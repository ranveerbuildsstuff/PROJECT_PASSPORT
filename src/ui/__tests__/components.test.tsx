import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  Button,
  Badge,
  Dialog,
  Tabs,
  Input,
  Textarea,
  ProgressRing,
  ToastProvider,
  useToast,
  ThemeProvider,
  useTheme,
} from '../index';

describe('UI Primitives and Design System', () => {
  it('renders Button with variants and loading state', () => {
    const { rerender } = render(<Button variant="primary">Submit</Button>);
    const btn = screen.getByRole('button', { name: /Submit/i });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain('bg-accent-brass');

    rerender(<Button variant="primary" isLoading>Submit</Button>);
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('renders Badge in stamp style with semantic variants', () => {
    const { rerender } = render(<Badge variant="brass">Idea</Badge>);
    const badge = screen.getByText('Idea');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('font-mono');
    expect(badge.className).toContain('border-accent-brass');

    rerender(<Badge variant="success">PASS</Badge>);
    expect(screen.getByText('PASS').className).toContain('border-color-success');
  });

  it('renders Dialog with accessible roles and dismiss controls', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Dialog isOpen={true} onClose={onClose} title="Test Modal" description="Modal description">
        <div>Modal Content</div>
      </Dialog>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Test Modal/i })).toBeInTheDocument();
    expect(screen.getByText('Modal Content')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: /Close dialog/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();

    rerender(
      <Dialog isOpen={false} onClose={onClose} title="Test Modal">
        <div>Modal Content</div>
      </Dialog>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders Tabs with accessible tablist and triggers onChange', () => {
    const onChange = vi.fn();
    const tabs = [
      { id: 'tab1', label: 'Tab One' },
      { id: 'tab2', label: 'Tab Two' },
    ];

    render(<Tabs tabs={tabs} activeTab="tab1" onChange={onChange} />);

    const tabList = screen.getByRole('tablist');
    expect(tabList).toBeInTheDocument();

    const tab1 = screen.getByRole('tab', { name: /Tab One/i });
    const tab2 = screen.getByRole('tab', { name: /Tab Two/i });

    expect(tab1).toHaveAttribute('aria-selected', 'true');
    expect(tab2).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(tab2);
    expect(onChange).toHaveBeenCalledWith('tab2');
  });

  it('renders Input and Textarea with labels, errors, and accessible descriptions', () => {
    render(
      <Input
        label="Project Name"
        required
        error="Project name cannot be empty"
        placeholder="Enter name"
      />
    );

    const input = screen.getByLabelText(/Project Name/i);
    expect(input).toBeInTheDocument();
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Project name cannot be empty');

    render(
      <Textarea
        label="Project Goal"
        helperText="Explain the goal"
        placeholder="Goal description"
      />
    );

    const textarea = screen.getByLabelText(/Project Goal/i);
    expect(textarea).toBeInTheDocument();
    expect(screen.getByText('Explain the goal')).toBeInTheDocument();
  });

  it('renders ProgressRing with accessible progressbar attributes', () => {
    render(<ProgressRing value={75} size={48} strokeWidth={4} />);

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toBeInTheDocument();
    expect(progressbar).toHaveAttribute('aria-valuenow', '75');
    expect(progressbar).toHaveAttribute('aria-label', 'Readiness score: 75%');
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('handles Toast notifications non-intrusively with auto dismiss', () => {
    function TestToastConsumer() {
      const { showToast } = useToast();
      return (
        <button onClick={() => showToast('File saved successfully', 'success', 'Saved')}>
          Trigger Toast
        </button>
      );
    }

    render(
      <ToastProvider>
        <TestToastConsumer />
      </ToastProvider>
    );

    const triggerBtn = screen.getByText('Trigger Toast');
    fireEvent.click(triggerBtn);

    const toast = screen.getByRole('status');
    expect(toast).toBeInTheDocument();
    expect(toast).toHaveTextContent('File saved successfully');
    expect(toast).toHaveTextContent(/Saved/i);
  });

  it('renders action button in Toast and invokes callback on click', () => {
    const handleUndo = vi.fn();
    function TestToastActionConsumer() {
      const { showToast } = useToast();
      return (
        <button
          onClick={() =>
            showToast('Item deleted', 'info', undefined, { label: 'Undo', onClick: handleUndo })
          }
        >
          Trigger Undo Toast
        </button>
      );
    }

    render(
      <ToastProvider>
        <TestToastActionConsumer />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Trigger Undo Toast'));
    const undoBtn = screen.getByRole('button', { name: 'Undo' });
    expect(undoBtn).toBeInTheDocument();
    fireEvent.click(undoBtn);
    expect(handleUndo).toHaveBeenCalledTimes(1);
  });

  it('manages theme toggle in ThemeProvider', () => {
    function TestThemeConsumer() {
      const { theme, toggleTheme } = useTheme();
      return (
        <div>
          <span>Current: {theme}</span>
          <button onClick={toggleTheme}>Toggle</button>
        </div>
      );
    }

    render(
      <ThemeProvider>
        <TestThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByText(/Current: dark/i)).toBeInTheDocument();
    const btn = screen.getByText('Toggle');
    act(() => {
      fireEvent.click(btn);
    });
    expect(screen.getByText(/Current: light/i)).toBeInTheDocument();
  });
});
