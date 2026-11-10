import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';
import { BackupDialog } from '../../ui/BackupDialog';
import { ToastProvider } from '../../ui';
import { db } from '../../storage/db';
import { createProject } from '../../storage';
import { _setStorageAvailableForTesting } from '../../storage/testing';

describe('AppShell & BackupDialog Tests', () => {
  beforeEach(async () => {
    _setStorageAvailableForTesting(null);
    await db.projects.clear();
    await db.passports.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders friendly storage-unavailable screen when storage is blocked', async () => {
    _setStorageAvailableForTesting(false);

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Storage is blocked/i })).toBeInTheDocument();
      expect(screen.getByText(/Project Passport runs entirely on your device/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Retry storage check/i })).toBeInTheDocument();
    });
  });

  it('triggers a JSON file download when exporting a backup', async () => {
    await createProject('Project for Backup');

    // Mock URL.createObjectURL and URL.revokeObjectURL
    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/test-blob');
    const revokeObjectURLMock = vi.fn();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      <ToastProvider>
        <BackupDialog isOpen={true} onClose={vi.fn()} />
      </ToastProvider>
    );

    const exportBtn = screen.getByRole('button', { name: /Export backup file/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
    });
    clickSpy.mockRestore();
  });

  it('mentions that existing projects with same ID will be REPLACED in import confirmation', async () => {
    render(
      <ToastProvider>
        <BackupDialog isOpen={true} onClose={vi.fn()} />
      </ToastProvider>
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    const mockBackup = {
      backupVersion: 1,
      createdAt: new Date().toISOString(),
      projects: [
        {
          project: {
            id: 'proj-replace-1',
            name: 'Imported Project',
            updatedAt: new Date().toISOString(),
            status: 'idea',
          },
          passport: {
            schemaVersion: 1,
            project: {
              id: 'proj-replace-1',
              name: 'Imported Project',
              goal: 'Goal',
              summary: 'Summary',
              status: 'idea',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            stack: [],
            requirements: [],
            decisions: [],
            completed: [],
            tasks: [],
            bugs: [],
            bugsReviewed: false,
            instructions: [],
            files: [],
            conversations: [],
            nextAction: 'Next',
            openQuestions: [],
          },
          conversations: [],
          files: [],
          checkpoints: [],
        },
      ],
    };

    const file = new File([JSON.stringify(mockBackup)], 'backup.json', {
      type: 'application/json',
    });
    file.text = () => Promise.resolve(JSON.stringify(mockBackup));

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Confirm Project Replacement/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Projects in this backup sharing the same ID as existing local projects will be/i)
      ).toBeInTheDocument();
      expect(screen.getByText('REPLACED')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Confirm and restore/i })).toBeInTheDocument();
    });
  });
});
