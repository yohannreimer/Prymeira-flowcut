import express from "express";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { getConfig } from "./config";
import { createJobStore, type JobStore } from "./jobs/job-store";
import type { RunCaptionJobInput } from "./jobs/run-caption-job";
import type { RunExportJobInput } from "./jobs/run-export-job";
import type { RunManualRenderJobInput } from "./jobs/run-manual-render-job";
import type { RunMotionJobInput } from "./jobs/run-motion-job";
import type { RunProjectJobInput } from "./jobs/run-project-job";
import type { RunYoutubePackageJobInput } from "./jobs/run-youtube-package-job";
import { InMemoryUploadSessionRepository } from "./media-factory-saas/upload-sessions";
import type { PrymeiraTenantContext } from "./prymeira/tenant";
import {
  createMediaFactorySaasRouter,
  type MediaFactoryObjectStorage
} from "./routes/media-factory-saas";
import { createProjectRouter } from "./routes/projects";

const PROJECT_ID_PATTERN = /^project_[A-Za-z0-9_-]+$/;

export type MediaFactorySaasOptions = {
  enabled: boolean;
  accountApiUrl: string;
  storage: MediaFactoryObjectStorage;
  fetch?: typeof fetch;
};

export type CreateAppOptions = {
  workspaceRoot?: string;
  jobs?: JobStore;
  runJobs?: boolean;
  runProjectJob?: (input: RunProjectJobInput) => Promise<void>;
  runManualRenderJob?: (input: RunManualRenderJobInput) => Promise<void>;
  runCaptionJob?: (input: RunCaptionJobInput) => Promise<void>;
  runMotionJob?: (input: RunMotionJobInput) => Promise<void>;
  runExportJob?: (input: RunExportJobInput) => Promise<void>;
  runYoutubePackageJob?: (input: RunYoutubePackageJobInput) => Promise<void>;
  uploadFileSizeLimitBytes?: number;
  requireTenantAccess?: (authorization: string | undefined) => Promise<PrymeiraTenantContext>;
  mediaFactorySaas?: MediaFactorySaasOptions;
};

export function createApp(options: CreateAppOptions = {}) {
  const config = getConfig();
  const workspaceRoot = options.workspaceRoot ?? config.workspaceRoot;
  const uploadFileSizeLimitBytes = options.uploadFileSizeLimitBytes ?? config.uploadFileSizeLimitBytes;
  const jobs = options.jobs ?? createJobStore();
  const app = express();

  app.use(express.json());
  app.get("/media/:projectId/:filename", (req, res) => {
    const { projectId, filename } = req.params;
    if (!PROJECT_ID_PATTERN.test(projectId) || filename !== path.basename(filename)) {
      res.status(404).json({ error: "Media not found" });
      return;
    }

    if (filename === "source") {
      const uploadsRoot = path.resolve(workspaceRoot, projectId, "uploads");
      void readdir(uploadsRoot)
        .then((files) => {
          const sourceName = files.find((file) => file.startsWith("source."));
          if (!sourceName) {
            res.status(404).json({ error: "Media not found" });
            return;
          }
          setMediaNoCacheHeaders(res);
          res.sendFile(path.resolve(uploadsRoot, sourceName));
        })
        .catch(() => {
          if (!res.headersSent) res.status(404).json({ error: "Media not found" });
        });
      return;
    }

    const rendersRoot = path.resolve(workspaceRoot, projectId, "renders");
    const mediaPath = path.resolve(rendersRoot, filename);
    const relativeToRenders = path.relative(rendersRoot, mediaPath);
    if (relativeToRenders.startsWith("..") || path.isAbsolute(relativeToRenders)) {
      res.status(404).json({ error: "Media not found" });
      return;
    }

    setMediaNoCacheHeaders(res);
    res.sendFile(mediaPath, (error) => {
      if (error && !res.headersSent) {
        res.status(404).json({ error: "Media not found" });
      }
    });
  });
  app.use("/api/projects", createProjectRouter({
    workspaceRoot,
    jobs,
    runJobs: options.runJobs ?? true,
    runProjectJob: options.runProjectJob,
    runManualRenderJob: options.runManualRenderJob,
    runCaptionJob: options.runCaptionJob,
    runMotionJob: options.runMotionJob,
    runExportJob: options.runExportJob,
    runYoutubePackageJob: options.runYoutubePackageJob,
    uploadFileSizeLimitBytes,
    requireTenantAccess: options.requireTenantAccess
  }));

  if (options.mediaFactorySaas?.enabled) {
    app.use("/api/mediafactory", createMediaFactorySaasRouter({
      accountApiUrl: options.mediaFactorySaas.accountApiUrl,
      repo: new InMemoryUploadSessionRepository(),
      storage: options.mediaFactorySaas.storage,
      fetch: options.mediaFactorySaas.fetch
    }));
  }

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/config", (_req, res) => {
    res.json({ uploadFileSizeLimitBytes });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  });

  return app;
}

function setMediaNoCacheHeaders(res: express.Response) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}
