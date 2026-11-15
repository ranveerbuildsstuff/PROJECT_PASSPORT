import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { CheckpointsTab } from '../../src/pages/checkpoints/CheckpointsTab';
import { ToastProvider } from '../../src/ui/Toast';
import { db } from '../../src/storage/db';
import { createProject, createCheckpoint } from '../../src/storage/storageService';
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
});
