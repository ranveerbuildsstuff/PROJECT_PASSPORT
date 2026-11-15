import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PassportEditor } from '../PassportEditor';
import { ToastProvider } from '../../../ui';
import { createEmptyPassport } from '../../../domain';
import type { PassportV1 } from '../../../domain';
import * as storage from '../../../storage';

describe('PassportEditor Component', () => {
  let samplePassport: PassportV1;

  beforeEach(() => {
    samplePassport = createEmptyPassport('Editor Test Project');
    samplePassport.project.id = 'editor-proj-1';
    samplePassport.project.goal = 'Primary goal';
    samplePassport.project.summary = 'Summary text';
    samplePassport.stack = [{ name: 'React', role: 'UI', version: '18', notes: 'Core' }];
    samplePassport.requirements = [{ id: 'r1', text: 'Must be fast', priority: 'must' }];
    samplePassport.decisions = [
      { id: 'd1', decision: 'Active decision', reason: 'Good', date: '2026-01-01', status: 'active' },
      { id: 'd2', decision: 'Superseded decision', reason: 'Old', date: '2026-01-01', status: 'superseded' },
    ];
    samplePassport.completed = [{ id: 'c1', text: 'Initialized repo' }];
    samplePassport.tasks = [{ id: 't1', text: 'Implement auth', status: 'todo', priority: 'high' }];
    samplePassport.bugs = [{ id: 'b1', text: 'Memory leak', severity: 'medium', status: 'open' }];
    samplePassport.bugsReviewed = false;
    samplePassport.instructions = ['Use strict types'];
    samplePassport.nextAction = 'Deploy beta';
    samplePassport.openQuestions = ['Which cloud provider?'];

    vi.spyOn(storage, 'getPassport').mockResolvedValue(samplePassport);
    vi.spyOn(storage, 'savePassport').mockResolvedValue();
  });

  it('renders all 11 sections with Basics open by default', () => {
    render(
      <ToastProvider>
        <PassportEditor
          projectId="editor-proj-1"
          initialPassport={samplePassport}
          onNavigateTab={vi.fn()}
        />
      </ToastProvider>
    );

    // Section headings
    expect(screen.getByRole('button', { name: /Basics/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Tech stack/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Requirements/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Architectural decisions/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Completed work/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Tasks/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Bugs & limitations/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /AI instructions/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Next action/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Open questions/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Files & conversations/i })).toHaveAttribute('aria-expanded', 'false');

    // Basics inputs should be visible
    expect(screen.getByDisplayValue('Editor Test Project')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Primary goal')).toBeInTheDocument();
  }, 15000);

  it('toggles accordion sections open and closed', () => {
    render(
      <ToastProvider>
        <PassportEditor
          projectId="editor-proj-1"
          initialPassport={samplePassport}
          onNavigateTab={vi.fn()}
        />
      </ToastProvider>
    );

    const stackHeader = screen.getByRole('button', { name: /Tech stack/i });
    expect(stackHeader).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(stackHeader);
    expect(stackHeader).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByDisplayValue('React')).toBeInTheDocument();

    fireEvent.click(stackHeader);
    expect(stackHeader).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands all and collapses all sections via control buttons', () => {
    render(
      <ToastProvider>
        <PassportEditor
          projectId="editor-proj-1"
          initialPassport={samplePassport}
          onNavigateTab={vi.fn()}
        />
      </ToastProvider>
    );

    const expandAllBtn = screen.getByRole('button', { name: /Expand all/i });
    fireEvent.click(expandAllBtn);

    expect(screen.getByRole('button', { name: /Basics/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Tech stack/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Requirements/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Tasks/i })).toHaveAttribute('aria-expanded', 'true');

    const collapseAllBtn = screen.getByRole('button', { name: /Collapse all/i });
    fireEvent.click(collapseAllBtn);

    expect(screen.getByRole('button', { name: /Basics/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Tech stack/i })).toHaveAttribute('aria-expanded', 'false');
  }, 15000);

  it('renders superseded decision with dimmed opacity and badge', () => {
    render(
      <ToastProvider>
        <PassportEditor
          projectId="editor-proj-1"
          initialPassport={samplePassport}
          onNavigateTab={vi.fn()}
        />
      </ToastProvider>
    );

    // Expand decisions
    fireEvent.click(screen.getByRole('button', { name: /Architectural decisions/i }));

    expect(screen.getByDisplayValue('Active decision')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Superseded decision')).toBeInTheDocument();
    const badges = screen.getAllByText('Superseded');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('deletes an item and restores it when clicking Undo in toast', async () => {
    render(
      <ToastProvider>
        <PassportEditor
          projectId="editor-proj-1"
          initialPassport={samplePassport}
          onNavigateTab={vi.fn()}
        />
      </ToastProvider>
    );

    // Expand tasks
    fireEvent.click(screen.getByRole('button', { name: /Tasks/i }));

    expect(screen.getByDisplayValue('Implement auth')).toBeInTheDocument();

    const deleteBtn = screen.getByRole('button', { name: /Delete task 1/i });
    fireEvent.click(deleteBtn);

    // Should be deleted immediately
    expect(screen.queryByDisplayValue('Implement auth')).not.toBeInTheDocument();

    // Toast with Undo button should appear
    const undoBtn = await screen.findByRole('button', { name: /Undo/i });
    expect(undoBtn).toBeInTheDocument();

    fireEvent.click(undoBtn);

    // Restored!
    expect(await screen.findByDisplayValue('Implement auth')).toBeInTheDocument();
  });

  it('displays inline validation error for empty task text and shows Not saved', async () => {
    render(
      <ToastProvider>
        <PassportEditor
          projectId="editor-proj-1"
          initialPassport={samplePassport}
          onNavigateTab={vi.fn()}
        />
      </ToastProvider>
    );

    // Expand tasks
    fireEvent.click(screen.getByRole('button', { name: /Tasks/i }));

    const taskInput = screen.getByDisplayValue('Implement auth');
    fireEvent.change(taskInput, { target: { value: '' } });

    // Inline error and Not saved status
    await waitFor(() => {
      const errorElements = screen.getAllByText(/Task 1 needs some text/i);
      expect(errorElements.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Not saved/i)).toBeInTheDocument();
    });
  });

  it('prompts with discard confirmation dialog when attempting to navigate with invalid draft', async () => {
    let interceptor: ((target: string) => boolean | Promise<boolean>) | null = null;
    const registerInterceptor = (fn: ((target: string) => boolean | Promise<boolean>) | null) => {
      interceptor = fn;
    };

    const mockNavigate = vi.fn();

    render(
      <ToastProvider>
        <PassportEditor
          projectId="editor-proj-1"
          initialPassport={samplePassport}
          onNavigateTab={mockNavigate}
          registerNavigationInterceptor={registerInterceptor}
        />
      </ToastProvider>
    );

    // Clear project name to make it invalid
    const nameInput = screen.getByDisplayValue('Editor Test Project');
    fireEvent.change(nameInput, { target: { value: '' } });

    await waitFor(() => {
      const errors = screen.getAllByText(/Project name cannot be empty/i);
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    expect(interceptor).not.toBeNull();

    // Attempt navigation while invalid
    await act(async () => {
      const allowed = await interceptor!('overview');
      expect(allowed).toBe(false);
    });

    // Discard confirmation dialog should be open
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Discard unsaved changes\?/i })).toBeInTheDocument();

    // Clicking "Discard and leave" should proceed to target tab
    const discardBtn = screen.getByRole('button', { name: /Discard and leave/i });
    fireEvent.click(discardBtn);

    expect(mockNavigate).toHaveBeenCalledWith('overview');
  });
});
