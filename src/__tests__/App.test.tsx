import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

describe('App smoke test', () => {
  it('renders the Project Passport placeholder home page', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    const heading = screen.getByRole('heading', { name: /Project Passport/i });
    expect(heading).toBeInTheDocument();
  });
});
