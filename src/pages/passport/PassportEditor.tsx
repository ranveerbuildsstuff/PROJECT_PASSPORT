import React, { useState, useCallback } from 'react';
import {
  ChevronsUpDown,
} from 'lucide-react';
import type { PassportV1 } from '../../domain';
import { useAutosave } from './useAutosave';
import { SidePanel } from './SidePanel';
import { AutosaveStatus } from './AutosaveStatus';
import { useMediaQuery } from '../../ui';
import { AccordionSection } from '../../ui/Accordion';
import { Button, Dialog } from '../../ui';
import { BasicsSection } from './sections/BasicsSection';
import { StackSection } from './sections/StackSection';
import { RequirementsSection } from './sections/RequirementsSection';
import { DecisionsSection } from './sections/DecisionsSection';
import { CompletedSection } from './sections/CompletedSection';
import { TasksSection } from './sections/TasksSection';
import { BugsSection } from './sections/BugsSection';
import { InstructionsSection } from './sections/InstructionsSection';
import { NextActionSection } from './sections/NextActionSection';
import { OpenQuestionsSection } from './sections/OpenQuestionsSection';
import { ContextSummarySection } from './sections/ContextSummarySection';

export interface PassportEditorProps {
  projectId: string;
  initialPassport: PassportV1;
  onNavigateTab: (tab: string) => void;
  registerNavigationInterceptor?: (interceptor: ((targetTab: string) => boolean) | null) => void;
}

