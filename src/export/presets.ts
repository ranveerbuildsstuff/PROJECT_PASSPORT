/**
 * Destination presets and budget validation for Export Handoff Packages.
 *
 * Invariants:
 * - Pure, deterministic, zero external dependencies.
 * - Minimum budget: 1,000 tokens. Maximum budget: 2,000,000 tokens.
 * - Human, actionable plain-language validation errors.
 */

export type ExportPresetKey =
  | 'lite'
  | 'chatgpt'
  | 'claude'
  | 'gemini'
  | 'coding_agent'
  | 'custom';

export type ExportFormat = 'lite' | 'full';

export interface DestinationPreset {
  key: ExportPresetKey;
  label: string;
  defaultTokens: number;
  description: string;
  recommendedFormat: ExportFormat;
}

export const DESTINATION_PRESETS: Record<ExportPresetKey, DestinationPreset> = {
  lite: {
    key: 'lite',
    label: 'Lite paste',
    defaultTokens: 6_000,
    description: 'Compact prompt tailored for quick copy-paste into any web chat window.',
    recommendedFormat: 'lite',
  },
  coding_agent: {
    key: 'coding_agent',
    label: 'Coding Agent',
    defaultTokens: 40_000,
    description: 'Focused context budget for autonomous agents (Claude Code, Cursor, Codex).',
    recommendedFormat: 'full',
  },
  chatgpt: {
    key: 'chatgpt',
    label: 'ChatGPT',
    defaultTokens: 30_000,
    description: 'Optimized handoff context for OpenAI GPT-4o models.',
    recommendedFormat: 'lite',
  },
  claude: {
    key: 'claude',
    label: 'Claude',
    defaultTokens: 60_000,
    description: 'Expanded context handoff for Anthropic Claude 3.5 Sonnet / Opus.',
    recommendedFormat: 'lite',
  },
  gemini: {
    key: 'gemini',
    label: 'Gemini',
    defaultTokens: 100_000,
    description: 'Deep context handoff for Google Gemini 1.5 Pro / Flash large windows.',
    recommendedFormat: 'full',
  },
  custom: {
    key: 'custom',
    label: 'Custom',
    defaultTokens: 50_000,
    description: 'User-specified token budget (1,000 to 2,000,000 tokens).',
    recommendedFormat: 'lite',
  },
};

export const MIN_CUSTOM_BUDGET = 1_000;
export const MAX_CUSTOM_BUDGET = 2_000_000;

export interface BudgetValidationResult {
  isValid: boolean;
  budget?: number;
  error?: string;
}

export const INVALID_CUSTOM_BUDGET_MESSAGE =
  'Enter a whole number between 1,000 and 2,000,000.';

/**
 * Validates a custom token budget input against boundary conditions.
 * Accepts numbers or numeric strings.
 */
export function validateCustomBudget(value: unknown): BudgetValidationResult {
  if (value === undefined || value === null || value === '') {
    return {
      isValid: false,
      error: INVALID_CUSTOM_BUDGET_MESSAGE,
    };
  }

  const str = String(value).trim().replace(/,/g, '');
  if (!/^\d+$/.test(str)) {
    return {
      isValid: false,
      error: INVALID_CUSTOM_BUDGET_MESSAGE,
    };
  }

  const num = Number(str);
  if (!Number.isFinite(num) || num < MIN_CUSTOM_BUDGET || num > MAX_CUSTOM_BUDGET) {
    return {
      isValid: false,
      error: INVALID_CUSTOM_BUDGET_MESSAGE,
    };
  }

  return {
    isValid: true,
    budget: Math.floor(num),
  };
}
