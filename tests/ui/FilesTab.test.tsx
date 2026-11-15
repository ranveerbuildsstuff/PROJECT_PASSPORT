import { useState, useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../src/ui/Toast';
import { FilesTab } from '../../src/pages/files/FilesTab';
import { AddFilesDialog } from '../../src/ui/AddFilesDialog';
import { createEmptyPassport, type PassportV1 } from '../../src/domain';
import { db } from '../../src/storage/db';

function FilesTabTestWrapper({ projectId }: { projectId: string }) {
  const [passport, setPassport] = useState<PassportV1 | null>(null);

  useEffect(() => {
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
  }, [projectId]);

  if (!passport) return <div>Loading...</div>;
  return <FilesTab projectId={projectId} passport={passport} />;
}

describe('FilesTab & AddFilesDialog (RTL)', () => {
  const projectId = 'test-proj-files-1';

  beforeEach(async () => {
    await db.projects.clear();
    await db.passports.clear();
    await db.files.clear();

    const now = new Date().toISOString();
    const passport = createEmptyPassport('Files App');
    passport.project.id = projectId;
    passport.project.updatedAt = now;

    await db.projects.put({
      id: projectId,
      name: 'Files App',
      updatedAt: now,
      status: 'in_progress',
    });

    await db.passports.put({
      projectId,
      passport,
    });
  });

  it('renders compact empty state when no files are attached', async () => {
    render(
      <ToastProvider>
        <FilesTabTestWrapper projectId={projectId} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('No project files attached yet')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Add source files, a directory, or an archive/i)
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Add files/i }).length).toBeGreaterThan(0);
  });

  it('renders manifest table with path, purpose, include toggle, size, and tokens', async () => {
    const passportRecord = await db.passports.get(projectId);
    if (passportRecord) {
      passportRecord.passport.files = [
        {
          path: 'src/main.ts',
          purpose: 'Entry point',
          included: true,
          sizeBytes: 1200,
        },
        {
          path: 'docs/guide.md',
          purpose: '',
          included: false,
          sizeBytes: 800,
        },
      ];
      await db.passports.put(passportRecord);
    }

    render(
      <ToastProvider>
        <FilesTabTestWrapper projectId={projectId} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('src/main.ts')).toBeInTheDocument();
      expect(screen.getByText('docs/guide.md')).toBeInTheDocument();
    });

    // Check token estimate labels (both summary and row)
    expect(screen.getAllByText(/~300 tokens \(estimate\)/i).length).toBeGreaterThanOrEqual(1);

    // Check include toggles
    const toggles = screen.getAllByRole('checkbox', { name: /Include/i });
    expect(toggles).toHaveLength(2);
    expect(toggles[0]).toBeChecked();
    expect(toggles[1]).not.toBeChecked();

    // Check purpose input
    const purposeInput = screen.getByDisplayValue('Entry point');
    expect(purposeInput).toBeInTheDocument();
  });

  it('allows removing a file and displays undo toast that restores it', async () => {
    const passportRecord = await db.passports.get(projectId);
    if (passportRecord) {
      passportRecord.passport.files = [
        {
          path: 'src/remove-me.ts',
          purpose: 'To be removed',
          included: true,
          sizeBytes: 100,
        },
      ];
      await db.passports.put(passportRecord);
      await db.files.put({
        id: `${projectId}:src/remove-me.ts`,
        projectId,
        path: 'src/remove-me.ts',
        mime: 'text/plain',
        content: 'content to remove',
        sizeBytes: 100,
      });
    }

    render(
      <ToastProvider>
        <FilesTabTestWrapper projectId={projectId} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('src/remove-me.ts')).toBeInTheDocument();
    });

    const removeBtn = screen.getByRole('button', { name: /Remove src\/remove-me\.ts/i });
    fireEvent.click(removeBtn);

    // Verify row disappears and undo toast appears
    await waitFor(() => {
      expect(screen.queryByText('src/remove-me.ts')).not.toBeInTheDocument();
    });

    const undoBtn = await screen.findByRole('button', { name: 'Undo' });
    expect(undoBtn).toBeInTheDocument();

    // Click undo
    fireEvent.click(undoBtn);

    // Verify restored
    await waitFor(() => {
      expect(screen.getByText('src/remove-me.ts')).toBeInTheDocument();
    });
  });

  it('AddFilesDialog shows 3 picker choices and has proper modal role', () => {
    const handleClose = vi.fn();
    render(
      <ToastProvider>
        <AddFilesDialog
          isOpen={true}
          onClose={handleClose}
          projectId={projectId}
          onSuccess={vi.fn()}
        />
      </ToastProvider>
    );

    expect(screen.getByRole('dialog', { name: 'Add project files' })).toBeInTheDocument();
    expect(screen.getByText('Choose files')).toBeInTheDocument();
    expect(screen.getByText('Choose folder')).toBeInTheDocument();
    expect(screen.getByText('Choose .zip')).toBeInTheDocument();
    expect(screen.getByLabelText('Choose files')).toBeInTheDocument();
    expect(screen.getByLabelText('Choose folder')).toBeInTheDocument();
    expect(screen.getByLabelText('Choose .zip')).toBeInTheDocument();
  });
});
