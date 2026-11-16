/**
 * Pure, deterministic 4-tier token budget allocation and priority truncation.
 *
 * Tiers:
 * - Tier 1: Fixed continue instructions, project header, goal, summary, status,
 *           tech stack, requirements, instructions, next action.
 *           (Never dropped; may exceed budget with a clear warning).
 * - Tier 2: Active decisions, pending tasks, open bugs, open questions.
 * - Tier 2b: Superseded decisions, done tasks, fixed bugs, completed milestones.
 * - Tier 3: Included files in manifest order. Whole files only.
 *           Stops at first file that does not fit (no skipping).
 * - Tier 4: Conversation excerpts, newest turns first, whole turns only, oldest trimmed.
 *
 * Invariants:
 * - Pure function, deterministic, never throws.
 * - Every entity across all tiers reported exactly once in plan items.
 * - All token values labelled "estimate".
 */

import type { PassportV1, Decision, Task, Bug, CompletedItem } from '../domain/passport.schema';
import type { ConversationTurn } from '../domain';
import type { FileRecord, ConversationRecord } from '../storage/db';
import { estimateTokens } from '../domain/tokens';

export type PlanItemStatus = 'included' | 'trimmed' | 'omitted';
export type PlanTier = '1' | '2' | '2b' | '3' | '4';

export interface PlanItem {
  id: string;
  title: string;
  category: string;
  tier: PlanTier;
  status: PlanItemStatus;
  estimatedTokens: number;
  reason: string;
  details?: string;
}

export interface BudgetedConversation {
  id: string;
  title: string;
  source: string;
  turns: ConversationTurn[];
  originalTurnCount: number;
  tokens: number;
  isTrimmed: boolean;
}

export interface BudgetedFile {
  path: string;
  purpose: string;
  content: string;
  sizeBytes: number;
  tokens: number;
}

export interface ExportBudgeterInput {
  passport: PassportV1;
  files?: FileRecord[];
  conversations?: Array<{
    record: ConversationRecord;
    turns: ConversationTurn[];
  }>;
}

export interface ExportPlan {
  budget: number;
  totalEstimatedTokens: number;
  isOverBudget: boolean;
  overBudgetWarning: string | null;

  tier1Tokens: number;
  tier2Tokens: number;
  tier2bTokens: number;
  tier3Tokens: number;
  tier4Tokens: number;

  allItems: PlanItem[];
  includedItems: PlanItem[];
  trimmedItems: PlanItem[];
  omittedItems: PlanItem[];

  filteredPassport: PassportV1;
  includedFiles: BudgetedFile[];
  includedConversations: BudgetedConversation[];
}

// Estimated overhead for the fixed CONTINUE_PROMPT preamble & recipient instructions
export const CONTINUE_PROMPT_FIXED_OVERHEAD_TOKENS = 280;

function formatTokens(t: number): string {
  return `~${t.toLocaleString()} tokens (estimate)`;
}

