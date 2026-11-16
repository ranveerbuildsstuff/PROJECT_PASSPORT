import { describe, it, expect } from 'vitest';
import {
  DESTINATION_PRESETS,
  validateCustomBudget,
} from '../../src/export/presets';

describe('export presets module', () => {
  it('defines all required presets with exact budget tokens', () => {
    expect(DESTINATION_PRESETS.lite.defaultTokens).toBe(6_000);
    expect(DESTINATION_PRESETS.chatgpt.defaultTokens).toBe(30_000);
    expect(DESTINATION_PRESETS.claude.defaultTokens).toBe(60_000);
    expect(DESTINATION_PRESETS.gemini.defaultTokens).toBe(100_000);
    expect(DESTINATION_PRESETS.coding_agent.defaultTokens).toBe(40_000);
    expect(DESTINATION_PRESETS.custom.defaultTokens).toBe(50_000);
  });

  it('validates custom budget within [1,000, 2,000,000]', () => {
    expect(validateCustomBudget(1_000)).toEqual({ isValid: true, budget: 1_000 });
    expect(validateCustomBudget(2_000_000)).toEqual({ isValid: true, budget: 2_000_000 });
    expect(validateCustomBudget(45_000)).toEqual({ isValid: true, budget: 45_000 });
    expect(validateCustomBudget('10,000')).toEqual({ isValid: true, budget: 10_000 });
    expect(validateCustomBudget('  25000  ')).toEqual({ isValid: true, budget: 25_000 });
  });

  it('rejects values below 1,000 with exact plain-language error', () => {
    const res = validateCustomBudget(999);
    expect(res.isValid).toBe(false);
    expect(res.error).toBe('Enter a whole number between 1,000 and 2,000,000.');
  });

  it('rejects values above 2,000,000 with exact plain-language error', () => {
    const res = validateCustomBudget(2_000_001);
    expect(res.isValid).toBe(false);
    expect(res.error).toBe('Enter a whole number between 1,000 and 2,000,000.');
  });

  it('rejects non-numbers, negative numbers, decimals, and empty inputs with exact error', () => {
    expect(validateCustomBudget('').error).toBe('Enter a whole number between 1,000 and 2,000,000.');
    expect(validateCustomBudget(null).error).toBe('Enter a whole number between 1,000 and 2,000,000.');
    expect(validateCustomBudget(undefined).error).toBe('Enter a whole number between 1,000 and 2,000,000.');
    expect(validateCustomBudget('abc').error).toBe('Enter a whole number between 1,000 and 2,000,000.');
    expect(validateCustomBudget('-500').error).toBe('Enter a whole number between 1,000 and 2,000,000.');
    expect(validateCustomBudget('1234.56').error).toBe('Enter a whole number between 1,000 and 2,000,000.');
  });
});
