import type { PassportV1 } from './passport.schema';

/**
 * Converts a PassportV1 object into a cleanly formatted Markdown document.
 * Stable section ordering:
 * 1. Title & Status
 * 2. Goal
 * 3. Summary
 * 4. Next Action
 * 5. Tech Stack
 * 6. Requirements
 * 7. Decisions
 * 8. Completed
 * 9. Tasks
 * 10. Bugs & Issues
 * 11. AI Instructions
 * 12. Open Questions
 * 13. Files
 * 14. Conversations
 *
 * Empty sections are strictly omitted.
 */
export function passportToMarkdown(passport: PassportV1): string {
  const sections: string[] = [];

  // 1. Header
  const headerLines: string[] = [
    `# ${passport.project.name || 'Untitled Project'}`,
    `Status: ${passport.project.status.toUpperCase()} | Schema: v${passport.schemaVersion}`,
  ];
  if (passport.project.updatedAt) {
    headerLines.push(`Last updated: ${passport.project.updatedAt}`);
  }
  sections.push(headerLines.join('\n'));

  // 2. Goal
  if (passport.project.goal.trim()) {
    sections.push(`## Goal\n\n${passport.project.goal.trim()}`);
  }

  // 3. Summary
  if (passport.project.summary.trim()) {
    sections.push(`## Summary\n\n${passport.project.summary.trim()}`);
  }

  // 4. Next Action
  if (passport.nextAction.trim()) {
    sections.push(`## Next Action\n\n${passport.nextAction.trim()}`);
  }

  // 5. Tech Stack
  if (passport.stack.length > 0) {
    const stackLines = passport.stack.map((item) => {
      const parts = [`- **${item.name}**`];
      const details: string[] = [];
      if (item.role) details.push(item.role);
      if (item.version) details.push(`v${item.version}`);
      if (details.length > 0) parts.push(`(${details.join(', ')})`);
      if (item.notes) parts.push(`— ${item.notes}`);
      return parts.join(' ');
    });
    sections.push(`## Tech Stack\n\n${stackLines.join('\n')}`);
  }

  // 6. Requirements
  if (passport.requirements.length > 0) {
    const reqLines = passport.requirements.map(
      (r) => `- [${r.priority.toUpperCase()}] ${r.text}`,
    );
    sections.push(`## Requirements\n\n${reqLines.join('\n')}`);
  }

  // 7. Decisions
  if (passport.decisions.length > 0) {
    const decisionLines = passport.decisions.map((d) => {
      const header = `### [${d.status.toUpperCase()}] ${d.decision}`;
      const meta = d.date ? `*Date: ${d.date}*\n\n` : '';
      const reason = `**Reason:** ${d.reason}`;
      return `${header}\n\n${meta}${reason}`;
    });
    sections.push(`## Decisions\n\n${decisionLines.join('\n\n')}`);
  }

  // 8. Completed
  if (passport.completed.length > 0) {
    const completedLines = passport.completed.map((c) => `- [x] ${c.text}`);
    sections.push(`## Completed Work\n\n${completedLines.join('\n')}`);
  }

  // 9. Tasks
  if (passport.tasks.length > 0) {
    const taskLines = passport.tasks.map(
      (t) => `- [ ] [${t.status.toUpperCase()}] [${t.priority.toUpperCase()}] ${t.text}`,
    );
    sections.push(`## Tasks\n\n${taskLines.join('\n')}`);
  }

  // 10. Bugs & Issues
  if (passport.bugs.length > 0) {
    const bugLines = passport.bugs.map(
      (b) => `- [${b.status.toUpperCase()}] [SEVERITY: ${b.severity.toUpperCase()}] ${b.text}`,
    );
    sections.push(`## Bugs & Issues\n\n${bugLines.join('\n')}`);
  } else if (passport.bugsReviewed) {
    sections.push('## Bugs & Issues\n\nNone reported (confirmed by the user)');
  }

  // 11. AI Instructions
  if (passport.instructions.length > 0) {
    const instLines = passport.instructions.map((i) => `- ${i}`);
    sections.push(`## AI Instructions\n\n${instLines.join('\n')}`);
  }

  // 12. Open Questions
  if (passport.openQuestions.length > 0) {
    const qLines = passport.openQuestions.map((q) => `- ${q}`);
    sections.push(`## Open Questions\n\n${qLines.join('\n')}`);
  }

  // 13. Files
  if (passport.files.length > 0) {
    const fileLines = passport.files.map((f) => {
      const inc = f.included ? 'included' : 'excluded';
      return `- \`${f.path}\` (${f.sizeBytes} bytes, ${inc}) — ${f.purpose}`;
    });
    sections.push(`## Project Files\n\n${fileLines.join('\n')}`);
  }

  // 14. Conversations
  if (passport.conversations.length > 0) {
    const convoLines = passport.conversations.map((c) => {
      const inc = c.included ? 'included' : 'excluded';
      return `- **${c.title}** (${c.source}, ~${c.tokenEstimate} tokens est., ${c.messageCount} messages, ${inc})`;
    });
    sections.push(`## Attached Conversations\n\n${convoLines.join('\n')}`);
  }

  return sections.join('\n\n') + '\n';
}
