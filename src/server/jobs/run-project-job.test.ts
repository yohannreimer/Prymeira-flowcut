import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createJobStore } from "./job-store";
import { getSilenceAnalysisTimeoutMs, runProjectJob, type RunProjectJobDeps } from "./run-project-job";
import { createProjectWorkspace } from "../workspace";
import { withTempDir } from "../../test/fixtures";

describe("runProjectJob", () => {
  it("skips silence analysis for no-audio media and passes with a whole-video plan", async () => {
    await withTempDir("ai-editor-job-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath: "/tmp/source.mp4" });
      const analyzeSilence = vi.fn();
      const renderRoughCut = vi.fn().mockResolvedValue(path.join(workspace.renders, "rough-cut.mp4"));
      const runBasicQa = vi.fn().mockResolvedValue({ status: "passed", warnings: [] });
      const deps: RunProjectJobDeps = {
        probeMedia: vi.fn().mockResolvedValue({
          durationSec: 8,
          width: 1280,
          height: 720,
          fps: 30,
          hasAudio: false
        }),
        analyzeSilence,
        renderRoughCut,
        runBasicQa,
        now: () => new Date("2026-05-05T00:00:00.000Z")
      };

      await runProjectJob({ jobId: job.id, workspace, sourcePath: "/tmp/source.mp4", jobs }, deps);

      const plan = JSON.parse(await readFile(workspace.planPath, "utf8"));
      expect(analyzeSilence).not.toHaveBeenCalled();
      expect(plan.source.hasAudio).toBe(false);
      expect(plan.removed).toEqual([]);
      expect(plan.segments).toEqual([
        expect.objectContaining({ sourceStartSec: 0, sourceEndSec: 8, timelineStartSec: 0, timelineEndSec: 8 })
      ]);
      expect(renderRoughCut).toHaveBeenCalledWith(expect.objectContaining({ source: expect.objectContaining({ hasAudio: false }) }), workspace);
      expect(runBasicQa).toHaveBeenCalledWith(path.join(workspace.renders, "rough-cut.mp4"), { expectedHasAudio: false });
      expect(jobs.get(job.id)).toMatchObject({
        status: "passed",
        stage: "complete",
        message: "Rough cut draft passed basic QA",
        outputPath: path.join(workspace.renders, "rough-cut.mp4"),
        planPath: workspace.planPath,
        warnings: []
      });
    });
  });

  it("routes vertical media to the SupoClip project job without running the horizontal rough-cut flow", async () => {
    await withTempDir("ai-editor-vertical-job-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath: "/tmp/source-vertical.mp4" });
      const analyzeSilence = vi.fn().mockResolvedValue([]);
      const renderRoughCut = vi.fn().mockResolvedValue(path.join(workspace.renders, "rough-cut.mp4"));
      const runVerticalProjectJob = vi.fn().mockResolvedValue(undefined);

      await runProjectJob({
        jobId: job.id,
        workspace,
        sourcePath: "/tmp/source-vertical.mp4",
        jobs
      }, {
        probeMedia: vi.fn().mockResolvedValue({
          durationSec: 45,
          width: 1080,
          height: 1920,
          fps: 30,
          hasAudio: true
        }),
        analyzeSilence,
        renderRoughCut,
        runBasicQa: vi.fn().mockResolvedValue({ status: "passed", warnings: [] }),
        runVerticalProjectJob,
        now: () => new Date("2026-05-05T00:00:00.000Z")
      } as RunProjectJobDeps & { runVerticalProjectJob: typeof runVerticalProjectJob });

      expect(runVerticalProjectJob).toHaveBeenCalledWith({
        jobId: job.id,
        workspace,
        sourcePath: "/tmp/source-vertical.mp4",
        jobs,
        metadata: {
          durationSec: 45,
          width: 1080,
          height: 1920,
          fps: 30,
          hasAudio: true
        }
      });
      expect(analyzeSilence).not.toHaveBeenCalled();
      expect(renderRoughCut).not.toHaveBeenCalled();
    });
  });

  it("uses the default vertical SupoClip runner for vertical media", async () => {
    await withTempDir("ai-editor-default-vertical-job-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath: "/tmp/source-vertical.mp4" });

      await runProjectJob({
        jobId: job.id,
        workspace,
        sourcePath: "/tmp/source-vertical.mp4",
        jobs
      }, {
        probeMedia: vi.fn().mockResolvedValue({
          durationSec: 45,
          width: 1080,
          height: 1920,
          fps: 30,
          hasAudio: true
        })
      });

      expect(jobs.get(job.id)).toMatchObject({
        status: "failed",
        stage: "supoclip_upload",
        message: "Vertical SupoClip job failed",
        error: "SupoClip vertical processing is disabled. Set SUPOCLIP_ENABLED=true."
      });
    });
  });

  it("completes with warning status when render QA reports warnings", async () => {
    await withTempDir("ai-editor-job-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath: "/tmp/source.mp4" });
      const renderPath = path.join(workspace.renders, "rough-cut.mp4");
      const deps: RunProjectJobDeps = {
        probeMedia: vi.fn().mockResolvedValue({
          durationSec: 8,
          width: 1280,
          height: 720,
          fps: 30,
          hasAudio: false
        }),
        renderRoughCut: vi.fn().mockResolvedValue(renderPath),
        runBasicQa: vi.fn().mockResolvedValue({ status: "warning", warnings: ["Detected possible black frame regions: black_start:0"] }),
        now: () => new Date("2026-05-05T00:00:00.000Z")
      };

      await runProjectJob({ jobId: job.id, workspace, sourcePath: "/tmp/source.mp4", jobs }, deps);

      expect(jobs.get(job.id)).toMatchObject({
        status: "warning",
        stage: "complete",
        message: "Rough cut draft is ready with warnings",
        outputPath: renderPath,
        planPath: workspace.planPath,
        warnings: ["Detected possible black frame regions: black_start:0"]
      });
      await expect(readFile(workspace.planPath, "utf8").then(JSON.parse)).resolves.toMatchObject({
        qa: {
          status: "warning",
          warnings: ["Detected possible black frame regions: black_start:0"]
        }
      });
    });
  });

  it("uses a noise-tolerant silence threshold for voice recordings with background noise", async () => {
    await withTempDir("ai-editor-job-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath: "/tmp/source.mov" });
      const analyzeSilence = vi.fn().mockResolvedValue([{ startSec: 4.623, endSec: 9.411, durationSec: 4.788 }]);
      const renderRoughCut = vi.fn().mockResolvedValue(path.join(workspace.renders, "rough-cut.mp4"));
      const runBasicQa = vi.fn().mockResolvedValue({ status: "passed", warnings: [] });

      await runProjectJob({
        jobId: job.id,
        workspace,
        sourcePath: "/tmp/source.mov",
        jobs
      }, {
        probeMedia: vi.fn().mockResolvedValue({
          durationSec: 12.533,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true
        }),
        analyzeSilence,
        renderRoughCut,
        runBasicQa,
        now: () => new Date("2026-05-05T00:00:00.000Z")
      });

      expect(analyzeSilence).toHaveBeenCalledWith("/tmp/source.mov", {
        noiseDb: -35,
        minDurationSec: 0.7,
        timeoutMs: getSilenceAnalysisTimeoutMs(12.533)
      });
      await expect(readFile(workspace.planPath, "utf8").then(JSON.parse)).resolves.toMatchObject({
        removed: [{ startSec: 4.823, endSec: 9.211, reason: "silence" }]
      });
    });
  });

  it("uses the requested cut preset for silence analysis and margins", async () => {
    await withTempDir("ai-editor-job-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath: "/tmp/source.mov" });
      const analyzeSilence = vi.fn().mockResolvedValue([{ startSec: 2, endSec: 6, durationSec: 4 }]);

      await runProjectJob({
        jobId: job.id,
        workspace,
        sourcePath: "/tmp/source.mov",
        jobs,
        cutPresetId: "aggressive"
      }, {
        probeMedia: vi.fn().mockResolvedValue({
          durationSec: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true
        }),
        analyzeSilence,
        renderRoughCut: vi.fn().mockResolvedValue(path.join(workspace.renders, "rough-cut.mp4")),
        runBasicQa: vi.fn().mockResolvedValue({ status: "passed", warnings: [] }),
        now: () => new Date("2026-05-05T00:00:00.000Z")
      });

      expect(analyzeSilence).toHaveBeenCalledWith("/tmp/source.mov", {
        noiseDb: -30,
        minDurationSec: 0.5,
        timeoutMs: getSilenceAnalysisTimeoutMs(10)
      });
      await expect(readFile(workspace.planPath, "utf8").then(JSON.parse)).resolves.toMatchObject({
        removed: [{ startSec: 2.1, endSec: 5.9, reason: "silence" }]
      });
    });
  });

  it("persists render failures in the edit plan so the UI can show the error after restart", async () => {
    await withTempDir("ai-editor-job-render-failure-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath: "/tmp/source.mp4" });
      const deps: RunProjectJobDeps = {
        probeMedia: vi.fn().mockResolvedValue({
          durationSec: 8,
          width: 1280,
          height: 720,
          fps: 30,
          hasAudio: false
        }),
        renderRoughCut: vi.fn().mockRejectedValue(new Error("ffmpeg exited before writing trailer")),
        now: () => new Date("2026-05-05T00:00:00.000Z")
      };

      await runProjectJob({ jobId: job.id, workspace, sourcePath: "/tmp/source.mp4", jobs }, deps);

      expect(jobs.get(job.id)).toMatchObject({
        status: "failed",
        stage: "render",
        message: "Project job failed",
        planPath: workspace.planPath,
        error: "ffmpeg exited before writing trailer"
      });
      await expect(readFile(workspace.planPath, "utf8").then(JSON.parse)).resolves.toMatchObject({
        qa: {
          status: "failed",
          warnings: ["Render failed during render: ffmpeg exited before writing trailer"]
        }
      });
    });
  });

  it("scales silence analysis timeout for longer media files", () => {
    expect(getSilenceAnalysisTimeoutMs(10)).toBe(135000);
    expect(getSilenceAnalysisTimeoutMs(578)).toBe(987000);
    expect(getSilenceAnalysisTimeoutMs(0)).toBe(120000);
    expect(getSilenceAnalysisTimeoutMs(999999)).toBe(3600000);
  });

  it("preserves rendered output paths when QA throws after render", async () => {
    await withTempDir("ai-editor-job-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath: "/tmp/source.mp4" });
      const renderPath = path.join(workspace.renders, "rough-cut.mp4");
      const deps: RunProjectJobDeps = {
        probeMedia: vi.fn().mockResolvedValue({
          durationSec: 8,
          width: 1280,
          height: 720,
          fps: 30,
          hasAudio: false
        }),
        renderRoughCut: vi.fn().mockResolvedValue(renderPath),
        runBasicQa: vi.fn().mockRejectedValue(new Error("qa exploded")),
        now: () => new Date("2026-05-05T00:00:00.000Z")
      };

      await runProjectJob({ jobId: job.id, workspace, sourcePath: "/tmp/source.mp4", jobs }, deps);

      expect(jobs.get(job.id)).toMatchObject({
        status: "failed",
        stage: "qa",
        message: "Project job failed",
        outputPath: renderPath,
        planPath: workspace.planPath,
        error: "qa exploded"
      });
      await expect(readFile(workspace.planPath, "utf8").then(JSON.parse)).resolves.toMatchObject({
        qa: {
          status: "failed",
          warnings: ["QA failed to complete: qa exploded"]
        }
      });
    });
  });

  it("marks the rendered draft failed when QA returns failed status", async () => {
    await withTempDir("ai-editor-job-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath: "/tmp/source.mp4" });
      const renderPath = path.join(workspace.renders, "rough-cut.mp4");
      const deps: RunProjectJobDeps = {
        probeMedia: vi.fn().mockResolvedValue({
          durationSec: 8,
          width: 1280,
          height: 720,
          fps: 30,
          hasAudio: false
        }),
        renderRoughCut: vi.fn().mockResolvedValue(renderPath),
        runBasicQa: vi.fn().mockResolvedValue({ status: "failed", warnings: ["Rendered draft failed QA checks."] }),
        now: () => new Date("2026-05-05T00:00:00.000Z")
      };

      await runProjectJob({ jobId: job.id, workspace, sourcePath: "/tmp/source.mp4", jobs }, deps);

      expect(jobs.get(job.id)).toMatchObject({
        status: "failed",
        stage: "qa_failed",
        message: "Rough cut draft failed QA",
        outputPath: renderPath,
        planPath: workspace.planPath,
        warnings: ["Rendered draft failed QA checks."]
      });
      await expect(readFile(workspace.planPath, "utf8").then(JSON.parse)).resolves.toMatchObject({
        qa: {
          status: "failed",
          warnings: ["Rendered draft failed QA checks."]
        }
      });
    });
  });

  it("marks the job failed when orchestration fails", async () => {
    await withTempDir("ai-editor-job-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath: "/tmp/source.mp4" });
      const deps: RunProjectJobDeps = {
        probeMedia: vi.fn().mockRejectedValue(new Error("probe exploded"))
      };

      await runProjectJob({ jobId: job.id, workspace, sourcePath: "/tmp/source.mp4", jobs }, deps);

      expect(jobs.get(job.id)).toMatchObject({
        status: "failed",
        stage: "probe",
        message: "Project job failed",
        error: "probe exploded"
      });
    });
  });
});
