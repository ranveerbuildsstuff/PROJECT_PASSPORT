import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, FolderPlus, Edit3, Trash2, FolderGit2 } from 'lucide-react';
import {
  Button,
  Card,
  Badge,
  Dialog,
  Input,
  Textarea,
  EmptyState,
  ProgressRing,
  useToast,
  ImportPackageDialog,
} from '../ui';
import { useProjects, type ProjectCardData } from './hooks';
import {
  createProject,
  renameProject,
  deleteProject,
  getPassport,
  savePassport,
  requestPersistentStorage,
} from '../storage';
import { formatDateTime, formatProjectStatus } from '../lib';

export function DashboardPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { projects, isLoading, error, reload } = useProjects();

  // Dialog States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createGoal, setCreateGoal] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  const [renameTarget, setRenameTarget] = useState<ProjectCardData | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isSubmittingRename, setIsSubmittingRename] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ProjectCardData | null>(null);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  const [isImportOpen, setIsImportOpen] = useState(false);

  // Handlers
  const handleOpenCreate = () => {
    setCreateName('');
    setCreateGoal('');
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = createName.trim();
    if (!trimmed) {
      setCreateError('Project name cannot be empty');
      return;
    }

    setIsSubmittingCreate(true);
    setCreateError(null);

    try {
      // Call requestPersistentStorage once on create
      await requestPersistentStorage();

      const newProject = await createProject(trimmed);

      // If optional goal was provided, update passport
      const trimmedGoal = createGoal.trim();
      if (trimmedGoal) {
        const passport = await getPassport(newProject.id);
        if (passport) {
          passport.project.goal = trimmedGoal;
          await savePassport(passport);
        }
      }

      showToast(`Created project "${newProject.name}"`, 'success');
      setIsCreateOpen(false);
      navigate(`/project/${newProject.id}/overview`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create project.');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleOpenRename = (project: ProjectCardData) => {
    setRenameTarget(project);
    setRenameName(project.name);
    setRenameError(null);
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget) return;

    const trimmed = renameName.trim();
    if (!trimmed) {
      setRenameError('Project name cannot be empty');
      return;
    }

    setIsSubmittingRename(true);
    setRenameError(null);

    try {
      await renameProject(renameTarget.id, trimmed);
      showToast(`Renamed project to "${trimmed}"`, 'success');
      setRenameTarget(null);
      await reload();
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Failed to rename project.');
    } finally {
      setIsSubmittingRename(false);
    }
  };

  const handleOpenDelete = (project: ProjectCardData) => {
    setDeleteTarget(project);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsSubmittingDelete(true);

    try {
      await deleteProject(deleteTarget.id);
      showToast(`Deleted project "${deleteTarget.name}"`, 'info');
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete project.', 'error');
    } finally {
      setIsSubmittingDelete(false);
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

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-text-muted gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-border-subtle border-t-accent-brass" />
        <span className="text-sm">Loading projects...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="p-6 rounded-lg border border-color-danger bg-color-danger/10 text-text-primary flex flex-col gap-3 max-w-lg mx-auto"
      >
        <h3 className="font-semibold text-color-danger">Could not load projects</h3>
        <p className="text-sm text-text-muted leading-relaxed">{error}</p>
        <Button variant="secondary" size="sm" onClick={() => reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner / Heading */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-text-primary">
            Projects
          </h2>
          <p className="text-sm text-text-muted mt-0.5">
            {projects.length === 1
              ? '1 local project'
              : `${projects.length} local projects`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setIsImportOpen(true)}
          >
            <FolderGit2 className="w-4 h-4" aria-hidden="true" />
            <span>Import package</span>
          </Button>
          <Button
            variant="primary"
            onClick={handleOpenCreate}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>New project</span>
          </Button>
        </div>
      </div>

      {/* Main Content: Empty State or Project List */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center w-full">
          <EmptyState
            icon={<FolderPlus className="w-6 h-6" aria-hidden="true" />}
            title="No projects yet"
            description="Project Passport keeps a structured, portable record of your AI-assisted project so you can switch tools without starting over. All your project context stays strictly on this device in local storage."
            actionLabel="New project"
            onAction={handleOpenCreate}
            className="mt-6 w-full"
          />
          <div className="flex items-center justify-center gap-4 mt-6 text-xs text-text-muted flex-wrap">
            <Link
              to="/welcome"
              className="hover:text-text-primary underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass rounded px-1.5 py-1 min-h-[44px] inline-flex items-center"
            >
              New here? Read the guide
            </Link>
            <span aria-hidden="true">&bull;</span>
            <Link
              to="/privacy"
              className="hover:text-text-primary underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass rounded px-1.5 py-1 min-h-[44px] inline-flex items-center"
            >
              How your data is protected
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {projects.map((p) => (
            <Card
              key={p.id}
              className="flex flex-col justify-between hover:border-text-muted transition-colors relative group"
            >
              <div className="p-5 flex flex-col gap-4">
                {/* Header: Name and Status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/project/${p.id}/overview`}
                      title={p.name}
                      className="text-base font-semibold text-text-primary hover:text-accent-brass transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass rounded flex items-center min-h-[44px]"
                    >
                      <span className="line-clamp-2">{p.name}</span>
                    </Link>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant={getStatusVariant(p.status)}>
                        {formatProjectStatus(p.status)}
                      </Badge>
                    </div>
                  </div>

                  {/* Readiness Ring */}
                  <div className="shrink-0" title={`Readiness: ${p.readinessScore}%`}>
                    <ProgressRing value={p.readinessScore} size={48} strokeWidth={4} />
                  </div>
                </div>

                {/* Metadata */}
                <div className="text-xs text-text-muted flex items-center gap-1.5">
                  <FolderGit2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Updated {formatDateTime(p.updatedAt)}</span>
                </div>
              </div>

              {/* Card Actions Footer */}
              <div className="px-5 py-3 border-t border-border-subtle bg-bg-app/40 flex items-center justify-between gap-2">
                <Link
                  to={`/project/${p.id}/overview`}
                  className="text-xs font-medium text-accent-brass hover:underline min-h-[44px] inline-flex items-center"
                >
                  Open passport &rarr;
                </Link>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenRename(p)}
                    aria-label={`Rename ${p.name}`}
                    title="Rename project"
                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded text-text-muted hover:text-text-primary hover:bg-bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenDelete(p)}
                    aria-label={`Delete ${p.name}`}
                    title="Delete project"
                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded text-text-muted hover:text-color-danger hover:bg-bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-color-danger cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* New Project Dialog */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => !isSubmittingCreate && setIsCreateOpen(false)}
        title="New project"
        description="Create a new local passport record for an AI-assisted project."
      >
        <form onSubmit={handleCreateSubmit} noValidate className="flex flex-col gap-4">
          <Input
            label="Project name"
            required
            value={createName}
            onChange={(e) => {
              setCreateName(e.target.value);
              if (createError) setCreateError(null);
            }}
            error={createError || undefined}
            placeholder="e.g. Mobile E-commerce App"
            autoFocus
          />

          <Textarea
            label="Initial goal (optional)"
            value={createGoal}
            onChange={(e) => setCreateGoal(e.target.value)}
            placeholder="What is this project aiming to build or solve?"
            helperText="You can refine and expand this goal anytime in the passport editor."
            rows={3}
          />

          <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-border-subtle">
            <Button
              variant="ghost"
              onClick={() => setIsCreateOpen(false)}
              disabled={isSubmittingCreate}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmittingCreate}
            >
              Create project
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog
        isOpen={!!renameTarget}
        onClose={() => !isSubmittingRename && setRenameTarget(null)}
        title="Rename project"
        description="Update the display name of this project across its passport records."
      >
        <form onSubmit={handleRenameSubmit} noValidate className="flex flex-col gap-4">
          <Input
            label="New project name"
            required
            value={renameName}
            onChange={(e) => {
              setRenameName(e.target.value);
              if (renameError) setRenameError(null);
            }}
            error={renameError || undefined}
            placeholder="Project name"
            autoFocus
          />

          <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-border-subtle">
            <Button
              variant="ghost"
              onClick={() => setRenameTarget(null)}
              disabled={isSubmittingRename}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmittingRename}
            >
              Save name
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        isOpen={!!deleteTarget}
        onClose={() => !isSubmittingDelete && setDeleteTarget(null)}
        title="Delete project"
        description="Permanently remove this project and all associated passport data from local storage."
      >
        <div className="flex flex-col gap-4">
          <div className="p-4 rounded-lg bg-color-danger/10 border border-color-danger/40 text-text-primary text-sm flex flex-col gap-1.5">
            <p className="font-semibold text-color-danger">
              Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;?
            </p>
            <p className="text-xs text-text-muted leading-relaxed">
              This action cannot be undone. All passport configurations, saved conversations, attached files, and checkpoints for this project will be permanently erased from your browser.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 mt-2 pt-4 border-t border-border-subtle">
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={isSubmittingDelete}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={isSubmittingDelete}
              onClick={handleConfirmDelete}
            >
              Delete project
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Package Import Dialog */}
      <ImportPackageDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportSuccess={(newId) => {
          setIsImportOpen(false);
          reload();
          navigate(`/project/${newId}/overview`);
        }}
      />
    </div>
  );
}
