import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CaptureDialog } from '../../src/ui/CaptureDialog';
import { ToastProvider } from '../../src/ui';
import type { PassportV1 } from '../../src/domain';
import * as storage from '../../src/storage';

function TestHarness({
  defaultOpen = true,
  projectId,
  currentPassport,
  onMergeComplete,
}: {
  defaultOpen?: boolean;
  projectId?: string;
  currentPassport?: PassportV1;
  onMergeComplete?: (cpId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <ToastProvider>
      <button
        type="button"
        id="trigger-btn"
        onClick={() => setIsOpen(true)}
      >
        Open Capture
      </button>
      <CaptureDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        projectId={projectId}
        currentPassport={currentPassport}
        onMergeComplete={onMergeComplete}
      />
    </ToastProvider>
  );
}

describe('CaptureDialog Component (RTL)', () => {
  let fetchSpy: { mockRestore: () => void; mockReset: () => void } & ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch') as unknown as { mockRestore: () => void; mockReset: () => void } & ReturnType<typeof vi.fn>;
    fetchSpy.mockImplementation(() => {
      throw new Error('fetch should never be called!');
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('renders Step 1 with prompt text, tokens estimate and privacy notice', () => {
    render(<TestHarness />);

    expect(screen.getByRole('heading', { name: /Capture from AI/i })).toBeInTheDocument();
    expect(screen.getByText(/Copy this prompt/i)).toBeInTheDocument();
    expect(screen.getByText(/~.+ tokens \(estimate\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Your conversation stays in that AI\. This app never connects to it\./i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy prompt/i })).toBeInTheDocument();
  });

  it('handles copy success via navigator.clipboard and displays toast', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<TestHarness />);

    const copyBtn = screen.getByRole('button', { name: /Copy prompt/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled();
      expect(screen.getByText(/Capture prompt copied to clipboard/i)).toBeInTheDocument();
    });
  });

  it('handles copy fallback when navigator.clipboard fails', async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<TestHarness />);

    const copyBtn = screen.getByRole('button', { name: /Copy prompt/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Couldn’t copy automatically\. The prompt is selected: press Ctrl\+C\./i)
      ).toBeInTheDocument();
    });
  });

  it('handles invalid paste then fixed paste, moving focus to result heading', async () => {
    render(<TestHarness />);

    const textarea = screen.getByLabelText(/Paste AI response/i);
    const checkBtn = screen.getByRole('button', { name: /Check reply/i });

    // 1. Paste invalid/truncated JSON
    fireEvent.change(textarea, { target: { value: '{"project": {"name": "Incomplete' } });
    fireEvent.click(checkBtn);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(screen.getByText(/Incomplete JSON/i)).toBeInTheDocument();
      expect(
        screen.getByText(/The JSON stops before it ends\. Ask the AI to send the complete reply again\./i)
      ).toBeInTheDocument();
      // Result heading has focus
      const heading = screen.getByRole('heading', { name: /Incomplete JSON/i });
      expect(document.activeElement).toBe(heading);
    });

    // 2. Fix the paste with valid JSON
    fireEvent.change(textarea, {
      target: {
        value: '```json\n{"project":{"name":"Fixed App","goal":"Deliver passport"}}\n```',
      },
    });
    fireEvent.click(checkBtn);

    await waitFor(() => {
      const statusCard = screen.getByRole('status');
      expect(statusCard).toBeInTheDocument();
      expect(screen.getByText(/Passport reply verified/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Apply merge/i })).toBeInTheDocument();
      // Result heading has focus
      const heading = screen.getByRole('heading', { name: /Passport reply verified/i });
      expect(document.activeElement).toBe(heading);
    });
  });

  it('Escape key returns focus to the trigger button', async () => {
    render(<TestHarness defaultOpen={false} />);

    const triggerBtn = screen.getByRole('button', { name: /Open Capture/i });
    triggerBtn.focus();
    expect(document.activeElement).toBe(triggerBtn);

    fireEvent.click(triggerBtn);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Press Escape on document where listener is registered
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(document.activeElement).toBe(triggerBtn);
    });
  });

  it('proves fetch is never called throughout the entire flow', async () => {
    render(<TestHarness />);

    const textarea = screen.getByLabelText(/Paste AI response/i);
    const checkBtn = screen.getByRole('button', { name: /Check reply/i });

    fireEvent.change(textarea, {
      target: {
        value: '{"project":{"name":"Offline App","status":"idea"}}',
      },
    });
    fireEvent.click(checkBtn);

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('allows changing section merge choices and calls applyMergeWithCheckpoint', async () => {
    const mockApplyMerge = vi.spyOn(storage, 'applyMergeWithCheckpoint').mockResolvedValue({
      checkpointId: 'cp-test-123',
      updatedPassport: {
        schemaVersion: 1,
        project: { id: 'p1', name: 'Merged', status: 'idea', goal: '', summary: '', createdAt: '', updatedAt: '' },
        stack: [],
        requirements: [],
        decisions: [],
        completed: [],
        tasks: [],
        bugs: [],
        bugsReviewed: false,
        instructions: [],
        nextAction: '',
        openQuestions: [],
        files: [],
        conversations: [],
      },
    });

    const baselinePassport: PassportV1 = {
      schemaVersion: 1,
      project: { id: 'p1', name: 'Initial', status: 'idea', goal: '', summary: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
      stack: [],
      requirements: [],
      decisions: [],
      completed: [],
      tasks: [],
      bugs: [],
      bugsReviewed: false,
      instructions: [],
      nextAction: '',
      openQuestions: [],
      files: [],
      conversations: [],
    };

    const onComplete = vi.fn();

    render(
      <TestHarness
        projectId="p1"
        currentPassport={baselinePassport}
        onMergeComplete={onComplete}
      />
    );

    const textarea = screen.getByLabelText(/Paste AI response/i);
    const checkBtn = screen.getByRole('button', { name: /Check reply/i });

    fireEvent.change(textarea, {
      target: {
        value: '```json\n{"project":{"name":"Merged App"}}\n```',
      },
    });
    fireEvent.click(checkBtn);

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Apply merge/i })).toBeInTheDocument();
    });

    // Check that Basics section has Replace / Merge / Skip buttons
    const replaceBtn = screen.getByRole('button', { name: /^replace$/i });
    expect(replaceBtn).toBeInTheDocument();
    fireEvent.click(replaceBtn);

    // Click Apply merge
    const applyBtn = screen.getByRole('button', { name: /Apply merge/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(mockApplyMerge).toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledWith('cp-test-123');
    });

    mockApplyMerge.mockRestore();
  });

  it('undo-after-merge safety: clicking Undo when newer edits exist flushes and notes checkpoint in toast', async () => {
    const postMergeUpdatedAt = '2026-01-01T12:00:00.000Z';
    const mockApplyMerge = vi.spyOn(storage, 'applyMergeWithCheckpoint').mockResolvedValue({
      checkpointId: 'cp-undo-test',
      updatedPassport: {
        schemaVersion: 1,
        project: { id: 'p1', name: 'Merged App', status: 'idea', goal: '', summary: '', createdAt: '', updatedAt: postMergeUpdatedAt },
        stack: [],
        requirements: [],
        decisions: [],
        completed: [],
        tasks: [],
        bugs: [],
        bugsReviewed: false,
        instructions: [],
        nextAction: '',
        openQuestions: [],
        files: [],
        conversations: [],
      },
    });

    const mockRestoreCheckpoint = vi.spyOn(storage, 'restoreCheckpoint').mockResolvedValue({
      schemaVersion: 1,
      project: { id: 'p1', name: 'Initial', status: 'idea', goal: 'Original goal', summary: '', createdAt: '', updatedAt: '2026-01-01T12:10:00.000Z' },
      stack: [],
      requirements: [],
      decisions: [],
      completed: [],
      tasks: [],
      bugs: [],
      bugsReviewed: false,
      instructions: [],
      nextAction: '',
      openQuestions: [],
      files: [],
      conversations: [],
    });

    const baselinePassport: PassportV1 = {
      schemaVersion: 1,
      project: { id: 'p1', name: 'Initial', status: 'idea', goal: 'Original goal', summary: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
      stack: [],
      requirements: [],
      decisions: [],
      completed: [],
      tasks: [],
      bugs: [],
      bugsReviewed: false,
      instructions: [],
      nextAction: '',
      openQuestions: [],
      files: [],
      conversations: [],
    };

    render(
      <TestHarness
        projectId="p1"
        currentPassport={baselinePassport}
      />
    );

    const textarea = screen.getByLabelText(/Paste AI response/i);
    const checkBtn = screen.getByRole('button', { name: /Check reply/i });

    fireEvent.change(textarea, {
      target: {
        value: '```json\n{"project":{"name":"Merged App"}}\n```',
      },
    });
    fireEvent.click(checkBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Apply merge/i })).toBeInTheDocument();
    });

    // Apply merge
    fireEvent.click(screen.getByRole('button', { name: /Apply merge/i }));

    // Wait for merge toast with Undo button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    });

    // Simulate user making edits after merge: storage now has newer updatedAt
    vi.spyOn(storage, 'getPassport').mockResolvedValue({
      ...baselinePassport,
      project: {
        ...baselinePassport.project,
        updatedAt: '2026-01-01T12:05:00.000Z', // newer than postMergeUpdatedAt
        goal: 'User post-merge edit',
      },
    });

    // Click Undo
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    // Assert restoreCheckpoint was called with the merge checkpoint ID
    await waitFor(() => {
      expect(mockRestoreCheckpoint).toHaveBeenCalledWith('cp-undo-test');
      // Toast explicitly informs the user that newer edits were saved in a "Before restore" checkpoint
      expect(
        screen.getByText('Merge undone. Newer edits saved in a "Before restore" checkpoint.')
      ).toBeInTheDocument();
    });

    mockApplyMerge.mockRestore();
    mockRestoreCheckpoint.mockRestore();
  });
});
