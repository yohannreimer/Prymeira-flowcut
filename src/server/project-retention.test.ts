import { mkdir, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createJobStore } from "./jobs/job-store";
import { cleanupExpiredProjects, startProjectRetentionCleanup } from "./project-retention";
import { withTempDir } from "../test/fixtures";

afterEach(() => {
  vi.useRealTimers();
});

async function createProject(root: string, projectId: string, updatedAt: Date) {
  const projectRoot = path.join(root, projectId);
  await mkdir(path.join(projectRoot, "uploads"), { recursive: true });
  await mkdir(path.join(projectRoot, "renders"), { recursive: true });
  await writeFile(path.join(projectRoot, "uploads", "source.mp4"), "source");
  await writeFile(path.join(projectRoot, "renders", "rough-cut.mp4"), "render");
  await writeFile(path.join(projectRoot, "edit-plan.json"), "{}");
  await touchTree(projectRoot, updatedAt);
  return projectRoot;
}

async function touchTree(root: string, updatedAt: Date) {
  await utimes(root, updatedAt, updatedAt);
  await utimes(path.join(root, "uploads"), updatedAt, updatedAt);
  await utimes(path.join(root, "renders"), updatedAt, updatedAt);
  await utimes(path.join(root, "uploads", "source.mp4"), updatedAt, updatedAt);
  await utimes(path.join(root, "renders", "rough-cut.mp4"), updatedAt, updatedAt);
  await utimes(path.join(root, "edit-plan.json"), updatedAt, updatedAt);
}

describe("cleanupExpiredProjects", () => {
  it("deletes project folders older than the retention window", async () => {
    await withTempDir("project-retention-", async (dir) => {
      const expiredProject = await createProject(dir, "project_expired", new Date("2026-05-20T12:00:00.000Z"));
      const freshProject = await createProject(dir, "project_fresh", new Date("2026-05-20T12:45:00.000Z"));

      const result = await cleanupExpiredProjects({
        workspaceRoot: dir,
        jobs: createJobStore(),
        retentionMs: 30 * 60 * 1000,
        now: new Date("2026-05-20T12:45:01.000Z")
      });

      await expect(stat(expiredProject)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(stat(freshProject)).resolves.toBeTruthy();
      expect(result.deletedProjectIds).toEqual(["project_expired"]);
    });
  });

  it("keeps expired project folders while their jobs are queued or running", async () => {
    await withTempDir("project-retention-active-", async (dir) => {
      const activeProject = await createProject(dir, "project_active", new Date("2026-05-20T12:00:00.000Z"));
      const jobs = createJobStore();
      jobs.create({
        projectId: "project_active",
        sourcePath: path.join(activeProject, "uploads", "source.mp4")
      });

      const result = await cleanupExpiredProjects({
        workspaceRoot: dir,
        jobs,
        retentionMs: 30 * 60 * 1000,
        now: new Date("2026-05-20T12:45:01.000Z")
      });

      await expect(stat(activeProject)).resolves.toBeTruthy();
      expect(result.deletedProjectIds).toEqual([]);
      expect(result.skippedActiveProjectIds).toEqual(["project_active"]);
    });
  });

  it("cleans tenant project folders under workspace project roots", async () => {
    await withTempDir("project-retention-tenant-", async (dir) => {
      const projectsRoot = path.join(dir, "workspaces", "workspace_123", "projects");
      const expiredProject = await createProject(projectsRoot, "project_tenant", new Date("2026-05-20T12:00:00.000Z"));

      const result = await cleanupExpiredProjects({
        workspaceRoot: dir,
        jobs: createJobStore(),
        retentionMs: 30 * 60 * 1000,
        now: new Date("2026-05-20T12:45:01.000Z")
      });

      await expect(stat(expiredProject)).rejects.toMatchObject({ code: "ENOENT" });
      expect(result.deletedProjectIds).toEqual(["project_tenant"]);
    });
  });

  it("runs cleanup on an interval without throwing cleanup failures", async () => {
    vi.useFakeTimers();
    const cleanup = vi
      .fn()
      .mockResolvedValueOnce({ deletedProjectIds: [], skippedActiveProjectIds: [] })
      .mockRejectedValueOnce(new Error("disk temporarily unavailable"));
    const logger = { warn: vi.fn() };

    const stop = startProjectRetentionCleanup({
      workspaceRoot: "/workspace",
      jobs: createJobStore(),
      retentionMs: 30 * 60 * 1000,
      intervalMs: 1000,
      cleanup,
      logger
    });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    await vi.advanceTimersByTimeAsync(1000);

    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(cleanup).toHaveBeenCalledWith({
      workspaceRoot: "/workspace",
      jobs: expect.anything(),
      retentionMs: 30 * 60 * 1000
    });
    expect(logger.warn).toHaveBeenCalledWith("Project retention cleanup failed", expect.any(Error));
  });
});
