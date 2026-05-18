import { copyFile, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import multer from "multer";
import { z } from "zod";
import { captionSettingsSchema } from "../../shared/caption-settings";
import { CAPTION_STYLE_IDS, DEFAULT_CAPTION_STYLE_ID } from "../../shared/caption-styles";
import { cutPresetSchema } from "../../shared/cut-presets";
import {
  editPlanSchema,
  sectionAudioTreatmentSchema,
  sectionCaptionTreatmentSchema,
  sectionImageTreatmentSchema,
  sectionMotionSlotSchema,
  timelineSectionTypeSchema,
  type EditPlan,
  type TimelineSection
} from "../../shared/edit-plan";
import { exportSettingsSchema } from "../../shared/export-settings";
import { manualRenderRequestSchema } from "../../shared/manual-edits";
import { listProjectLibrary } from "../../shared/project-library";
import { createProjectWorkspace } from "../workspace";
import type { JobStore } from "../jobs/job-store";
import { runCaptionJob, type RunCaptionJobInput } from "../jobs/run-caption-job";
import { runExportJob, type RunExportJobInput } from "../jobs/run-export-job";
import { runManualRenderJob, type RunManualRenderJobInput } from "../jobs/run-manual-render-job";
import { runMotionJob, type RunMotionJobInput } from "../jobs/run-motion-job";
import { runProjectJob, type RunProjectJobInput } from "../jobs/run-project-job";
import { runYoutubePackageJob, type RunYoutubePackageJobInput } from "../jobs/run-youtube-package-job";
import type { ProjectJob } from "../jobs/job-store";
import { assessPublishReadiness } from "../qa/publish-readiness";
import { isYoutubePackageAssetName, readYoutubePackageSummary } from "../youtube/youtube-package-summary";

const DEFAULT_UPLOAD_FILE_SIZE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;
const NORMAL_EXTENSION_PATTERN = /^\.[A-Za-z0-9]{1,10}$/;
const PROJECT_ID_PATTERN = /^project_[A-Za-z0-9_-]+$/;
const captionRequestSchema = z.object({
  captionStyleId: z.enum(CAPTION_STYLE_IDS).default(DEFAULT_CAPTION_STYLE_ID)
}).default({ captionStyleId: DEFAULT_CAPTION_STYLE_ID });
const captionPatchSchema = z
  .object({
    text: z.string().optional(),
    styleId: z.enum(CAPTION_STYLE_IDS).optional()
  })
  .refine((patch) => patch.text !== undefined || patch.styleId !== undefined, {
    message: "caption patch must include text or styleId"
  });
const captionSettingsPatchSchema = captionSettingsSchema.partial();
const sectionMotionTreatmentPatchSchema = z.object({
  enabled: z.boolean().optional(),
  slots: z.array(sectionMotionSlotSchema).optional()
});
const updateSectionRequestSchema = z.object({
  type: timelineSectionTypeSchema.optional(),
  startSec: z.number().finite().nonnegative().optional(),
  endSec: z.number().finite().nonnegative().optional(),
  sourceStartSec: z.number().finite().nonnegative().optional(),
  sourceEndSec: z.number().finite().nonnegative().optional(),
  label: z.string().min(1).optional(),
  confidence: z.number().finite().min(0).max(1).optional(),
  warnings: z.array(z.string()).optional(),
  treatments: z.object({
    captions: sectionCaptionTreatmentSchema.optional(),
    audio: sectionAudioTreatmentSchema.optional(),
    image: sectionImageTreatmentSchema.optional(),
    motion: sectionMotionTreatmentPatchSchema.optional()
  }).optional()
}).strict();

export type ProjectRouteOptions = {
  workspaceRoot: string;
  jobs: JobStore;
  runJobs: boolean;
  runProjectJob?: (input: RunProjectJobInput) => Promise<void>;
  runManualRenderJob?: (input: RunManualRenderJobInput) => Promise<void>;
  runCaptionJob?: (input: RunCaptionJobInput) => Promise<void>;
  runMotionJob?: (input: RunMotionJobInput) => Promise<void>;
  runExportJob?: (input: RunExportJobInput) => Promise<void>;
  runYoutubePackageJob?: (input: RunYoutubePackageJobInput) => Promise<void>;
  uploadFileSizeLimitBytes?: number;
};

export function createProjectRouter(options: ProjectRouteOptions) {
  const router = express.Router();
  const upload = multer({
    dest: path.join(tmpdir(), "ai-editor-uploads"),
    limits: {
      fileSize: options.uploadFileSizeLimitBytes ?? DEFAULT_UPLOAD_FILE_SIZE_LIMIT_BYTES
    }
  });
  const uploadVideo = upload.single("video");
  const uploadMusic = upload.single("music");
  const projectJobRunner = options.runProjectJob ?? runProjectJob;
  const manualRenderJobRunner = options.runManualRenderJob ?? runManualRenderJob;
  const captionJobRunner = options.runCaptionJob ?? runCaptionJob;
  const motionJobRunner = options.runMotionJob ?? runMotionJob;
  const exportJobRunner = options.runExportJob ?? runExportJob;
  const youtubePackageJobRunner = options.runYoutubePackageJob ?? runYoutubePackageJob;

  router.get("/", async (_req, res, next) => {
    try {
      const projects = await listProjectLibrary(options.workspaceRoot);
      res.json({ projects });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", (req, res, next) => {
    uploadVideo(req, res, (error) => {
      if (error instanceof multer.MulterError && error.code === "LIMIT_UNEXPECTED_FILE") {
        res.status(400).json({ error: "Missing multipart field: video" });
        return;
      }
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "Uploaded video exceeds the configured size limit" });
        return;
      }
      next(error);
    });
  }, async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Missing multipart field: video" });
        return;
      }
      const presetResult = cutPresetSchema.default("normal").safeParse(req.body.cutPreset);
      if (!presetResult.success) {
        res.status(400).json({ error: "Invalid cut preset" });
        return;
      }

      const projectId = `project_${crypto.randomUUID()}`;
      const workspace = await createProjectWorkspace(options.workspaceRoot, projectId);
      const safeExt = getSafeSourceExtension(req.file.originalname);
      const sourcePath = path.join(workspace.uploads, `source${safeExt}`);

      try {
        await copyFile(req.file.path, sourcePath);
      } finally {
        await unlink(req.file.path).catch(() => undefined);
      }

      const job = options.jobs.create({ projectId, sourcePath });

      if (options.runJobs) {
        void Promise.resolve().then(() => projectJobRunner({
          jobId: job.id,
          workspace,
          sourcePath,
          jobs: options.jobs,
          cutPresetId: presetResult.data
        })).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Unknown error";
          options.jobs.update(job.id, {
            status: "failed",
            stage: "failed",
            message: `Project job failed: ${message}`,
            error: message
          });
        });
      }

      res.status(201).json({ projectId, job: serializeJob(job, options.workspaceRoot) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:projectId/plan", async (req, res, next) => {
    try {
      const { projectId } = req.params;
      if (!PROJECT_ID_PATTERN.test(projectId)) {
        res.status(404).json({ error: "Plan not found" });
        return;
      }

      const planPath = path.join(options.workspaceRoot, projectId, "edit-plan.json");
      const plan = editPlanSchema.parse(JSON.parse(await readFile(planPath, "utf8")));
      res.json({ plan: serializePlan(plan) });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        res.status(404).json({ error: "Plan not found" });
        return;
      }
      next(error);
    }
  });

  router.delete("/:projectId", async (req, res, next) => {
    try {
      const { projectId } = req.params;
      if (!PROJECT_ID_PATTERN.test(projectId)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      await rm(path.join(options.workspaceRoot, projectId), { recursive: true, force: true });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post("/:projectId/music", (req, res, next) => {
    uploadMusic(req, res, (error) => {
      if (error) {
        next(error);
        return;
      }
      next();
    });
  }, async (req, res, next) => {
    try {
      const { projectId } = req.params;
      if (!PROJECT_ID_PATTERN.test(projectId) || !req.file) {
        res.status(400).json({ error: "Missing music file" });
        return;
      }
      const workspace = await createProjectWorkspace(options.workspaceRoot, projectId);
      const safeExt = getSafeSourceExtension(req.file.originalname);
      const musicPath = path.join(workspace.uploads, `music${safeExt}`);
      try {
        await copyFile(req.file.path, musicPath);
      } finally {
        await unlink(req.file.path).catch(() => undefined);
      }
      res.status(201).json({ musicPath });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:projectId/export", async (req, res, next) => {
    try {
      const settingsResult = exportSettingsSchema.safeParse(req.body ?? {});
      if (!settingsResult.success) {
        res.status(400).json({ error: "Invalid export settings" });
        return;
      }

      const { projectId } = req.params;
      if (!PROJECT_ID_PATTERN.test(projectId)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const workspace = await createProjectWorkspace(options.workspaceRoot, projectId);
      const plan = editPlanSchema.parse(JSON.parse(await readFile(workspace.planPath, "utf8")));
      const job = options.jobs.create({ projectId, sourcePath: plan.source.path });
      const queuedJob = options.jobs.update(job.id, {
        stage: "export_queued",
        message: "Export accepted",
        planPath: workspace.planPath
      }) ?? job;

      if (options.runJobs) {
        void Promise.resolve().then(() => exportJobRunner({
          jobId: queuedJob.id,
          workspace,
          jobs: options.jobs,
          settings: settingsResult.data
        })).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Unknown error";
          options.jobs.update(queuedJob.id, {
            status: "failed",
            stage: "failed",
            message: `Export failed: ${message}`,
            error: message
          });
        });
      }

      res.status(202).json({ job: serializeJob(queuedJob, options.workspaceRoot) });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      next(error);
    }
  });

  router.post("/:projectId/render", async (req, res, next) => {
    try {
      const { projectId } = req.params;
      if (!PROJECT_ID_PATTERN.test(projectId)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const renderRequest = manualRenderRequestSchema.safeParse(req.body);
      if (!renderRequest.success) {
        res.status(400).json({ error: "Invalid render request" });
        return;
      }

      const workspace = await createProjectWorkspace(options.workspaceRoot, projectId);
      const plan = editPlanSchema.parse(JSON.parse(await readFile(workspace.planPath, "utf8")));
      const knownCutIds = new Set(plan.removed.map((cut) => cut.id));
      const activeCutIds = renderRequest.data.activeCuts?.map((cut) => cut.id) ?? renderRequest.data.activeCutIds ?? [];
      if (activeCutIds.some((cutId) => !knownCutIds.has(cutId))) {
        res.status(400).json({ error: "Unknown cut ID" });
        return;
      }

      const job = options.jobs.create({ projectId, sourcePath: plan.source.path });
      if (options.runJobs) {
        void Promise.resolve().then(() => manualRenderJobRunner({
          jobId: job.id,
          workspace,
          jobs: options.jobs,
          activeCutIds,
          activeCuts: renderRequest.data.activeCuts,
          colorPresetId: renderRequest.data.colorPresetId,
          colorAdjustments: renderRequest.data.colorAdjustments,
          flipHorizontal: renderRequest.data.flipHorizontal,
          musicPath: renderRequest.data.musicPath ?? null,
          audioCleanup: renderRequest.data.audioCleanup,
          audioDucking: renderRequest.data.audioDucking,
          preview: renderRequest.data.preview
        })).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Unknown error";
          options.jobs.update(job.id, {
            status: "failed",
            stage: "failed",
            message: `Manual render failed: ${message}`,
            error: message
          });
        });
      }

      res.status(202).json({ job: serializeJob(job, options.workspaceRoot) });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      next(error);
    }
  });

  router.post("/:projectId/captions", async (req, res, next) => {
    try {
      const { projectId } = req.params;
      if (!PROJECT_ID_PATTERN.test(projectId)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      const bodyResult = captionRequestSchema.safeParse(req.body ?? {});
      if (!bodyResult.success) {
        res.status(400).json({ error: "Invalid caption style" });
        return;
      }
      const workspace = await createProjectWorkspace(options.workspaceRoot, projectId);
      const plan = editPlanSchema.parse(JSON.parse(await readFile(workspace.planPath, "utf8")));
      const job = options.jobs.create({ projectId, sourcePath: plan.source.path });
      if (options.runJobs) {
        void Promise.resolve().then(() => captionJobRunner({
          jobId: job.id,
          workspace,
          jobs: options.jobs,
          captionStyleId: bodyResult.data.captionStyleId
        })).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Unknown error";
          options.jobs.update(job.id, {
            status: "failed",
            stage: "failed",
            message: `Whisper captions failed: ${message}`,
            error: message
          });
        });
      }
      res.status(202).json({ job: serializeJob(job, options.workspaceRoot) });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      next(error);
    }
  });

  router.post("/:projectId/motion", async (req, res, next) => {
    try {
      const { projectId } = req.params;
      if (!PROJECT_ID_PATTERN.test(projectId)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      const workspace = await createProjectWorkspace(options.workspaceRoot, projectId);
      const plan = editPlanSchema.parse(JSON.parse(await readFile(workspace.planPath, "utf8")));
      const job = options.jobs.create({ projectId, sourcePath: plan.source.path });
      const queuedJob = options.jobs.update(job.id, {
        stage: "motion_queued",
        message: "AI motion accepted",
        planPath: workspace.planPath
      }) ?? job;

      if (options.runJobs) {
        void Promise.resolve().then(() => motionJobRunner({
          jobId: queuedJob.id,
          workspace,
          jobs: options.jobs
        })).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Unknown error";
          options.jobs.update(queuedJob.id, {
            status: "failed",
            stage: "failed",
            message: `AI motion failed: ${message}`,
            error: message
          });
        });
      }
      res.status(202).json({ job: serializeJob(queuedJob, options.workspaceRoot) });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      next(error);
    }
  });

  router.post("/:projectId/youtube-package", async (req, res, next) => {
    try {
      const { projectId } = req.params;
      if (!PROJECT_ID_PATTERN.test(projectId)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      const workspace = await createProjectWorkspace(options.workspaceRoot, projectId);
      const plan = editPlanSchema.parse(JSON.parse(await readFile(workspace.planPath, "utf8")));
      const job = options.jobs.create({ projectId, sourcePath: plan.source.path });
      const queuedJob = options.jobs.update(job.id, {
        stage: "youtube_package_queued",
        message: "YouTube package accepted",
        planPath: workspace.planPath
      }) ?? job;

      if (options.runJobs) {
        void Promise.resolve().then(() => youtubePackageJobRunner({
          jobId: queuedJob.id,
          workspace,
          jobs: options.jobs
        })).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Unknown error";
          options.jobs.update(queuedJob.id, {
            status: "failed",
            stage: "failed",
            message: `YouTube package failed: ${message}`,
            error: message
          });
        });
      }
      res.status(202).json({ job: serializeJob(queuedJob, options.workspaceRoot) });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      next(error);
    }
  });

  router.get("/:projectId/youtube-package/summary", async (req, res, next) => {
    try {
      const { projectId } = req.params;
      if (!PROJECT_ID_PATTERN.test(projectId)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const workspace = await createProjectWorkspace(options.workspaceRoot, projectId);
      const summary = await readYoutubePackageSummary(workspace.root, projectId);
      res.json({ summary });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:projectId/youtube-package/assets/:assetName", async (req, res, next) => {
    try {
      const { projectId, assetName } = req.params;
      if (!PROJECT_ID_PATTERN.test(projectId) || !isYoutubePackageAssetName(assetName)) {
        res.status(404).json({ error: "Asset not found" });
        return;
      }

      const workspace = await createProjectWorkspace(options.workspaceRoot, projectId);
      const summary = await readYoutubePackageSummary(workspace.root, projectId);
      if (!summary.assets.some((asset) => asset.name === assetName)) {
        res.status(404).json({ error: "Asset not found" });
        return;
      }

      const packageDir = path.join(workspace.root, "download", "youtube-package");
      res.sendFile(path.join(packageDir, assetName), (error) => {
        if (error && !res.headersSent) {
          next(error);
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:projectId/captions/settings", async (req, res, next) => {
    try {
      const { projectId } = req.params;
      if (!PROJECT_ID_PATTERN.test(projectId)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      const patchResult = captionSettingsPatchSchema.safeParse(req.body ?? {});
      if (!patchResult.success) {
        res.status(400).json({ error: "Invalid caption settings" });
        return;
      }

      const workspace = await createProjectWorkspace(options.workspaceRoot, projectId);
      const plan = editPlanSchema.parse(JSON.parse(await readFile(workspace.planPath, "utf8")));
      const nextSettings = captionSettingsSchema.parse({ ...plan.captionSettings, ...patchResult.data });
      const nextPlan = editPlanSchema.parse({ ...plan, captionSettings: nextSettings });
      await writeFile(workspace.planPath, JSON.stringify(nextPlan, null, 2));
      res.json({ plan: serializePlan(nextPlan) });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      next(error);
    }
  });

  router.patch("/:projectId/captions/:captionId", async (req, res, next) => {
    try {
      const { projectId, captionId } = req.params;
      if (!PROJECT_ID_PATTERN.test(projectId)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      const patchResult = captionPatchSchema.safeParse(req.body ?? {});
      if (!patchResult.success) {
        res.status(400).json({ error: "Invalid caption update" });
        return;
      }

      const workspace = await createProjectWorkspace(options.workspaceRoot, projectId);
      const plan = editPlanSchema.parse(JSON.parse(await readFile(workspace.planPath, "utf8")));
      let found = false;
      const captions = plan.captions.map((caption) => {
        if (caption.id !== captionId) return caption;
        found = true;
        return {
          ...caption,
          text: patchResult.data.text ?? caption.text,
          styleId: patchResult.data.styleId ?? caption.styleId
        };
      });
      if (!found) {
        res.status(404).json({ error: "Caption not found" });
        return;
      }

      const nextPlan = editPlanSchema.parse({ ...plan, captions });
      await writeFile(workspace.planPath, JSON.stringify(nextPlan, null, 2));
      res.json({ plan: serializePlan(nextPlan) });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      next(error);
    }
  });

  router.patch("/:projectId/sections/:sectionId", async (req, res, next) => {
    try {
      const { projectId, sectionId } = req.params;
      if (!PROJECT_ID_PATTERN.test(projectId)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      const patchResult = updateSectionRequestSchema.safeParse(req.body ?? {});
      if (!patchResult.success) {
        res.status(400).json({ error: "Invalid section update" });
        return;
      }

      const workspace = await createProjectWorkspace(options.workspaceRoot, projectId);
      const plan = editPlanSchema.parse(JSON.parse(await readFile(workspace.planPath, "utf8")));
      let found = false;
      const sections = plan.sections.map((section) => {
        if (section.id !== sectionId) return section;
        found = true;
        return mergeSectionPatch(section, patchResult.data);
      });
      if (!found) {
        res.status(404).json({ error: "Section not found" });
        return;
      }

      const nextPlan = editPlanSchema.parse({ ...plan, sections });
      await writeFile(workspace.planPath, JSON.stringify(nextPlan, null, 2));
      res.json({ plan: serializePlan(nextPlan) });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      next(error);
    }
  });

  router.get("/:projectId/publish-readiness", async (req, res, next) => {
    try {
      const { projectId } = req.params;
      if (!PROJECT_ID_PATTERN.test(projectId)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const workspace = await createProjectWorkspace(options.workspaceRoot, projectId);
      const plan = editPlanSchema.parse(JSON.parse(await readFile(workspace.planPath, "utf8")));
      const publishReadiness = assessPublishReadiness(plan, {
        hasLatestExport: await hasFinalExport(workspace.renders),
        sourceColorTransfer: null
      });
      const nextPlan = editPlanSchema.parse({ ...plan, publishReadiness });
      await writeFile(workspace.planPath, JSON.stringify(nextPlan, null, 2));
      res.json({ publishReadiness });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      next(error);
    }
  });

  router.get("/jobs/:jobId", (req, res) => {
    const job = options.jobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json({ job: serializeJob(job, options.workspaceRoot) });
  });

  return router;
}

function serializePlan(plan: EditPlan) {
  return {
    projectId: plan.projectId,
    sourceUrl: `/media/${encodeURIComponent(plan.projectId)}/source`,
    captionsVttUrl: plan.captions.length > 0 ? `/media/${encodeURIComponent(plan.projectId)}/captions.vtt` : null,
    source: {
      durationSec: plan.source.durationSec,
      width: plan.source.width,
      height: plan.source.height,
      fps: plan.source.fps,
      hasAudio: plan.source.hasAudio
    },
    segments: plan.segments,
    removed: plan.removed,
    sections: plan.sections,
    captions: plan.captions,
    captionSettings: plan.captionSettings,
    color: plan.color,
    video: plan.video,
    audio: plan.audio,
    qa: plan.qa,
    publishReadiness: plan.publishReadiness
  };
}

function mergeSectionPatch(section: TimelineSection, patch: z.infer<typeof updateSectionRequestSchema>): TimelineSection {
  const treatments: TimelineSection["treatments"] = patch.treatments
    ? {
        ...section.treatments,
        ...patch.treatments,
        captions: patch.treatments.captions
          ? { ...section.treatments.captions, ...patch.treatments.captions }
          : section.treatments.captions,
        audio: patch.treatments.audio
          ? { ...section.treatments.audio, ...patch.treatments.audio }
          : section.treatments.audio,
        image: patch.treatments.image
          ? { ...section.treatments.image, ...patch.treatments.image }
          : section.treatments.image,
        motion: patch.treatments.motion
          ? { ...(section.treatments.motion ?? { enabled: false, slots: [] }), ...patch.treatments.motion }
          : section.treatments.motion
      }
    : section.treatments;

  return { ...section, ...patch, treatments };
}

async function hasFinalExport(rendersPath: string) {
  const entries = await readdir(rendersPath, { withFileTypes: true }).catch(() => []);
  return entries.some((entry) =>
    entry.isFile() &&
    entry.name.toLowerCase().endsWith(".mp4") &&
    entry.name !== "rough-cut.mp4"
  );
}

function serializeJob(job: ProjectJob, workspaceRoot: string) {
  return {
    ...job,
    outputUrl: getRenderMediaUrl(job, workspaceRoot)
  };
}

function getRenderMediaUrl(job: ProjectJob, workspaceRoot: string) {
  if (job.status === "failed") return null;
  if (!job.outputPath) return null;
  const workspaceRootResolved = path.resolve(workspaceRoot);
  const rendersRoot = path.resolve(workspaceRootResolved, job.projectId, "renders");
  const outputPathResolved = path.resolve(job.outputPath);
  const relativeToWorkspace = path.relative(workspaceRootResolved, outputPathResolved);
  const relativeToRenders = path.relative(rendersRoot, outputPathResolved);

  if (
    relativeToWorkspace.startsWith("..") ||
    path.isAbsolute(relativeToWorkspace) ||
    relativeToRenders.startsWith("..") ||
    path.isAbsolute(relativeToRenders) ||
    relativeToRenders === ""
  ) {
    return null;
  }

  const filename = path.basename(outputPathResolved);
  return `/media/${encodeURIComponent(job.projectId)}/${encodeURIComponent(filename)}`;
}

function getSafeSourceExtension(originalName: string) {
  const extension = path.extname(path.basename(originalName));
  return NORMAL_EXTENSION_PATTERN.test(extension) ? extension.toLowerCase() : ".mp4";
}
