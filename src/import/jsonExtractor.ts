export type ExtractionErrorCode =
  | 'empty'
  | 'too_large'
  | 'no_json_found'
  | 'truncated'
  | 'invalid_json'
  | 'not_an_object';

export interface ExtractionRepair {
  type:
    | 'smart_double_quotes'
    | 'smart_single_quotes'
    | 'trailing_commas'
    | 'comments'
    | 'whitespace'
    | 'literal_newlines';
  count: number;
  description: string;
}

export type ExtractionResult =
  | {
      ok: true;
      value: unknown;
      repairs: ExtractionRepair[];
    }
  | {
      ok: false;
      code: ExtractionErrorCode;
      message: string;
      line?: number;
      column?: number;
      excerpt?: string;
    };

const KNOWN_PASSPORT_KEYS = [
  'passport',
  'project',
  'basics',
  'stack',
  'requirements',
  'decisions',
  'completed',
  'tasks',
  'bugs',
  'bugsReviewed',
  'instructions',
  'nextAction',
  'openQuestions',
  'schemaVersion',
  'files',
  'conversations',
];

/**
 * Counts how many known passport keys are present in an object.
 */
function countKnownPassportKeys(obj: unknown): number {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return 0;
  }
  const record = obj as Record<string, unknown>;
  // Check if unwrapped passport
  let target = record;
  if ('passport' in record && typeof record.passport === 'object' && record.passport !== null && !Array.isArray(record.passport)) {
    target = record.passport as Record<string, unknown>;
  }

  let count = 0;
  for (const key of KNOWN_PASSPORT_KEYS) {
    if (key in target) {
      count++;
    }
  }
  return count;
}

/**
 * Iterative string-aware repair pipeline.
 * Repaired changes are tracked and reported with exact counts.
 */
