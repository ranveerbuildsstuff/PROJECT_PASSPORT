import React from 'react';
import { ShieldCheck } from 'lucide-react';

export function PrivacyPage(): React.ReactElement {
  return (
    <div className="max-w-3xl mx-auto space-y-10 py-4 sm:py-6">
      {/* Title */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-accent-brass" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
            Privacy &amp; Security Model
          </h1>
        </div>
        <p className="text-sm sm:text-base text-text-muted leading-relaxed">
          Project Passport is built on zero-knowledge, local-only architecture. Your code, transcripts, and project data are never transmitted over the internet.
        </p>
        <p className="text-xs sm:text-sm font-mono text-accent-brass bg-accent-brass/10 border border-accent-brass/30 px-3 py-2 rounded-md inline-block">
          After the first visit, the app runs without a connection.
        </p>
      </div>

      {/* What is stored and where */}
      <section className="space-y-3" aria-labelledby="stored-where-heading">
        <h2 id="stored-where-heading" className="text-lg sm:text-xl font-bold text-text-primary border-b border-border-subtle pb-2">
          What is stored and where
        </h2>
        <div className="p-4 rounded-lg border border-border-subtle bg-bg-surface space-y-3 text-xs sm:text-sm text-text-muted leading-relaxed">
          <p>
            All workspace data is stored in the browser's client-side <strong>IndexedDB</strong> under the database name:
          </p>
          <div className="font-mono text-xs bg-bg-app p-3 rounded border border-border-subtle text-text-primary space-y-1">
            <div className="font-semibold text-accent-brass">Database: ProjectPassportDB</div>
            <ul className="list-disc list-inside space-y-0.5 text-text-muted">
              <li><code className="text-text-primary">projects</code> — Project metadata (ID, name, timestamps, status)</li>
              <li><code className="text-text-primary">passports</code> — Passport records conforming to schema version 1</li>
              <li><code className="text-text-primary">checkpoints</code> — Historical snapshots with file hashes and diffs</li>
              <li><code className="text-text-primary">conversations</code> — Pasted chat transcripts and turn records</li>
              <li><code className="text-text-primary">files</code> — Attached project source files and manifests</li>
            </ul>
          </div>
          <p>
            The only data saved to <strong>localStorage</strong> is your UI appearance preference under a single key:
          </p>
          <div className="font-mono text-xs bg-bg-app p-2 rounded border border-border-subtle text-text-primary">
            <code>theme</code>: "light" or absent (defaults to dark)
          </div>
        </div>
      </section>

      {/* What never leaves the device */}
      <section className="space-y-3" aria-labelledby="never-leaves-heading">
        <h2 id="never-leaves-heading" className="text-lg sm:text-xl font-bold text-text-primary border-b border-border-subtle pb-2">
          What never leaves the device
        </h2>
        <div className="p-4 rounded-lg border border-border-subtle bg-bg-surface space-y-3 text-xs sm:text-sm text-text-muted leading-relaxed">
          <ul className="list-disc list-inside space-y-1.5">
            <li><strong>Zero outbound network requests:</strong> No telemetry, analytics, crash reporting, remote logs, or CDNs.</li>
            <li><strong>Zero cookies or tracking:</strong> No tracking pixels, session cookies, or device fingerprinting.</li>
            <li><strong>No accounts or sign-in:</strong> No third-party OAuth, API tokens, or server-side user authentication.</li>
          </ul>
          <p className="text-xs text-text-muted italic border-t border-border-subtle/60 pt-2">
            <strong>How to verify:</strong> Open your browser Developer Tools (F12), switch to the <em>Network</em> tab, and filter by &ldquo;All&rdquo;. Perform any action in the application (create projects, import chats, attach files, export packages). You will observe exactly zero outbound network requests.
          </p>
        </div>
      </section>

      {/* What the app protects */}
      <section className="space-y-3" aria-labelledby="what-protects-heading">
        <h2 id="what-protects-heading" className="text-lg sm:text-xl font-bold text-text-primary border-b border-border-subtle pb-2">
          What the app protects
        </h2>
        <div className="p-4 rounded-lg border border-border-subtle bg-bg-surface space-y-3 text-xs sm:text-sm text-text-muted leading-relaxed">
          <ul className="list-disc list-inside space-y-1.5">
            <li><strong>Hard-blocked files:</strong> Sensitive files such as <code className="font-mono">.env</code>, private keys (<code className="font-mono">.pem</code>, <code className="font-mono">id_rsa</code>), credentials, and SQLite databases are strictly refused during file attachment and packaging.</li>
            <li><strong>Pattern-based secret scanner:</strong> Text files, transcripts, and passport fields are scanned for 13+ secret patterns (AWS, GitHub tokens, OpenAI keys, JWTs). <em>Note: Pattern scanners can miss obfuscated, unusual, or proprietary secrets.</em></li>
            <li><strong>Export secret gate:</strong> Exporting a handoff package is blocked if unreviewed or unresolved secret findings exist across included files, conversations, or passport text.</li>
          </ul>
        </div>
      </section>

      {/* What it does not protect */}
      <section className="space-y-3" aria-labelledby="not-protect-heading">
        <h2 id="not-protect-heading" className="text-lg sm:text-xl font-bold text-text-primary border-b border-border-subtle pb-2">
          What it does not protect
        </h2>
        <div className="p-4 rounded-lg border border-border-subtle bg-bg-surface space-y-3 text-xs sm:text-sm text-text-muted leading-relaxed">
          <ul className="list-disc list-inside space-y-1.5">
            <li><strong>No encryption at rest:</strong> Data in IndexedDB is unencrypted on your local hard drive. Any process or browser extension with access to your browser profile can read it. Use full-disk encryption (e.g. BitLocker, FileVault) for local protection.</li>
            <li><strong>External AI provider terms:</strong> Once you copy a continuation prompt or handoff zip and paste it into ChatGPT, Claude, Gemini, or any third-party provider, that provider’s data retention and privacy policies govern the data.</li>
            <li><strong>No guarantee against zero-day leaks:</strong> We never claim &ldquo;100% secure&rdquo;. You remain in control of what code and secrets you paste into browser workspaces.</li>
          </ul>
        </div>
      </section>

      {/* How to remove everything */}
      <section className="space-y-3" aria-labelledby="remove-heading">
        <h2 id="remove-heading" className="text-lg sm:text-xl font-bold text-text-primary border-b border-border-subtle pb-2">
          How to remove everything
        </h2>
        <div className="p-4 rounded-lg border border-border-subtle bg-bg-surface space-y-3 text-xs sm:text-sm text-text-muted leading-relaxed">
          <p>
            To completely purge all Project Passport data:
          </p>
          <ol className="list-decimal list-inside space-y-1 text-text-muted">
            <li>Delete individual projects from the Dashboard menu, or:</li>
            <li>In your browser, open site settings (click the lock/tune icon in the address bar) and choose <strong>Clear site data</strong> / <strong>Delete cookies and site data</strong>.</li>
          </ol>
          <p className="text-xs text-text-muted">
            Clearing site data permanently wipes the IndexedDB database and theme preference from your machine.
          </p>
        </div>
      </section>
    </div>
  );
}
