import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Moon, Sun, HardDriveDownload } from 'lucide-react';
import { useTheme } from './useTheme';
import { BackupDialog } from './BackupDialog';
import { Badge } from './Badge';

export interface HeaderProps {
  onRefreshProjects?: () => void;
}

export function Header({ onRefreshProjects }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const [isBackupOpen, setIsBackupOpen] = useState(false);

  return (
    <>
      <header
        className="sticky top-0 z-40 w-full border-b border-border-subtle bg-bg-surface box-border"
        style={{
          height: 'var(--app-header-h)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
        }}
      >
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-full flex items-center justify-between gap-1 sm:gap-4">
          {/* Logo & Product Name */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <h1 className="text-base sm:text-lg font-bold tracking-tight whitespace-nowrap m-0 p-0 leading-none">
              <Link
                to="/"
                className="flex items-center gap-1.5 sm:gap-2 text-text-primary hover:text-accent-brass transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass rounded px-1 min-h-[44px]"
                aria-label="Project Passport Home"
              >
                <span>Project Passport</span>
              </Link>
            </h1>

            {/* Offline / Local device badge */}
            <div className="hidden sm:inline-flex">
              <Badge variant="default" className="text-[11px] gap-1.5 py-1 whitespace-nowrap">
                <ShieldCheck className="w-3.5 h-3.5 text-accent-brass shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">Stored only on this device</span>
              </Badge>
            </div>
          </div>

          {/* Controls: Device indicator on mobile, Backup Dialog, Theme Toggle */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <div className="sm:hidden flex items-center">
              <Badge
                variant="default"
                className="text-[10px] px-1.5 py-0.5 whitespace-nowrap inline-flex items-center gap-1 shrink-0"
                title="Stored only on this device"
                aria-label="Stored only on this device"
              >
                <ShieldCheck className="w-3 h-3 text-accent-brass shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">ON DEVICE</span>
              </Badge>
            </div>

            {/* Backup & Restore button */}
            <button
              type="button"
              onClick={() => setIsBackupOpen(true)}
              aria-label="Backup and restore"
              title="Backup and restore"
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2 sm:px-3 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-app border border-transparent hover:border-border-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass cursor-pointer gap-1.5"
            >
              <HardDriveDownload className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline text-xs font-medium">Backup</span>
            </button>

            {/* Theme Toggle button */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-app border border-transparent hover:border-border-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-accent-brass" aria-hidden="true" />
              ) : (
                <Moon className="w-5 h-5 text-accent-brass" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </header>

      <BackupDialog
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
        onRestoreComplete={onRefreshProjects}
      />
    </>
  );
}
