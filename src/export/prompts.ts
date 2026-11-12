import {
  ProjectStatusSchema,
  RequirementPrioritySchema,
  DecisionStatusSchema,
  TaskStatusSchema,
  TaskPrioritySchema,
  BugSeveritySchema,
  BugStatusSchema,
} from '../domain';

export const CAPTURE_PROMPT_VERSION = 1;

/**
 * Generates a deterministic, vendor-neutral capture prompt that instructs an AI assistant
 * to summarize the project context into a single JSON passport adhering to Schema v1.
 */
export function generateCapturePrompt(): string {
  const projectStatuses = ProjectStatusSchema.options.join(', ');
  const reqPriorities = RequirementPrioritySchema.options.join(', ');
  const decisionStatuses = DecisionStatusSchema.options.join(', ');
  const taskStatuses = TaskStatusSchema.options.join(', ');
  const taskPriorities = TaskPrioritySchema.options.join(', ');
  const bugSeverities = BugSeveritySchema.options.join(', ');
  const bugStatuses = BugStatusSchema.options.join(', ');

  return `You are helping summarize the current state of our project into a portable structured project passport.

Instructions:
1. Reply with ONLY one JSON object in one \`\`\`json block.
2. Follow the skeleton, and omit fields rather than invent.
3. Decisions need reasons.
4. List completed items, pending tasks and open bugs accurately.
5. Set bugsReviewed true only if certain there are no open bugs.
6. Always give nextAction.
7. Put uncertainty in openQuestions.
8. Never include secrets (write [REDACTED]).
9. Omit project id, timestamps, files and conversations.

Field values and enum options:
- project.status options: ${projectStatuses}
- requirements[].priority options: ${reqPriorities}
- decisions[].status options: ${decisionStatuses}
- tasks[].status options: ${taskStatuses}
- tasks[].priority options: ${taskPriorities}
- bugs[].severity options: ${bugSeverities}
- bugs[].status options: ${bugStatuses}

Skeleton:
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
\`\`\`
`;
}
