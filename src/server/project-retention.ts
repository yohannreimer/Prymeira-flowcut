import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JobStore } from "./jobs/job-store";

const PROJECT_ID_PATTERN = /^project_[A-Za-z0-9_-]+$/;
const ACTIVE_JOB_STATUSES = new Set(["queued", "running"]);

export type ProjectRetentionCleanupResult = {
  deletedProjectIds: string[];
  skippedActiveProjectIds: string[];
};

export type ProjectRetentionCleanupLogger = {
  warn: (message: string, error: unknown) => void;
};

export type ProjectRetentionCleanupFn = typeof cleanupExpiredProjects;

export async function touchProjectActivity(projectRoot: string, now = new Date()): Promise<void> {
  await mkdir(projectRoot, { recursive: true });
  await writeFile(path.join(projectRoot, ".last-activity"), `${now.toISOString()}\n`);
}

export async function cleanupExpiredProjects({
  workspaceRoot,
  jobs,
  retentionMs,
  now = new Date()
}: {
  workspaceRoot: string;
  jobs: JobStore;
  retentionMs: number;
  now?: Date;
}): Promise<ProjectRetentionCleanupResult> {
  if (!Number.isFinite(retentionMs) || retentionMs <= 0) {
    return { deletedProjectIds: [], skippedActiveProjectIds: [] };
  }

  const activeProjectIds = new Set(
    jobs
      .list()
      .filter((job) => ACTIVE_JOB_STATUSES.has(job.status))
      .map((job) => job.projectId)
  );
  const projects = await listProjectRoots(workspaceRoot);
  const deletedProjectIds: string[] = [];
  const skippedActiveProjectIds: string[] = [];

  for (const project of projects) {
    if (activeProjectIds.has(project.projectId)) {
      skippedActiveProjectIds.push(project.projectId);
      continue;
    }

    const lastActivityMs = await getNewestMtimeMs(project.root).catch(() => null);
    if (lastActivityMs === null) {
      continue;
    }

    if (now.getTime() - lastActivityMs <= retentionMs) {
      continue;
    }

    await rm(project.root, { recursive: true, force: true });
    deletedProjectIds.push(project.projectId);
  }

  return {
    deletedProjectIds,
    skippedActiveProjectIds
  };
}

export function startProjectRetentionCleanup({
  workspaceRoot,
  jobs,
  retentionMs,
  intervalMs,
  cleanup = cleanupExpiredProjects,
  logger = console
}: {
  workspaceRoot: string;
  jobs: JobStore;
  retentionMs: number;
  intervalMs: number;
  cleanup?: ProjectRetentionCleanupFn;
  logger?: ProjectRetentionCleanupLogger;
}): () => void {
  const interval = setInterval(() => {
    void cleanup({ workspaceRoot, jobs, retentionMs }).catch((error: unknown) => {
      logger.warn("Project retention cleanup failed", error);
    });
  }, intervalMs);

  interval.unref?.();
  return () => clearInterval(interval);
}

async function listProjectRoots(workspaceRoot: string): Promise<Array<{ projectId: string; root: string }>> {
  const roots = new Map<string, { projectId: string; root: string }>();

  for (const project of await listProjectsIn(workspaceRoot)) {
    roots.set(project.root, project);
  }

  const workspacesRoot = path.join(workspaceRoot, "workspaces");
  const workspaceEntries = await readdir(workspacesRoot, { withFileTypes: true }).catch(() => []);
  for (const workspaceEntry of workspaceEntries) {
    if (!workspaceEntry.isDirectory()) {
      continue;
    }

    const projectsRoot = path.join(workspacesRoot, workspaceEntry.name, "projects");
    for (const project of await listProjectsIn(projectsRoot)) {
      roots.set(project.root, project);
    }
  }

  return Array.from(roots.values()).sort((a, b) => a.root.localeCompare(b.root));
}

async function listProjectsIn(root: string): Promise<Array<{ projectId: string; root: string }>> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && PROJECT_ID_PATTERN.test(entry.name))
    .map((entry) => ({
      projectId: entry.name,
      root: path.join(root, entry.name)
    }));
}

async function getNewestMtimeMs(root: string): Promise<number> {
  const rootStats = await stat(root);
  let newest = rootStats.mtimeMs;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    const entryStats = await stat(entryPath).catch(() => null);
    if (!entryStats) {
      continue;
    }

    newest = Math.max(newest, entryStats.mtimeMs);
    if (entry.isDirectory()) {
      newest = Math.max(newest, await getNewestMtimeMs(entryPath));
    }
  }

  return newest;
}
