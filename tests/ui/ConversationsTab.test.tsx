import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../src/ui/Toast';
import { ConversationViewer } from '../../src/ui/ConversationViewer';
import { PasteConversationDialog } from '../../src/ui/PasteConversationDialog';
import { ReconstructPromptDialog } from '../../src/ui/ReconstructPromptDialog';
import { ConversationsTab } from '../../src/pages/conversations/ConversationsTab';
import { createEmptyPassport, type ConversationTurn } from '../../src/domain';
import { db } from '../../src/storage/db';
import { assertPlainLanguage } from '../import/pasteParser.test';

function ViewerTestWrapper({
  initialTurns,
  onTurnsChange,
}: {
  initialTurns: ConversationTurn[];
  onTurnsChange?: (turns: ConversationTurn[]) => void;
}) {
  const [turns, setTurns] = useState<ConversationTurn[]>(initialTurns);

  const handleChange = (newTurns: ConversationTurn[]) => {
    setTurns(newTurns);
    if (onTurnsChange) onTurnsChange(newTurns);
  };

  return <ConversationViewer turns={turns} onChange={handleChange} />;
}

function PasteDialogWrapper({
  defaultOpen = true,
  projectId = 'proj-123',
}: {
  defaultOpen?: boolean;
  projectId?: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <ToastProvider>
      <button
        type="button"
        id="open-paste-btn"
        onClick={() => setIsOpen(true)}
      >
        Open Paste Dialog
      </button>
      <PasteConversationDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        projectId={projectId}
      />
    </ToastProvider>
  );
}

