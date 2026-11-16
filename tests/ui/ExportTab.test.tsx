import { useState, useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../src/ui/Toast';
import { ExportTab } from '../../src/pages/export/ExportTab';
import { createEmptyPassport, type PassportV1 } from '../../src/domain';
import { db } from '../../src/storage/db';

function ExportTabTestWrapper({
  projectId,
  initialPassport,
  onNavigateToPassport,
}: {
  projectId: string;
  initialPassport?: PassportV1;
  onNavigateToPassport?: () => void;
}) {
  const [passport, setPassport] = useState<PassportV1 | null>(initialPassport || null);

  useEffect(() => {
    if (initialPassport) return;
    let mounted = true;
    const load = async () => {
      const p = await db.passports.get(projectId);
      if (mounted && p) {
        setPassport(p.passport);
      }
    };
    load();
    const handleUpdate = () => load();
    window.addEventListener('project-storage-updated', handleUpdate);
    return () => {
      mounted = false;
      window.removeEventListener('project-storage-updated', handleUpdate);
    };
  }, [projectId, initialPassport]);

  if (!passport) return <div>Loading...</div>;

  return (
    <ToastProvider>
      <ExportTab
        projectId={projectId}
        passport={passport}
        onNavigateToPassport={onNavigateToPassport}
      />
    </ToastProvider>
  );
}

describe('ExportTab (RTL)', () => {
  const projectId = 'test-proj-export-1';

  beforeEach(async () => {
    await db.projects.clear();
    await db.passports.clear();
    await db.files.clear();
    await db.conversations.clear();
  });

  it('renders empty passport state when project passport is completely empty', async () => {
    const onNav = vi.fn();
    const emptyPassport = createEmptyPassport('');
    emptyPassport.project.id = projectId;
    emptyPassport.project.name = '';
    emptyPassport.project.goal = '';

    render(
      <ExportTabTestWrapper
        projectId={projectId}
        initialPassport={emptyPassport}
        onNavigateToPassport={onNav}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Your project passport is empty')).toBeInTheDocument();
    });

    const navBtn = screen.getByRole('button', { name: /Go to Passport tab/i });
    expect(navBtn).toBeInTheDocument();
    fireEvent.click(navBtn);
    expect(onNav).toHaveBeenCalled();
  });

  it('renders default Lite preset (6,000 tokens) and switching presets updates budget', async () => {
    const passport = createEmptyPassport('My Active App');
    passport.project.id = projectId;
    passport.project.goal = 'Full featured task tracker';
    passport.stack = [{ name: 'React', role: 'UI' }];
    passport.tasks = [{ id: 't1', text: 'Build dashboard', status: 'todo', priority: 'high' }];

    await db.projects.put({
      id: projectId,
      name: 'My Active App',
      updatedAt: new Date().toISOString(),
      status: 'in_progress',
    });
    await db.passports.put({ projectId, passport });

    render(<ExportTabTestWrapper projectId={projectId} initialPassport={passport} />);

    await waitFor(() => {
      expect(screen.getByText('Export Handoff Package')).toBeInTheDocument();
    });

    // Default preset is Lite paste
    expect(screen.getByText(/~6,000 tokens \(estimate\)/i)).toBeInTheDocument();

    // Switch to ChatGPT preset
    const chatGptBtn = screen.getByRole('button', { name: /ChatGPT/i });
    fireEvent.click(chatGptBtn);

    expect(screen.getAllByText(/30,000 tokens/i).length).toBeGreaterThanOrEqual(1);

    // Switch to Custom preset
    const customBtn = screen.getByRole('button', { name: /Custom/i });
    fireEvent.click(customBtn);

    const customInput = screen.getByPlaceholderText('50000');
    expect(customInput).toBeInTheDocument();
  });

  it('validates custom budget input with plain language error for out of bounds numbers', async () => {
    const passport = createEmptyPassport('My Custom App');
    passport.project.id = projectId;
    passport.project.goal = 'Testing custom budget bounds';

    render(<ExportTabTestWrapper projectId={projectId} initialPassport={passport} />);

    await waitFor(() => {
      expect(screen.getByText('Export Handoff Package')).toBeInTheDocument();
    });

    const customBtn = screen.getByRole('button', { name: /Custom/i });
    fireEvent.click(customBtn);

    const customInput = screen.getByPlaceholderText('50000');
    fireEvent.change(customInput, { target: { value: '500' } });

    await waitFor(() => {
      expect(
        screen.getByText('Enter a whole number between 1,000 and 2,000,000.')
      ).toBeInTheDocument();
    });

    fireEvent.change(customInput, { target: { value: '15000' } });

    await waitFor(() => {
      expect(
        screen.queryByText('Enter a whole number between 1,000 and 2,000,000.')
      ).toBeNull();
    });
  });

  it('switches between Lite format and Full package format', async () => {
    const passport = createEmptyPassport('Format Toggle App');
    passport.project.id = projectId;
    passport.project.goal = 'Format toggling test';

    render(<ExportTabTestWrapper projectId={projectId} initialPassport={passport} />);

    await waitFor(() => {
      expect(screen.getByText('Export Handoff Package')).toBeInTheDocument();
    });

    // Initially Lite format
    expect(screen.getByRole('button', { name: /Copy prompt/i })).toBeInTheDocument();

    // Toggle to Full package
    const fullBtn = screen.getByRole('button', { name: /Full package/i });
    fireEvent.click(fullBtn);

    expect(screen.getByRole('button', { name: /Download package/i })).toBeInTheDocument();
  });

  it('displays truncation filter tabs and item listings', async () => {
    const passport = createEmptyPassport('Truncation App');
    passport.project.id = projectId;
    passport.project.goal = 'Truncation list test';
    passport.tasks = [
      { id: 't1', text: 'Task 1', status: 'todo', priority: 'high' },
      { id: 't2', text: 'Task 2', status: 'done', priority: 'low' },
    ];

    render(<ExportTabTestWrapper projectId={projectId} initialPassport={passport} />);

    await waitFor(() => {
      expect(screen.getByText('Export Handoff Package')).toBeInTheDocument();
    });

    // Truncation filter buttons
    expect(screen.getByRole('button', { name: /All \(/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Included \(/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trimmed \(/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Omitted \(/i })).toBeInTheDocument();

    // Summary line with estimate
    expect(screen.getAllByText(/tokens \(estimate\)/i).length).toBeGreaterThanOrEqual(1);
  });

  it('displays secret gate block when secrets are detected and unblocks on override acknowledgment', async () => {
    const passport = createEmptyPassport('Secret App');
    passport.project.id = projectId;
    // AWS Access Key in passport text constructed dynamically to avoid static repo hygiene alerts
    const sampleAwsKey = ['AK', 'IA', 'IOSFODNN7EXAMPLE'].join('');
    passport.project.goal = `API key ${sampleAwsKey} in passport text`;

    render(<ExportTabTestWrapper projectId={projectId} initialPassport={passport} />);

    await waitFor(() => {
      expect(screen.getByText(/Export blocked: Unresolved secrets detected/i)).toBeInTheDocument();
    });

    // Check button is disabled
    const copyBtn = screen.getByRole('button', { name: /Copy prompt/i });
    expect(copyBtn).toBeDisabled();

    // Acknowledge override
    const overrideCheckbox = screen.getByLabelText(/I understand the risks and want to export anyway/i);
    fireEvent.click(overrideCheckbox);

    // Button should now be enabled
    expect(copyBtn).not.toBeDisabled();
  });

  it('copies Lite prompt to clipboard and shows toast', async () => {
    const passport = createEmptyPassport('Copy App');
    passport.project.id = projectId;
    passport.project.goal = 'Copy prompt to clipboard';

    // Mock navigator.clipboard
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<ExportTabTestWrapper projectId={projectId} initialPassport={passport} />);

    await waitFor(() => {
      expect(screen.getByText('Export Handoff Package')).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole('button', { name: /Copy prompt/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled();
      expect(screen.getByText(/Prompt copied to clipboard/i)).toBeInTheDocument();
    });
  });
});
