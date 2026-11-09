import React from 'react';
import { Routes, Route } from 'react-router-dom';

export function HomePage(): React.ReactElement {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full p-8 border border-border-subtle rounded-lg bg-bg-surface">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Project Passport
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Portable project context for AI workflows. Local-first, private, and transferable.
        </p>
        <div className="mt-6 inline-flex items-center px-3 py-1 rounded text-xs font-mono border border-border-subtle bg-bg-app text-text-muted">
          Scaffold initialized • Slice 1
        </div>
      </div>
    </main>
  );
}

export function App(): React.ReactElement {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
    </Routes>
  );
}

export default App;
