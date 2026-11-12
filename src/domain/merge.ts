import { newId } from './editor';
import type { PassportV1, Bug } from './passport.schema';
import type { MergeSectionId, PassportImport, ImportedSections, ImportedBasics, ImportedBugs } from './passportImport';

export type MergeAction = 'replace' | 'merge' | 'skip';

export type MergeChoices = Partial<Record<MergeSectionId, MergeAction>>;

export type IncomingSections = ImportedSections | PassportImport;

export interface SectionDiffSummary {
  added: number;
  changed: number;
  removed: number;
  summary: string;
}

export function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getIncomingBasics(incoming: IncomingSections): ImportedBasics | undefined {
  if ('basics' in incoming && incoming.basics) return incoming.basics;
  if ('project' in incoming && incoming.project) return incoming.project;
  return undefined;
}

export function getIncomingBugs(incoming: IncomingSections): { items: Bug[]; bugsReviewed?: boolean } {
  if (!incoming.bugs) {
    return { items: [], bugsReviewed: incoming.bugsReviewed };
  }
  if (Array.isArray(incoming.bugs)) {
    const bugsReviewed = (incoming.bugs as unknown as ImportedBugs).bugsReviewed ?? incoming.bugsReviewed;
    return { items: incoming.bugs as Bug[], bugsReviewed };
  }
  const bugsObj = incoming.bugs as unknown as { items?: Bug[]; bugsReviewed?: boolean };
  return {
    items: bugsObj.items || [],
    bugsReviewed: bugsObj.bugsReviewed ?? incoming.bugsReviewed,
  };
}

function formatSummary(added: number, changed: number, removed: number, action: MergeAction): string {
  if (action === 'skip') {
    return 'No changes (skipped)';
  }
  const parts: string[] = [];
  if (added > 0) {
    parts.push(`${added} added`);
  }
  if (changed > 0) {
    parts.push(`${changed} changed`);
  }
  if (removed > 0) {
    parts.push(`${removed} removed`);
  }
  return parts.length > 0 ? parts.join(', ') : 'No changes';
}

