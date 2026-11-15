import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProjectPage } from '../ProjectPage';
import { ToastProvider } from '../../ui';
import { db } from '../../storage/db';
import { createProject, getPassport, savePassport } from '../../storage';
import { _setStorageAvailableForTesting } from '../../storage/testing';

describe('ProjectPage Component Tests', () => {
  beforeEach(async () => {
    _setStorageAvailableForTesting(null);
    await db.projects.clear();
    await db.passports.clear();
  });

  it('renders project not found state for an unknown project ID', async () => {
    render(
      <MemoryRouter initialEntries={['/project/non-existent-id/overview']}>
        <ToastProvider>
          <Routes>
            <Route path="/project/:id/:tab?" element={<ProjectPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Project not found/i })).toBeInTheDocument();
      expect(
        screen.getByText(/This project was not found\. It may have been deleted\. Go back to your projects and try again\./i)
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Return to projects/i })).toBeInTheDocument();
    });
  });

  it('renders Overview tab with real passport data, readiness checklist, quick stats, and next action', async () => {
    const project = await createProject('E-commerce Microservices');
    const passport = (await getPassport(project.id))!;

    // Populate passport with realistic data
    passport.project.goal = 'Build high-performance checkout';
    passport.stack = [
      { name: 'React', role: 'UI' },
      { name: 'Node.js', role: 'API' },
    ];
    passport.decisions = [
      { id: 'd1', decision: 'Use IndexedDB', reason: 'Zero telemetry local-first', status: 'active' },
    ];
    passport.tasks = [
      { id: 't1', text: 'Implement payment gateway', status: 'todo', priority: 'high' },
    ];
    passport.bugs = [];
    passport.bugsReviewed = true;
    passport.nextAction = 'Review security requirements';
    passport.files = [
      { path: 'src/index.ts', purpose: 'Entrypoint', included: true, sizeBytes: 120 },
    ];

    await savePassport(passport);

    render(
      <MemoryRouter initialEntries={[`/project/${project.id}/overview`]}>
        <ToastProvider>
          <Routes>
            <Route path="/project/:id/:tab?" element={<ProjectPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'E-commerce Microservices' })).toBeInTheDocument();
      expect(screen.getByText('Build high-performance checkout')).toBeInTheDocument();
      expect(screen.getByText('Review security requirements')).toBeInTheDocument();
    });

    // Check readiness checklist criteria
    expect(screen.getByText('Readiness Checklist')).toBeInTheDocument();
    expect(screen.getByText('Objective defined')).toBeInTheDocument();
    expect(screen.getByText('Stack recorded')).toBeInTheDocument();
    expect(screen.getByText('Active decisions')).toBeInTheDocument();

    // Check quick stats
    expect(screen.getByText('Stack')).toBeInTheDocument();
    expect(screen.getByText('Decisions')).toBeInTheDocument();

    // Check passport tab renders the editor
    const passportTab = screen.getByRole('tab', { name: /Passport/i });
    fireEvent.click(passportTab);

    await waitFor(() => {
      expect(screen.getByText('Basics')).toBeInTheDocument();
      expect(screen.getByText('Tech stack')).toBeInTheDocument();
    });

    // Check Conversations tab renders real content
    const convTab = screen.getByRole('tab', { name: /Conversations/i });
    fireEvent.click(convTab);

    await waitFor(() => {
      expect(screen.getByText(/No conversations attached yet/i)).toBeInTheDocument();
    });

    // Check Files tab renders real content
    const filesTab = screen.getByRole('tab', { name: /Files/i });
    fireEvent.click(filesTab);

    await waitFor(() => {
      expect(screen.getByText('src/index.ts')).toBeInTheDocument();
    });

    // Check placeholder on remaining future tabs (e.g. Checkpoints)
    const checkpointsTab = screen.getByRole('tab', { name: /Checkpoints/i });
    fireEvent.click(checkpointsTab);

    await waitFor(() => {
      expect(screen.getByText(/Coming in a later slice/i)).toBeInTheDocument();
    });
  });
});
