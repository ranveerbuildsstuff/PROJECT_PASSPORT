import React from 'react';
import { Header } from './Header';

export interface AppShellProps {
  children: React.ReactNode;
  onRefreshProjects?: () => void;
}

export function AppShell({ children, onRefreshProjects }: AppShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-bg-app text-text-primary">
      {/* Skip to main content link for screen reader and keyboard accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent-brass focus:text-black focus:font-bold focus:rounded-lg"
      >
        Skip to main content
      </a>

      <Header onRefreshProjects={onRefreshProjects} />

      <main id="main-content" className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>

      <footer className="w-full border-t border-border-subtle/60 py-4 px-4 sm:px-6 text-center text-xs text-text-muted">
        <p>Project Passport &bull; The AI is replaceable; the project is not &bull; Your data never leaves this device</p>
      </footer>
    </div>
  );
}