export function planExport(input: ExportBudgeterInput, budget: number): ExportPlan {
  const { passport, files = [], conversations = [] } = input;
  const allItems: PlanItem[] = [];

  let consumedTokens = 0;

  // -------------------------------------------------------------
  // TIER 1: Core State & Instructions (Never dropped)
  // -------------------------------------------------------------
  let t1Tokens = CONTINUE_PROMPT_FIXED_OVERHEAD_TOKENS;

  allItems.push({
    id: 'tier1:instructions',
    title: 'Recipient AI Continue Instructions',
    category: 'Instructions',
    tier: '1',
    status: 'included',
    estimatedTokens: CONTINUE_PROMPT_FIXED_OVERHEAD_TOKENS,
    reason: 'Fixed instructions requiring AI to confirm scope and ask questions before editing.',
  });

  // Project Header, Goal, Summary, Status
  const headerText = `${passport.project.name} (Status: ${passport.project.status})\nGoal: ${passport.project.goal}\nSummary: ${passport.project.summary}`;
  const headerTokens = estimateTokens(headerText);
  t1Tokens += headerTokens;
  allItems.push({
    id: 'tier1:project_header',
    title: `Project: ${passport.project.name || 'Untitled'}`,
    category: 'Header',
    tier: '1',
    status: 'included',
    estimatedTokens: headerTokens,
    reason: 'Always retained: core project identity, goal, and status.',
  });

  // Next action
  if (passport.nextAction.trim()) {
    const naTokens = estimateTokens(`Next Action:\n${passport.nextAction.trim()}`);
    t1Tokens += naTokens;
    allItems.push({
      id: 'tier1:next_action',
      title: 'Next Planned Action',
      category: 'Next Action',
      tier: '1',
      status: 'included',
      estimatedTokens: naTokens,
      reason: 'Always retained: immediate next action for continuation.',
    });
  }

  // Stack
  if (passport.stack && passport.stack.length > 0) {
    const stackText = passport.stack.map((s) => `- ${s.name}: ${s.role}`).join('\n');
    const stackTokens = estimateTokens(`Tech Stack:\n${stackText}`);
    t1Tokens += stackTokens;
    allItems.push({
      id: 'tier1:stack',
      title: `Tech Stack (${passport.stack.length} technologies)`,
      category: 'Tech Stack',
      tier: '1',
      status: 'included',
      estimatedTokens: stackTokens,
      reason: 'Always retained: active architecture and technologies.',
    });
  }

  // Requirements
  if (passport.requirements && passport.requirements.length > 0) {
    const reqText = passport.requirements.map((r) => `- [${r.priority}] ${r.text}`).join('\n');
    const reqTokens = estimateTokens(`Requirements:\n${reqText}`);
    t1Tokens += reqTokens;
    allItems.push({
      id: 'tier1:requirements',
      title: `Requirements (${passport.requirements.length} specifications)`,
      category: 'Requirements',
      tier: '1',
      status: 'included',
      estimatedTokens: reqTokens,
      reason: 'Always retained: foundational project requirements.',
    });
  }

  // AI Instructions
  if (passport.instructions && passport.instructions.length > 0) {
    const instrText = passport.instructions.map((i) => `- ${i}`).join('\n');
    const instrTokens = estimateTokens(`Instructions:\n${instrText}`);
    t1Tokens += instrTokens;
    allItems.push({
      id: 'tier1:instructions_list',
      title: `Custom Instructions (${passport.instructions.length} rules)`,
      category: 'Instructions',
      tier: '1',
      status: 'included',
      estimatedTokens: instrTokens,
      reason: 'Always retained: developer and project rules.',
    });
  }

  consumedTokens += t1Tokens;

  // Warning if Tier 1 exceeds budget
  const isTier1Over = t1Tokens > budget;
  const overBudgetWarning = isTier1Over
    ? `Core project state alone (${formatTokens(t1Tokens)}) exceeds the chosen budget (${formatTokens(budget)}). It is included in full, but recipient models may truncate.`
    : null;

  // -------------------------------------------------------------
  // TIER 2: Active Decisions, Pending Tasks, Open Bugs, Open Questions
  // -------------------------------------------------------------
  let t2Tokens = 0;
  const activeDecisions: Decision[] = [];
  const pendingTasks: Task[] = [];
  const openBugs: Bug[] = [];
  const openQuestions: string[] = [];

  // Active Decisions
  const rawActiveDecisions = (passport.decisions || []).filter((d) => d.status === 'active');
  for (const d of rawActiveDecisions) {
    const itemTokens = estimateTokens(`Decision: ${d.decision} (Reason: ${d.reason})`);
    if (consumedTokens + itemTokens <= budget) {
      consumedTokens += itemTokens;
      t2Tokens += itemTokens;
      activeDecisions.push(d);
      allItems.push({
        id: `tier2:dec:${d.id}`,
        title: `Decision: ${d.decision}`,
        category: 'Active Decision',
        tier: '2',
        status: 'included',
        estimatedTokens: itemTokens,
        reason: 'Fits within token budget.',
      });
    } else {
      allItems.push({
        id: `tier2:dec:${d.id}`,
        title: `Decision: ${d.decision}`,
        category: 'Active Decision',
        tier: '2',
        status: 'omitted',
        estimatedTokens: itemTokens,
        reason: 'Omitted because item exceeds remaining token budget.',
      });
    }
  }

  // Pending Tasks
  const rawPendingTasks = (passport.tasks || []).filter((t) => t.status !== 'done');
  for (const t of rawPendingTasks) {
    const itemTokens = estimateTokens(`Task [${t.status}/${t.priority}]: ${t.text}`);
    if (consumedTokens + itemTokens <= budget) {
      consumedTokens += itemTokens;
      t2Tokens += itemTokens;
      pendingTasks.push(t);
      allItems.push({
        id: `tier2:task:${t.id}`,
        title: `Task: ${t.text}`,
        category: 'Pending Task',
        tier: '2',
        status: 'included',
        estimatedTokens: itemTokens,
        reason: 'Fits within token budget.',
      });
    } else {
      allItems.push({
        id: `tier2:task:${t.id}`,
        title: `Task: ${t.text}`,
        category: 'Pending Task',
        tier: '2',
        status: 'omitted',
        estimatedTokens: itemTokens,
        reason: 'Omitted because item exceeds remaining token budget.',
      });
    }
  }

  // Open Bugs
  const rawOpenBugs = (passport.bugs || []).filter((b) => b.status === 'open');
  for (const b of rawOpenBugs) {
    const itemTokens = estimateTokens(`Bug [${b.severity}]: ${b.text}`);
    if (consumedTokens + itemTokens <= budget) {
      consumedTokens += itemTokens;
      t2Tokens += itemTokens;
      openBugs.push(b);
      allItems.push({
        id: `tier2:bug:${b.id}`,
        title: `Bug: ${b.text}`,
        category: 'Open Bug',
        tier: '2',
        status: 'included',
        estimatedTokens: itemTokens,
        reason: 'Fits within token budget.',
      });
    } else {
      allItems.push({
        id: `tier2:bug:${b.id}`,
        title: `Bug: ${b.text}`,
        category: 'Open Bug',
        tier: '2',
        status: 'omitted',
        estimatedTokens: itemTokens,
        reason: 'Omitted because item exceeds remaining token budget.',
      });
    }
  }

  // Open Questions
  const rawQuestions = passport.openQuestions || [];
  for (let i = 0; i < rawQuestions.length; i++) {
    const q = rawQuestions[i]!;
    const itemTokens = estimateTokens(`Question: ${q}`);
    if (consumedTokens + itemTokens <= budget) {
      consumedTokens += itemTokens;
      t2Tokens += itemTokens;
      openQuestions.push(q);
      allItems.push({
        id: `tier2:question:${i}`,
        title: `Question: ${q}`,
        category: 'Open Question',
        tier: '2',
        status: 'included',
        estimatedTokens: itemTokens,
        reason: 'Fits within token budget.',
      });
    } else {
      allItems.push({
        id: `tier2:question:${i}`,
        title: `Question: ${q}`,
        category: 'Open Question',
        tier: '2',
        status: 'omitted',
        estimatedTokens: itemTokens,
        reason: 'Omitted because item exceeds remaining token budget.',
      });
    }
  }

  // -------------------------------------------------------------
  // TIER 2b: Superseded Decisions, Done Tasks, Fixed Bugs, Completed Milestones
  // -------------------------------------------------------------
  let t2bTokens = 0;
  const supersededDecisions: Decision[] = [];
  const doneTasks: Task[] = [];
  const fixedBugs: Bug[] = [];
  const completedMilestones: CompletedItem[] = [];

  // Completed Milestones
  const rawCompleted = passport.completed || [];
  for (const c of rawCompleted) {
    const itemTokens = estimateTokens(`Completed: ${c.text}`);
    if (consumedTokens + itemTokens <= budget) {
      consumedTokens += itemTokens;
      t2bTokens += itemTokens;
      completedMilestones.push(c);
      allItems.push({
        id: `tier2b:completed:${c.id}`,
        title: `Completed: ${c.text}`,
        category: 'Milestone',
        tier: '2b',
        status: 'included',
        estimatedTokens: itemTokens,
        reason: 'Fits within token budget.',
      });
    } else {
      allItems.push({
        id: `tier2b:completed:${c.id}`,
        title: `Completed: ${c.text}`,
        category: 'Milestone',
        tier: '2b',
        status: 'omitted',
        estimatedTokens: itemTokens,
        reason: 'Omitted because item exceeds remaining token budget.',
      });
    }
  }

  // Done Tasks
  const rawDoneTasks = (passport.tasks || []).filter((t) => t.status === 'done');
  for (const t of rawDoneTasks) {
    const itemTokens = estimateTokens(`Task [done]: ${t.text}`);
    if (consumedTokens + itemTokens <= budget) {
      consumedTokens += itemTokens;
      t2bTokens += itemTokens;
      doneTasks.push(t);
      allItems.push({
        id: `tier2b:task:${t.id}`,
        title: `Task [Done]: ${t.text}`,
        category: 'Completed Task',
        tier: '2b',
        status: 'included',
        estimatedTokens: itemTokens,
        reason: 'Fits within token budget.',
      });
    } else {
      allItems.push({
        id: `tier2b:task:${t.id}`,
        title: `Task [Done]: ${t.text}`,
        category: 'Completed Task',
        tier: '2b',
        status: 'omitted',
        estimatedTokens: itemTokens,
        reason: 'Omitted because item exceeds remaining token budget.',
      });
    }
  }

  // Fixed Bugs
  const rawFixedBugs = (passport.bugs || []).filter((b) => b.status === 'fixed');
  for (const b of rawFixedBugs) {
    const itemTokens = estimateTokens(`Bug [fixed]: ${b.text}`);
    if (consumedTokens + itemTokens <= budget) {
      consumedTokens += itemTokens;
      t2bTokens += itemTokens;
      fixedBugs.push(b);
      allItems.push({
        id: `tier2b:bug:${b.id}`,
        title: `Bug [Fixed]: ${b.text}`,
        category: 'Fixed Bug',
        tier: '2b',
        status: 'included',
        estimatedTokens: itemTokens,
        reason: 'Fits within token budget.',
      });
    } else {
      allItems.push({
        id: `tier2b:bug:${b.id}`,
        title: `Bug [Fixed]: ${b.text}`,
        category: 'Fixed Bug',
        tier: '2b',
        status: 'omitted',
        estimatedTokens: itemTokens,
        reason: 'Omitted because item exceeds remaining token budget.',
      });
    }
  }

  // Superseded Decisions
  const rawSuperseded = (passport.decisions || []).filter((d) => d.status === 'superseded');
  for (const d of rawSuperseded) {
    const itemTokens = estimateTokens(`Decision [superseded]: ${d.decision}`);
    if (consumedTokens + itemTokens <= budget) {
      consumedTokens += itemTokens;
      t2bTokens += itemTokens;
      supersededDecisions.push(d);
      allItems.push({
        id: `tier2b:dec:${d.id}`,
        title: `Decision [Superseded]: ${d.decision}`,
        category: 'Superseded Decision',
        tier: '2b',
        status: 'included',
        estimatedTokens: itemTokens,
        reason: 'Fits within token budget.',
      });
    } else {
      allItems.push({
        id: `tier2b:dec:${d.id}`,
        title: `Decision [Superseded]: ${d.decision}`,
        category: 'Superseded Decision',
        tier: '2b',
        status: 'omitted',
        estimatedTokens: itemTokens,
        reason: 'Omitted because item exceeds remaining token budget.',
      });
    }
  }

  // -------------------------------------------------------------
  // TIER 3: Files (Manifest order, whole files only, stop at first that fails)
  // -------------------------------------------------------------
  let t3Tokens = 0;
  const includedFiles: BudgetedFile[] = [];

  const fileMap = new Map<string, FileRecord>();
  for (const f of files) {
    fileMap.set(f.path, f);
  }

  const manifestFiles = (passport.files || []).filter((f) => f.included);
  let filesTruncated = false;

  for (const mf of manifestFiles) {
    const fileRec = fileMap.get(mf.path);
    const rawContent = fileRec?.content ?? '';
    const content = typeof rawContent === 'string' ? rawContent : new TextDecoder().decode(rawContent);
    // Format in handoff: `### File: path (purpose)\n```ext\ncontent\n```\n`
    const fileTokens = estimateTokens(`File: ${mf.path}\nPurpose: ${mf.purpose}\n${content}`);

    if (!filesTruncated && consumedTokens + fileTokens <= budget) {
      consumedTokens += fileTokens;
      t3Tokens += fileTokens;
      includedFiles.push({
        path: mf.path,
        purpose: mf.purpose,
        content,
        sizeBytes: mf.sizeBytes,
        tokens: fileTokens,
      });
      allItems.push({
        id: `tier3:file:${mf.path}`,
        title: mf.path,
        category: 'Project File',
        tier: '3',
        status: 'included',
        estimatedTokens: fileTokens,
        reason: 'Whole file fits within remaining token budget.',
      });
    } else {
      const reason = filesTruncated
        ? 'Omitted to preserve priority: an earlier file in manifest order did not fit.'
        : `Omitted because file (${formatTokens(fileTokens)}) exceeds remaining budget (${formatTokens(Math.max(0, budget - consumedTokens))}).`;
      filesTruncated = true;
      allItems.push({
        id: `tier3:file:${mf.path}`,
        title: mf.path,
        category: 'Project File',
        tier: '3',
        status: 'omitted',
        estimatedTokens: fileTokens,
        reason,
      });
    }
  }

  // -------------------------------------------------------------
  // TIER 4: Conversations (Newest turns first, whole turns only, oldest trimmed)
  // -------------------------------------------------------------
  let t4Tokens = 0;
  const includedConversations: BudgetedConversation[] = [];

  const convMap = new Map<string, { record: ConversationRecord; turns: ConversationTurn[] }>();
  for (const c of conversations) {
    convMap.set(c.record.id, c);
  }

  const manifestConvs = (passport.conversations || []).filter((c) => c.included);

  for (const mc of manifestConvs) {
    const convData = convMap.get(mc.id);
    const turns = convData?.turns ?? [];
    const originalTurnCount = turns.length;

    if (turns.length === 0) {
      allItems.push({
        id: `tier4:conv:${mc.id}`,
        title: mc.title || 'Untitled Conversation',
        category: 'Conversation',
        tier: '4',
        status: 'omitted',
        estimatedTokens: 0,
        reason: 'No conversation turns available.',
      });
      continue;
    }

    // Try fitting turns newest first (index: turns.length - 1 down to 0)
    const fittedTurns: ConversationTurn[] = [];
    let convFittedTokens = 0;
    const headerTokens = estimateTokens(`Conversation: ${mc.title} (${mc.source})\n`);

    if (consumedTokens + headerTokens > budget) {
      // Cannot even fit conversation header
      const totalConvTokens = estimateTokens(
        turns.map((t) => `${t.role}: ${t.text}`).join('\n')
      );
      allItems.push({
        id: `tier4:conv:${mc.id}`,
        title: mc.title || 'Untitled Conversation',
        category: 'Conversation',
        tier: '4',
        status: 'omitted',
        estimatedTokens: totalConvTokens,
        reason: `Omitted because conversation exceeds remaining budget (${formatTokens(Math.max(0, budget - consumedTokens))}).`,
      });
      continue;
    }

    convFittedTokens += headerTokens;

    for (let i = turns.length - 1; i >= 0; i--) {
      const turn = turns[i]!;
      const turnTokens = estimateTokens(`Turn (${turn.role}): ${turn.text}\n`);
      if (consumedTokens + convFittedTokens + turnTokens <= budget) {
        convFittedTokens += turnTokens;
        fittedTurns.unshift(turn); // Keep chronological order
      } else {
        // Stop adding older turns
        break;
      }
    }

    if (fittedTurns.length === 0) {
      // Could not fit even one turn
      const totalConvTokens = estimateTokens(
        turns.map((t) => `${t.role}: ${t.text}`).join('\n')
      );
      allItems.push({
        id: `tier4:conv:${mc.id}`,
        title: mc.title || 'Untitled Conversation',
        category: 'Conversation',
        tier: '4',
        status: 'omitted',
        estimatedTokens: totalConvTokens,
        reason: 'Omitted because even the single newest turn exceeds remaining budget.',
      });
    } else {
      consumedTokens += convFittedTokens;
      t4Tokens += convFittedTokens;
      const isTrimmed = fittedTurns.length < originalTurnCount;
      const omittedTurns = originalTurnCount - fittedTurns.length;

      includedConversations.push({
        id: mc.id,
        title: mc.title,
        source: mc.source,
        turns: fittedTurns,
        originalTurnCount,
        tokens: convFittedTokens,
        isTrimmed,
      });

      if (isTrimmed) {
        allItems.push({
          id: `tier4:conv:${mc.id}`,
          title: mc.title || 'Untitled Conversation',
          category: 'Conversation',
          tier: '4',
          status: 'trimmed',
          estimatedTokens: convFittedTokens,
          reason: `${omittedTurns} older turns trimmed; newest ${fittedTurns.length} turns included within remaining budget.`,
        });
      } else {
        allItems.push({
          id: `tier4:conv:${mc.id}`,
          title: mc.title || 'Untitled Conversation',
          category: 'Conversation',
          tier: '4',
          status: 'included',
          estimatedTokens: convFittedTokens,
          reason: 'All conversation turns fit within remaining budget.',
        });
      }
    }
  }

  // -------------------------------------------------------------
  // Filtered Passport Copy
  // -------------------------------------------------------------
  // Files and conversations omitted by budget are marked included: false in exported copy
  const includedFilePaths = new Set(includedFiles.map((f) => f.path));
  const includedConvIds = new Set(includedConversations.map((c) => c.id));

  const filteredPassport: PassportV1 = {
    ...passport,
    decisions: [...activeDecisions, ...supersededDecisions],
    tasks: [...pendingTasks, ...doneTasks],
    bugs: [...openBugs, ...fixedBugs],
    completed: completedMilestones,
    openQuestions,
    files: (passport.files || []).map((f) => ({
      ...f,
      included: f.included && includedFilePaths.has(f.path),
    })),
    conversations: (passport.conversations || []).map((c) => ({
      ...c,
      included: c.included && includedConvIds.has(c.id),
    })),
  };

  const includedItems = allItems.filter((i) => i.status === 'included');
  const trimmedItems = allItems.filter((i) => i.status === 'trimmed');
  const omittedItems = allItems.filter((i) => i.status === 'omitted');

  return {
    budget,
    totalEstimatedTokens: consumedTokens,
    isOverBudget: consumedTokens > budget,
    overBudgetWarning,
    tier1Tokens: t1Tokens,
    tier2Tokens: t2Tokens,
    tier2bTokens: t2bTokens,
    tier3Tokens: t3Tokens,
    tier4Tokens: t4Tokens,
    allItems,
    includedItems,
    trimmedItems,
    omittedItems,
    filteredPassport,
    includedFiles,
    includedConversations,
  };
}
