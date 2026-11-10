import React, { useRef } from 'react';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
  'aria-label'?: string;
}

export function Tabs({
  tabs,
  activeTab,
  onChange,
  className = '',
  'aria-label': ariaLabel = 'Navigation tabs',
}: TabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let targetIndex = -1;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      targetIndex = (index + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      targetIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      targetIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      targetIndex = tabs.length - 1;
    }

    if (targetIndex !== -1) {
      const nextTab = tabs[targetIndex];
      if (nextTab) {
        onChange(nextTab.id);
        const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        buttons?.[targetIndex]?.focus();
      }
    }
  };

  return (
    <div
      ref={tabListRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center gap-1 border-b border-border-subtle overflow-x-auto no-scrollbar ${className}`}
    >
      {tabs.map((tab, idx) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`min-h-[44px] px-3.5 py-2 font-medium text-sm inline-flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass -mb-[1px] ${
              isActive
                ? 'border-b-2 border-accent-brass text-text-primary font-semibold'
                : 'border-b-2 border-transparent text-text-muted hover:text-text-primary hover:border-border-subtle'
            }`}
          >
            {tab.icon && <span className="w-4 h-4" aria-hidden="true">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge && <span>{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}
