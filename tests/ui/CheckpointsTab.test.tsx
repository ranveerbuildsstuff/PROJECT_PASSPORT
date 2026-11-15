import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { CheckpointsTab } from '../../src/pages/checkpoints/CheckpointsTab';
import { ToastProvider } from '../../src/ui/Toast';
import { db } from '../../src/storage/db';
import { createProject, createCheckpoint, addProjectFiles } from '../../src/storage/storageService';
import { registerAutosaveFlusher } from '../../src/lib';
import type { PassportV1 } from '../../src/domain/passport.schema';

const mockPassport: PassportV1 = {
  schemaVersion: 1,
  project: {
    id: 'p-test',
    name: 'Test Project',
    goal: 'Test Goal',
    summary: 'Test Summary',
    status: 'in_progress',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  stack: [{ name: 'React', role: 'UI' }],
  requirements: [{ id: 'r1', text: 'Req 1', priority: 'must' }],
  decisions: [{ id: 'd1', decision: 'Dec 1', reason: 'R1', status: 'active' }],
  completed: [{ id: 'c1', text: 'Comp 1' }],
  tasks: [{ id: 't1', text: 'Task 1', status: 'todo', priority: 'medium' }],
  bugs: [{ id: 'b1', text: 'Bug 1', severity: 'low', status: 'open' }],
  bugsReviewed: true,
  instructions: ['Instruction 1'],
  files: [{ path: 'src/app.ts', purpose: 'App code', included: true, sizeBytes: 100 }],
  conversations: [
    { id: 'conv-1', title: 'Arch chat', source: 'claude', messageCount: 2, tokenEstimate: 200, included: true },
  ],
  nextAction: 'Build checkpoints',
  openQuestions: ['Question 1'],
};

function renderCheckpointsTab(projectId: string, passport: PassportV1 = mockPassport) {
  return render(
    <BrowserRouter>
      <ToastProvider>
        <CheckpointsTab projectId={projectId} passport={passport} />
      </ToastProvider>
    </BrowserRouter>
  );
}

describe('CheckpointsTab Component', () => {
  beforeEach(async () => {
    await db.projects.clear();
    await db.passports.clear();
    await db.checkpoints.clear();
    await db.conversations.clear();
    await db.files.clear();
  });

  it('renders compact empty state when no checkpoints exist', async () => {
    const proj = await createProject('Empty CP Project');
    renderCheckpointsTab(proj.id);

    await waitFor(() => {
      expect(screen.getByText('No checkpoints yet.')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Create checkpoint/i }).length).toBeGreaterThanOrEqual(1);
    });

    // Verify forbidden tokens
    const bodyText = document.body.textContent || '';
    expect(bodyText).not.toMatch(/invalid_|Expected|undefined|\[object|ZodError/);
  });

  it('renders populated timeline with stamp badges and details', async () => {
    const proj = await createProject('Populated CP Project');
    await createCheckpoint(proj.id, { note: 'Initial Release Baseline' });

    renderCheckpointsTab(proj.id);

    await waitFor(() => {
      expect(screen.getByText(/#1 • MANUAL/)).toBeInTheDocument();
      expect(screen.getByText('Initial Release Baseline')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Compare/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Restore/i })).toBeInTheDocument();
    });

    // Forbidden tokens
    const bodyText = document.body.textContent || '';
    expect(bodyText).not.toMatch(/invalid_|Expected|undefined|\[object|ZodError/);
  });

  it('opens create checkpoint dialog, fills note and submits', async () => {
    const proj = await createProject('Create Flow Project');
    renderCheckpointsTab(proj.id);

    await waitFor(() => {
      expect(screen.getByText('No checkpoints yet.')).toBeInTheDocument();
    });

    // Click Create checkpoint in header
    const createBtns = screen.getAllByRole('button', { name: /Create checkpoint/i });
    fireEvent.click(createBtns[0]!);

    // Verify dialog opened
    let dialog!: HTMLElement;
    await waitFor(() => {
      dialog = screen.getByRole('dialog', { name: /Create checkpoint/i });
      expect(dialog).toBeInTheDocument();
    });

    const noteInput = within(dialog).getByLabelText(/Checkpoint note/i);
    fireEvent.change(noteInput, { target: { value: 'Feature complete checkpoint' } });

    const submitBtn = within(dialog).getByRole('button', { name: /Create checkpoint/i });
    fireEvent.click(submitBtn);

    // Dialog closes and new card appears on timeline
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Feature complete checkpoint')).toBeInTheDocument();
    });
  });

  it('opens compare dialog when Compare button is clicked', async () => {
    const proj = await createProject('Compare Flow Project');
    await createCheckpoint(proj.id, { note: 'Snapshot to compare' });

    renderCheckpointsTab(proj.id);

    await waitFor(() => {
      expect(screen.getByText('Snapshot to compare')).toBeInTheDocument();
    });

    const compareBtn = screen.getByRole('button', { name: /Compare/i });
    fireEvent.click(compareBtn);

    let dialog!: HTMLElement;
    await waitFor(() => {
      dialog = screen.getByRole('dialog', { name: /Compare versions/i });
      expect(dialog).toBeInTheDocument();
      expect(within(dialog).getByLabelText(/Base \(From\)/i)).toBeInTheDocument();
      expect(within(dialog).getByLabelText(/Target \(To\)/i)).toBeInTheDocument();
    });

    // Close via Close button inside dialog
    const closeBtn = within(dialog).getByRole('button', { name: /^Close$/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('opens restore dialog, displays attachments notice, and supports cancel', async () => {
    const proj = await createProject('Restore Flow Project');
    await createCheckpoint(proj.id, { note: 'Snapshot to restore' });

    renderCheckpointsTab(proj.id);

    await waitFor(() => {
      expect(screen.getByText('Snapshot to restore')).toBeInTheDocument();
    });

    const restoreBtn = screen.getByRole('button', { name: /^Restore$/i });
    fireEvent.click(restoreBtn);

    let dialog!: HTMLElement;
    await waitFor(() => {
      dialog = screen.getByRole('dialog', { name: /Restore checkpoint/i });
      expect(dialog).toBeInTheDocument();
      expect(within(dialog).getByText(/Your attached files and conversations stay as they are/i)).toBeInTheDocument();
    });

    // Cancel restores dialog
    const cancelBtn = within(dialog).getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('closes dialog on Escape key press', async () => {
    const proj = await createProject('Escape Project');
    renderCheckpointsTab(proj.id);

    await waitFor(() => {
      expect(screen.getByText('No checkpoints yet.')).toBeInTheDocument();
    });

    const createBtns = screen.getAllByRole('button', { name: /Create checkpoint/i });
    fireEvent.click(createBtns[0]!);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('hashes stored content for Current side: same content is not content changed, different content at same path is', async () => {
    const proj = await createProject('Hash Compare Project');
    await addProjectFiles(proj.id, [
      {
        path: 'src/app.ts',
        purpose: 'Application',
        content: 'console.log("version 1");',
        sizeBytes: 25,
        included: true,
      },
    ]);

    // Create checkpoint #1 with the initial content
    await createCheckpoint(proj.id, { note: 'CP 1' });

    const passportRecord = await db.passports.get(proj.id);
    const currentPass = passportRecord!.passport;

    // Render tab
    const { unmount } = renderCheckpointsTab(proj.id, currentPass);

    // Case A: Same file content (with a change in project goal so sections render)
    currentPass.project.goal = 'Updated Goal to Trigger Section Render';
    await db.passports.update(proj.id, { passport: currentPass });

    // Open Compare dialog
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Compare/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Compare/i }));

    let dialog!: HTMLElement;
    await waitFor(() => {
      dialog = screen.getByRole('dialog', { name: /Compare versions/i });
      expect(dialog).toBeInTheDocument();
    });

    // Case A assertions: Files section has no changes (returns null, not rendered) and no Content changed badge
    await waitFor(() => {
      expect(within(dialog).queryByText('Files')).not.toBeInTheDocument();
      expect(within(dialog).queryByText('Content changed (SHA-256)')).not.toBeInTheDocument();
    });

    // Close dialog
    fireEvent.click(within(dialog).getByRole('button', { name: /^Close$/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    unmount();

    // Case B: Update stored content in db.files to different content at the same path
    const fileId = `${proj.id}:src/app.ts`;
    const existingFile = await db.files.get(fileId);
    await db.files.put({
      ...existingFile!,
      content: 'console.log("version 2 modified content");',
      sizeBytes: 39,
    });
    // Update size in current passport
    currentPass.files = [
      { path: 'src/app.ts', purpose: 'Application', included: true, sizeBytes: 39 },
    ];
    await db.passports.update(proj.id, { passport: currentPass });

    renderCheckpointsTab(proj.id, currentPass);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Compare/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Compare/i }));

    await waitFor(() => {
      dialog = screen.getByRole('dialog', { name: /Compare versions/i });
      expect(dialog).toBeInTheDocument();
    });

    // Case B assertion: Current side hash was re-computed from stored content and differs from CP1
    await waitFor(() => {
      expect(within(dialog).getByText('Content changed (SHA-256)')).toBeInTheDocument();
      expect(within(dialog).getByText('(1 changed)')).toBeInTheDocument();
    });
  });

  it('restoring while autosave is in conflict state blocks with the message and loses no edits', async () => {
    const proj = await createProject('Conflict Restore Project');
    await createCheckpoint(proj.id, { note: 'Safe Checkpoint' });

    // Register an active flusher simulating conflict state
    registerAutosaveFlusher(async () => ({ ok: false, reason: 'conflict' }));

    try {
      renderCheckpointsTab(proj.id);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^Restore$/i })).toBeInTheDocument();
      });

      // Click restore on the checkpoint
      fireEvent.click(screen.getByRole('button', { name: /^Restore$/i }));

      let dialog!: HTMLElement;
      await waitFor(() => {
        dialog = screen.getByRole('dialog', { name: /Restore checkpoint/i });
        expect(dialog).toBeInTheDocument();
      });

      // Submit restore
      const restoreSubmitBtn = within(dialog).getByRole('button', { name: /^Restore checkpoint$/i });
      fireEvent.click(restoreSubmitBtn);

      // Verify that it blocked with the exact stale conflict message
      await waitFor(() => {
        expect(
          within(dialog).getByText(
            'Another tab changed this passport. Reload the latest version before restoring.'
          )
        ).toBeInTheDocument();
      });

      // Verify checkpoint table count was not changed by a restore
      const cps = await db.checkpoints.where('projectId').equals(proj.id).toArray();
      // Only the initial checkpoint exists; no "Before restore" checkpoint was created
      expect(cps).toHaveLength(1);
      expect(cps[0]!.note).toBe('Safe Checkpoint');
    } finally {
      registerAutosaveFlusher(null);
    }
  });
});
