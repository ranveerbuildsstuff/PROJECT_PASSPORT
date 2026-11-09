import { describe, it, expect } from 'vitest';
import { estimateTokens, formatTokenEstimate } from '../tokens';

describe('Token Estimation Utilities', () => {
  it('returns 0 for empty or nullish strings', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('calculates Math.ceil(characters / 4)', () => {
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('12345678')).toBe(2);
    expect(estimateTokens('123456789')).toBe(3);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
    expect(estimateTokens('a'.repeat(401))).toBe(101);
  });

  it('formatTokenEstimate includes the mandatory "estimate" label', () => {
    const formatted = formatTokenEstimate(1250);
    expect(formatted).toContain('tokens (estimate)');
    expect(formatted).toBe('~1,250 tokens (estimate)');
  });
});
