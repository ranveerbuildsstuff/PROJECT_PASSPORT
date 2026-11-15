import {
  ProjectStatusSchema,
  RequirementPrioritySchema,
  DecisionStatusSchema,
  TaskStatusSchema,
  TaskPrioritySchema,
  BugSeveritySchema,
  BugStatusSchema,
  type ConversationTurn,
  estimateTokens,
} from '../domain';

export const CAPTURE_PROMPT_VERSION = 1;
export const RECONSTRUCT_PROMPT_VERSION = 1;

export const DEFAULT_RECONSTRUCT_TOKEN_CAP = 30_000;

/**
 * Shared Schema v1 rules so capture and reconstruct prompts cannot drift.
 */
export const SCHEMA_V1_RULES = `Instructions:
1. Reply with ONLY one JSON object in one \`\`\`json block.
2. Follow the skeleton, and omit fields rather than invent.
3. Decisions need reasons.
4. List completed items, pending tasks and open bugs accurately.
5. Set bugsReviewed true only if certain there are no open bugs.
6. Always give nextAction.
7. Put uncertainty in openQuestions.
8. Never include secrets (write [REDACTED]).
9. Omit project id, timestamps, files and conversations.`;

function getEnumOptionsText(): string {
  const projectStatuses = ProjectStatusSchema.options.join(', ');
  const reqPriorities = RequirementPrioritySchema.options.join(', ');
  const decisionStatuses = DecisionStatusSchema.options.join(', ');
  const taskStatuses = TaskStatusSchema.options.join(', ');
  const taskPriorities = TaskPrioritySchema.options.join(', ');
  const bugSeverities = BugSeveritySchema.options.join(', ');
  const bugStatuses = BugStatusSchema.options.join(', ');

  return `Field values and enum options:
- project.status options: ${projectStatuses}
- requirements[].priority options: ${reqPriorities}
- decisions[].status options: ${decisionStatuses}
- tasks[].status options: ${taskStatuses}
- tasks[].priority options: ${taskPriorities}
- bugs[].severity options: ${bugSeverities}
- bugs[].status options: ${bugStatuses}`;
}

export const SCHEMA_V1_SKELETON = `Skeleton:
\`\`\`json
{
  "project": {
    "name": "Project Name",
    "goal": "Core objective and purpose of the project",
    "summary": "Executive summary of the current state and progress",
    "status": "in_progress"
  },
  "stack": [
    {
      "name": "Technology Name",
      "role": "Role in architecture",
      "version": "1.0",
      "notes": "Key configuration notes"
    }
  ],
  "requirements": [
    {
      "text": "Requirement description",
      "priority": "must"
    }
  ],
  "decisions": [
    {
      "decision": "Architectural or technical decision",
      "reason": "Rationale explaining why this decision was made",
      "status": "active"
    }
  ],
  "completed": [
    {
      "text": "Completed task or milestone description"
    }
  ],
  "tasks": [
    {
      "text": "Pending task description",
      "status": "todo",
      "priority": "medium"
    }
  ],
  "bugs": [
    {
      "text": "Known bug or limitation description",
      "severity": "medium",
      "status": "open"
    }
  ],
  "bugsReviewed": false,
  "instructions": [
    "AI convention, constraint, or coding style rule"
  ],
  "nextAction": "Specific, immediate next action to take",
  "openQuestions": [
    "Unresolved technical or product question"
  ]
}
\`\`\``;

/**
 * Generates a deterministic, vendor-neutral capture prompt that instructs an AI assistant
 * to summarize the project context into a single JSON passport adhering to Schema v1.
 */
export function generateCapturePrompt(): string {
  return `You are helping summarize the current state of our project into a portable structured project passport.

${SCHEMA_V1_RULES}

${getEnumOptionsText()}

${SCHEMA_V1_SKELETON}
`;
}

export interface ReconstructPromptOptions {
  tokenCap?: number;
}

export interface ReconstructPromptResult {
  prompt: string;
  includedTurns: number;
  omittedTurns: number;
  estimatedTokens: number;
}

/**
 * Generates a deterministic, vendor-neutral reconstruct prompt from attached conversation turns.
 * Trims oldest turns first to fit within the specified token cap (default 30,000 tokens).
 * If even the newest single turn exceeds the cap, includes it truncated.
 */
export function generateReconstructPrompt(
  turns: readonly ConversationTurn[],
  options?: ReconstructPromptOptions
): ReconstructPromptResult {
  const tokenCap = options?.tokenCap ?? DEFAULT_RECONSTRUCT_TOKEN_CAP;

  if (turns.length === 0) {
    const emptyPrompt = `You are reconstructing a project passport from a past conversation transcript.
The conversation below is the source of truth for reconstructing the project passport.

${SCHEMA_V1_RULES}

${getEnumOptionsText()}

${SCHEMA_V1_SKELETON}

=== CONVERSATION TRANSCRIPT START ===
(No conversation turns attached)
=== CONVERSATION TRANSCRIPT END ===
`;
    return {
      prompt: emptyPrompt,
      includedTurns: 0,
      omittedTurns: 0,
      estimatedTokens: estimateTokens(emptyPrompt),
    };
  }

  // Work backwards from newest turn to oldest turn to fit within tokenCap
  const included: ConversationTurn[] = [];
  let currentTokens = 0;
  let singleTurnTruncated = false;

  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (!turn) continue;
    const turnTokens = estimateTokens(turn.text);

    if (currentTokens + turnTokens <= tokenCap) {
      included.unshift(turn);
      currentTokens += turnTokens;
    } else {
      if (included.length === 0) {
        // Even the single newest turn exceeds the cap: truncate it to fit tokenCap
        singleTurnTruncated = true;
        const charBudget = Math.max(100, tokenCap * 4 - 200);
        const truncatedText =
          turn.text.slice(0, charBudget).trim() +
          '\n\n[...Message truncated to fit token cap...]';
        included.unshift({
          id: turn.id,
          role: turn.role,
          text: truncatedText,
        });
        currentTokens = estimateTokens(truncatedText);
      }
      break;
    }
  }

  const includedTurns = included.length;
  const omittedTurns = turns.length - includedTurns;

  const notes: string[] = [];
  if (omittedTurns > 0) {
    notes.push(
      `[Note: The oldest ${omittedTurns} messages were omitted to fit within the ${tokenCap.toLocaleString()} token cap.]`
    );
  }
  if (singleTurnTruncated) {
    notes.push(
      `[Note: The newest message was truncated to fit within the ${tokenCap.toLocaleString()} token cap.]`
    );
  }

  const notesText = notes.length > 0 ? `${notes.join('\n')}\n\n` : '';

  const renderedTurns = included
    .map((turn, index) => {
      const turnNumber = index + 1;
      const roleLabel = turn.role === 'user' ? 'USER' : 'ASSISTANT';
      return `--- BEGIN MESSAGE ${turnNumber} (${roleLabel}) ---
${turn.text}
--- END MESSAGE ${turnNumber} ---`;
    })
    .join('\n\n');

  const prompt = `You are reconstructing a project passport from a past conversation transcript.
The conversation below is the source of truth for reconstructing the project passport.

${SCHEMA_V1_RULES}

${getEnumOptionsText()}

${SCHEMA_V1_SKELETON}

=== CONVERSATION TRANSCRIPT START ===
${notesText}${renderedTurns}
=== CONVERSATION TRANSCRIPT END ===
`;

  return {
    prompt,
    includedTurns,
    omittedTurns,
    estimatedTokens: estimateTokens(prompt),
  };
}