export function PassportEditor({
  projectId,
  initialPassport,
  onNavigateTab,
  registerNavigationInterceptor,
}: PassportEditorProps): React.ReactElement {
  const {
    draft,
    updateDraft,
    saveStatus,
    statusMessage,
    isDraftValid,
    fieldErrors,
    flushSave,
  } = useAutosave({
    projectId,
    initialPassport,
  });

  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Accordion open/close state: Basics open by default
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    basics: true,
    stack: false,
    requirements: false,
    decisions: false,
    completed: false,
    tasks: false,
    bugs: false,
    instructions: false,
    nextAction: false,
    openQuestions: false,
    context: false,
  });

  // State for discard confirmation dialog
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);
  const [pendingTargetTab, setPendingTargetTab] = useState<string | null>(null);

  const toggleSection = (sectionKey: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const toggleAllSections = (expand: boolean) => {
    setOpenSections({
      basics: expand,
      stack: expand,
      requirements: expand,
      decisions: expand,
      completed: expand,
      tasks: expand,
      bugs: expand,
      instructions: expand,
      nextAction: expand,
      openQuestions: expand,
      context: expand,
    });
  };

  // Intercept navigation if draft is invalid
  const isDraftValidRef = React.useRef(isDraftValid);
  isDraftValidRef.current = isDraftValid;
  const flushSaveRef = React.useRef(flushSave);
  flushSaveRef.current = flushSave;

  // Interceptor check for navigation away from passport tab
  const interceptorCheck = useCallback((target: string): boolean => {
    if (!isDraftValidRef.current) {
      setPendingTargetTab(target);
      setIsDiscardDialogOpen(true);
      return false; // block navigation
    }
    void flushSaveRef.current();
    return true; // allow navigation
  }, []);

  // Register with parent if provided
  React.useEffect(() => {
    if (registerNavigationInterceptor) {
      registerNavigationInterceptor(interceptorCheck);
      return () => {
        registerNavigationInterceptor(null);
      };
    }
  }, [registerNavigationInterceptor, interceptorCheck]);

  const handleInternalNavigation = (target: string) => {
    if (interceptorCheck(target)) {
      onNavigateTab(target);
    }
  };

  const handleConfirmDiscard = () => {
    setIsDiscardDialogOpen(false);
    if (pendingTargetTab) {
      onNavigateTab(pendingTargetTab);
      setPendingTargetTab(null);
    }
  };

  const handleCancelDiscard = () => {
    setIsDiscardDialogOpen(false);
    setPendingTargetTab(null);
  };

  const allExpanded = Object.values(openSections).every(Boolean);

  return (
    <div className="flex flex-col gap-6">
      {/* Mobile Sticky Bar: Slim bar right below the app header */}
      {!isDesktop && (
        <div
          className="sticky z-30 -mx-4 px-4 py-2 border-b border-border-subtle bg-bg-surface flex items-center justify-between shadow-xs"
          style={{ top: 'var(--app-header-h)' }}
        >
          <AutosaveStatus saveStatus={saveStatus} statusMessage={statusMessage} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => toggleAllSections(!allExpanded)}
            className="text-xs text-text-muted hover:text-text-primary gap-1 min-h-[36px] py-1 px-2.5"
          >
            <ChevronsUpDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{allExpanded ? 'Collapse all' : 'Expand all'}</span>
          </Button>
        </div>
      )}

      {/* Main Layout: Left Editor Accordions, Right Sticky Side Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Editor Sections */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-3 min-w-0">
          {/* Desktop header with Expand/Collapse button */}
          {isDesktop && (
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Passport Sections
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => toggleAllSections(!allExpanded)}
                className="text-xs text-text-muted hover:text-text-primary gap-1.5 min-h-[44px]"
              >
                <ChevronsUpDown className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{allExpanded ? 'Collapse all' : 'Expand all'}</span>
              </Button>
            </div>
          )}

          {/* 1. Basics */}
          <AccordionSection
            title="Basics"
            isOpen={Boolean(openSections.basics)}
            onToggle={() => toggleSection('basics')}
          >
            <BasicsSection
              draft={draft}
              updateDraft={updateDraft}
              errors={fieldErrors}
            />
          </AccordionSection>

          {/* 2. Stack */}
          <AccordionSection
            title="Tech stack"
            count={draft.stack.length}
            isOpen={Boolean(openSections.stack)}
            onToggle={() => toggleSection('stack')}
          >
            <StackSection
              draft={draft}
              updateDraft={updateDraft}
              errors={fieldErrors}
            />
          </AccordionSection>

          {/* 3. Requirements */}
          <AccordionSection
            title="Requirements"
            count={draft.requirements.length}
            isOpen={Boolean(openSections.requirements)}
            onToggle={() => toggleSection('requirements')}
          >
            <RequirementsSection
              draft={draft}
              updateDraft={updateDraft}
              errors={fieldErrors}
            />
          </AccordionSection>

          {/* 4. Decisions */}
          <AccordionSection
            title="Architectural decisions"
            count={draft.decisions.length}
            isOpen={Boolean(openSections.decisions)}
            onToggle={() => toggleSection('decisions')}
          >
            <DecisionsSection
              draft={draft}
              updateDraft={updateDraft}
              errors={fieldErrors}
            />
          </AccordionSection>

          {/* 5. Completed */}
          <AccordionSection
            title="Completed work"
            count={draft.completed.length}
            isOpen={Boolean(openSections.completed)}
            onToggle={() => toggleSection('completed')}
          >
            <CompletedSection
              draft={draft}
              updateDraft={updateDraft}
              errors={fieldErrors}
            />
          </AccordionSection>

          {/* 6. Tasks */}
          <AccordionSection
            title="Tasks"
            count={draft.tasks.length}
            isOpen={Boolean(openSections.tasks)}
            onToggle={() => toggleSection('tasks')}
          >
            <TasksSection
              draft={draft}
              updateDraft={updateDraft}
              errors={fieldErrors}
            />
          </AccordionSection>

          {/* 7. Bugs */}
          <AccordionSection
            title="Bugs & limitations"
            count={draft.bugs.length}
            isOpen={Boolean(openSections.bugs)}
            onToggle={() => toggleSection('bugs')}
          >
            <BugsSection
              draft={draft}
              updateDraft={updateDraft}
              errors={fieldErrors}
            />
          </AccordionSection>

          {/* 8. Instructions */}
          <AccordionSection
            title="AI instructions"
            count={draft.instructions.length}
            isOpen={Boolean(openSections.instructions)}
            onToggle={() => toggleSection('instructions')}
          >
            <InstructionsSection
              draft={draft}
              updateDraft={updateDraft}
              errors={fieldErrors}
            />
          </AccordionSection>

          {/* 9. Next Action */}
          <AccordionSection
            title="Next action"
            count={draft.nextAction.trim().length > 0 ? 1 : 0}
            isOpen={Boolean(openSections.nextAction)}
            onToggle={() => toggleSection('nextAction')}
          >
            <NextActionSection
              draft={draft}
              updateDraft={updateDraft}
              errors={fieldErrors}
            />
          </AccordionSection>

          {/* 10. Open Questions */}
          <AccordionSection
            title="Open questions"
            count={draft.openQuestions.length}
            isOpen={Boolean(openSections.openQuestions)}
            onToggle={() => toggleSection('openQuestions')}
          >
            <OpenQuestionsSection
              draft={draft}
              updateDraft={updateDraft}
              errors={fieldErrors}
            />
          </AccordionSection>

          {/* 11. Attached Context Summary */}
          <AccordionSection
            title="Files & conversations"
            count={draft.files.length + draft.conversations.length}
            isOpen={Boolean(openSections.context)}
            onToggle={() => toggleSection('context')}
          >
            <ContextSummarySection
              passport={draft}
              onNavigateTab={handleInternalNavigation}
            />
          </AccordionSection>
        </div>

        {/* Right Column: Side Panel with Sticky Header */}
        <div className="lg:col-span-5 xl:col-span-4 min-w-0">
          <SidePanel
            draft={draft}
            saveStatus={isDesktop ? saveStatus : undefined}
            statusMessage={isDesktop ? statusMessage : undefined}
          />
        </div>
      </div>

      {/* Discard Confirmation Dialog */}
      <Dialog
        isOpen={isDiscardDialogOpen}
        onClose={handleCancelDiscard}
        title="Discard unsaved changes?"
        aria-describedby="discard-dialog-description"
      >
        <div className="flex flex-col gap-4">
          <p id="discard-dialog-description" className="text-sm text-text-muted leading-relaxed">
            Your passport currently has validation errors that cannot be saved:
          </p>
          <div className="p-3 rounded-lg border border-color-danger/30 bg-color-danger/10 text-xs text-text-primary font-mono">
            {statusMessage}
          </div>
          <p className="text-sm text-text-muted leading-relaxed">
            If you leave now, these unsaved changes will be discarded. Are you sure you want to leave?
          </p>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelDiscard}
            >
              Keep editing
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmDiscard}
            >
              Discard and leave
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
