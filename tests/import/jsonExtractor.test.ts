import { describe, it, expect, vi } from 'vitest';
import { extractJson } from '../../src/import/jsonExtractor';

interface ParsedPayload {
  project?: { name?: string; goal?: string; summary?: string };
  tasks?: Array<{ text?: string }>;
  nextAction?: string;
}

const asParsed = (val: unknown) => val as ParsedPayload;

describe('extractJson', () => {
  describe('Extractor Table (>= 25 cases)', () => {
    // 1. Fenced json (lowercase)
    it('1. extracts from ```json code fence', () => {
      const text = '```json\n{"project":{"name":"App"}}\n```';
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('App');
      }
    });

    // 2. Fenced JSON (uppercase)
    it('2. extracts from ```JSON code fence', () => {
      const text = '```JSON\n{"project":{"name":"UppercaseApp"}}\n```';
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('UppercaseApp');
      }
    });

    // 3. Fenced plain (``` without language)
    it('3. extracts from plain ``` fence without language specifier', () => {
      const text = '```\n{"project":{"name":"PlainFence"}}\n```';
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('PlainFence');
      }
    });

    // 4. Example fence then real fence
    it('4. picks real passport candidate when preceded by an example code fence', () => {
      const text = `
Here is an example structure:
\`\`\`json
{"example": true}
\`\`\`
And here is your actual passport:
\`\`\`json
{"project":{"name":"RealApp"},"tasks":[{"text":"Deploy"}]}
\`\`\`
`;
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('RealApp');
      }
    });

    // 5. Prose around
    it('5. handles leading and trailing conversational prose', () => {
      const text = `
Certainly! Here is the completed project passport for your review.
\`\`\`json
{"project":{"name":"ProseApp","goal":"Demonstrate robust parsing"}}
\`\`\`
Let me know if you would like me to adjust any fields!
`;
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('ProseApp');
      }
    });

    // 6. } inside strings
    it('6. correctly handles closing braces inside string literals', () => {
      const text = '{"project":{"name":"Bracket {test} and } closing"},"nextAction":"Run {step}"}';
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('Bracket {test} and } closing');
      }
    });

    // 7. Escaped quotes inside strings
    it('7. correctly handles escaped quotes inside strings', () => {
      const text = '{"project":{"name":"App with \\"quotes\\" inside"}}';
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('App with "quotes" inside');
      }
    });

    // 8. Smart quote delimiters
    it('8. repairs smart double quotes used as delimiters', () => {
      const text = '{ “project”: { “name”: “Smart Quotes App” } }';
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('Smart Quotes App');
        expect(res.repairs.some((r) => r.type === 'smart_double_quotes')).toBe(true);
      }
    });

    // 9. ’ preserved inside ASCII strings
    it('9. preserves apostrophes and smart single quotes inside ASCII string content', () => {
      const text = '{"project":{"name":"User’s App","summary":"It don\'t break"}}';
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('User’s App');
        expect(asParsed(res.value).project?.summary).toBe("It don't break");
      }
    });

    // 10. Smart single quotes in structural position
    it('10. repairs smart single quotes when used in structural position', () => {
      const text = '{ ‘project’: { ‘name’: ‘Single Quote App’ } }';
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('Single Quote App');
        expect(res.repairs.some((r) => r.type === 'smart_single_quotes')).toBe(true);
      }
    });

    // 11. Trailing commas in objects and arrays
    it('11. repairs trailing commas in objects and arrays', () => {
      const text = `
{
  "project": {
    "name": "CommaApp",
  },
  "stack": [
    { "name": "React", },
  ],
}
`;
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('CommaApp');
        expect(res.repairs.some((r) => r.type === 'trailing_commas')).toBe(true);
      }
    });

    // 12. Single-line comments
    it('12. strips single-line comments outside strings', () => {
      const text = `
{
  // Project definition
  "project": {
    "name": "CommentedApp" // Name of the project
  }
}
`;
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('CommentedApp');
        expect(res.repairs.some((r) => r.type === 'comments')).toBe(true);
      }
    });

    // 13. Multi-line comments
    it('13. strips multi-line block comments outside strings', () => {
      const text = `
{
  /* Header comment */
  "project": {
    "name": "BlockCommentApp"
  }
}
`;
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('BlockCommentApp');
        expect(res.repairs.some((r) => r.type === 'comments')).toBe(true);
      }
    });

    // 14. BOM character
    it('14. strips byte order mark (\\uFEFF)', () => {
      const text = '\uFEFF{"project":{"name":"BOMApp"}}';
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('BOMApp');
        expect(res.repairs.some((r) => r.type === 'whitespace')).toBe(true);
      }
    });

    // 15. NBSP and zero-width characters
    it('15. normalizes non-breaking spaces (\\u00A0) and zero-width spaces (\\u200B)', () => {
      const text = '{\u200B"project":\u00A0{"name":"NBSPApp"}}';
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('NBSPApp');
        expect(res.repairs.some((r) => r.type === 'whitespace')).toBe(true);
      }
    });

    // 16. CRLF line endings
    it('16. handles Windows CRLF line endings smoothly', () => {
      const text = '{\r\n  "project": {\r\n    "name": "CRLFApp"\r\n  }\r\n}';
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('CRLFApp');
      }
    });

    // 17. Literal newline inside string
    it('17. repairs unescaped literal newlines inside JSON strings', () => {
      const text = '{"project":{"name":"Multi\nLine\nApp"}}';
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('Multi\nLine\nApp');
        expect(res.repairs.some((r) => r.type === 'literal_newlines')).toBe(true);
      }
    });

    // 18. Truncated JSON
    it('18. returns code "truncated" when JSON stops prematurely', () => {
      const text = '{"project":{"name":"Incomplete';
      const res = extractJson(text);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('truncated');
        expect(res.message).toBe('The JSON stops before it ends. Ask the AI to send the complete reply again.');
      }
    });

    // 19. Empty input
    it('19. returns code "empty" when input is empty or whitespace only', () => {
      const res = extractJson('   \n\t  ');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('empty');
        expect(res.message).toBe(
          'Nothing to check yet. Paste the AI’s reply into the box above, then choose Check reply.'
        );
      }
    });

    // 20. Array root
    it('20. returns code "not_an_object" when root is an array', () => {
      const text = '[{"project":{"name":"InArray"}}]';
      const res = extractJson(text);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('not_an_object');
        expect(res.message).toBe('The reply is a list, but we need one object describing the project.');
      }
    });

    // 21. Two candidates (picks candidate with most passport keys)
    it('21. picks the candidate with the highest number of known passport keys', () => {
      const text = `
Candidate 1:
\`\`\`json
{"foo": "bar", "count": 1}
\`\`\`
Candidate 2:
\`\`\`json
{"project": {"name": "Winning"}, "stack": [], "tasks": []}
\`\`\`
`;
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('Winning');
      }
    });

    // 22. Two candidates with tie (picks first)
    it('22. picks the first candidate on equal known-key ties', () => {
      const text = `
{"project": {"name": "FirstCandidate"}}
{"project": {"name": "SecondCandidate"}}
`;
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('FirstCandidate');
      }
    });

    // 23. Input over 1 MB
    it('23. returns code "too_large" when text exceeds 1,000,000 characters', () => {
      const bigText = 'a'.repeat(1_000_001);
      const res = extractJson(bigText);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('too_large');
        expect(res.message).toBe(
          'This text is over 1 MB, far larger than a passport. Check you pasted only the AI’s reply.'
        );
      }
    });

    // 24. 50,000 nested braces (no stack overflow, iterative scanner)
    it('24. processes 50,000 nested braces without stack overflow', () => {
      const nested = '{'.repeat(50000) + '}'.repeat(50000);
      expect(() => extractJson(nested)).not.toThrow();
    });

    // 25. Raw unescaped top-level {...} without fences
    it('25. extracts raw JSON object directly without code fences', () => {
      const text = 'Here is your passport: {"project":{"name":"DirectApp"}}';
      const res = extractJson(text);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(asParsed(res.value).project?.name).toBe('DirectApp');
      }
    });

    // 26. No JSON found
    it('26. returns "no_json_found" when text contains no JSON object', () => {
      const text = 'Hello, this is just conversational chat with no code or braces at all.';
      const res = extractJson(text);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('no_json_found');
        expect(res.message).toBe(
          'We couldn’t find any JSON in this text. Ask the AI to reply again using the prompt exactly.'
        );
      }
    });

    // 27. Invalid JSON with typo
    it('27. returns "invalid_json" with line, column and excerpt <= 60 chars', () => {
      const text = '{\n  "project": {\n    "name": "TypoApp"\n    broken_here\n  }\n}';
      const res = extractJson(text);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('invalid_json');
        expect(res.message).toMatch(/The JSON has a typo near line \d+\. Fix it in the box or ask the AI to resend it\./);
        expect(res.line).toBeDefined();
        if (res.excerpt) {
          expect(res.excerpt.length).toBeLessThanOrEqual(60);
        }
      }
    });
  });

  describe('Fuzz Testing (500 seeded PRNG mutations)', () => {
    it('never throws and always returns a typed result across 500 mutations', () => {
      const baseValid = JSON.stringify({
        project: { name: 'Base App', status: 'in_progress', goal: 'Test resilience' },
        stack: [{ name: 'React', version: '18' }],
        tasks: [{ id: 't1', text: 'Task 1', status: 'todo', priority: 'medium' }],
      });

      // Simple seeded PRNG (Linear Congruential Generator)
      let seed = 123456789;
      function nextRandom() {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      }

      const mutators = [
        (s: string) => s.slice(0, Math.floor(nextRandom() * s.length)), // truncate
        (s: string) => {
          const idx = Math.floor(nextRandom() * s.length);
          return s.slice(0, idx) + '“' + s.slice(idx); // inject smart quote
        },
        (s: string) => {
          const idx = Math.floor(nextRandom() * s.length);
          return s.slice(0, idx) + ',\n}' + s.slice(idx + 1); // inject trailing comma
        },
        (s: string) => {
          const idx = Math.floor(nextRandom() * s.length);
          return s.slice(0, idx) + '// comment\n' + s.slice(idx); // inject comment
        },
        (s: string) => {
          const idx = Math.floor(nextRandom() * s.length);
          return s.slice(0, idx) + '\uFEFF' + s.slice(idx); // inject BOM
        },
        (s: string) => {
          const idx = Math.floor(nextRandom() * s.length);
          return s.slice(0, idx) + '\n' + s.slice(idx); // inject newline
        },
        (s: string) => {
          const idx = Math.floor(nextRandom() * s.length);
          return s.slice(0, idx) + '```json\n' + s.slice(idx) + '\n```'; // wrap in fence
        },
      ];

      for (let i = 0; i < 500; i++) {
        let mutated = baseValid;
        const numMutations = 1 + Math.floor(nextRandom() * 3);
        for (let m = 0; m < numMutations; m++) {
          const mutator = mutators[Math.floor(nextRandom() * mutators.length)];
          if (mutator) {
            mutated = mutator(mutated);
          }
        }

        let res;
        expect(() => {
          res = extractJson(mutated);
        }).not.toThrow();

        expect(typeof res!.ok).toBe('boolean');
        if (!res!.ok) {
          expect(typeof res!.code).toBe('string');
          expect(typeof res!.message).toBe('string');
        }
      }
    });
  });

  describe('Safety & Security', () => {
    it('does not pollute Object.prototype via __proto__ payloads', () => {
      const payload = '{"__proto__":{"polluted":true},"project":{"name":"SafeApp"}}';
      const res = extractJson(payload);
      expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
      expect(res.ok).toBe(true);
    });

    it('logs absolutely nothing to console.log or console.error', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      extractJson('{"project":{"name":"SilentApp"},"invalid": typo}');

      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();

      logSpy.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('never leaks sentinel user strings into console output or error text beyond excerpt', () => {
      const sentinel = 'SECRET_SENTINEL_USER_CONTENT_778899';
      const text = `{"project":{"name":"${sentinel}"},"broken": typo_here}`;

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const res = extractJson(text);

      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();

      if (!res.ok) {
        expect(res.message).not.toContain(sentinel);
        if (res.excerpt) {
          expect(res.excerpt.length).toBeLessThanOrEqual(60);
        }
      }

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});
