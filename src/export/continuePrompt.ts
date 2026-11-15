/**
 * Deterministic, vendor-neutral generation of CONTINUE_PROMPT for recipient AI models.
 *
 * Invariants:
 * - Strictly vendor-neutral (no provider-specific phrasing, no hype).
 * - Instructs recipient AI to first confirm in its own words:
 *   1. Project objective and scope.
 *   2. Active tech stack.
 *   3. Key architectural and implementation decisions.
 *   4. Current status and active bugs.
 *   5. Next planned task.
 * - Instructs AI to pause and ask about any ambiguities before modifying code or proposing new architecture.
 * - Deterministic, pure function, zero logging.
 */

import type { ExportPlan } from './budgeter';
import { passportToMarkdown } from '../domain/markdown';

export const CONTINUE_PROMPT_VERSION = 1;

export const RECIPIENT_AI_MANDATORY_CONFIRMATION = `### Mandatory Instructions for Recipient AI:
Before generating code, making modifications, or proposing new architecture, you MUST:
1. Confirm, in your own words, your understanding of:
   a. Project objective and scope.
   b. Active tech stack and architecture.
   c. Key architectural and implementation decisions (and their rationales).
   d. Current status, open questions, and active bugs.
   e. The immediate next planned task.
2. Explicitly pause and ask about any ambiguities, missing context, or conflicting requirements before proceeding.`;

/**
 * Generates the full CONTINUE_PROMPT text according to the selected format (lite or full).
 */
export function generateContinuePrompt(plan: ExportPlan, format: 'lite' | 'full' = 'lite'): string {
  const { filteredPassport, includedFiles, includedConversations } = plan;

  if (format === 'full') {
    return generateFullBundleContinuePrompt(plan);
  }

  // Lite format: Self-contained prompt for direct clipboard paste into chat windows
  const sections: string[] = [];

  // Preamble
  sections.push(`# PROJECT HANDOFF: ${filteredPassport.project.name || 'Untitled Project'}`);
  sections.push(RECIPIENT_AI_MANDATORY_CONFIRMATION);

  // Core Passport State
  sections.push('---');
  sections.push('## Project State and Context');
  sections.push(passportToMarkdown(filteredPassport));

  // Attached Files (if any were budgeted)
  if (includedFiles.length > 0) {
    sections.push('---');
    sections.push(`## Included Files (${includedFiles.length})`);
    for (const file of includedFiles) {
      const ext = file.path.includes('.') ? file.path.split('.').pop() || '' : '';
      sections.push(`### File: \`${file.path}\`\nPurpose: ${file.purpose || 'Project source file'}\n\`\`\`${ext}\n${file.content}\n\`\`\``);
    }
  }

  // Attached Conversation Excerpts (if any were budgeted)
  if (includedConversations.length > 0) {
    sections.push('---');
    sections.push(`## Context Conversations (${includedConversations.length})`);
    for (const conv of includedConversations) {
      const trimNotice = conv.isTrimmed
        ? ` *(trimmed: newest ${conv.turns.length} of ${conv.originalTurnCount} turns included)*`
        : '';
      sections.push(`### Conversation: ${conv.title || 'Untitled'} [Source: ${conv.source}]${trimNotice}`);

      for (let i = 0; i < conv.turns.length; i++) {
        const turn = conv.turns[i]!;
        sections.push(`**${turn.role.toUpperCase()}:**\n${turn.text}\n`);
      }
    }
  }

  // Closing reiteration of next action & pause
  sections.push('---');
  sections.push(`### Next Action:\n${filteredPassport.nextAction?.trim() || 'Awaiting instruction.'}`);
  sections.push(`\n*Remember: Pause and confirm the 5 points above before writing or altering any project code.*`);

  return sections.join('\n\n');
}

/**
 * Generates the CONTINUE_PROMPT.md content bundled inside the Full .zip package.
 */
function generateFullBundleContinuePrompt(plan: ExportPlan): string {
  const { filteredPassport, includedFiles, includedConversations } = plan;

  const sections: string[] = [];

  sections.push(`# PROJECT HANDOFF: ${filteredPassport.project.name || 'Untitled Project'}`);
  sections.push(RECIPIENT_AI_MANDATORY_CONFIRMATION);

  sections.push('---');
  sections.push('## Package Contents');
  sections.push(`This verified handoff package contains:
- \`project-passport.json\`: Structured Passport Schema v1 JSON definition.
- \`PROJECT_STATE.md\`: Executive summary of project goals, stack, requirements, decisions, tasks, and bugs.
- \`MANIFEST.json\`: SHA-256 integrity manifest for all files and artifacts.
- \`files/\`: ${includedFiles.length} included project source and configuration files.
- \`conversations/\`: ${includedConversations.length} conversation transcripts formatted as Markdown.`);

  sections.push('---');
  sections.push(`## Current Target\nNext Action: **${filteredPassport.nextAction?.trim() || 'Review project state.'}**`);
  sections.push(`\n*Please review \`PROJECT_STATE.md\` and \`project-passport.json\`, then confirm your understanding of the 5 points above.*`);

  return sections.join('\n\n');
}
