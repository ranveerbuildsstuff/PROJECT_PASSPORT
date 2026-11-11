import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from './Badge';

export interface AccordionSectionProps {
  id?: string;
  title: string;
  count?: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
}

export function AccordionSection({
  id: customId,
  title,
  count,
  isOpen,
  onToggle,
  children,
  className = '',
}: AccordionSectionProps): React.ReactElement {
  const generatedId = useId();
  const sectionId = customId || generatedId;
  const headerId = `${sectionId}-header`;
  const contentId = `${sectionId}-content`;

  return (
    <div className={`rounded-lg border border-border-subtle bg-bg-surface overflow-hidden ${className}`}>
      <h3>
        <button
          type="button"
          id={headerId}
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={onToggle}
          className="w-full flex items-center justify-between p-4 min-h-[44px] text-left font-medium text-text-primary hover:bg-bg-app/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base font-semibold">{title}</span>
            {typeof count === 'number' && (
              <Badge variant="default">
                {count}
              </Badge>
            )}
          </div>
          <ChevronDown
            className={`w-4 h-4 text-text-muted transition-transform duration-200 shrink-0 ${
              isOpen ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>
      </h3>
      {isOpen && (
        <div
          id={contentId}
          role="region"
          aria-labelledby={headerId}
          className="p-4 sm:p-5 border-t border-border-subtle flex flex-col gap-4"
        >
          {children}
        </div>
      )}
    </div>
  );
}