function repairJsonText(text: string): { repaired: string; repairs: ExtractionRepair[] } {
  const repairs: ExtractionRepair[] = [];

  // 1. Whitespace repairs: BOM, zero-width chars and NBSP
  let whitespaceCount = 0;
  let s1 = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\uFEFF' || ch === '\u200B' || ch === '\u200C' || ch === '\u200D') {
      whitespaceCount++;
    } else if (ch === '\u00A0') {
      whitespaceCount++;
      s1 += ' ';
    } else {
      s1 += ch;
    }
  }
  if (whitespaceCount > 0) {
    repairs.push({
      type: 'whitespace',
      count: whitespaceCount,
      description: 'Removed BOM or normalized special whitespace',
    });
  }

  // 2. Remove comments outside strings
  let commentsCount = 0;
  let s2 = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s1.length; i++) {
    const ch = s1[i];
    const next = i + 1 < s1.length ? s1[i + 1] : '';

    if (inStr) {
      s2 += ch;
      if (esc) {
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }

    if (ch === '"') {
      inStr = true;
      s2 += ch;
      continue;
    }

    // Check single-line comment //
    if (ch === '/' && next === '/') {
      commentsCount++;
      i += 2;
      while (i < s1.length && s1[i] !== '\n') {
        i++;
      }
      if (i < s1.length) {
        s2 += s1[i]; // keep newline
      }
      continue;
    }

    // Check multi-line comment /* ... */
    if (ch === '/' && next === '*') {
      commentsCount++;
      i += 2;
      while (i < s1.length - 1 && !(s1[i] === '*' && s1[i + 1] === '/')) {
        i++;
      }
      i++; // skip /
      s2 += ' ';
      continue;
    }

    s2 += ch;
  }
  if (commentsCount > 0) {
    repairs.push({
      type: 'comments',
      count: commentsCount,
      description: 'Removed comments outside strings',
    });
  }

  // 3. Smart quotes and literal newlines in strings
  // Rules:
  // - smart double quotes as delimiters (“ ” -> ")
  //   (a smart quote inside an ASCII-quoted string is content and is left alone)
  // - smart single quotes only in structural position (‘ ’ ' -> ")
  // - literal newlines inside strings -> \n
  let smartDoubleCount = 0;
  let smartSingleCount = 0;
  let literalNewlineCount = 0;
  let s3 = '';

  type StringMode = 'OUTSIDE' | 'ASCII' | 'SMART_DOUBLE' | 'SMART_SINGLE';
  let mode: StringMode = 'OUTSIDE';
  esc = false;

  for (let i = 0; i < s2.length; i++) {
    const ch = s2[i];
    const next = i + 1 < s2.length ? s2[i + 1] : '';

    if (mode === 'OUTSIDE') {
      if (ch === '"') {
        mode = 'ASCII';
        s3 += '"';
      } else if (ch === '“' || ch === '”') {
        mode = 'SMART_DOUBLE';
        smartDoubleCount++;
        s3 += '"';
      } else if (ch === '\'' || ch === '‘' || ch === '’') {
        mode = 'SMART_SINGLE';
        smartSingleCount++;
        s3 += '"';
      } else {
        s3 += ch;
      }
      continue;
    }

    if (mode === 'ASCII') {
      if (esc) {
        esc = false;
        s3 += ch;
      } else if (ch === '\\') {
        esc = true;
        s3 += ch;
      } else if (ch === '"') {
        mode = 'OUTSIDE';
        s3 += '"';
      } else if (ch === '\n') {
        literalNewlineCount++;
        s3 += '\\n';
      } else if (ch === '\r') {
        if (next === '\n') {
          // Skip \r; following \n will be turned into \n
        } else {
          literalNewlineCount++;
          s3 += '\\n';
        }
      } else {
        // Smart quotes inside ASCII string are content and preserved
        s3 += ch;
      }
      continue;
    }

    if (mode === 'SMART_DOUBLE') {
      if (esc) {
        esc = false;
        s3 += ch;
      } else if (ch === '\\') {
        esc = true;
        s3 += ch;
      } else if (ch === '”' || ch === '“' || ch === '"') {
        mode = 'OUTSIDE';
        if (ch !== '"') {
          smartDoubleCount++;
        }
        s3 += '"';
      } else if (ch === '\n') {
        literalNewlineCount++;
        s3 += '\\n';
      } else if (ch === '\r') {
        if (next !== '\n') {
          literalNewlineCount++;
          s3 += '\\n';
        }
      } else {
        s3 += ch;
      }
      continue;
    }

    if (mode === 'SMART_SINGLE') {
      if (esc) {
        esc = false;
        s3 += ch;
      } else if (ch === '\\') {
        esc = true;
        s3 += ch;
      } else if (ch === '\'' || ch === '’' || ch === '‘') {
        mode = 'OUTSIDE';
        smartSingleCount++;
        s3 += '"';
      } else if (ch === '\n') {
        literalNewlineCount++;
        s3 += '\\n';
      } else if (ch === '\r') {
        if (next !== '\n') {
          literalNewlineCount++;
          s3 += '\\n';
        }
      } else {
        s3 += ch;
      }
      continue;
    }
  }

  if (smartDoubleCount > 0) {
    repairs.push({
      type: 'smart_double_quotes',
      count: smartDoubleCount,
      description: 'Converted smart double quotes to standard quotes',
    });
  }
  if (smartSingleCount > 0) {
    repairs.push({
      type: 'smart_single_quotes',
      count: smartSingleCount,
      description: 'Converted smart single quotes to standard quotes',
    });
  }
  if (literalNewlineCount > 0) {
    repairs.push({
      type: 'literal_newlines',
      count: literalNewlineCount,
      description: 'Escaped literal newlines inside strings',
    });
  }

  // 4. Trailing commas: outside strings, comma followed by whitespace/newlines and } or ]
  let trailingCommaCount = 0;
  let s4 = '';
  inStr = false;
  esc = false;

  for (let i = 0; i < s3.length; i++) {
    const ch = s3[i];

    if (inStr) {
      s4 += ch;
      if (esc) {
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }

    if (ch === '"') {
      inStr = true;
      s4 += ch;
      continue;
    }

    if (ch === ',') {
      // Look ahead past whitespace to see if next non-whitespace char is } or ]
      let j = i + 1;
      while (j < s3.length && /\s/.test(s3[j] || '')) {
        j++;
      }
      if (j < s3.length && (s3[j] === '}' || s3[j] === ']')) {
        trailingCommaCount++;
        continue; // skip the comma
      }
    }

    s4 += ch;
  }

  if (trailingCommaCount > 0) {
    repairs.push({
      type: 'trailing_commas',
      count: trailingCommaCount,
      description: 'Removed trailing commas',
    });
  }

  return { repaired: s4, repairs };
}

/**
 * Extracts line, column and excerpt from a JSON parse error.
 */
function analyzeParseError(
  err: Error,
  rawCandidate: string
): { line: number; column: number; excerpt: string; isTruncated: boolean } {
  let pos = -1;
  const msg = err.message || '';

  // V8 message: "... at position 123"
  const posMatch = /position\s+(\d+)/i.exec(msg);
  if (posMatch && posMatch[1]) {
    pos = parseInt(posMatch[1], 10);
  }

  // Calculate line and column
  let line = 1;
  let column = 1;
  if (pos >= 0 && pos <= rawCandidate.length) {
    for (let i = 0; i < pos; i++) {
      if (rawCandidate[i] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
  } else {
    // Default to last line if position is beyond length or end of input
    for (let i = 0; i < rawCandidate.length; i++) {
      if (rawCandidate[i] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
  }

  const errorPos = pos >= 0 ? pos : rawCandidate.length;
  const start = Math.max(0, errorPos - 25);
  const end = Math.min(rawCandidate.length, errorPos + 25);
  const excerpt = rawCandidate.slice(start, end).replace(/\s+/g, ' ').trim().slice(0, 60);

  const isTruncated =
    /unexpected end of (json|input)/i.test(msg) ||
    /unterminated/i.test(msg) ||
    errorPos >= rawCandidate.length;

  return { line, column, excerpt, isTruncated };
}

/**
 * Iteratively parses and repairs JSON text. Never throws, no recursion, O(n).
 */
export function extractJson(text: string): ExtractionResult {
  const initialRepairs: ExtractionRepair[] = [];

  // Strip Byte Order Mark (BOM) at text start
  if (text && text.charCodeAt(0) === 0xFEFF) {
    initialRepairs.push({
      type: 'whitespace',
      count: 1,
      description: 'Removed byte order mark (BOM)',
    });
    text = text.slice(1);
  }

  // Input validations
  if (!text || text.trim().length === 0) {
    return {
      ok: false,
      code: 'empty',
      message: 'Nothing to check yet. Paste the AI’s reply into the box above, then choose Check reply.',
    };
  }

  if (text.length > 1_000_000) {
    return {
      ok: false,
      code: 'too_large',
      message: 'This text is over 1 MB, far larger than a passport. Check you pasted only the AI’s reply.',
    };
  }

  // Check if root of text or fenced block is an array
  const trimmed = text.trim();
  let rootToCheck = trimmed;
  const rootFenceMatch = /^```(?:json|JSON)?\s*([\s\S]*?)```$/.exec(trimmed);
  if (rootFenceMatch && rootFenceMatch[1]) {
    rootToCheck = rootFenceMatch[1].trim();
  }
  if (rootToCheck.startsWith('[') && rootToCheck.endsWith(']')) {
    try {
      const parsedArr = JSON.parse(rootToCheck);
      if (Array.isArray(parsedArr)) {
        return {
          ok: false,
          code: 'not_an_object',
          message: 'The reply is a list, but we need one object describing the project.',
        };
      }
    } catch {
      // Fall through to candidate scanning
    }
  }

  // Collect candidate strings
  const candidates: string[] = [];

  // 1. Fenced code blocks ```json ... ```
  const fencedRegex = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fencedRegex.exec(text)) !== null) {
    const content = match[1]?.trim();
    if (content && (content.includes('{') || content.includes('['))) {
      candidates.push(content);
    }
  }

  // 2. Balanced top-level {...} candidates
  let braceDepth = 0;
  let startIndex = -1;
  let inStr = false;
  let esc = false;
  let hasUnclosedBrace = false;
  let unclosedStartIndex = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }

    if (ch === '"') {
      inStr = true;
      continue;
    }

    if (ch === '{') {
      if (braceDepth === 0) {
        startIndex = i;
      }
      braceDepth++;
    } else if (ch === '}') {
      if (braceDepth > 0) {
        braceDepth--;
        if (braceDepth === 0 && startIndex >= 0) {
          const cand = text.slice(startIndex, i + 1);
          if (!candidates.includes(cand)) {
            candidates.push(cand);
          }
          startIndex = -1;
        }
      }
    }
  }

  if (braceDepth > 0 && startIndex >= 0) {
    hasUnclosedBrace = true;
    unclosedStartIndex = startIndex;
  }

  // If no candidates found, evaluate potential failure causes
  if (candidates.length === 0) {
    if (hasUnclosedBrace) {
      return {
        ok: false,
        code: 'truncated',
        message: 'The JSON stops before it ends. Ask the AI to send the complete reply again.',
      };
    }

    // Check if user pasted an array root
    const trimmed = text.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsedArr = JSON.parse(trimmed);
        if (Array.isArray(parsedArr)) {
          return {
            ok: false,
            code: 'not_an_object',
            message: 'The reply is a list, but we need one object describing the project.',
          };
        }
      } catch {
        // Fall through
      }
    }

    return {
      ok: false,
      code: 'no_json_found',
      message: 'We couldn’t find any JSON in this text. Ask the AI to reply again using the prompt exactly.',
    };
  }

  // Try parsing each candidate: raw first, then with repairs
  interface CandidateEvaluation {
    candidate: string;
    parsed: unknown;
    repairs: ExtractionRepair[];
    score: number;
    isArray: boolean;
  }

  const evaluations: CandidateEvaluation[] = [];
  let lastParseError: { err: Error; cand: string } | null = null;

  for (const cand of candidates) {
    // 1. Try raw JSON.parse (skip if containing BOM so BOM is repaired and recorded)
    if (!cand.includes('\uFEFF')) {
      try {
        const parsed = JSON.parse(cand);
        const isArr = Array.isArray(parsed);
        const score = countKnownPassportKeys(parsed);
        evaluations.push({
          candidate: cand,
          parsed,
          repairs: [],
          score,
          isArray: isArr,
        });
        continue;
      } catch (rawErr) {
        lastParseError = { err: rawErr as Error, cand };
      }
    }

    // 2. Try repaired parse
    try {
      const { repaired, repairs } = repairJsonText(cand);
      const parsed = JSON.parse(repaired);
      const isArr = Array.isArray(parsed);
      const score = countKnownPassportKeys(parsed);
      evaluations.push({
        candidate: cand,
        parsed,
        repairs,
        score,
        isArray: isArr,
      });
    } catch (repairedErr) {
      lastParseError = { err: repairedErr as Error, cand };
    }
  }

  // Filter valid parsed candidates
  if (evaluations.length > 0) {
    // Look for non-array objects first
    const objectEvals = evaluations.filter((e) => !e.isArray && typeof e.parsed === 'object' && e.parsed !== null);

    if (objectEvals.length > 0) {
      // Pick the candidate with the most known passport keys, first on ties
      let best = objectEvals[0]!;
      for (let i = 1; i < objectEvals.length; i++) {
        const current = objectEvals[i]!;
        if (current.score > best.score) {
          best = current;
        }
      }

      const combinedRepairs = [...initialRepairs, ...best.repairs];
      return {
        ok: true,
        value: best.parsed,
        repairs: combinedRepairs,
      };
    }

    // If only arrays were parsed
    const arrayEvals = evaluations.filter((e) => e.isArray);
    if (arrayEvals.length > 0) {
      return {
        ok: false,
        code: 'not_an_object',
        message: 'The reply is a list, but we need one object describing the project.',
      };
    }
  }

  // If no candidate could be parsed, report error based on lastParseError or unclosed braces
  if (hasUnclosedBrace && (!lastParseError || unclosedStartIndex >= 0)) {
    return {
      ok: false,
      code: 'truncated',
      message: 'The JSON stops before it ends. Ask the AI to send the complete reply again.',
    };
  }

  if (lastParseError) {
    const analysis = analyzeParseError(lastParseError.err, lastParseError.cand);
    if (analysis.isTruncated) {
      return {
        ok: false,
        code: 'truncated',
        message: 'The JSON stops before it ends. Ask the AI to send the complete reply again.',
      };
    }

    return {
      ok: false,
      code: 'invalid_json',
      message: `The JSON has a typo near line ${analysis.line}. Fix it in the box or ask the AI to resend it.`,
      line: analysis.line,
      column: analysis.column,
      excerpt: analysis.excerpt,
    };
  }

  return {
    ok: false,
    code: 'invalid_json',
    message: 'The JSON has a typo near line 1. Fix it in the box or ask the AI to resend it.',
  };
}
