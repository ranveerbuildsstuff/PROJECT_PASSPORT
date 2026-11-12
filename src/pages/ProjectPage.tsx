import React, { useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  Layers,
  Cpu,
  GitCommit,
  CheckSquare,
  Bug,
  Files,
  MessagesSquare,
  ArrowRight,
  Clock,
  HelpCircle,
} from 'lucide-react';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Tabs,
  ProgressRing,
  EmptyState,
  CaptureDialog,
} from '../ui';
import { useProject } from './hooks';
import { computeReadiness } from '../domain';
import { formatDateTime, formatProjectStatus } from '../lib';
import { PassportEditor } from './passport';

const VALID_TABS = ['overview', 'passport', 'conversations', 'files', 'checkpoints', 'export'] as const;
type TabType = typeof VALID_TABS[number];

export function ProjectPage() {
  const { id, tab } = useParams<{ id: string; tab?: string }>();
  const navigate = useNavigate();

  const activeTab: TabType = (tab && (VALID_TABS as readonly string[]).includes(tab))
    ? (tab as TabType)
    : 'overview';

  const { project, passport, isLoading, notFound, error, reload } = useProject(id);
  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [navInterceptor, setNavInterceptor] = useState<((target: string) => boolean | Promise<boolean>) | null>(null);

  const registerNavigationInterceptor = useCallback(
    (interceptor: ((target: string) => boolean | Promise<boolean>) | null) => {
      setNavInterceptor(() => interceptor);
    },
    []
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[350px] text-text-muted gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-border-subtle border-t-accent-brass" />
        <span className="text-sm">Loading project...</span>
      </div>
    );
  }

  if (notFound || !project || !passport) {
    return (
      <div className="py-12">
        <EmptyState
          icon={<HelpCircle className="w-8 h-8" aria-hidden="true" />}
          title="Project not found"
          description="This project was not found. It may have been deleted. Go back to your projects and try again."
          actionLabel="Return to projects"
          onAction={() => navigate('/')}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="p-6 rounded-lg border border-color-danger bg-color-danger/10 text-text-primary flex flex-col gap-3 max-w-lg mx-auto"
      >
        <h3 className="font-semibold text-color-danger">Failed to load project</h3>
        <p className="text-sm text-text-muted leading-relaxed">{error}</p>
        <Button variant="secondary" size="sm" onClick={() => reload()}>
          Retry
        </Button>
      </div>
    );
  }

  const readiness = computeReadiness(passport);

  const tabsList = [
    { id: 'overview', label: 'Overview' },
    { id: 'passport', label: 'Passport' },
    { id: 'conversations', label: 'Conversations' },
    { id: 'files', label: 'Files' },
    { id: 'checkpoints', label: 'Checkpoints' },
    { id: 'export', label: 'Export' },
  ];

  const handleTabChange = async (newTab: string) => {
    if (activeTab === 'passport' && navInterceptor) {
      const allowed = await navInterceptor(newTab);
      if (!allowed) return;
    }
    navigate(`/project/${project.id}/${newTab}`);
  };

  const handleBackLinkClick = async (e: React.MouseEvent) => {
    if (activeTab === 'passport' && navInterceptor) {
      e.preventDefault();
      const allowed = await navInterceptor('/');
      if (allowed) {
        navigate('/');
      }
      return;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'done':
        return 'success';
      case 'in_progress':
        return 'brass';
      case 'paused':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Back button and Top Navigation */}
      <div>
        <Link
          to="/"
          onClick={handleBackLinkClick}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass rounded min-h-[44px] px-1"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back to all projects</span>
        </Link>
      </div>

      {/* Project Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 sm:p-6 rounded-lg border border-border-subtle bg-bg-surface">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1
              className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary line-clamp-2"
              title={project.name}
            >
              {project.name}
            </h1>
            <Badge variant={getStatusVariant(project.status)}>
              {formatProjectStatus(project.status)}
            </Badge>
          </div>
          {passport.project.goal && (
            <p className="text-sm text-text-muted max-w-2xl leading-relaxed">
              {passport.project.goal}
            </p>
          )}
          <div className="flex items-center gap-4 text-xs text-text-muted mt-1">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              Updated {formatDateTime(project.updatedAt)}
            </span>
            <span className="font-mono text-[11px] text-text-muted">ID: {project.id.slice(0, 8)}</span>
          </div>
        </div>

        {/* Readiness Score Summary */}
        <div className="flex items-center gap-4 self-start md:self-auto p-3 rounded-lg border border-border-subtle bg-bg-app/40">
          <ProgressRing value={readiness.score} size={56} strokeWidth={5} />
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Handoff Readiness
            </span>
            <span className="text-lg font-bold text-text-primary">
              {readiness.score}/100
            </span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <Tabs
        tabs={tabsList}
        activeTab={activeTab}
        onChange={handleTabChange}
        aria-label="Project tabs"
      />

      {/* Tab Content Panes */}
      <div role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-6">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
              <Card className="p-4 flex flex-col gap-1">
                <span className="text-xs text-text-muted flex items-center gap-1.5 font-medium">
                  <Cpu className="w-3.5 h-3.5 text-accent-brass" aria-hidden="true" /> Stack
                </span>
                <span className="text-xl font-bold font-mono text-text-primary">
                  {passport.stack.length}
                </span>
              </Card>

              <Card className="p-4 flex flex-col gap-1">
                <span className="text-xs text-text-muted flex items-center gap-1.5 font-medium">
                  <GitCommit className="w-3.5 h-3.5 text-accent-brass" aria-hidden="true" /> Decisions
                </span>
                <span className="text-xl font-bold font-mono text-text-primary">
                  {passport.decisions.length}
                </span>
              </Card>

              <Card className="p-4 flex flex-col gap-1">
                <span className="text-xs text-text-muted flex items-center gap-1.5 font-medium">
                  <CheckSquare className="w-3.5 h-3.5 text-accent-brass" aria-hidden="true" /> Tasks
                </span>
                <span className="text-xl font-bold font-mono text-text-primary">
                  {passport.tasks.length}
                </span>
              </Card>

              <Card className="p-4 flex flex-col gap-1">
                <span className="text-xs text-text-muted flex items-center gap-1.5 font-medium">
                  <Bug className="w-3.5 h-3.5 text-accent-brass" aria-hidden="true" /> Bugs
                </span>
                <span className="text-xl font-bold font-mono text-text-primary">
                  {passport.bugs.length}
                </span>
              </Card>

              <Card className="p-4 flex flex-col gap-1">
                <span className="text-xs text-text-muted flex items-center gap-1.5 font-medium">
                  <Files className="w-3.5 h-3.5 text-accent-brass" aria-hidden="true" /> Files
                </span>
                <span className="text-xl font-bold font-mono text-text-primary">
                  {passport.files.length}
                </span>
              </Card>

              <Card className="p-4 flex flex-col gap-1">
                <span className="text-xs text-text-muted flex items-center gap-1.5 font-medium">
                  <MessagesSquare className="w-3.5 h-3.5 text-accent-brass" aria-hidden="true" /> Chats
                </span>
                <span className="text-xl font-bold font-mono text-text-primary">
                  {passport.conversations.length}
                </span>
              </Card>
            </div>

            {/* Next Action Box */}
            <Card className="border-l-4 border-l-accent-brass">
              <CardHeader>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ArrowRight className="w-4 h-4 text-accent-brass" aria-hidden="true" />
                    <span>Next Action</span>
                  </CardTitle>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsCaptureOpen(true)}
                    className="min-h-[44px]"
                  >
                    Capture from AI
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-text-primary">
                  {passport.nextAction || 'No next action recorded yet. Add one in the passport editor to clarify your next milestone.'}
                </p>
              </CardContent>
            </Card>

            {/* Readiness Checklist */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-base sm:text-lg">
                      Readiness Checklist
                    </CardTitle>
                    <p className="text-xs text-text-muted mt-1">
                      7 handoff checks evaluate whether another AI assistant can continue this project without context loss.
                    </p>
                  </div>
                  <Badge variant={readiness.score === 100 ? 'success' : 'brass'}>
                    {readiness.checks.filter((c) => c.passed).length}/7 PASSED
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border-subtle/60" aria-label="Readiness criteria checks">
                  {readiness.checks.map((check) => (
                    <li
                      key={check.id}
                      className="py-3.5 flex items-start sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 sm:mt-0 shrink-0">
                          {check.passed ? (
                            <CheckCircle2
                              className="w-5 h-5 text-color-success"
                              aria-hidden="true"
                            />
                          ) : (
                            <CircleDashed
                              className="w-5 h-5 text-text-muted"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span
                            className={`text-sm font-medium ${
                              check.passed ? 'text-text-primary' : 'text-text-muted'
                            }`}
                          >
                            {check.label}
                          </span>
                          <span className="text-xs text-text-muted leading-relaxed">
                            {check.description}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {check.passed ? (
                          <Badge variant="success">PASS</Badge>
                        ) : (
                          <Badge variant="default">INCOMPLETE</Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'passport' && passport && (
          <PassportEditor
            projectId={project.id}
            initialPassport={passport}
            onNavigateTab={(targetTab) => {
              if (targetTab === 'home') {
                navigate('/');
              } else {
                navigate(`/project/${project.id}/${targetTab}`);
              }
            }}
            registerNavigationInterceptor={registerNavigationInterceptor}
            onOpenCapture={() => setIsCaptureOpen(true)}
          />
        )}

        {activeTab !== 'overview' && activeTab !== 'passport' && (
          <Card className="p-8 sm:p-12 text-center flex flex-col items-center justify-center max-w-xl mx-auto my-6">
            <div className="w-12 h-12 rounded-full bg-bg-app border border-border-subtle flex items-center justify-center text-accent-brass mb-4">
              <Layers className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2 capitalize">
              {activeTab} Tab
            </h3>
            <p className="text-sm text-text-muted leading-relaxed mb-6">
              Coming in a later slice. In upcoming tickets, this view will provide dedicated tools for editing your passport data, managing conversations, inspecting source files, comparing checkpoints, and generating handoff packages.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTabChange('overview')}
            >
              Return to Overview
            </Button>
          </Card>
        )}
      </div>

      <CaptureDialog
        isOpen={isCaptureOpen}
        onClose={() => setIsCaptureOpen(false)}
      />
    </div>
  );
}
