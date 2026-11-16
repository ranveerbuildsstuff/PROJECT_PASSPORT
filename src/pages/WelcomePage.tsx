import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ArrowRight } from 'lucide-react';

export function WelcomePage(): React.ReactElement {
  return (
    <div className="max-w-3xl mx-auto space-y-10 py-4 sm:py-6">
      {/* Intro */}
      <div className="space-y-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
          Project Passport
        </h1>
        <p className="text-base sm:text-lg text-text-primary font-medium leading-relaxed">
          The AI is replaceable; the project is not.
        </p>
        <p className="text-sm sm:text-base text-text-muted leading-relaxed">
          Project Passport is a local-first workspace that preserves your project context across AI assistants.
          When conversations wander, context windows fill, or tools change, your passport keeps the project's
          identity, decisions, files, and progress intact.
        </p>
        <div>
          <Link to="/">
            <Button variant="primary" size="lg" className="gap-2 min-h-[44px]">
              <span>Open your projects</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Button>
          </Link>
        </div>
      </div>

      {/* How it works */}
      <section className="space-y-4" aria-labelledby="how-it-works-heading">
        <h2 id="how-it-works-heading" className="text-lg sm:text-xl font-bold text-text-primary border-b border-border-subtle pb-2">
          How it works
        </h2>
        <ol className="space-y-4 list-none p-0">
          <li className="p-4 rounded-lg border border-border-subtle bg-bg-surface flex items-start gap-3">
            <Badge variant="brass" className="shrink-0 mt-0.5">1. CAPTURE</Badge>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-text-primary">Capture conversational state</p>
              <p className="text-xs text-text-muted leading-relaxed">
                Paste chat transcripts from ChatGPT, Claude, Gemini, or local models. The importer extracts key project milestones, decisions, tasks, and bugs into structured records.
              </p>
            </div>
          </li>
          <li className="p-4 rounded-lg border border-border-subtle bg-bg-surface flex items-start gap-3">
            <Badge variant="brass" className="shrink-0 mt-0.5">2. STRUCTURE</Badge>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-text-primary">Structure your project passport</p>
              <p className="text-xs text-text-muted leading-relaxed">
                Maintain a single source of truth: goals, architecture decisions, requirements, open questions, and the immediate next action.
              </p>
            </div>
          </li>
          <li className="p-4 rounded-lg border border-border-subtle bg-bg-surface flex items-start gap-3">
            <Badge variant="brass" className="shrink-0 mt-0.5">3. CHECKPOINT</Badge>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-text-primary">Record immutable snapshots</p>
              <p className="text-xs text-text-muted leading-relaxed">
                Save versioned checkpoints with SHA-256 file hashes before high-risk changes. Inspect plain-language visual diffs and safely rollback at any time.
              </p>
            </div>
          </li>
          <li className="p-4 rounded-lg border border-border-subtle bg-bg-surface flex items-start gap-3">
            <Badge variant="brass" className="shrink-0 mt-0.5">4. EXPORT</Badge>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-text-primary">Export bounded handoff packages</p>
              <p className="text-xs text-text-muted leading-relaxed">
                Fit your project into target context windows (Claude 200k, GPT-4o 128k, DeepSeek 64k) using token budgeting and pattern-based secret scanning.
              </p>
            </div>
          </li>
          <li className="p-4 rounded-lg border border-border-subtle bg-bg-surface flex items-start gap-3">
            <Badge variant="brass" className="shrink-0 mt-0.5">5. CONTINUE</Badge>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-text-primary">Continue seamlessly in any assistant</p>
              <p className="text-xs text-text-muted leading-relaxed">
                Paste the synthesized continuation prompt into a fresh AI conversation and pick up immediately where you left off.
              </p>
            </div>
          </li>
        </ol>
      </section>

      {/* What it is not */}
      <section className="space-y-3" aria-labelledby="what-it-is-not-heading">
        <h2 id="what-it-is-not-heading" className="text-lg sm:text-xl font-bold text-text-primary border-b border-border-subtle pb-2">
          What it is not
        </h2>
        <div className="p-4 rounded-lg border border-border-subtle bg-bg-surface space-y-2 text-xs sm:text-sm text-text-muted leading-relaxed">
          <p>
            Project Passport does not move subscriptions or quotas, scrape sites, or ask for account credentials. It carries project context only.
          </p>
          <p>
            There are no server accounts, remote databases, or cloud synchronizers. The tool operates solely within your web browser.
          </p>
        </div>
      </section>

      {/* Honest limits */}
      <section className="space-y-3" aria-labelledby="honest-limits-heading">
        <h2 id="honest-limits-heading" className="text-lg sm:text-xl font-bold text-text-primary border-b border-border-subtle pb-2">
          Honest limits
        </h2>
        <div className="p-4 rounded-lg border border-border-subtle bg-bg-surface space-y-2 text-xs sm:text-sm text-text-muted leading-relaxed">
          <p>
            Browser storage can be cleared by private browsing mode, storage cleaners, or browser profile resets. There is no automated background sync.
          </p>
          <p>
            You should regularly back up your workspace using the{' '}
            <Link
              to="/?backup=open"
              className="text-accent-brass hover:underline font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass rounded px-1 py-0.5"
            >
              Backup &amp; restore
            </Link>{' '}
            tool in the top bar to save a standalone JSON archive of all projects.
          </p>
        </div>
      </section>
    </div>
  );
}
