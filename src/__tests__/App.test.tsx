import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { db } from '../storage/db';
import { _setStorageAvailableForTesting } from '../storage/testing';

describe('App smoke test', () => {
  beforeEach(async () => {
    _setStorageAvailableForTesting(null);
    await db.projects.clear();
    await db.passports.clear();
  });

  it('renders Project Passport dashboard on default route', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(
      () => {
        expect(screen.getByRole('heading', { name: /Project Passport/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 2, name: 'Projects' })).toBeInTheDocument();
        expect(screen.getByText(/No projects yet/i)).toBeInTheDocument();
      },
      { timeout: 4000 }
    );
  });
});
