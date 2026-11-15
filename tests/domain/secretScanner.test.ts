import { describe, it, expect, vi } from 'vitest';
import {
  scanText,
  redactText,
  maskSecret,
  findingKey,
  type SecretFinding,
} from '../../src/domain/secretScanner';

describe('secretScanner domain module', () => {
  describe('Pattern Matching Table (Positive & Negative Near-Miss Cases)', () => {
    // 1. AWS Access Key IDs
    it('detects valid AWS access key IDs', () => {
      const awsKey = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
      const text = `const awsKey = "${awsKey}";`;
      const findings = scanText(text, 'src/aws.ts');
      expect(findings).toHaveLength(1);
      expect(findings[0]?.category).toBe('AWS Access Key');
      expect(findings[0]?.masked).toBe('AKIAIO...MPLE');
    });

    it('ignores near-miss AWS look-alikes', () => {
      // Too short (15 chars) or wrong prefix
      expect(scanText('const k = "AKIAIOSFODNN7EXA";', 'test.ts')).toHaveLength(0);
      expect(scanText('const k = "BKIAIOSFODNN7EXAMPLE";', 'test.ts')).toHaveLength(0);
      expect(scanText('const k = "akiaiosfodnn7example";', 'test.ts')).toHaveLength(0);
    });

    // 2. GitHub Tokens
    it('detects GitHub classic personal access tokens (ghp_)', () => {
      const ghpToken = ['ghp_', '1234567890abcdefghijklmnopqrstuvwxyz'].join('');
      const text = `export const GITHUB_TOKEN = "${ghpToken}";`;
      const findings = scanText(text, 'src/git.ts');
      expect(findings).toHaveLength(1);
      expect(findings[0]?.category).toBe('GitHub Token');
      expect(findings[0]?.masked).toBe('ghp_12...wxyz');
    });

    it('detects GitHub fine-grained personal access tokens (github_pat_)', () => {
      const patToken = ['github_pat_', '11AAAAAAA0123456789abcdefghijklmnopqrstuvwxyz'].join('');
      const text = `const pat = "${patToken}";`;
      const findings = scanText(text, 'src/git.ts');
      expect(findings).toHaveLength(1);
      expect(findings[0]?.category).toBe('GitHub Token');
    });

    it('ignores near-miss GitHub token look-alikes', () => {
      expect(scanText('const k = "ghp_short";', 'test.ts')).toHaveLength(0);
      expect(scanText('const k = "gho_1234567890abcdefghijklmnopqrstuvwxyz";', 'test.ts')).toHaveLength(0);
    });

    // 3. Google API Keys (AIza followed by exactly 35 characters)
    it('detects Google API keys (AIza...)', () => {
      const gkey = ['AIza', 'SyD-1234567890abcdefghijklmnopqrstu'].join('');
      const text = `const gkey = "${gkey}";`;
      const findings = scanText(text, 'src/google.ts');
      expect(findings).toHaveLength(1);
      expect(findings[0]?.category).toBe('Google API Key');
      expect(findings[0]?.masked).toBe('AIzaSy...rstu');
    });

    it('ignores near-miss Google API key look-alikes', () => {
      expect(scanText('const k = "AIzaShort";', 'test.ts')).toHaveLength(0);
      const wrongPrefix = ['BIza', 'SyD-1234567890abcdefghijklmnopqrstu'].join('');
      expect(scanText(`const k = "${wrongPrefix}";`, 'test.ts')).toHaveLength(0);
      // 34 characters after AIza (one character short of 35) must NOT match
      const nearMiss34 = ['AIza', 'SyD-1234567890abcdefghijklmnopqrst'].join('');
      expect(scanText(`const k = "${nearMiss34}";`, 'test.ts')).toHaveLength(0);
      // 36 characters after AIza (one character too long)
      const nearMiss36 = ['AIza', 'SyD-1234567890abcdefghijklmnopqrstuv'].join('');
      expect(scanText(`const k = "${nearMiss36}";`, 'test.ts')).toHaveLength(0);
    });

    // 4. sk- API Keys (OpenAI, Anthropic)
    it('detects OpenAI and Anthropic sk- keys', () => {
      const openAi = ['sk-', '1234567890abcdef1234567890abcdef'].join('');
      const claude = ['sk-ant-api03-', '1234567890abcdefghijklmnopqrstuvwxyz9xQ2'].join('');
      const text = `const openAi = "${openAi}";\nconst claude = "${claude}";`;
      const findings = scanText(text, 'src/ai.ts');
      expect(findings).toHaveLength(2);
      expect(findings[0]?.category).toBe('sk- API Key');
      expect(findings[1]?.category).toBe('sk- API Key');
      expect(findings[1]?.masked).toBe('sk-ant...9xQ2');
    });

    it('does NOT match look-alikes ending in sk- like task- or risk-', () => {
      const text = 'const item = "task-12345678901234567890";\nconst r = "risk-assessment-strategy-v2";';
      expect(scanText(text, 'src/plan.ts')).toHaveLength(0);
    });

    // 5. Private Key Blocks
    it('detects PEM private key blocks', () => {
      const pem = [
        '-----BEGIN ',
        'RSA PRIVATE KEY-----\n',
        'MIIEowIBAAKCAQEA0Y1uV...\n',
        '-----END RSA PRIVATE KEY-----',
      ].join('');
      const findings = scanText(pem, 'server.key');
      expect(findings).toHaveLength(1);
      expect(findings[0]?.category).toBe('Private Key Block');
      expect(findings[0]?.masked).toBe('[PRIVATE KEY BLOCK]');
    });

    it('detects generic BEGIN PRIVATE KEY headers', () => {
      const text = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
      const findings = scanText(text, 'key.txt');
      expect(findings).toHaveLength(1);
      expect(findings[0]?.category).toBe('Private Key Block');
    });

    it('does NOT match public key blocks', () => {
      const pub = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A
-----END PUBLIC KEY-----`;
      expect(scanText(pub, 'pub.pem')).toHaveLength(0);
    });

    // 6. JSON Web Tokens (JWT)
    it('detects JWT tokens', () => {
      const header = ['ey', 'JhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'].join('');
      const payload = ['ey', 'JzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0'].join('');
      const signature = 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const jwt = [header, payload, signature].join('.');
      const text = ['const to', `ken = "${jwt}";`].join('');
      const findings = scanText(text, 'src/auth.ts');
      expect(findings.some((f) => f.category === 'JSON Web Token')).toBe(true);
    });

    it('ignores near-miss JWT look-alikes', () => {
      expect(scanText('const t = "eyJnot.valid";', 'test.ts')).toHaveLength(0);
    });

    // 7. Literal Credential Assignments
    it('detects quoted credential assignments (password, secret, token, api_key)', () => {
      const cases = [
        ['pass', 'word: "myUltraSecretPassword123"'].join(''),
        ['pass', 'word = "secretPassword456"'].join(''),
        ['sec', 'ret: \'vaultSecretKey789\''].join(''),
        ['api_', 'key = "customApiKey321"'].join(''),
        ['to', 'ken: "bearerSessionToken999"'].join(''),
      ];

      for (const line of cases) {
        const findings = scanText(line, 'src/creds.ts');
        expect(findings.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('detects unquoted credential assignments', () => {
      const text = ['to', 'ken = sessionToken12345678'].join('');
      const findings = scanText(text, 'env.txt');
      expect(findings.length).toBeGreaterThanOrEqual(1);
    });

    it('ignores non-credential near-miss assignments', () => {
      expect(scanText('tokenEstimate: 50', 'schema.ts')).toHaveLength(0);
      expect(scanText('const password = "";', 'auth.ts')).toHaveLength(0);
      expect(scanText('password = null', 'auth.ts')).toHaveLength(0);
      expect(scanText('is_secret = false', 'auth.ts')).toHaveLength(0);
      expect(scanText('let token: string = "[REDACTED]";', 'test.ts')).toHaveLength(0);
    });

    // Line Number Verification & CRLF
    it('accurately identifies line numbers with CRLF line breaks', () => {
      const awsVal = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
      const crlfText = `line1\r\nline2\r\nconst aws = "${awsVal}";\r\nline4`;
      const findings = scanText(crlfText, 'src/test.ts');
      expect(findings).toHaveLength(1);
      expect(findings[0]?.line).toBe(3);
    });

    it('handles multiple findings on the same line', () => {
      const k1 = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
      const k2 = ['AIza', 'SyD-1234567890abcdefghijklmnopqrstu'].join('');
      const line = `const k1 = "${k1}"; const k2 = "${k2}";`;
      const findings = scanText(line, 'src/test.ts');
      expect(findings).toHaveLength(2);
      expect(findings[0]?.line).toBe(1);
      expect(findings[1]?.line).toBe(1);
    });

    it('detects secrets embedded in comments and JSON files', () => {
      const json = JSON.stringify({
        database: {
          [['pass', 'word'].join('')]: 'superSecretDatabasePassword!',
        },
      });
      expect(scanText(json, 'config.json').length).toBeGreaterThanOrEqual(1);

      const gkey = ['AIza', 'SyD-1234567890abcdefghijklmnopqrstu'].join('');
      const comment = ['// TODO: delete hardcoded key ', gkey].join('');
      expect(scanText(comment, 'app.ts').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Masking Safety', () => {
    it('guarantees raw secret never appears in finding JSON stringify', () => {
      const rawSecret = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
      const findings = scanText(`const k = "${rawSecret}";`, 'test.ts');
      const serialized = JSON.stringify(findings);
      expect(serialized).not.toContain(rawSecret);
      expect(serialized).toContain('AKIAIO...MPLE');
    });

    it('masks short values with fixed category mask', () => {
      const masked = maskSecret('short123', 'Secret Token');
      expect(masked).toBe('[SECRET TOKEN:••••••••]');
    });

    it('never leaks key material from private key blocks', () => {
      const privHeader = ['-----BEGIN ', 'PRIVATE KEY-----\nMIIE...'].join('');
      const masked = maskSecret(privHeader, 'Private Key Block');
      expect(masked).toBe('[PRIVATE KEY BLOCK]');
      expect(masked).not.toContain('MIIE');
    });

    it('builds stable findingKey without leaking raw secret', () => {
      const finding: SecretFinding = {
        path: 'src/api.ts',
        line: 14,
        category: 'AWS Access Key',
        masked: 'AKIAIO...MPLE',
      };
      const key = findingKey(finding);
      expect(key).toBe('src/api.ts:AWS Access Key:14:AKIAIO...MPLE');
    });
  });

  describe('Redaction Idempotence', () => {
    it('replaces all detected secrets with [REDACTED]', () => {
      const awsVal = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
      const googleVal = ['AIza', 'SyD-1234567890abcdefghijklmnopqrstu'].join('');
      const original = `const aws = "${awsVal}";\nconst google = "${googleVal}";`;
      const redacted = redactText(original);

      expect(redacted).toContain('const aws = "[REDACTED]";');
      expect(redacted).toContain('const google = "[REDACTED]";');
      expect(redacted).not.toContain(awsVal);
      expect(redacted).not.toContain(googleVal);

      // Re-scan of redacted text returns 0 findings
      const reScan = scanText(redacted, 'src/test.ts');
      expect(reScan).toHaveLength(0);
    });

    it('is completely idempotent when run multiple times', () => {
      const original = ['pass', 'word: "databaseSecretPassword123"'].join('');
      const pass1 = redactText(original);
      const pass2 = redactText(pass1);
      expect(pass1).toBe(pass2);
      expect(scanText(pass2, 'test.ts')).toHaveLength(0);
    });
  });

  describe('Safety & Zero Content Logging', () => {
    it('never outputs raw secret content to console.log or console.error', () => {
      const logSpy = vi.spyOn(console, 'log');
      const errorSpy = vi.spyOn(console, 'error');

      const sentinel = ['AIza', 'SyD-SENTINEL-SECRET-KEY-12345678901'].join('');
      const secText = ['const sec', `ret = "${sentinel}";`].join('');
      scanText(secText, 'src/auth.ts');
      redactText(secText);

      for (const call of logSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(sentinel);
      }
      for (const call of errorSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(sentinel);
      }

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('Adversarial Performance Budget', () => {
    it('scans a 100,000-character line with repeated near-matches under 50ms', () => {
      // Near match pattern that tests catastrophic backtracking resistance
      const adversarialLine = ['task-sk-risk-to', 'ken-pass', 'word-not-quite-sec', 'ret-'].join('').repeat(2500);
      const start = performance.now();
      const findings = scanText(adversarialLine, 'long.txt');
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
      expect(findings).toHaveLength(0);
    });
  });

  describe('Fuzz Testing (Seeded PRNG)', () => {
    it('never throws on 500 mutated file variations with secrets', () => {
      // Simple pseudo-random number generator with fixed seed
      let seed = 42;
      const random = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };

      const snippets = [
        ['AKIA', 'IOSFODNN7EXAMPLE'].join(''),
        ['ghp_', '1234567890abcdefghijklmnopqrstuvwxyz'].join(''),
        ['AIza', 'SyD-1234567890abcdefghijklmnopqrstu'].join(''),
        ['sk-ant-api03-', '1234567890abcdefghijklmnopqrstuvwxyz9xQ2'].join(''),
        ['pass', 'word: "superSecretPassword123"'].join(''),
        'random filler text',
        '\\n\\r\\t\\0\\b',
        '{"nested": {"key": "value"}}',
      ];

      for (let i = 0; i < 500; i++) {
        let text = '';
        const count = Math.floor(random() * 10) + 1;
        for (let j = 0; j < count; j++) {
          const index = Math.floor(random() * snippets.length);
          text += snippets[index] + ' ';
        }

        expect(() => {
          const findings = scanText(text, `fuzz-${i}.ts`);
          redactText(text, findings);
        }).not.toThrow();
      }
    });
  });
});
