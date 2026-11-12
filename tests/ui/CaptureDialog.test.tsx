import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CaptureDialog } from '../../src/ui/CaptureDialog';
import { ToastProvider } from '../../src/ui';

function TestHarness({ defaultOpen = true }: { defaultOpen?: boolean }) {
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
      <CaptureDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
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
      expect(screen.getByText(/Merging arrives in the next update/i)).toBeInTheDocument();
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
});