function itemsAreDifferent(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  keysToCompare: string[],
  normalizedKey?: string
): boolean {
  for (const key of keysToCompare) {
    const valA = (a[key] ?? '') as string;
    const valB = (b[key] ?? '') as string;
    if (normalizedKey && key === normalizedKey) {
      if (normalizeText(valA) !== normalizeText(valB)) return true;
    } else {
      if (typeof valA === 'string' && typeof valB === 'string') {
        if (valA.trim() !== valB.trim()) return true;
      } else if (valA !== valB) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Calculates added, changed, and removed counts for a given section under a chosen MergeAction.
 */
export function calculateSectionDiff(
  sectionId: MergeSectionId,
  current: PassportV1,
  incoming: IncomingSections,
  action: MergeAction
): SectionDiffSummary {
  if (action === 'skip') {
    return { added: 0, changed: 0, removed: 0, summary: 'No changes (skipped)' };
  }

  let added = 0;
  let changed = 0;
  let removed = 0;

  switch (sectionId) {
    case 'basics': {
      const incBasics = getIncomingBasics(incoming);
      const checks: Array<{
        currVal: string | undefined;
        incVal: string | undefined;
        canBeRemoved: boolean;
      }> = [
        { currVal: current.project.name, incVal: incBasics?.name, canBeRemoved: false },
        { currVal: current.project.status, incVal: incBasics?.status, canBeRemoved: false },
        { currVal: current.project.goal, incVal: incBasics?.goal, canBeRemoved: true },
        { currVal: current.project.summary, incVal: incBasics?.summary, canBeRemoved: true },
      ];

      for (const { currVal, incVal, canBeRemoved } of checks) {
        const trimmedInc = incVal?.trim();
        const trimmedCurr = currVal?.trim();
        if (action === 'merge') {
          // scalar fields replace only when incoming is non-empty
          if (trimmedInc) {
            if (!trimmedCurr) {
              added++;
            } else if (trimmedInc !== trimmedCurr) {
              changed++;
            }
          }
        } else if (action === 'replace') {
          if (trimmedInc) {
            if (!trimmedCurr) {
              added++;
            } else if (trimmedInc !== trimmedCurr) {
              changed++;
            }
          } else if (trimmedCurr && canBeRemoved) {
            removed++;
          }
        }
      }
      break;
    }

    case 'nextAction': {
      const trimmedInc = incoming.nextAction?.trim();
      const trimmedCurr = current.nextAction?.trim();
      if (trimmedInc) {
        if (!trimmedCurr) {
          added = 1;
        } else if (trimmedInc !== trimmedCurr) {
          changed = 1;
        }
      } else if (action === 'replace' && trimmedCurr) {
        removed = 1;
      }
      break;
    }

    case 'instructions':
    case 'openQuestions': {
      const currList = current[sectionId] || [];
      const incList = incoming[sectionId] || [];
      const currNormSet = new Set(currList.map(normalizeText));
      const incNormSet = new Set(incList.map(normalizeText));

      for (const inc of incList) {
        if (!currNormSet.has(normalizeText(inc))) {
          added++;
        }
      }

      if (action === 'replace') {
        for (const curr of currList) {
          if (!incNormSet.has(normalizeText(curr))) {
            removed++;
          }
        }
      }
      break;
    }

    case 'stack': {
      const currList = current.stack || [];
      const incList = incoming.stack || [];
      const matchedCurrNames = new Set<string>();

      for (const inc of incList) {
        const match = currList.find((c) => normalizeText(c.name) === normalizeText(inc.name));
        if (match) {
          matchedCurrNames.add(normalizeText(match.name));
          if (
            itemsAreDifferent(
              match as unknown as Record<string, unknown>,
              inc as unknown as Record<string, unknown>,
              ['name', 'role', 'version', 'notes'],
              'name'
            )
          ) {
            changed++;
          }
        } else {
          added++;
        }
      }

      if (action === 'replace') {
        removed = currList.length - matchedCurrNames.size;
      }
      break;
    }

    case 'requirements': {
      const currList = current.requirements || [];
      const incList = incoming.requirements || [];
      const matchedCurrIds = new Set<string>();

      for (const inc of incList) {
        const incId = (inc as { id?: string }).id;
        const match =
          (incId ? currList.find((c) => c.id === incId) : null) ||
          currList.find((c) => normalizeText(c.text) === normalizeText(inc.text));

        if (match) {
          matchedCurrIds.add(match.id);
          if (
            itemsAreDifferent(
              match as unknown as Record<string, unknown>,
              inc as unknown as Record<string, unknown>,
              ['text', 'priority'],
              'text'
            )
          ) {
            changed++;
          }
        } else {
          added++;
        }
      }

      if (action === 'replace') {
        removed = currList.length - matchedCurrIds.size;
      }
      break;
    }

    case 'decisions': {
      const currList = current.decisions || [];
      const incList = incoming.decisions || [];
      const matchedCurrIds = new Set<string>();

      for (const inc of incList) {
        const incId = (inc as { id?: string }).id;
        const match =
          (incId ? currList.find((c) => c.id === incId) : null) ||
          currList.find((c) => normalizeText(c.decision) === normalizeText(inc.decision));

        if (match) {
          matchedCurrIds.add(match.id);
          if (
            itemsAreDifferent(
              match as unknown as Record<string, unknown>,
              inc as unknown as Record<string, unknown>,
              ['decision', 'reason', 'date', 'status'],
              'decision'
            )
          ) {
            changed++;
          }
        } else {
          added++;
        }
      }

      if (action === 'replace') {
        removed = currList.length - matchedCurrIds.size;
      }
      break;
    }

    case 'completed': {
      const currList = current.completed || [];
      const incList = incoming.completed || [];
      const matchedCurrIds = new Set<string>();

      for (const inc of incList) {
        const incId = (inc as { id?: string }).id;
        const match =
          (incId ? currList.find((c) => c.id === incId) : null) ||
          currList.find((c) => normalizeText(c.text) === normalizeText(inc.text));

        if (match) {
          matchedCurrIds.add(match.id);
          if (
            itemsAreDifferent(
              match as unknown as Record<string, unknown>,
              inc as unknown as Record<string, unknown>,
              ['text'],
              'text'
            )
          ) {
            changed++;
          }
        } else {
          added++;
        }
      }

      if (action === 'replace') {
        removed = currList.length - matchedCurrIds.size;
      }
      break;
    }

    case 'tasks': {
      const currList = current.tasks || [];
      const incList = incoming.tasks || [];
      const matchedCurrIds = new Set<string>();

      for (const inc of incList) {
        const incId = (inc as { id?: string }).id;
        const match =
          (incId ? currList.find((c) => c.id === incId) : null) ||
          currList.find((c) => normalizeText(c.text) === normalizeText(inc.text));

        if (match) {
          matchedCurrIds.add(match.id);
          if (
            itemsAreDifferent(
              match as unknown as Record<string, unknown>,
              inc as unknown as Record<string, unknown>,
              ['text', 'status', 'priority'],
              'text'
            )
          ) {
            changed++;
          }
        } else {
          added++;
        }
      }

      if (action === 'replace') {
        removed = currList.length - matchedCurrIds.size;
      }
      break;
    }

    case 'bugs': {
      const currList = current.bugs || [];
      const { items: incList, bugsReviewed: incBugsReviewed } = getIncomingBugs(incoming);
      const matchedCurrIds = new Set<string>();

      for (const inc of incList) {
        const incId = (inc as { id?: string }).id;
        const match =
          (incId ? currList.find((c) => c.id === incId) : null) ||
          currList.find((c) => normalizeText(c.text) === normalizeText(inc.text));

        if (match) {
          matchedCurrIds.add(match.id);
          if (
            itemsAreDifferent(
              match as unknown as Record<string, unknown>,
              inc as unknown as Record<string, unknown>,
              ['text', 'severity', 'status'],
              'text'
            )
          ) {
            changed++;
          }
        } else {
          added++;
        }
      }

      if (action === 'replace') {
        removed = currList.length - matchedCurrIds.size;
      }

      if (incBugsReviewed !== undefined && incBugsReviewed !== current.bugsReviewed) {
        changed++;
      }
      break;
    }
  }

  return {
    added,
    changed,
    removed,
    summary: formatSummary(added, changed, removed, action),
  };
}

/**
 * Calculates diff summaries for all sections present in the incoming payload.
 */
export function calculateAllSectionDiffs(
  current: PassportV1,
  incoming: IncomingSections,
  choices: MergeChoices
): Record<MergeSectionId, SectionDiffSummary> {
  const result: Partial<Record<MergeSectionId, SectionDiffSummary>> = {};
  const allSections: MergeSectionId[] = [
    'basics',
    'stack',
    'requirements',
    'decisions',
    'completed',
    'tasks',
    'bugs',
    'instructions',
    'nextAction',
    'openQuestions',
  ];

  for (const s of allSections) {
    const action = choices[s] ?? (s === 'nextAction' ? 'replace' : 'merge');
    result[s] = calculateSectionDiff(s, current, incoming, action);
  }

  return result as Record<MergeSectionId, SectionDiffSummary>;
}

/**
 * Pure function that applies section-by-section merge choices between current and incoming passports.
 */
export function mergePassport(
  current: PassportV1,
  incoming: IncomingSections,
  choices: MergeChoices,
  idFactory: () => string = newId
): PassportV1 {
  const result: PassportV1 = JSON.parse(JSON.stringify(current));

  // 1. Basics
  const basicsAction = choices.basics ?? 'merge';
  const incBasics = getIncomingBasics(incoming);
  if (incBasics) {
    if (basicsAction === 'replace') {
      if (incBasics.name && incBasics.name.trim()) {
        result.project.name = incBasics.name.trim();
      }
      if (incBasics.status) {
        result.project.status = incBasics.status;
      }
      result.project.goal = incBasics.goal?.trim() || '';
      result.project.summary = incBasics.summary?.trim() || '';
    } else if (basicsAction === 'merge') {
      if (incBasics.name && incBasics.name.trim()) {
        result.project.name = incBasics.name.trim();
      }
      if (incBasics.status) {
        result.project.status = incBasics.status;
      }
      if (incBasics.goal && incBasics.goal.trim()) {
        result.project.goal = incBasics.goal.trim();
      }
      if (incBasics.summary && incBasics.summary.trim()) {
        result.project.summary = incBasics.summary.trim();
      }
    }
  }

  // 2. Next Action (replace-or-skip only)
  const nextActionChoice = choices.nextAction ?? 'replace';
  if (nextActionChoice === 'replace' || nextActionChoice === 'merge') {
    if (incoming.nextAction && incoming.nextAction.trim()) {
      result.nextAction = incoming.nextAction.trim();
    }
  }

  // 3. String Lists: Instructions & Open Questions
  const stringSections: Array<'instructions' | 'openQuestions'> = ['instructions', 'openQuestions'];
  for (const s of stringSections) {
    const action = choices[s] ?? 'merge';
    if (action === 'replace') {
      result[s] = (incoming[s] || []).map((str) => str.trim()).filter(Boolean);
    } else if (action === 'merge') {
      const mergedList = [...(result[s] || [])];
      const existingNorm = new Set(mergedList.map(normalizeText));
      for (const item of incoming[s] || []) {
        const trimmed = item.trim();
        if (trimmed && !existingNorm.has(normalizeText(trimmed))) {
          mergedList.push(trimmed);
          existingNorm.add(normalizeText(trimmed));
        }
      }
      result[s] = mergedList;
    }
  }

  // 4. Object Lists: Stack
  const stackAction = choices.stack ?? 'merge';
  if (stackAction === 'replace') {
    result.stack = (incoming.stack || []).map((item) => ({
      name: item.name.trim(),
      role: item.role ? item.role.trim() : undefined,
      version: item.version?.trim() || undefined,
      notes: item.notes?.trim() || undefined,
    }));
  } else if (stackAction === 'merge') {
    const list = [...(result.stack || [])];
    for (const inc of incoming.stack || []) {
      const matchIdx = list.findIndex(
        (c) => normalizeText(c.name) === normalizeText(inc.name)
      );
      if (matchIdx >= 0 && list[matchIdx]) {
        const currentItem = list[matchIdx]!;
        list[matchIdx] = {
          name: inc.name.trim(),
          role: inc.role?.trim() || currentItem.role,
          version: inc.version?.trim() || currentItem.version,
          notes: inc.notes?.trim() || currentItem.notes,
        };
      } else {
        list.push({
          name: inc.name.trim(),
          role: inc.role?.trim() || undefined,
          version: inc.version?.trim() || undefined,
          notes: inc.notes?.trim() || undefined,
        });
      }
    }
    result.stack = list;
  }

  // 5. Requirements
  const reqAction = choices.requirements ?? 'merge';
  if (reqAction === 'replace') {
    result.requirements = (incoming.requirements || []).map((item) => ({
      id: (item as { id?: string }).id || idFactory(),
      text: item.text.trim(),
      priority: item.priority || 'should',
    }));
  } else if (reqAction === 'merge') {
    const list = [...(result.requirements || [])];
    for (const inc of incoming.requirements || []) {
      const incId = (inc as { id?: string }).id;
      const matchIdx = list.findIndex(
        (c) => (incId && c.id === incId) || normalizeText(c.text) === normalizeText(inc.text)
      );
      if (matchIdx >= 0 && list[matchIdx]) {
        const currentItem = list[matchIdx]!;
        list[matchIdx] = {
          id: currentItem.id,
          text: inc.text.trim(),
          priority: inc.priority || currentItem.priority,
        };
      } else {
        list.push({
          id: incId || idFactory(),
          text: inc.text.trim(),
          priority: inc.priority || 'should',
        });
      }
    }
    result.requirements = list;
  }

  // 6. Decisions
  const decAction = choices.decisions ?? 'merge';
  if (decAction === 'replace') {
    result.decisions = (incoming.decisions || []).map((item) => ({
      id: (item as { id?: string }).id || idFactory(),
      decision: item.decision.trim(),
      reason: item.reason.trim(),
      date: item.date || new Date().toISOString().slice(0, 10),
      status: item.status || 'active',
    }));
  } else if (decAction === 'merge') {
    const list = [...(result.decisions || [])];
    for (const inc of incoming.decisions || []) {
      const incId = (inc as { id?: string }).id;
      const matchIdx = list.findIndex(
        (c) => (incId && c.id === incId) || normalizeText(c.decision) === normalizeText(inc.decision)
      );
      if (matchIdx >= 0 && list[matchIdx]) {
        const currentItem = list[matchIdx]!;
        list[matchIdx] = {
          id: currentItem.id,
          decision: inc.decision.trim(),
          reason: inc.reason.trim(),
          date: inc.date || currentItem.date,
          status: inc.status || currentItem.status,
        };
      } else {
        list.push({
          id: incId || idFactory(),
          decision: inc.decision.trim(),
          reason: inc.reason.trim(),
          date: inc.date || new Date().toISOString().slice(0, 10),
          status: inc.status || 'active',
        });
      }
    }
    result.decisions = list;
  }

  // 7. Completed
  const compAction = choices.completed ?? 'merge';
  if (compAction === 'replace') {
    result.completed = (incoming.completed || []).map((item) => ({
      id: (item as { id?: string }).id || idFactory(),
      text: item.text.trim(),
    }));
  } else if (compAction === 'merge') {
    const list = [...(result.completed || [])];
    for (const inc of incoming.completed || []) {
      const incId = (inc as { id?: string }).id;
      const matchIdx = list.findIndex(
        (c) => (incId && c.id === incId) || normalizeText(c.text) === normalizeText(inc.text)
      );
      if (matchIdx >= 0 && list[matchIdx]) {
        list[matchIdx] = {
          id: list[matchIdx]!.id,
          text: inc.text.trim(),
        };
      } else {
        list.push({
          id: incId || idFactory(),
          text: inc.text.trim(),
        });
      }
    }
    result.completed = list;
  }

  // 8. Tasks
  const taskAction = choices.tasks ?? 'merge';
  if (taskAction === 'replace') {
    result.tasks = (incoming.tasks || []).map((item) => ({
      id: (item as { id?: string }).id || idFactory(),
      text: item.text.trim(),
      status: item.status || 'todo',
      priority: item.priority || 'medium',
    }));
  } else if (taskAction === 'merge') {
    const list = [...(result.tasks || [])];
    for (const inc of incoming.tasks || []) {
      const incId = (inc as { id?: string }).id;
      const matchIdx = list.findIndex(
        (c) => (incId && c.id === incId) || normalizeText(c.text) === normalizeText(inc.text)
      );
      if (matchIdx >= 0 && list[matchIdx]) {
        const currentItem = list[matchIdx]!;
        list[matchIdx] = {
          id: currentItem.id,
          text: inc.text.trim(),
          status: inc.status || currentItem.status,
          priority: inc.priority || currentItem.priority,
        };
      } else {
        list.push({
          id: incId || idFactory(),
          text: inc.text.trim(),
          status: inc.status || 'todo',
          priority: inc.priority || 'medium',
        });
      }
    }
    result.tasks = list;
  }

  // 9. Bugs & bugsReviewed
  const bugAction = choices.bugs ?? 'merge';
  const { items: incBugs, bugsReviewed: incBugsReviewed } = getIncomingBugs(incoming);
  if (bugAction === 'replace') {
    result.bugs = incBugs.map((item) => ({
      id: (item as { id?: string }).id || idFactory(),
      text: item.text.trim(),
      severity: item.severity || 'low',
      status: item.status || 'open',
    }));
    if (incBugsReviewed !== undefined) {
      result.bugsReviewed = incBugsReviewed;
    }
  } else if (bugAction === 'merge') {
    const list = [...(result.bugs || [])];
    for (const inc of incBugs) {
      const incId = (inc as { id?: string }).id;
      const matchIdx = list.findIndex(
        (c) => (incId && c.id === incId) || normalizeText(c.text) === normalizeText(inc.text)
      );
      if (matchIdx >= 0 && list[matchIdx]) {
        const currentItem = list[matchIdx]!;
        list[matchIdx] = {
          id: currentItem.id,
          text: inc.text.trim(),
          severity: inc.severity || currentItem.severity,
          status: inc.status || currentItem.status,
        };
      } else {
        list.push({
          id: incId || idFactory(),
          text: inc.text.trim(),
          severity: inc.severity || 'low',
          status: inc.status || 'open',
        });
      }
    }
    result.bugs = list;
    if (incBugsReviewed !== undefined) {
      result.bugsReviewed = incBugsReviewed;
    }
  }

  return result;
}
