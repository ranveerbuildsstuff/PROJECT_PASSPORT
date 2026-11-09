/**
 * Calculates estimated token count based on character length.
 * Formula: Math.ceil(characters / 4).
 * Always labelled "estimate" in UI displays.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Returns formatted string with token estimate label for UI display.
 */
export function formatTokenEstimate(tokens: number): string {
  return `~${tokens.toLocaleString()} tokens (estimate)`;
}
