import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '../DashboardPage';
import { ToastProvider } from '../../ui';
import { db } from '../../storage/db';
import { createProject, listProjects } from '../../storage';
import { _setStorageAvailableForTesting } from '../../storage/testing';

function renderDashboard() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <DashboardPage />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('DashboardPage Component Tests', () => {
  beforeEach(async () => {
    _setStorageAvailableForTesting(null);
    await db.projects.clear();
    await db.passports.clear();
    await db.checkpoints.clear();
    await db.conversations.clear();
    await db.files.clear();
  });

  it('renders empty state when no projects exist', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/No projects yet/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Project Passport keeps a structured, portable record/i)
      ).toBeInTheDocument();
    });
  });

  it('validates project name is required when creating a project', async () => {
    renderDashboard();

    await waitFor(() => {
      const [btn] = screen.getAllByRole('button', { name: /^New project$/i });
      expect(btn).toBeInTheDocument();
    });

    const [createBtn] = screen.getAllByRole('button', { name: /^New project$/i });
    expect(createBtn).toBeDefined();
    fireEvent.click(createBtn!);

    expect(screen.getByRole('heading', { name: /New Project/i })).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Create project/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Project name cannot be empty');
    });

    const projectsInDb = await listProjects();
    expect(projectsInDb.length).toBe(0);
  });

  it('creates a new project and displays it on the dashboard', async () => {
    renderDashboard();

    await waitFor(() => {
      const [btn] = screen.getAllByRole('button', { name: /^New project$/i });
      expect(btn).toBeInTheDocument();
    });

    const [createBtn] = screen.getAllByRole('button', { name: /^New project$/i });
    expect(createBtn).toBeDefined();
    fireEvent.click(createBtn!);

    const nameInput = screen.getByLabelText(/Project name/i);
    fireEvent.change(nameInput, { target: { value: 'Frontend Redesign' } });

    const submitBtn = screen.getByRole('button', { name: /Create project/i });
    fireEvent.click(submitBtn);

    await waitFor(async () => {
      const projects = await listProjects();
      expect(projects.length).toBe(1);
      expect(projects[0]?.name).toBe('Frontend Redesign');
    });
  });

  it('renames an existing project', async () => {
    const created = await createProject('Old Project Name');
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Old Project Name')).toBeInTheDocument();
    });

    const renameBtn = screen.getByRole('button', { name: `Rename ${created.name}` });
    fireEvent.click(renameBtn);

    expect(screen.getByRole('heading', { name: /Rename Project/i })).toBeInTheDocument();

    const input = screen.getByLabelText(/New project name/i);
    fireEvent.change(input, { target: { value: '   ' } });

    const saveBtn = screen.getByRole('button', { name: /Save name/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Project name cannot be empty');
    });

    fireEvent.change(input, { target: { value: 'Refactored Project' } });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Refactored Project')).toBeInTheDocument();
      expect(screen.queryByText('Old Project Name')).not.toBeInTheDocument();
    });
  });

  it('deletes an existing project with cancel and confirm paths', async () => {
    const created = await createProject('Disposable Project');
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Disposable Project')).toBeInTheDocument();
    });

    // 1. Open delete modal and click Cancel
    const deleteBtn = screen.getByRole('button', { name: `Delete ${created.name}` });
    fireEvent.click(deleteBtn);

    expect(
      screen.getByText(/Are you sure you want to delete “Disposable Project”?/i)
    ).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Delete Project/i })).not.toBeInTheDocument();
      expect(screen.getByText('Disposable Project')).toBeInTheDocument();
    });

    // 2. Open delete modal and Confirm Delete
    fireEvent.click(deleteBtn);
    const confirmDeleteBtn = screen.getByRole('button', { name: /Delete project/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(screen.queryByText('Disposable Project')).not.toBeInTheDocument();
      expect(screen.getByText(/No projects yet/i)).toBeInTheDocument();
    });

    const projectsInDb = await listProjects();
    expect(projectsInDb.length).toBe(0);
  });
});
