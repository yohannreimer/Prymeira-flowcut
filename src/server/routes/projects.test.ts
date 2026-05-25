import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { setImmediate as waitForBackgroundJob } from "node:timers/promises";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { createJobStore } from "../jobs/job-store";
import { withTempDir } from "../../test/fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function tenantAccess(workspaceId = "workspace_123") {
  const token = "clerk-token";
  return vi.fn().mockResolvedValue({
    token,
    workspaceId,
    workspaceRole: "owner",
    productKey: "media",
    productRole: "admin",
    plan: "pro",
    limits: {}
  });
}

function missingTenantAccess() {
  return vi.fn().mockRejectedValue({
    statusCode: 401,
    code: "missing_auth_token",
    message: "Missing Clerk bearer token."
  });
}

describe("project routes", () => {
  it("lists project directories with plan metadata and derived artifacts", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const projectId = "project_123";
      const projectRoot = path.join(dir, projectId);
      const rendersRoot = path.join(projectRoot, "renders");
      await mkdir(rendersRoot, { recursive: true });
      await writeFile(path.join(rendersRoot, "rough-cut.mp4"), Buffer.from("rendered"));
      await writeFile(path.join(rendersRoot, "captions.vtt"), "WEBVTT");
      await writeFile(path.join(rendersRoot, "youtube-edit.mp4"), Buffer.from("final export"));
      await writeFile(path.join(projectRoot, "edit-plan.json"), JSON.stringify({
        id: "plan_project_123",
        projectId,
        version: 1,
        source: {
          path: "/uploads/source interview.mov",
          durationSec: 12,
          width: 1080,
          height: 1920,
          fps: 30,
          hasAudio: true
        },
        segments: [
          { id: "seg_1", sourceStartSec: 0, sourceEndSec: 8, timelineStartSec: 0, timelineEndSec: 8, reason: "kept speech/content" }
        ],
        removed: [{ id: "cut_1", startSec: 8, endSec: 12, reason: "silence" }],
        captions: [
          { id: "cap_1", startSec: 0, endSec: 2, text: "Hello", styleId: "focus_word", words: [] }
        ],
        overlays: [],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: { path: "/uploads/music.wav", gainDb: -10, duckUnderSpeechDb: -14 }, voiceTargetLufs: -16 },
        qa: { status: "warning", warnings: ["needs review"] },
        createdAt: "2026-05-05T00:00:00.000Z"
      }));
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false });

      const response = await request(app).get("/api/projects");

      expect(response.status).toBe(200);
      expect(response.body.projects).toHaveLength(1);
      expect(response.body.projects[0]).toMatchObject({
        id: projectId,
        name: "source interview.mov",
        sourceFileName: "source interview.mov",
        durationSec: 12,
        orientation: "vertical",
        status: "rendered",
        counts: { cuts: 1, captions: 1 },
        outputUrl: "/media/project_123/rough-cut.mp4",
        finalExportUrl: "/media/project_123/youtube-edit.mp4"
      });
      expect(response.body.projects[0].versions).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "rough_cut" }),
        expect.objectContaining({ kind: "final_export" }),
        expect.objectContaining({ kind: "captions_file" }),
        expect.objectContaining({ kind: "music" }),
        expect.objectContaining({ kind: "captions_plan" })
      ]));
    });
  });

  it("records project activity for a live workspace session", async () => {
    await withTempDir("ai-editor-route-activity-", async (dir) => {
      const projectId = "project_123";
      const projectRoot = path.join(dir, projectId);
      await mkdir(projectRoot, { recursive: true });
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false });

      await request(app)
        .post(`/api/projects/${projectId}/activity`)
        .expect(204);

      await expect(stat(path.join(projectRoot, ".last-activity"))).resolves.toBeTruthy();
    });
  });

  it("does not create activity markers for missing projects", async () => {
    await withTempDir("ai-editor-route-activity-missing-", async (dir) => {
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false });

      await request(app)
        .post("/api/projects/project_missing/activity")
        .expect(404);
    });
  });

  it("lists projects from the authorized tenant workspace", async () => {
    await withTempDir("ai-editor-route-tenant-list-", async (dir) => {
      const projectId = "project_123";
      const tenantProjectsRoot = path.join(dir, "workspaces", "workspace_123", "projects");
      const projectRoot = path.join(tenantProjectsRoot, projectId);
      await mkdir(projectRoot, { recursive: true });
      await writeFile(path.join(projectRoot, "edit-plan.json"), JSON.stringify({
        id: "plan_project_123",
        projectId,
        version: 1,
        source: {
          path: "/uploads/source.mp4",
          durationSec: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true
        },
        segments: [
          { id: "seg_1", sourceStartSec: 0, sourceEndSec: 10, timelineStartSec: 0, timelineEndSec: 10, reason: "kept speech/content" }
        ],
        removed: [],
        captions: [],
        overlays: [],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] },
        createdAt: "2026-05-05T00:00:00.000Z"
      }));
      const requireTenantAccess = tenantAccess();
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false, requireTenantAccess });

      const response = await request(app)
        .get("/api/projects")
        .set("Authorization", "Bearer clerk-token");

      expect(response.status).toBe(200);
      expect(response.body.projects).toEqual([
        expect.objectContaining({ id: projectId })
      ]);
      expect(requireTenantAccess).toHaveBeenCalledWith("Bearer clerk-token");
    });
  });

  it("lists project directories without plans as missing plan placeholders", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      await mkdir(path.join(dir, "project_empty"), { recursive: true });
      await mkdir(path.join(dir, "notes"), { recursive: true });
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false });

      const response = await request(app).get("/api/projects");

      expect(response.status).toBe(200);
      expect(response.body.projects).toEqual([
        expect.objectContaining({
          id: "project_empty",
          name: "project_empty",
          durationSec: null,
          orientation: "original",
          status: "missing_plan",
          counts: { cuts: 0, captions: 0 },
          outputUrl: null,
          versions: []
        })
      ]);
    });
  });

  it("creates uploaded projects under the authorized tenant workspace", async () => {
    await withTempDir("ai-editor-route-tenant-upload-", async (dir) => {
      const fixture = path.join(dir, "sample.mp4");
      await writeFile(fixture, Buffer.from("fake mp4"));
      const requireTenantAccess = tenantAccess();
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false, requireTenantAccess });

      const response = await request(app)
        .post("/api/projects")
        .set("Authorization", "Bearer clerk-token")
        .attach("video", fixture);

      expect(response.status).toBe(201);
      expect(response.body.projectId).toMatch(/^project_/);
      await expect(access(path.join(
        dir,
        "workspaces",
        "workspace_123",
        "projects",
        response.body.projectId,
        "uploads",
        "source.mp4"
      ))).resolves.toBeUndefined();
    });
  });

  it("creates a direct-to-R2 upload session for tenant uploads", async () => {
    await withTempDir("ai-editor-route-direct-upload-", async (dir) => {
      const createSignedUploadUrl = vi.fn().mockResolvedValue("https://r2.test/signed-put");
      const requireTenantAccess = tenantAccess();
      const app = createApp({
        workspaceRoot: dir,
        jobs: createJobStore(),
        runJobs: false,
        requireTenantAccess,
        directUploadStorage: {
          createSignedUploadUrl,
          getUploadedObjectSize: vi.fn(),
          downloadObjectToFile: vi.fn()
        }
      });

      const response = await request(app)
        .post("/api/projects/uploads")
        .set("Authorization", "Bearer clerk-token")
        .send({
          fileName: "aula longa.mp4",
          contentType: "video/mp4",
          sizeBytes: 612
        });

      expect(response.status).toBe(201);
      expect(response.body.upload).toMatchObject({
        id: expect.stringMatching(/^upload_/),
        status: "pending",
        fileName: "aula longa.mp4",
        contentType: "video/mp4",
        sizeBytes: 612
      });
      expect(response.body.uploadUrl).toBe("https://r2.test/signed-put");
      expect(createSignedUploadUrl).toHaveBeenCalledWith(expect.objectContaining({
        contentType: "video/mp4",
        sizeBytes: 612,
        storageKey: expect.stringContaining("workspaces/workspace_123/jobs/")
      }));
    });
  });

  it("completes a direct upload immediately, then downloads the R2 object in the background", async () => {
    await withTempDir("ai-editor-route-direct-complete-", async (dir) => {
      const jobs = createJobStore();
      let finishDownload: () => void = () => {
        throw new Error("Download did not start.");
      };
      let resolveDownloadStarted: (() => void) | null = null;
      const downloadHasStarted = new Promise<void>((resolve) => {
        resolveDownloadStarted = resolve;
      });
      const downloadObjectToFile = vi.fn(({ outputPath }: { outputPath: string }) => {
        resolveDownloadStarted?.();
        return new Promise<void>((resolveDownload) => {
          finishDownload = () => {
            void writeFile(outputPath, "video-bytes").then(resolveDownload);
          };
        });
      });
      const deleteObject = vi.fn();
      const requireTenantAccess = tenantAccess();
      const app = createApp({
        workspaceRoot: dir,
        jobs,
        runJobs: false,
        requireTenantAccess,
        directUploadStorage: {
          createSignedUploadUrl: vi.fn().mockResolvedValue("https://r2.test/signed-put"),
          getUploadedObjectSize: vi.fn().mockResolvedValue(612),
          downloadObjectToFile,
          deleteObject
        }
      });
      const created = await request(app)
        .post("/api/projects/uploads")
        .set("Authorization", "Bearer clerk-token")
        .send({
          fileName: "aula longa.mp4",
          contentType: "video/mp4",
          sizeBytes: 612
        });

      const response = await request(app)
        .post(`/api/projects/uploads/${created.body.upload.id}/complete`)
        .set("Authorization", "Bearer clerk-token")
        .send({ cutPreset: "normal" });

      expect(response.status).toBe(201);
      expect(response.body.projectId).toMatch(/^project_/);
      expect(response.body.job).toMatchObject({
        projectId: response.body.projectId,
        status: "queued"
      });
      const sourcePath = path.join(
        dir,
        "workspaces",
        "workspace_123",
        "projects",
        response.body.projectId,
        "uploads",
        "source.mp4"
      );
      await downloadHasStarted;
      await expect(readFile(sourcePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      expect(jobs.get(response.body.job.id)).toMatchObject({
        status: "running",
        stage: "upload"
      });

      finishDownload();
      await waitForBackgroundJob();
      await waitForBackgroundJob();

      await expect(readFile(sourcePath, "utf8")).resolves.toBe("video-bytes");
      expect(downloadObjectToFile).toHaveBeenCalledWith(expect.objectContaining({
        outputPath: sourcePath,
        storageKey: created.body.upload.storageKey
      }));
      await vi.waitFor(() => {
        expect(deleteObject).toHaveBeenCalledWith(created.body.upload.storageKey);
      });
      expect(jobs.get(response.body.job.id)?.sourcePath).toBe(sourcePath);
    });
  });

  it("returns 401 when tenant auth is configured and the token is missing", async () => {
    await withTempDir("ai-editor-route-missing-token-", async (dir) => {
      const requireTenantAccess = missingTenantAccess();
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false, requireTenantAccess });

      const response = await request(app).get("/api/projects");

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: {
          code: "missing_auth_token",
          message: "Missing Clerk bearer token."
        }
      });
    });
  });

  it("returns 401 before accepting an uploaded project when the tenant token is missing", async () => {
    await withTempDir("ai-editor-route-missing-token-upload-", async (dir) => {
      const fixture = path.join(dir, "sample.mp4");
      await writeFile(fixture, Buffer.from("fake mp4"));
      const requireTenantAccess = missingTenantAccess();
      const app = createApp({
        workspaceRoot: dir,
        jobs: createJobStore(),
        runJobs: false,
        requireTenantAccess,
        uploadFileSizeLimitBytes: 1
      });

      const response = await request(app)
        .post("/api/projects")
        .attach("video", fixture);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: {
          code: "missing_auth_token",
          message: "Missing Clerk bearer token."
        }
      });
      expect(requireTenantAccess).toHaveBeenCalledWith(undefined);
      await expect(access(path.join(dir, "workspaces"))).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it("deletes a project directory", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const projectRoot = path.join(dir, "project_delete_me");
      await mkdir(projectRoot, { recursive: true });
      await writeFile(path.join(projectRoot, "note.txt"), "temporary");
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false });

      const response = await request(app).delete("/api/projects/project_delete_me");

      expect(response.status).toBe(204);
      await expect(access(projectRoot)).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it("accepts validated export settings and creates an export job", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const projectId = "project_123";
      const projectRoot = path.join(dir, projectId);
      await mkdir(projectRoot, { recursive: true });
      await writeFile(path.join(projectRoot, "edit-plan.json"), JSON.stringify({
        id: "plan_project_123",
        projectId,
        version: 1,
        source: {
          path: "/tmp/source.mov",
          durationSec: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true
        },
        segments: [
          { id: "seg_1", sourceStartSec: 0, sourceEndSec: 10, timelineStartSec: 0, timelineEndSec: 10, reason: "kept speech/content" }
        ],
        removed: [],
        captions: [],
        overlays: [],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] },
        createdAt: "2026-05-05T00:00:00.000Z"
      }));
      const jobs = createJobStore();
      const app = createApp({ workspaceRoot: dir, jobs, runJobs: false });

      const response = await request(app)
        .post(`/api/projects/${projectId}/export`)
        .send({ format: "vertical", resolution: "1080p", quality: "maxima", fileName: "final.mp4" });

      expect(response.status).toBe(202);
      expect(response.body.job).toMatchObject({
        projectId,
        status: "queued",
        stage: "export_queued",
        message: "Export accepted"
      });
      expect(jobs.get(response.body.job.id)?.sourcePath).toBe("/tmp/source.mov");
    });
  });

  it("accepts YouTube package generation and creates a queued job", async () => {
    await withTempDir("ai-editor-route-youtube-package-", async (dir) => {
      const projectId = "project_123";
      const projectRoot = path.join(dir, projectId);
      await mkdir(projectRoot, { recursive: true });
      await writeFile(path.join(projectRoot, "edit-plan.json"), JSON.stringify({
        id: "plan_project_123",
        projectId,
        version: 1,
        source: {
          path: "/tmp/source.mov",
          durationSec: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true
        },
        segments: [
          { id: "seg_1", sourceStartSec: 0, sourceEndSec: 10, timelineStartSec: 0, timelineEndSec: 10, reason: "kept speech/content" }
        ],
        removed: [],
        captions: [{ id: "cap_1", startSec: 0, endSec: 2, text: "Texto do video", styleId: "focus_word", words: [] }],
        overlays: [],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] },
        createdAt: "2026-05-05T00:00:00.000Z"
      }));
      const jobs = createJobStore();
      const app = createApp({ workspaceRoot: dir, jobs, runJobs: false });

      const response = await request(app).post(`/api/projects/${projectId}/youtube-package`).send({});

      expect(response.status).toBe(202);
      expect(response.body.job).toMatchObject({
        projectId,
        status: "queued",
        stage: "youtube_package_queued",
        message: "YouTube package accepted"
      });
      expect(jobs.get(response.body.job.id)?.sourcePath).toBe("/tmp/source.mov");
    });
  });

  it("passes YouTube package jobs to the background runner", async () => {
    await withTempDir("ai-editor-route-youtube-package-runner-", async (dir) => {
      const projectId = "project_123";
      const projectRoot = path.join(dir, projectId);
      await mkdir(projectRoot, { recursive: true });
      await writeFile(path.join(projectRoot, "edit-plan.json"), JSON.stringify({
        id: "plan_project_123",
        projectId,
        version: 1,
        source: {
          path: "/tmp/source.mov",
          durationSec: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true
        },
        segments: [
          { id: "seg_1", sourceStartSec: 0, sourceEndSec: 10, timelineStartSec: 0, timelineEndSec: 10, reason: "kept speech/content" }
        ],
        removed: [],
        captions: [{ id: "cap_1", startSec: 0, endSec: 2, text: "Texto do video", styleId: "focus_word", words: [] }],
        overlays: [],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] },
        createdAt: "2026-05-05T00:00:00.000Z"
      }));
      const runYoutubePackageJob = vi.fn().mockResolvedValue(undefined);
      const app = createApp({
        workspaceRoot: dir,
        jobs: createJobStore(),
        runJobs: true,
        runYoutubePackageJob
      });

      const response = await request(app).post(`/api/projects/${projectId}/youtube-package`).send({});
      await waitForBackgroundJob();

      expect(response.status).toBe(202);
      expect(runYoutubePackageJob).toHaveBeenCalledWith(expect.objectContaining({
        jobId: response.body.job.id,
        jobs: expect.any(Object),
        workspace: expect.objectContaining({ projectId })
      }));
    });
  });

  it("returns a YouTube package summary for review screens", async () => {
    await withTempDir("ai-editor-route-youtube-summary-", async (dir) => {
      const projectId = "project_123";
      const packageDir = path.join(dir, projectId, "download", "youtube-package");
      await mkdir(packageDir, { recursive: true });
      await writeFile(path.join(packageDir, "titulo.txt"), "Titulo de alta curiosidade\n");
      await writeFile(path.join(packageDir, "thumbnail-ref-01.jpg"), Buffer.from("jpg"));
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false });

      const response = await request(app).get(`/api/projects/${projectId}/youtube-package/summary`);

      expect(response.status).toBe(200);
      expect(response.body.summary).toMatchObject({
        status: "incomplete",
        title: "Titulo de alta curiosidade",
        description: null,
        transcriptAvailable: false,
        missing: ["descricao.txt", "transcricao.txt", "prompt-thumbnail.txt"],
        assets: [
          {
            kind: "thumbnail_reference",
            name: "thumbnail-ref-01.jpg",
            url: "/api/projects/project_123/youtube-package/assets/thumbnail-ref-01.jpg"
          }
        ]
      });
    });
  });

  it("serves only safe YouTube package assets", async () => {
    await withTempDir("ai-editor-route-youtube-assets-", async (dir) => {
      const projectId = "project_123";
      const projectRoot = path.join(dir, projectId);
      const packageDir = path.join(projectRoot, "download", "youtube-package");
      await mkdir(packageDir, { recursive: true });
      await writeFile(path.join(packageDir, "titulo.txt"), "Titulo\n");
      await writeFile(path.join(packageDir, "descricao.txt"), "Descricao\n");
      await writeFile(path.join(packageDir, "transcricao.txt"), "Transcricao\n");
      await writeFile(path.join(packageDir, "prompt-thumbnail.txt"), "Prompt\n");
      await writeFile(path.join(packageDir, "thumbnail-ref-01.jpg"), Buffer.from("jpg"));
      await writeFile(path.join(projectRoot, "edit-plan.json"), "private plan");
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false });

      const assetResponse = await request(app).get(`/api/projects/${projectId}/youtube-package/assets/thumbnail-ref-01.jpg`);
      const traversalResponse = await request(app).get(`/api/projects/${projectId}/youtube-package/assets/%2e%2e%2fedit-plan.json`);

      expect(assetResponse.status).toBe(200);
      expect(assetResponse.body.toString("utf8")).toBe("jpg");
      expect(traversalResponse.status).toBe(404);
    });
  });

  it("rejects invalid export settings", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false });

      const response = await request(app)
        .post("/api/projects/project_123/export")
        .send({ format: "square", resolution: "tiny", quality: "maxima", fileName: "../bad.mp4" });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/export/i);
    });
  });

  it("accepts a video upload and creates a queued job", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const fixture = path.join(dir, "sample.mp4");
      await writeFile(fixture, Buffer.from("fake mp4"));
      const jobs = createJobStore();
      const app = createApp({ workspaceRoot: dir, jobs, runJobs: false });

      const response = await request(app).post("/api/projects").attach("video", fixture);

      expect(response.status).toBe(201);
      expect(response.body.projectId).toMatch(/^project_/);
      expect(response.body.job.status).toBe("queued");
      expect(jobs.get(response.body.job.id)?.projectId).toBe(response.body.projectId);
    });
  });

  it("passes the selected cut preset into the background job", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const fixture = path.join(dir, "sample.mp4");
      await writeFile(fixture, Buffer.from("fake mp4"));
      const runProjectJob = vi.fn().mockResolvedValue(undefined);
      const app = createApp({
        workspaceRoot: dir,
        jobs: createJobStore(),
        runJobs: true,
        runProjectJob
      });

      const response = await request(app)
        .post("/api/projects")
        .field("cutPreset", "aggressive")
        .attach("video", fixture);
      await waitForBackgroundJob();

      expect(response.status).toBe(201);
      expect(runProjectJob).toHaveBeenCalledWith(expect.objectContaining({ cutPresetId: "aggressive" }));
    });
  });

  it("rejects invalid cut presets", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const fixture = path.join(dir, "sample.mp4");
      await writeFile(fixture, Buffer.from("fake mp4"));
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false });

      const response = await request(app)
        .post("/api/projects")
        .field("cutPreset", "chaos")
        .attach("video", fixture);

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/preset/i);
    });
  });

  it("stores uploaded video using a predictable source filename", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const fixture = path.join(dir, "sample.mp4");
      await writeFile(fixture, Buffer.from("fake mp4"));
      const jobs = createJobStore();
      const app = createApp({ workspaceRoot: dir, jobs, runJobs: false });

      const response = await request(app)
        .post("/api/projects")
        .attach("video", fixture, { filename: "../strange.name.mov" });

      const job = jobs.get(response.body.job.id);
      expect(response.status).toBe(201);
      expect(path.basename(job?.sourcePath ?? "")).toBe("source.mov");
      await expect(access(path.join(dir, response.body.projectId, "uploads", "source.mov"))).resolves.toBeUndefined();
    });
  });

  it("returns 400 when the video upload field is missing", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false });

      const response = await request(app).post("/api/projects");

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/video/i);
    });
  });

  it("returns 400 when a file is uploaded under the wrong field name", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const fixture = path.join(dir, "sample.mp4");
      await writeFile(fixture, Buffer.from("fake mp4"));
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false });

      const response = await request(app).post("/api/projects").attach("clip", fixture);

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/video/i);
    });
  });

  it("marks the job as failed when the background runner rejects", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const fixture = path.join(dir, "sample.mp4");
      await writeFile(fixture, Buffer.from("fake mp4"));
      const jobs = createJobStore();
      const runProjectJob = vi.fn().mockRejectedValue(new Error("analysis exploded"));
      const app = createApp({ workspaceRoot: dir, jobs, runJobs: true, runProjectJob });

      const response = await request(app).post("/api/projects").attach("video", fixture);
      await waitForBackgroundJob();

      const job = jobs.get(response.body.job.id);
      expect(response.status).toBe(201);
      expect(runProjectJob).toHaveBeenCalledOnce();
      expect(job?.status).toBe("failed");
      expect(job?.stage).toBe("failed");
      expect(job?.message).toMatch(/failed/i);
      expect(job?.error).toBe("analysis exploded");
    });
  });

  it("marks the job as failed when the background runner throws synchronously", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const fixture = path.join(dir, "sample.mp4");
      await writeFile(fixture, Buffer.from("fake mp4"));
      const jobs = createJobStore();
      const runProjectJob = vi.fn(() => {
        throw new Error("sync analysis exploded");
      });
      const app = createApp({ workspaceRoot: dir, jobs, runJobs: true, runProjectJob });

      const response = await request(app).post("/api/projects").attach("video", fixture);
      await waitForBackgroundJob();

      const job = jobs.get(response.body.job.id);
      expect(response.status).toBe(201);
      expect(runProjectJob).toHaveBeenCalledOnce();
      expect(job?.status).toBe("failed");
      expect(job?.stage).toBe("failed");
      expect(job?.message).toMatch(/failed/i);
      expect(job?.error).toBe("sync analysis exploded");
    });
  });

  it("returns 413 when the uploaded video exceeds the configured size limit", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const fixture = path.join(dir, "sample.mp4");
      await writeFile(fixture, Buffer.from("fake mp4"));
      const app = createApp({
        workspaceRoot: dir,
        jobs: createJobStore(),
        runJobs: false,
        uploadFileSizeLimitBytes: 4
      });

      const response = await request(app).post("/api/projects").attach("video", fixture);

      expect(response.status).toBe(413);
      expect(response.body.error).toMatch(/size|large|limit/i);
    });
  });

  it("returns 401 before accepting uploaded music when the tenant token is missing", async () => {
    await withTempDir("ai-editor-route-missing-token-music-", async (dir) => {
      const fixture = path.join(dir, "music.mp3");
      await writeFile(fixture, Buffer.from("fake mp3"));
      const requireTenantAccess = missingTenantAccess();
      const app = createApp({
        workspaceRoot: dir,
        jobs: createJobStore(),
        runJobs: false,
        requireTenantAccess,
        uploadFileSizeLimitBytes: 1
      });

      const response = await request(app)
        .post("/api/projects/project_123/music")
        .attach("music", fixture);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: {
          code: "missing_auth_token",
          message: "Missing Clerk bearer token."
        }
      });
      expect(requireTenantAccess).toHaveBeenCalledWith(undefined);
      await expect(access(path.join(dir, "workspaces"))).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it("returns a media URL for rendered job output inside the project renders directory", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const jobs = createJobStore();
      const projectId = "project_123";
      const renders = path.join(dir, projectId, "renders");
      await mkdir(renders, { recursive: true });
      const job = jobs.create({
        projectId,
        sourcePath: path.join(dir, projectId, "uploads", "source.mp4")
      });
      jobs.update(job.id, { outputPath: path.join(renders, "rough cut.mp4") });
      const app = createApp({ workspaceRoot: dir, jobs, runJobs: false });

      const response = await request(app).get(`/api/projects/jobs/${job.id}`);

      expect(response.status).toBe(200);
      expect(response.body.job.outputUrl).toBe("/media/project_123/rough%20cut.mp4");
    });
  });

  it("does not expose unscoped legacy jobs to authenticated tenant requests", async () => {
    await withTempDir("ai-editor-route-tenant-job-", async (dir) => {
      const jobs = createJobStore();
      const job = jobs.create({
        projectId: "project_123",
        sourcePath: path.join(dir, "project_123", "uploads", "source.mp4")
      });
      const requireTenantAccess = tenantAccess();
      const app = createApp({ workspaceRoot: dir, jobs, runJobs: false, requireTenantAccess });

      const response = await request(app)
        .get(`/api/projects/jobs/${job.id}`)
        .set("Authorization", "Bearer clerk-token");

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Job not found");
    });
  });

  it("does not return a download URL for failed render output", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const jobs = createJobStore();
      const projectId = "project_123";
      const renders = path.join(dir, projectId, "renders");
      await mkdir(renders, { recursive: true });
      const job = jobs.create({
        projectId,
        sourcePath: path.join(dir, projectId, "uploads", "source.mp4")
      });
      jobs.update(job.id, {
        status: "failed",
        stage: "failed",
        outputPath: path.join(renders, "failed-export.mp4"),
        error: "FFmpeg failed"
      });
      const app = createApp({ workspaceRoot: dir, jobs, runJobs: false });

      const response = await request(app).get(`/api/projects/jobs/${job.id}`);

      expect(response.status).toBe(200);
      expect(response.body.job.outputUrl).toBeNull();
    });
  });

  it("returns a sanitized edit plan summary", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const projectId = "project_123";
      const projectRoot = path.join(dir, projectId);
      await mkdir(projectRoot, { recursive: true });
      await writeFile(path.join(projectRoot, "edit-plan.json"), JSON.stringify({
        id: "plan_project_123",
        projectId,
        version: 1,
        source: {
          path: "/private/source.mov",
          durationSec: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true
        },
        segments: [
          {
            id: "seg_1",
            sourceStartSec: 0,
            sourceEndSec: 2,
            timelineStartSec: 0,
            timelineEndSec: 2,
            reason: "kept speech/content"
          }
        ],
        removed: [{ id: "cut_1", startSec: 2, endSec: 5, reason: "silence" }],
        captions: [],
        overlays: [],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] },
        createdAt: "2026-05-05T00:00:00.000Z"
      }));
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false });

      const response = await request(app).get(`/api/projects/${projectId}/plan`);

      expect(response.status).toBe(200);
      expect(response.body.plan.source).toEqual({
        durationSec: 10,
        width: 1920,
        height: 1080,
        fps: 30,
        hasAudio: true
      });
      expect(response.body.plan.source.path).toBeUndefined();
      expect(response.body.plan.removed).toEqual([{ id: "cut_1", startSec: 2, endSec: 5, reason: "silence" }]);
    });
  });

  it("starts a manual rerender with selected active cuts", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const projectId = "project_123";
      const projectRoot = path.join(dir, projectId);
      await mkdir(projectRoot, { recursive: true });
      await writeFile(path.join(projectRoot, "edit-plan.json"), JSON.stringify({
        id: "plan_project_123",
        projectId,
        version: 1,
        source: {
          path: "/tmp/source.mov",
          durationSec: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true
        },
        segments: [
          { id: "seg_1", sourceStartSec: 0, sourceEndSec: 10, timelineStartSec: 0, timelineEndSec: 10, reason: "kept speech/content" }
        ],
        removed: [{ id: "cut_1", startSec: 2, endSec: 5, reason: "silence" }],
        captions: [],
        overlays: [],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] },
        createdAt: "2026-05-05T00:00:00.000Z"
      }));
      const runManualRenderJob = vi.fn().mockResolvedValue(undefined);
      const app = createApp({
        workspaceRoot: dir,
        jobs: createJobStore(),
        runJobs: true,
        runManualRenderJob
      });

      const response = await request(app)
        .post(`/api/projects/${projectId}/render`)
        .send({ activeCutIds: ["cut_1"] });
      await waitForBackgroundJob();

      expect(response.status).toBe(202);
      expect(response.body.job.status).toBe("queued");
      expect(runManualRenderJob).toHaveBeenCalledWith(expect.objectContaining({
        activeCutIds: ["cut_1"],
        workspace: expect.objectContaining({ projectId })
      }));
    });
  });

  it("starts Whisper captions with the selected word-level style", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const projectId = "project_123";
      const projectRoot = path.join(dir, projectId);
      await mkdir(projectRoot, { recursive: true });
      await writeFile(path.join(projectRoot, "edit-plan.json"), JSON.stringify({
        id: "plan_project_123",
        projectId,
        version: 1,
        source: {
          path: "/tmp/source.mov",
          durationSec: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true
        },
        segments: [
          { id: "seg_1", sourceStartSec: 0, sourceEndSec: 10, timelineStartSec: 0, timelineEndSec: 10, reason: "kept speech/content" }
        ],
        removed: [],
        captions: [],
        overlays: [],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] },
        createdAt: "2026-05-05T00:00:00.000Z"
      }));
      const runCaptionJob = vi.fn().mockResolvedValue(undefined);
      const app = createApp({
        workspaceRoot: dir,
        jobs: createJobStore(),
        runJobs: true,
        runCaptionJob
      });

      const response = await request(app)
        .post(`/api/projects/${projectId}/captions`)
        .send({ captionStyleId: "stacked_pop" });
      await waitForBackgroundJob();

      expect(response.status).toBe(202);
      expect(response.body.job.status).toBe("queued");
      expect(runCaptionJob).toHaveBeenCalledWith(expect.objectContaining({
        captionStyleId: "stacked_pop",
        workspace: expect.objectContaining({ projectId })
      }));
    });
  });

  it("starts AI motion planning for an existing project", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const projectId = "project_123";
      const projectRoot = path.join(dir, projectId);
      await mkdir(projectRoot, { recursive: true });
      await writeFile(path.join(projectRoot, "edit-plan.json"), JSON.stringify({
        id: "plan_project_123",
        projectId,
        version: 1,
        source: {
          path: "/tmp/source.mov",
          durationSec: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true
        },
        segments: [
          { id: "seg_1", sourceStartSec: 0, sourceEndSec: 10, timelineStartSec: 0, timelineEndSec: 10, reason: "kept speech/content" }
        ],
        removed: [],
        sections: [
          { id: "section_hook", type: "hook", startSec: 0, endSec: 10, label: "Gancho", confidence: 0.8, warnings: [], treatments: {} }
        ],
        captions: [],
        overlays: [],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] },
        createdAt: "2026-05-05T00:00:00.000Z"
      }));
      const runMotionJob = vi.fn().mockResolvedValue(undefined);
      const app = createApp({
        workspaceRoot: dir,
        jobs: createJobStore(),
        runJobs: true,
        runMotionJob
      });

      const response = await request(app).post(`/api/projects/${projectId}/motion`).send({});
      await waitForBackgroundJob();

      expect(response.status).toBe(202);
      expect(response.body.job).toMatchObject({
        status: "queued",
        stage: "motion_queued",
        message: "AI motion accepted"
      });
      expect(runMotionJob).toHaveBeenCalledWith(expect.objectContaining({
        workspace: expect.objectContaining({ projectId })
      }));
    });
  });

  it("updates caption text in the edit plan without creating a render job", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const projectId = "project_123";
      const projectRoot = path.join(dir, projectId);
      await mkdir(projectRoot, { recursive: true });
      await writeFile(path.join(projectRoot, "edit-plan.json"), JSON.stringify({
        id: "plan_project_123",
        projectId,
        version: 1,
        source: {
          path: "/tmp/source.mov",
          durationSec: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true
        },
        segments: [
          { id: "seg_1", sourceStartSec: 0, sourceEndSec: 10, timelineStartSec: 0, timelineEndSec: 10, reason: "kept speech/content" }
        ],
        removed: [],
        captions: [
          { id: "cap_1", startSec: 0.5, endSec: 2, text: "texto antigo", styleId: "focus_word", words: [] }
        ],
        overlays: [],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] },
        createdAt: "2026-05-05T00:00:00.000Z"
      }));
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: true });

      const response = await request(app)
        .patch(`/api/projects/${projectId}/captions/cap_1`)
        .send({ text: "texto novo" });

      expect(response.status).toBe(200);
      expect(response.body.plan.captions[0].text).toBe("texto novo");
      const savedPlan = JSON.parse(await readFile(path.join(projectRoot, "edit-plan.json"), "utf8"));
      expect(savedPlan.captions[0].text).toBe("texto novo");
    });
  });

  it("updates caption settings in the edit plan", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const projectId = "project_123";
      const projectRoot = path.join(dir, projectId);
      await mkdir(projectRoot, { recursive: true });
      await writeFile(path.join(projectRoot, "edit-plan.json"), JSON.stringify({
        id: "plan_project_123",
        projectId,
        version: 1,
        source: {
          path: "/tmp/source.mov",
          durationSec: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true
        },
        segments: [
          { id: "seg_1", sourceStartSec: 0, sourceEndSec: 10, timelineStartSec: 0, timelineEndSec: 10, reason: "kept speech/content" }
        ],
        removed: [],
        captions: [],
        overlays: [],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] },
        createdAt: "2026-05-05T00:00:00.000Z"
      }));
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: true });

      const response = await request(app)
        .patch(`/api/projects/${projectId}/captions/settings`)
        .send({ wordsPerBlock: 5, enabled: false, positionYPct: 76 });

      expect(response.status).toBe(200);
      expect(response.body.plan.captionSettings).toMatchObject({
        wordsPerBlock: 5,
        enabled: false,
        positionYPct: 76
      });
      const savedPlan = JSON.parse(await readFile(path.join(projectRoot, "edit-plan.json"), "utf8"));
      expect(savedPlan.captionSettings.wordsPerBlock).toBe(5);
    });
  });

  it("updates a timeline section treatment", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const projectId = "project_123";
      const projectRoot = path.join(dir, projectId);
      await mkdir(projectRoot, { recursive: true });
      await writeFile(path.join(projectRoot, "edit-plan.json"), JSON.stringify({
        id: "plan_project_123",
        projectId,
        version: 1,
        source: {
          path: "/tmp/source.mov",
          durationSec: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true
        },
        segments: [
          { id: "seg_1", sourceStartSec: 0, sourceEndSec: 10, timelineStartSec: 0, timelineEndSec: 10, reason: "kept speech/content" }
        ],
        removed: [],
        sections: [
          { id: "section_1", type: "screen", startSec: 0, endSec: 5, label: "Tela", confidence: 1, warnings: [], treatments: {} }
        ],
        captions: [],
        overlays: [],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] },
        createdAt: "2026-05-05T00:00:00.000Z"
      }));
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false });

      const response = await request(app)
        .patch(`/api/projects/${projectId}/sections/section_1`)
        .send({
          type: "hybrid",
          label: "Tela + rosto",
          treatments: { captions: { enabled: false } }
        });

      expect(response.status).toBe(200);
      expect(response.body.plan.sections[0]).toMatchObject({
        type: "hybrid",
        label: "Tela + rosto",
        treatments: { captions: { enabled: false } }
      });
      const savedPlan = JSON.parse(await readFile(path.join(projectRoot, "edit-plan.json"), "utf8"));
      expect(savedPlan.sections[0].treatments.captions.enabled).toBe(false);
    });
  });

  it("does not allow timeline section identity updates", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const projectId = "project_123";
      const projectRoot = path.join(dir, projectId);
      await mkdir(projectRoot, { recursive: true });
      await writeFile(path.join(projectRoot, "edit-plan.json"), JSON.stringify({
        id: "plan_project_123",
        projectId,
        version: 1,
        source: {
          path: "/tmp/source.mov",
          durationSec: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true
        },
        segments: [
          { id: "seg_1", sourceStartSec: 0, sourceEndSec: 10, timelineStartSec: 0, timelineEndSec: 10, reason: "kept speech/content" }
        ],
        removed: [],
        sections: [
          { id: "section_1", type: "screen", startSec: 0, endSec: 5, label: "Tela", confidence: 1, warnings: [], treatments: {} }
        ],
        captions: [],
        overlays: [],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] },
        createdAt: "2026-05-05T00:00:00.000Z"
      }));
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false });

      const response = await request(app)
        .patch(`/api/projects/${projectId}/sections/section_1`)
        .send({ id: "section_renamed" });

      expect(response.status).toBe(400);
      const savedPlan = JSON.parse(await readFile(path.join(projectRoot, "edit-plan.json"), "utf8"));
      expect(savedPlan.sections[0].id).toBe("section_1");
    });
  });

  it("preserves motion slots when updating only motion enabled state", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const projectId = "project_123";
      const projectRoot = path.join(dir, projectId);
      await mkdir(projectRoot, { recursive: true });
      await writeFile(path.join(projectRoot, "edit-plan.json"), JSON.stringify({
        id: "plan_project_123",
        projectId,
        version: 1,
        source: {
          path: "/tmp/source.mov",
          durationSec: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true
        },
        segments: [
          { id: "seg_1", sourceStartSec: 0, sourceEndSec: 10, timelineStartSec: 0, timelineEndSec: 10, reason: "kept speech/content" }
        ],
        removed: [],
        sections: [
          {
            id: "section_1",
            type: "screen",
            startSec: 0,
            endSec: 5,
            label: "Tela",
            confidence: 1,
            warnings: [],
            treatments: {
              motion: {
                enabled: false,
                slots: [{ id: "slot_1", kind: "zoom", startSec: 1, endSec: 2, label: "Zoom" }]
              }
            }
          }
        ],
        captions: [],
        overlays: [],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] },
        createdAt: "2026-05-05T00:00:00.000Z"
      }));
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false });

      const response = await request(app)
        .patch(`/api/projects/${projectId}/sections/section_1`)
        .send({ treatments: { motion: { enabled: true } } });

      expect(response.status).toBe(200);
      expect(response.body.plan.sections[0].treatments.motion).toMatchObject({
        enabled: true,
        slots: [{ id: "slot_1" }]
      });
    });
  });

  it("returns publish readiness for a project", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const projectId = "project_123";
      const projectRoot = path.join(dir, projectId);
      await mkdir(projectRoot, { recursive: true });
      await writeFile(path.join(projectRoot, "edit-plan.json"), JSON.stringify({
        id: "plan_project_123",
        projectId,
        version: 1,
        source: {
          path: "/tmp/source.mov",
          durationSec: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true
        },
        segments: [
          { id: "seg_1", sourceStartSec: 0, sourceEndSec: 10, timelineStartSec: 0, timelineEndSec: 10, reason: "kept speech/content" }
        ],
        removed: [],
        sections: [],
        captions: [],
        captionSettings: { enabled: false },
        overlays: [],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] },
        createdAt: "2026-05-05T00:00:00.000Z"
      }));
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false });

      const response = await request(app).get(`/api/projects/${projectId}/publish-readiness`);

      expect(response.status).toBe(200);
      expect(response.body.publishReadiness).toHaveProperty("status");
      const savedPlan = JSON.parse(await readFile(path.join(projectRoot, "edit-plan.json"), "utf8"));
      expect(savedPlan.publishReadiness).toEqual(response.body.publishReadiness);
    });
  });

  it("marks publish readiness ready when a final export exists", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const projectId = "project_123";
      const projectRoot = path.join(dir, projectId);
      const rendersRoot = path.join(projectRoot, "renders");
      await mkdir(rendersRoot, { recursive: true });
      await writeFile(path.join(rendersRoot, "youtube-edit.mp4"), Buffer.from("final export"));
      await writeFile(path.join(projectRoot, "edit-plan.json"), JSON.stringify({
        id: "plan_project_123",
        projectId,
        version: 1,
        source: {
          path: "/tmp/source.mov",
          durationSec: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true
        },
        segments: [
          { id: "seg_1", sourceStartSec: 0, sourceEndSec: 10, timelineStartSec: 0, timelineEndSec: 10, reason: "kept speech/content" }
        ],
        removed: [],
        sections: [],
        captions: [],
        captionSettings: { enabled: false },
        overlays: [],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] },
        createdAt: "2026-05-05T00:00:00.000Z"
      }));
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false });

      const response = await request(app).get(`/api/projects/${projectId}/publish-readiness`);

      expect(response.status).toBe(200);
      expect(response.body.publishReadiness.status).toBe("ready");
      expect(response.body.publishReadiness.checks.some((check: { id: string }) => check.id === "latest_export")).toBe(false);
    });
  });

  it("publishes the final export to YouTube with edited metadata and selected thumbnail", async () => {
    await withTempDir("ai-editor-route-youtube-publish-", async (dir) => {
      vi.stubEnv("YOUTUBE_CLIENT_ID", "client-id");
      vi.stubEnv("YOUTUBE_CLIENT_SECRET", "client-secret");
      vi.stubEnv("YOUTUBE_REFRESH_TOKEN", "refresh-token");

      const projectId = "project_123";
      const projectRoot = path.join(dir, projectId);
      const rendersRoot = path.join(projectRoot, "renders");
      const packageRoot = path.join(projectRoot, "download", "youtube-package");
      await mkdir(rendersRoot, { recursive: true });
      await mkdir(packageRoot, { recursive: true });
      await writeFile(path.join(rendersRoot, "youtube-edit.mp4"), Buffer.from("final export"));
      await writeFile(path.join(rendersRoot, "preview-sample.mp4"), Buffer.from("newer preview export"));
      await writeFile(path.join(packageRoot, "title.txt"), "Titulo gerado");
      await writeFile(path.join(packageRoot, "description.txt"), "Descricao gerada");
      await writeFile(path.join(packageRoot, "chapters.txt"), "00:00 Inicio\n00:30 Ideia principal\n");
      await writeFile(path.join(packageRoot, "tags.txt"), "PROCESSO\nREAL\nBASTIDOR\n");
      await writeFile(path.join(packageRoot, "thumbnail-generated-01.png"), Buffer.from("thumbnail"));
      await writeFile(path.join(projectRoot, "edit-plan.json"), JSON.stringify({
        id: "plan_project_123",
        projectId,
        version: 1,
        source: {
          path: "/tmp/source.mov",
          durationSec: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true
        },
        segments: [
          { id: "seg_1", sourceStartSec: 0, sourceEndSec: 10, timelineStartSec: 0, timelineEndSec: 10, reason: "kept speech/content" }
        ],
        removed: [],
        sections: [],
        captions: [],
        captionSettings: { enabled: false },
        overlays: [],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] },
        createdAt: "2026-05-05T00:00:00.000Z"
      }));
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access-123" }), { status: 200 }))
        .mockResolvedValueOnce(new Response(null, {
          status: 200,
          headers: { location: "https://upload.youtube.test/session" }
        }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: "video-123" }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ kind: "youtube#thumbnailSetResponse" }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      const app = createApp({ workspaceRoot: dir, jobs: createJobStore(), runJobs: false });

      const response = await request(app)
        .post(`/api/projects/${projectId}/youtube-publish`)
        .send({
          title: "Titulo editado",
          description: "Descricao editada",
          privacyStatus: "unlisted",
          thumbnailName: "thumbnail-generated-01.png"
        });

      expect(response.status).toBe(200);
      expect(response.body.publication).toEqual({
        externalId: "video-123",
        url: "https://www.youtube.com/watch?v=video-123"
      });
      expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
        snippet: {
          title: "Titulo editado",
          description: "Descricao editada\n\nCapítulos\n00:00 Inicio\n00:30 Ideia principal",
          tags: ["PROCESSO", "REAL", "BASTIDOR"]
        },
        status: {
          privacyStatus: "unlisted"
        }
      });
      expect(fetchMock.mock.calls[1][1].headers).toMatchObject({
        "x-upload-content-length": String(Buffer.byteLength("final export"))
      });
      expect(fetchMock.mock.calls[3][0].toString()).toBe(
        "https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=video-123"
      );
    });
  });

  it("publishes YouTube videos with the refresh token saved for the tenant workspace", async () => {
    await withTempDir("ai-editor-route-youtube-publish-tenant-token-", async (dir) => {
      vi.stubEnv("YOUTUBE_CLIENT_ID", "client-id");
      vi.stubEnv("YOUTUBE_CLIENT_SECRET", "client-secret");

      const projectId = "project_123";
      const workspaceRoot = path.join(dir, "workspaces", "workspace_abc");
      const projectRoot = path.join(workspaceRoot, "projects", projectId);
      const rendersRoot = path.join(projectRoot, "renders");
      const packageRoot = path.join(projectRoot, "download", "youtube-package");
      await mkdir(rendersRoot, { recursive: true });
      await mkdir(packageRoot, { recursive: true });
      await mkdir(path.join(workspaceRoot, "integrations"), { recursive: true });
      await writeFile(path.join(workspaceRoot, "integrations", "youtube-oauth.json"), JSON.stringify({
        refreshToken: "refresh-workspace"
      }));
      await writeFile(path.join(rendersRoot, "youtube-edit.mp4"), Buffer.from("final export"));
      await writeFile(path.join(packageRoot, "title.txt"), "Titulo gerado");
      await writeFile(path.join(packageRoot, "description.txt"), "Descricao gerada");
      await writeFile(path.join(projectRoot, "edit-plan.json"), JSON.stringify({
        id: "plan_project_123",
        projectId,
        version: 1,
        source: {
          path: "/tmp/source.mov",
          durationSec: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true
        },
        segments: [],
        removed: [],
        sections: [],
        captions: [],
        captionSettings: { enabled: false },
        overlays: [],
        color: { presetId: "neutral", label: "Neutral" },
        audio: { music: null, voiceTargetLufs: -16 },
        qa: { status: "passed", warnings: [] },
        createdAt: "2026-05-05T00:00:00.000Z"
      }));
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access-123" }), { status: 200 }))
        .mockResolvedValueOnce(new Response(null, {
          status: 200,
          headers: { location: "https://upload.youtube.test/session" }
        }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: "video-123" }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      const app = createApp({
        workspaceRoot: dir,
        jobs: createJobStore(),
        runJobs: false,
        requireTenantAccess: tenantAccess("workspace_abc")
      });

      const response = await request(app)
        .post(`/api/projects/${projectId}/youtube-publish`)
        .set("Authorization", "Bearer clerk-token")
        .send({
          title: "Titulo editado",
          description: "Descricao editada",
          privacyStatus: "unlisted"
        });

      expect(response.status).toBe(200);
      const refreshBody = fetchMock.mock.calls[0][1].body as URLSearchParams;
      expect(refreshBody.get("refresh_token")).toBe("refresh-workspace");
    });
  });

  it("does not return a media URL for output outside the renders directory", async () => {
    await withTempDir("ai-editor-route-", async (dir) => {
      const jobs = createJobStore();
      const projectId = "project_123";
      const job = jobs.create({
        projectId,
        sourcePath: path.join(dir, projectId, "uploads", "source.mp4")
      });
      jobs.update(job.id, { outputPath: path.join(dir, projectId, "uploads", "source.mp4") });
      const app = createApp({ workspaceRoot: dir, jobs, runJobs: false });

      const response = await request(app).get(`/api/projects/jobs/${job.id}`);

      expect(response.status).toBe(200);
      expect(response.body.job.outputUrl).toBeNull();
    });
  });
});
