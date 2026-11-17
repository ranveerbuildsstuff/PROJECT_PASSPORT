import React, { useEffect, useState, useCallback } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { isAvailable } from './storage';
import { ThemeProvider } from './ui/ThemeContext';
import { ToastProvider } from './ui/Toast';
import { AppShell } from './ui/AppShell';
import { DashboardPage, ProjectPage, StorageBlockedPage, WelcomePage, PrivacyPage } from './pages';

export function App(): React.ReactElement {
  const location = useLocation();
  const isStorageFreeRoute = location.pathname === '/welcome' || location.pathname === '/privacy';
  const [storageStatus, setStorageStatus] = useState<'checking' | 'available' | 'blocked'>('checking');

  const checkStorage = useCallback(async () => {
    setStorageStatus('checking');
    try {
      const available = await isAvailable();
      setStorageStatus(available ? 'available' : 'blocked');
    } catch {
      setStorageStatus('blocked');
    }
  }, []);

  useEffect(() => {
    if (!isStorageFreeRoute) {
      checkStorage();
    }
  }, [checkStorage, isStorageFreeRoute]);

  if (isStorageFreeRoute) {
    return (
      <ThemeProvider>
        <ToastProvider>
          <AppShell>
            <Routes>
              <Route path="/welcome" element={<WelcomePage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
            </Routes>
          </AppShell>
        </ToastProvider>
      </ThemeProvider>
    );
  }

  if (storageStatus === 'checking') {
    return (
      <ThemeProvider>
        <div className="min-h-screen bg-bg-app flex items-center justify-center text-text-muted">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-border-subtle border-t-accent-brass" />
            <span className="text-sm font-medium">Checking local storage...</span>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  if (storageStatus === 'blocked') {
    return (
      <ThemeProvider>
        <StorageBlockedPage onRetry={checkStorage} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/welcome" element={<WelcomePage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/project/:id" element={<ProjectPage />} />
            <Route path="/project/:id/:tab" element={<ProjectPage />} />
            <Route path="*" element={<DashboardPage />} />
          </Routes>
        </AppShell>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