describe('ConversationViewer & Dialogs (RTL)', () => {
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

  describe('ConversationViewer controls', () => {
    it('renders messages with accessible names, badges and token estimates', () => {
      const turns: ConversationTurn[] = [
        { id: '1', role: 'user', text: 'First message text' },
        { id: '2', role: 'assistant', text: 'Second message text' },
      ];

      render(<ViewerTestWrapper initialTurns={turns} />);

      expect(screen.getByRole('group', { name: 'Message 1' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Message 2' })).toBeInTheDocument();
      expect(screen.getByText('USER')).toBeInTheDocument();
      expect(screen.getByText('ASSISTANT')).toBeInTheDocument();
      expect(screen.getAllByText(/~5 tokens \(estimate\)/i).length).toBeGreaterThan(0);
    });

    it('flips speaker role when Flip role button is clicked', () => {
      const turns: ConversationTurn[] = [
        { id: '1', role: 'user', text: 'Flip me' },
      ];

      render(<ViewerTestWrapper initialTurns={turns} />);

      expect(screen.getByText('USER')).toBeInTheDocument();

      const flipBtn = screen.getByRole('button', { name: /Flip role for Message 1/i });
      fireEvent.click(flipBtn);

      expect(screen.getByText('ASSISTANT')).toBeInTheDocument();
    });

    it('splits message when cursor is inside and shows plain-language error when invalid', () => {
      const turns: ConversationTurn[] = [
        { id: '1', role: 'user', text: 'First part\n\nSecond part' },
      ];

      render(<ViewerTestWrapper initialTurns={turns} />);

      const textarea = screen.getByLabelText(/Message 1 content/i) as HTMLTextAreaElement;
      const splitBtn = screen.getByRole('button', { name: /Split Message 1/i });

      // Split button is disabled initially when cursor is at 0
      expect(splitBtn).toBeDisabled();

      // Place cursor inside the text
      textarea.setSelectionRange(11, 11);
      fireEvent.select(textarea);

      expect(splitBtn).not.toBeDisabled();
      fireEvent.click(splitBtn);

      // Now there are two messages
      expect(screen.getByRole('group', { name: 'Message 1' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Message 2' })).toBeInTheDocument();
    });

    it('merges message with next message and removes turn when deleted', () => {
      const turns: ConversationTurn[] = [
        { id: '1', role: 'user', text: 'Message Alpha' },
        { id: '2', role: 'assistant', text: 'Message Beta' },
      ];

      render(<ViewerTestWrapper initialTurns={turns} />);

      // Merge turn 1 with turn 2
      const mergeBtn = screen.getByRole('button', { name: /Merge with next.*Message 1/i });
      fireEvent.click(mergeBtn);

      // Now only 1 message remains with concatenated text
      expect(screen.getAllByRole('group')).toHaveLength(1);
      const textarea = screen.getByLabelText(/Message 1 content/i);
      expect(textarea).toHaveValue('Message Alpha\n\nMessage Beta');

      // Delete turn 1
      const deleteBtn = screen.getByRole('button', { name: /Delete Message 1/i });
      fireEvent.click(deleteBtn);

      expect(screen.queryAllByRole('group')).toHaveLength(0);
    });
  });

  describe('PasteConversationDialog', () => {
    it('shows empty paste error in plain language when parsing empty text', () => {
      render(<PasteDialogWrapper />);

      const parseBtn = screen.getByRole('button', { name: 'Parse' });
      fireEvent.click(parseBtn);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(
        'Nothing to import yet. Paste a conversation into the box above, then choose Parse.'
      );
      assertPlainLanguage(alert.textContent || '');
    });

    it('shows over 1MB error in plain language when parsing huge text', () => {
      render(<PasteDialogWrapper />);

      const textarea = screen.getByLabelText(/Transcript Content/i);
      // Simulate input over 1,000,000 chars
      fireEvent.change(textarea, { target: { value: 'A'.repeat(1_000_001) } });

      const parseBtn = screen.getByRole('button', { name: 'Parse' });
      fireEvent.click(parseBtn);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('This text is over 1 MB. Paste one conversation at a time.');
      expect(
        screen.getByText('This text is over 1 MB. Paste one conversation at a time.')
      ).toBeInTheDocument();
      assertPlainLanguage(alert.textContent || '');
    });

    it('transitions to review step on successful parse and shows one brass primary button', async () => {
      render(<PasteDialogWrapper />);

      const textarea = screen.getByLabelText(/Transcript Content/i);
      fireEvent.change(textarea, {
        target: {
          value: 'User: Hello AI\nAssistant: Hello User',
        },
      });

      const parseBtn = screen.getByRole('button', { name: 'Parse' });
      fireEvent.click(parseBtn);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Review parsed conversation' })).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'Attach to project' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit raw paste' })).toBeInTheDocument();
    });

    it('closes on Escape key and restores focus to trigger element', async () => {
      render(<PasteDialogWrapper defaultOpen={false} />);

      const triggerBtn = screen.getByRole('button', { name: 'Open Paste Dialog' });
      triggerBtn.focus();
      fireEvent.click(triggerBtn);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      expect(document.activeElement).toBe(triggerBtn);
    });
  });

  describe('ConversationsTab component', () => {
    it('renders compact empty state when passport has no conversations', () => {
      const passport = createEmptyPassport('Empty Proj');
      passport.project.id = 'p1';

      render(
        <ToastProvider>
          <ConversationsTab projectId="p1" passport={passport} />
        </ToastProvider>
      );

      expect(screen.getByText('No conversations attached yet.')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Paste conversation/i }).length).toBeGreaterThanOrEqual(1);
    });

    it('renders attached conversation items with title, badges, tokens, and include toggle', () => {
      const passport = createEmptyPassport('Attached Proj');
      passport.project.id = 'p1';
      passport.conversations = [
        {
          id: 'c1',
          title: 'Planning Discussion',
          source: 'chatgpt',
          messageCount: 4,
          tokenEstimate: 450,
          included: true,
        },
      ];

      render(
        <ToastProvider>
          <ConversationsTab projectId="p1" passport={passport} />
        </ToastProvider>
      );

      expect(screen.getByText('Planning Discussion')).toBeInTheDocument();
      expect(screen.getByText('CHATGPT')).toBeInTheDocument();
      expect(screen.getByText(/4 messages/i)).toBeInTheDocument();
      expect(screen.getByText(/~450 tokens \(estimate\)/i)).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /Include Planning Discussion in export and reconstruct/i })).toBeChecked();
    });
  });

  describe('ReconstructPromptDialog', () => {
    beforeEach(async () => {
      await db.conversations.clear();
    });

    it('displays exact numbers in reconstruct trim warning with a lowered cap fixture', async () => {
      // 5 turns, each 400 chars -> 100 tokens each. Total = 500 tokens
      const turns: ConversationTurn[] = Array.from({ length: 5 }, (_, i) => ({
        id: `m-${i + 1}`,
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        text: `Message ${i + 1}. `.padEnd(400, 'X'),
      }));

      await db.conversations.put({
        id: 'conv-trim-test',
        projectId: 'p1',
        title: 'Trim Test Conversation',
        source: 'chatgpt',
        messages: turns,
        createdAt: new Date().toISOString(),
      });

      const passport = createEmptyPassport('Trim Test Project');
      passport.project.id = 'p1';
      passport.conversations = [
        {
          id: 'conv-trim-test',
          title: 'Trim Test Conversation',
          source: 'chatgpt',
          messageCount: 5,
          tokenEstimate: 500,
          included: true,
        },
      ];

      render(
        <ToastProvider>
          <ReconstructPromptDialog
            isOpen={true}
            onClose={() => {}}
            passport={passport}
            tokenCap={250}
          />
        </ToastProvider>
      );

      // Wait for loading to finish and warning banner to appear
      await waitFor(() => {
        expect(screen.getByRole('status')).toBeInTheDocument();
      });

      const warningText = screen.getByRole('status').textContent || '';
      expect(warningText).toContain('This conversation is about 500 tokens (estimate), over the cap of 250.');
      expect(warningText).toContain('The oldest 3 messages were left out of the prompt.');
      assertPlainLanguage(warningText);
    });
  });
});
