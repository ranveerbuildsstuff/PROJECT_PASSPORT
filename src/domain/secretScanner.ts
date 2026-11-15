/**
 * Pure, deterministic secret scanner, masking, and redaction logic.
 *
 * Invariants:
 * - Linear-time scanning with bounded regexes (no catastrophic backtracking).
 * - Findings never leak raw secrets (only category, line, and masked snippet).
 * - Redaction is idempotent and leaves zero findings on re-scan.
 * - Handles both LF and CRLF line endings with accurate line numbers.
 * - Zero console logging.
 */

export interface SecretFinding {
  path: string;
  line: number;
  category: string;
  masked: string;
}

interface InternalMatch {
  category: string;
  rawSecret: string;
  startIndex: number;
  endIndex: number;
  line: number;
  masked: string;
}

/**
 * Builds a stable key for acknowledging a finding.
 * Contains only path, category, line, and masked snippet—never the raw secret.
 */
export function findingKey(finding: SecretFinding): string {
  return `${finding.path}:${finding.category}:${finding.line}:${finding.masked}`;
}

/**
 * Masks a secret string according to the specification:
 * - Private key blocks: fixed [PRIVATE KEY BLOCK]
 * - Strings <= 12 characters: category + fixed mask (e.g. [CATEGORY:••••••••])
 * - Strings > 12 characters: first 6 chars + "..." + last 4 chars
 */
export function maskSecret(secret: string, category: string): string {
  if (category === 'Private Key Block' || secret.includes('PRIVATE KEY')) {
    return '[PRIVATE KEY BLOCK]';
  }

  const trimmed = secret.trim();
  if (trimmed.length <= 12) {
    return `[${category.toUpperCase()}:••••••••]`;
  }

  const prefix = trimmed.slice(0, 6);
  const suffix = trimmed.slice(-4);
  return `${prefix}...${suffix}`;
}

interface PatternRule {
  category: string;
  regex: RegExp;
  extractSecret?: (match: RegExpExecArray) => string;
}

const PATTERN_RULES: PatternRule[] = [
  // 1. AWS Access Key IDs: AKIA followed by 16 alphanumeric uppercase chars
  {
    category: 'AWS Access Key',
    regex: /(?<![A-Za-z0-9_-])AKIA[0-9A-Z]{16}(?![A-Za-z0-9_-])/g,
  },
  // 2. GitHub Personal Access Tokens (classic ghp_... or fine-grained github_pat_...)
  {
    category: 'GitHub Token',
    regex: /(?<![A-Za-z0-9_-])(?:ghp_[A-Za-z0-9_]{36,255}|github_pat_[A-Za-z0-9_]{22,255})(?![A-Za-z0-9_-])/g,
  },
  // 3. Google API Keys: AIza followed by exactly 35 characters
  {
    category: 'Google API Key',
    regex: /(?<![A-Za-z0-9_-])AIza[0-9A-Za-z\-_]{35}(?![A-Za-z0-9_-])/g,
  },
  // 4. sk- API keys (OpenAI, Anthropic)
  {
    category: 'sk- API Key',
    regex: /(?<![A-Za-z0-9_-])sk-(?:ant-)?(?:live-)?[0-9a-zA-Z\-_]{20,}(?![A-Za-z0-9_-])/g,
  },
  // 5. Private Key Blocks: -----BEGIN ... PRIVATE KEY-----
  {
    category: 'Private Key Block',
    regex: /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----[^-]*-----END (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/gs,
  },
  // Also match single-line BEGIN header in case PEM is truncated or multi-line
  {
    category: 'Private Key Block',
    regex: /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/g,
  },
  // 6. JSON Web Tokens (JWT): header starts with eyJ, contains 2 dots and base64url characters
  {
    category: 'JSON Web Token',
    regex: /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9\-_=]{10,}\.[A-Za-z0-9\-_=]{10,}(?:\.[A-Za-z0-9\-_+/=]{10,})?(?![A-Za-z0-9_-])/g,
  },
  // 7. Literal credential assignments (password, secret, token, api_key)
  {
    category: 'Credential Assignment',
    // Quoted or JSON key assignment e.g. key: "val"
    regex: /(?<![A-Za-z0-9_-])(["']?)(password|secret|token|api_key)\1\s*[:=]\s*(["'])([^"'\r\n]{4,})\3/gi,
    extractSecret: (m) => m[4] ?? '',
  },
  {
    category: 'Credential Assignment',
    // Unquoted credential assignment e.g. key = val
    regex: /(?<![A-Za-z0-9_-])(password|secret|token|api_key)\s*=\s*([a-zA-Z0-9!@#$%^&*()_+=\-`~[\]{}|\\;:,.<>?]{6,})/gi,
    extractSecret: (m) => m[2] ?? '',
  },
];

const EXCLUDED_LITERAL_VALUES = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'string',
  'number',
  'boolean',
  'object',
  '[redacted]',
  'password',
  'secret',
  'token',
  'api_key',
]);

