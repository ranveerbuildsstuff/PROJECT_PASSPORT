import { DatabaseZap, AlertCircle, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../ui';

export interface StorageBlockedPageProps {
  onRetry: () => void;
}

export function StorageBlockedPage({ onRetry }: StorageBlockedPageProps) {
  return (
    <div className="min-h-screen bg-bg-app text-text-primary flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg p-6 sm:p-8 rounded-lg border border-border-subtle bg-bg-surface text-center flex flex-col items-center gap-4 shadow-xl">
        <div className="w-14 h-14 rounded-full bg-color-danger/10 border border-color-danger/30 flex items-center justify-center text-color-danger">
          <DatabaseZap className="w-7 h-7" aria-hidden="true" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Storage is blocked
        </h1>

        <div className="text-sm text-text-muted leading-relaxed flex flex-col gap-3 text-left">
          <p>
            Project Passport runs entirely on your device and requires browser local storage (IndexedDB) to securely store your projects, passports, and files without sending data across the network.
          </p>
          <div className="p-3.5 rounded-lg border border-border-subtle bg-bg-app/60 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-color-warning shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs leading-normal">
              <strong>Common causes:</strong>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>Private or incognito browsing mode is active with storage disabled.</li>
                <li>Site data or cookies are blocked in browser privacy settings.</li>
                <li>Storage quota was exceeded or permissions were revoked.</li>
              </ul>
            </div>
          </div>
          <p>
            To continue, please open Project Passport in a standard browsing window, or allow local data for this origin in your browser settings.
          </p>
        </div>

        <div className="pt-2 w-full">
          <Button variant="primary" onClick={onRetry} className="w-full" aria-label="Retry storage check">
            <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
            <span>Retry storage check</span>
          </Button>
        </div>

        <div className="flex items-center justify-center gap-4 text-xs text-text-muted pt-2 border-t border-border-subtle w-full">
          <Link to="/welcome" className="hover:text-text-primary underline">
            About &amp; Guide
          </Link>
          <span>&bull;</span>
          <Link to="/privacy" className="hover:text-text-primary underline">
            Privacy &amp; Security
          </Link>
        </div>
      </div>
    </div>
  );
}
