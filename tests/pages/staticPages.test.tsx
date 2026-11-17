import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../src/App';
import * as storageModule from '../../src/storage';
import { db } from '../../src/storage/db';

describe('Static Pages (/welcome and /privacy)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders /welcome routing with honest copy and 5-step guide', () => {
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <App />
      </MemoryRouter>
    );

    // Main heading & core philosophy
    expect(screen.getByRole('heading', { level: 1, name: 'Project Passport' })).toBeInTheDocument();
    expect(screen.getByText('The AI is replaceable; the project is not.')).toBeInTheDocument();

    // 5 numbered steps
    expect(screen.getByText('1. CAPTURE')).toBeInTheDocument();
    expect(screen.getByText('2. STRUCTURE')).toBeInTheDocument();
    expect(screen.getByText('3. CHECKPOINT')).toBeInTheDocument();
    expect(screen.getByText('4. EXPORT')).toBeInTheDocument();
    expect(screen.getByText('5. CONTINUE')).toBeInTheDocument();

    // "What it is not" section
    expect(screen.getByRole('heading', { name: 'What it is not' })).toBeInTheDocument();
  });

  it('renders /privacy routing with storage specification and zero-leak guarantees', () => {
    render(
      <MemoryRouter initialEntries={['/privacy']}>
        <App />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { level: 1, name: /Privacy & Security Model/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Database: ProjectPassportDB/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Zero outbound network requests/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/What the app protects/i)).toBeInTheDocument();
    expect(screen.getByText(/What it does not protect/i)).toBeInTheDocument();
  });

  it('renders /welcome without crashing or showing StorageBlockedPage when storage is blocked', async () => {
    vi.spyOn(storageModule, 'isAvailable').mockResolvedValue(false);

    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Project Passport' })).toBeInTheDocument();
    expect(screen.queryByText(/Storage unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Try again/i)).not.toBeInTheDocument();
  });

  it('renders /privacy without crashing or showing StorageBlockedPage when storage is blocked', async () => {
    vi.spyOn(storageModule, 'isAvailable').mockResolvedValue(false);

    render(
      <MemoryRouter initialEntries={['/privacy']}>
        <App />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { level: 1, name: /Privacy & Security Model/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Storage unavailable/i)).not.toBeInTheDocument();
  });

  it('renders /welcome and /privacy with zero Dexie database access', () => {
    const tableSpy = vi.spyOn(db, 'table');
    const transactionSpy = vi.spyOn(db, 'transaction');
    const openSpy = vi.spyOn(db, 'open');

    // Render Welcome
    const { unmount } = render(
      <MemoryRouter initialEntries={['/welcome']}>
        <App />
      </MemoryRouter>
    );
    expect(tableSpy).not.toHaveBeenCalled();
    expect(transactionSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    unmount();

    // Render Privacy
    render(
      <MemoryRouter initialEntries={['/privacy']}>
        <App />
      </MemoryRouter>
    );
    expect(tableSpy).not.toHaveBeenCalled();
    expect(transactionSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });
});
