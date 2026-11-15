import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImportExportDialog } from '../../src/ui/ImportExportDialog';
import { ToastProvider } from '../../src/ui/Toast';
import * as storage from '../../src/storage';

describe('ImportExportDialog component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderDialog = (props?: Partial<React.ComponentProps<typeof ImportExportDialog>>) => {
    return render(
      <ToastProvider>
        <ImportExportDialog
          isOpen={true}
          onClose={vi.fn()}
          projectId="proj-123"
          {...props}
        />
      </ToastProvider>
    );
  };

  it('renders initial empty state with file input', () => {
    renderDialog();
    expect(screen.getByText('Import export file')).toBeInTheDocument();
    expect(
      screen.getByText('Choose conversations.json or Claude export')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Choose export JSON file')).toBeInTheDocument();
  });

  it('displays zip error when a .zip file is selected', async () => {
    renderDialog();
    const input = screen.getByLabelText('Choose export JSON file') as HTMLInputElement;

    const file = new File(['fake-zip-data'], 'export.zip', { type: 'application/zip' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByText(
          'This is a .zip file. Unzip it first, then choose conversations.json.'
        )
      ).toBeInTheDocument();
    });
  });

  it('shows 300 MB warning when selected file size exceeds threshold', async () => {
    renderDialog();
    const input = screen.getByLabelText('Choose export JSON file') as HTMLInputElement;

    // Create a mock File object with size > 300MB
    const bigFile = new File(['large content'], 'huge.json', { type: 'application/json' });
    Object.defineProperty(bigFile, 'size', { value: 350 * 1024 * 1024 });

    fireEvent.change(input, { target: { files: [bigFile] } });

    await waitFor(() => {
      expect(screen.getByText(/Large export file/i)).toBeInTheDocument();
      expect(screen.getByText('Proceed')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  it('displays safe diagnostics panel without content leakage when format is unrecognized', async () => {
    renderDialog();
    const input = screen.getByLabelText('Choose export JSON file') as HTMLInputElement;

    const unknownData = JSON.stringify([{ custom_unknown_field: 'secret_content_xyz' }]);
    const file = new File([unknownData], 'unknown.json', { type: 'application/json' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Unrecognized export format')).toBeInTheDocument();
      expect(screen.getByText(/custom_unknown_field/)).toBeInTheDocument();
      // Ensure the content string does NOT appear anywhere in the DOM
      expect(screen.queryByText('secret_content_xyz')).not.toBeInTheDocument();
    });
  });

  it('transitions to selection view on valid ChatGPT export and attaches conversations', async () => {
    const addImportedSpy = vi
      .spyOn(storage, 'addImportedConversations')
      .mockResolvedValueOnce({ importedIds: ['c1'], skippedCount: 0 });

    const onClose = vi.fn();
    renderDialog({ onClose });

    const input = screen.getByLabelText('Choose export JSON file') as HTMLInputElement;

    const chatGptData = JSON.stringify([
      {
        id: 'c1',
        title: 'Project Architecture Chat',
        create_time: 1700000000,
        mapping: {
          'n-1': {
            id: 'n-1',
            parent: null,
            children: [],
            message: { id: 'm-1', author: { role: 'user' }, content: { parts: ['Hello'] } },
          },
        },
        current_node: 'n-1',
      },
    ]);

    const file = new File([chatGptData], 'conversations.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Project Architecture Chat')).toBeInTheDocument();
    });

    // Check filter input
    const filterInput = screen.getByLabelText('Filter conversations by title');
    fireEvent.change(filterInput, { target: { value: 'Nonexistent' } });
    expect(screen.getByText('No conversations match your filter.')).toBeInTheDocument();

    fireEvent.change(filterInput, { target: { value: '' } });
    expect(screen.getByText('Project Architecture Chat')).toBeInTheDocument();

    // Attach button
    const attachButton = screen.getByRole('button', { name: /Attach selected/i });
    expect(attachButton).toBeEnabled();

    fireEvent.click(attachButton);

    await waitFor(() => {
      expect(addImportedSpy).toHaveBeenCalledWith(
        'proj-123',
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Project Architecture Chat',
            source: 'chatgpt',
          }),
        ]),
        expect.anything()
      );
      expect(onClose).toHaveBeenCalled();
    });
  });
});
