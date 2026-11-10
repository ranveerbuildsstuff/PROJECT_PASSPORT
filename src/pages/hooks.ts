import { useState, useEffect, useCallback } from 'react';
import {
  listProjects,
  getProject,
  getPassport,
  type ProjectRecord,
} from '../storage';
import { computeReadiness, type PassportV1 } from '../domain';

export interface ProjectCardData {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  readinessScore: number;
}

export function useProjects() {
  const [projects, setProjects] = useState<ProjectCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const projectList = await listProjects();
      const enriched: ProjectCardData[] = await Promise.all(
        projectList.map(async (p) => {
          let score = 0;
          try {
            const passport = await getPassport(p.id);
            if (passport) {
              score = computeReadiness(passport).score;
            }
          } catch {
            score = 0;
          }
          return {
            id: p.id,
            name: p.name,
            status: p.status,
            updatedAt: p.updatedAt,
            readinessScore: score,
          };
        })
      );
      setProjects(enriched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();

    const handleStorageUpdate = () => {
      fetchProjects();
    };

    window.addEventListener('project-storage-updated', handleStorageUpdate);
    return () => window.removeEventListener('project-storage-updated', handleStorageUpdate);
  }, [fetchProjects]);

  return { projects, isLoading, error, reload: fetchProjects };
}

export function useProject(projectId: string | undefined) {
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [passport, setPassport] = useState<PassportV1 | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProjectData = useCallback(async () => {
    if (!projectId) {
      setNotFound(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const proj = await getProject(projectId);
      if (!proj) {
        setNotFound(true);
        setProject(null);
        setPassport(null);
        return;
      }

      const pass = await getPassport(projectId);
      setProject(proj);
      setPassport(pass);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project.');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProjectData();
  }, [fetchProjectData]);

  return { project, passport, isLoading, notFound, error, reload: fetchProjectData };
}