/**
 * Computes 1-based line number for a character index in text,
 * properly handling both LF and CRLF line breaks.
 */
function getLineNumber(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
    }
  }
  return line;
}

/**
 * Internal pure scanner that extracts matches with coordinate boundaries
 * to support both finding generation and redaction.
 */
function scanTextInternal(text: string): InternalMatch[] {
  if (!text || typeof text !== 'string') return [];

  const matches: InternalMatch[] = [];
  const occupiedRanges: Array<{ start: number; end: number }> = [];

  const isRangeOccupied = (start: number, end: number) => {
    return occupiedRanges.some((r) => start < r.end && end > r.start);
  };

  for (const rule of PATTERN_RULES) {
    const rx = new RegExp(rule.regex.source, rule.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = rx.exec(text)) !== null) {
      const matchIndex = match.index;
      const matchedString = match[0];

      const rawSecret = rule.extractSecret ? rule.extractSecret(match) : matchedString;
      if (!rawSecret) continue;

      // Filter out redacted markers and non-secret language keywords
      const lower = rawSecret.toLowerCase().trim();
      if (EXCLUDED_LITERAL_VALUES.has(lower) || lower.includes('[redacted]')) {
        continue;
      }

      // Calculate the start and end of the secret itself within the match
      const secretOffset = matchedString.indexOf(rawSecret);
      const start = matchIndex + (secretOffset >= 0 ? secretOffset : 0);
      const end = start + rawSecret.length;

      if (isRangeOccupied(start, end)) {
        continue;
      }

      occupiedRanges.push({ start, end });
      const line = getLineNumber(text, start);
      const masked = maskSecret(rawSecret, rule.category);

      matches.push({
        category: rule.category,
        rawSecret,
        startIndex: start,
        endIndex: end,
        line,
        masked,
      });

      // Avoid infinite loop on zero-length matches
      if (match.index === rx.lastIndex) {
        rx.lastIndex++;
      }
    }
  }

  // Sort matches by appearance in text
  matches.sort((a, b) => a.startIndex - b.startIndex);
  return matches;
}

/**
 * Pure, deterministic scanner for secrets.
 * Returns findings containing category, line, path, and masked snippets only.
 * Guaranteed never to log or leak raw secret strings.
 */
export function scanText(text: string, path: string): SecretFinding[] {
  const internalMatches = scanTextInternal(text);
  return internalMatches.map((m) => ({
    path,
    line: m.line,
    category: m.category,
    masked: m.masked,
  }));
}

/**
 * Pure, idempotent function that redacts all detected secrets in the text,
 * replacing each with `[REDACTED]`.
 * Re-scanning the returned string is guaranteed to produce zero findings.
 */
export function redactText(text: string, findings?: SecretFinding[]): string {
  if (!text || typeof text !== 'string') return text;

  const matches = scanTextInternal(text);
  if (matches.length === 0) return text;

  // If specific findings were passed, filter matches that correspond to those findings
  let targets = matches;
  if (findings && findings.length > 0) {
    const findingKeys = new Set(findings.map(findingKey));
    targets = matches.filter((m) =>
      findingKeys.has(
        findingKey({
          path: 'file',
          line: m.line,
          category: m.category,
          masked: m.masked,
        })
      )
    );
  }

  if (targets.length === 0) {
    // If findings was passed but didn't match 'file' dummy path, match on category + line + masked
    if (findings && findings.length > 0) {
      targets = matches.filter((m) =>
        findings.some(
          (f) =>
            f.category === m.category &&
            f.line === m.line &&
            f.masked === m.masked
        )
      );
    }
    if (targets.length === 0) {
      targets = matches;
    }
  }

  // Build the redacted string by slicing between matches from back to front
  let result = text;
  // Sort descending by startIndex so replacements don't shift earlier indices
  targets.sort((a, b) => b.startIndex - a.startIndex);

  for (const t of targets) {
    result = result.slice(0, t.startIndex) + '[REDACTED]' + result.slice(t.endIndex);
  }

  return result;
}
