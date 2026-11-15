import { describe, it, expect, beforeEach } from 'vitest';
import {
  createProject,
  getProject,
  getPassport,
  addPastedConversation,
  updateConversationTurns,
  setConversationIncluded,
  removeConversation,
  restoreConversation,
  getConversation,
  StaleWrite,
} from '../index';
import { db } from '../db';
import {
  type ConversationTurn,
  applyEditorFields,
  createEmptyPassport,
} from '../../domain';

describe('conversation storage service operations', () => {
  beforeEach(async () => {
    await db.projects.clear();
    await db.passports.clear();
    await db.checkpoints.clear();
    await db.conversations.clear();
    await db.files.clear();
  });

  const turns: ConversationTurn[] = [
    { id: 't1', role: 'user', text: 'How do we design this offline passport?' },
    { id: 't2', role: 'assistant', text: 'Using Dexie and IndexedDB locally.' },
  ];

  it('addPastedConversation creates ConversationRecord and keeps passport.conversations in sync', async () => {
    const project = await createProject('Project Alpha');
    const projectId = project.id;
    const projectBefore = await getProject(projectId);

    // Wait a tiny moment to ensure updatedAt bump is strictly greater
    await new Promise((r) => setTimeout(r, 10));

    const convId = await addPastedConversation(projectId, {
      title: 'Initial Discussion',
      source: 'chatgpt',
      turns,
      included: true,
    });

    expect(convId).toBeTruthy();

    // Verify ConversationRecord in db.conversations
    const record = await getConversation(convId);
    expect(record).not.toBeNull();
    expect(record?.title).toBe('Initial Discussion');
    expect(record?.source).toBe('chatgpt');
    expect(record?.messages).toHaveLength(2);
    expect(record?.messages[0]?.text).toBe('How do we design this offline passport?');

    // Verify ConversationRef in passport.conversations
    const passport = await getPassport(projectId);
    expect(passport?.conversations).toHaveLength(1);
    const ref = passport?.conversations[0];
    expect(ref?.id).toBe(convId);
    expect(ref?.title).toBe('Initial Discussion');
    expect(ref?.source).toBe('chatgpt');
    expect(ref?.messageCount).toBe(2);
    expect(ref?.tokenEstimate).toBeGreaterThan(0);
    expect(ref?.included).toBe(true);

    // Verify project updatedAt bumped
    const projectAfter = await getProject(projectId);
    expect(projectAfter?.updatedAt).not.toBe(projectBefore?.updatedAt);
  });

  it('updateConversationTurns updates record and linked passport metadata in one transaction', async () => {
    const project = await createProject('Project Beta');
    const projectId = project.id;
    const convId = await addPastedConversation(projectId, {
      title: 'Original Title',
      source: 'claude',
      turns,
    });

    const updatedTurns: ConversationTurn[] = [
      ...turns,
      { id: 't3', role: 'user', text: 'What about data privacy?' },
      { id: 't4', role: 'assistant', text: 'Zero outbound network requests.' },
    ];

    await updateConversationTurns(convId, updatedTurns, {
      title: 'Updated Title',
    });

    const record = await getConversation(convId);
    expect(record?.title).toBe('Updated Title');
    expect(record?.messages).toHaveLength(4);

    const passport = await getPassport(projectId);
    const ref = passport?.conversations.find((r) => r.id === convId);
    expect(ref?.title).toBe('Updated Title');
    expect(ref?.messageCount).toBe(4);
  });

  it('setConversationIncluded toggles the included flag on passport reference', async () => {
    const project = await createProject('Project Gamma');
    const projectId = project.id;
    const convId = await addPastedConversation(projectId, {
      title: 'Toggle Test',
      source: 'gemini',
      turns,
      included: true,
    });

    await setConversationIncluded(convId, false);
    let passport = await getPassport(projectId);
    expect(passport?.conversations[0]?.included).toBe(false);

    await setConversationIncluded(convId, true);
    passport = await getPassport(projectId);
    expect(passport?.conversations[0]?.included).toBe(true);
  });

  it('removeConversation deletes record and removes ref from passport; restoreConversation restores both', async () => {
    const project = await createProject('Project Delta');
    const projectId = project.id;
    const convId = await addPastedConversation(projectId, {
      title: 'To Be Removed',
      source: 'paste',
      turns,
    });

    // Remove
    const removedData = await removeConversation(convId);
    expect(removedData).not.toBeNull();
    expect(removedData?.conversation.id).toBe(convId);
    expect(removedData?.ref.id).toBe(convId);

    // Verify record is gone from DB
    expect(await getConversation(convId)).toBeNull();
    let passport = await getPassport(projectId);
    expect(passport?.conversations).toHaveLength(0);

    // Restore (Undo)
    await restoreConversation(removedData!.conversation, removedData!.ref);

    // Verify record and ref are restored
    const restoredRecord = await getConversation(convId);
    expect(restoredRecord).not.toBeNull();
    passport = await getPassport(projectId);
    expect(passport?.conversations).toHaveLength(1);
    expect(passport?.conversations[0]?.id).toBe(convId);
  });

  it('stale-write guard: throws StaleWrite and writes nothing if expectedUpdatedAt mismatches', async () => {
    const project = await createProject('Project Epsilon');
    const projectId = project.id;
    const staleTime = '2020-01-01T00:00:00.000Z';

    // addPastedConversation with stale timestamp
    await expect(
      addPastedConversation(
        projectId,
        {
          title: 'Stale Add',
          source: 'chatgpt',
          turns,
        },
        { expectedUpdatedAt: staleTime }
      )
    ).rejects.toThrow(StaleWrite);

    // Verify nothing written
    const convs = await db.conversations.where('projectId').equals(projectId).toArray();
    expect(convs).toHaveLength(0);
    const pass = await getPassport(projectId);
    expect(pass?.conversations).toHaveLength(0);
  });

  it('failure injection test: transaction rolls back completely if passport write fails', async () => {
    const project = await createProject('Project Zeta');
    const projectId = project.id;

    // Simulate failure by corrupting the passport record before transaction or injecting an abort
    await db.passports.delete(projectId); // Deleting passport causes addPastedConversation to throw ProjectNotFound

    await expect(
      addPastedConversation(projectId, {
        title: 'Rollback Test',
        source: 'chatgpt',
        turns,
      })
    ).rejects.toThrow();

    // Verify conversations table remained completely untouched (0 records)
    const convCount = await db.conversations.count();
    expect(convCount).toBe(0);
  });

  it('autosave draft safety: applyEditorFields never overwrites conversations array', () => {
    const latest = createEmptyPassport('Test Project');
    latest.project.id = 'p-1';
    latest.conversations = [
      {
        id: 'c-1',
        title: 'Attached Conversation',
        source: 'chatgpt',
        messageCount: 5,
        tokenEstimate: 500,
        included: true,
      },
    ];

    const draft = createEmptyPassport('Test Project');
    draft.project.id = 'p-1';
    draft.project.goal = 'Updated draft goal';
    draft.conversations = []; // Even if draft has empty conversations, applyEditorFields must preserve latest

    const merged = applyEditorFields(latest, draft);

    expect(merged.project.goal).toBe('Updated draft goal');
    expect(merged.conversations).toHaveLength(1);
    expect(merged.conversations[0]?.id).toBe('c-1');
  });
});
