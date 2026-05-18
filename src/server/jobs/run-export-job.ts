import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ExportSettings } from "../../shared/export-settings";
import { editPlanSchema } from "../../shared/edit-plan";
import { createCaptionOverlayImages, type CaptionOverlayImage } from "../captions/overlay-images";
import { getConfig } from "../config";
import { runProcess } from "../media/process";
import type { ProcessOptions, ProcessResult } from "../media/process";
import { createMotionRenderPlan } from "../motion/motion-plan";
import { renderRemotionMotion } from "../render/render-remotion-motion";
import { renderRoughCut } from "../render/render-rough-cut";
import type { ProjectWorkspace } from "../workspace";
import type { JobStore } from "./job-store";

export type ExportProcessRunner = (
  command: string,
  args: string[],
  options?: ProcessOptions
) => Promise<ProcessResult>;

export type RunExportJobInput = {
  jobId: string;
  workspace: ProjectWorkspace;
  jobs: JobStore;
  settings: ExportSettings;
};

export type RunExportJobDeps = {
  renderRemotionMotion?: typeof renderRemotionMotion;
};

const EXPORT_TIMEOUT_MS = 60 * 60 * 1000;

export async function runExportJob(
  input: RunExportJobInput,
  processRunner: ExportProcessRunner = runProcess,
  deps: RunExportJobDeps = {}
) {
  const motionRenderer = deps.renderRemotionMotion ?? renderRemotionMotion;
  let outputPath: string | null = null;
  try {
    input.jobs.update(input.jobId, {
      status: "running",
      stage: "export_prepare",
      message: "Preparing export"
    });

    const storedPlan = editPlanSchema.parse(JSON.parse(await readFile(input.workspace.planPath, "utf8")));
    const plan = input.settings.captionSettings
      ? editPlanSchema.parse({ ...storedPlan, captionSettings: input.settings.captionSettings })
      : storedPlan;
    await mkdir(input.workspace.renders, { recursive: true });
    outputPath = path.join(input.workspace.renders, normalizeOutputFileName(input.settings.fileName));
    if (input.settings.renderMode === "fast_cuts") {
      input.jobs.update(input.jobId, {
        status: "running",
        stage: "export_fast_cut",
        message: "Rendering fast cuts-only export",
        planPath: input.workspace.planPath,
        outputPath
      });
      await renderRoughCut(plan, input.workspace, processRunner, {
        outputFileName: path.basename(outputPath),
        commandLogFileName: `${path.basename(outputPath, path.extname(outputPath))}-command.json`,
        audioCleanup: input.settings.audioCleanup,
        audioDucking: input.settings.audioDucking,
        videoPreset: input.settings.quality === "maxima" ? "slow" : "veryfast",
        videoCrf: input.settings.quality === "maxima" ? "12" : "18"
      });

      input.jobs.update(input.jobId, {
        status: "passed",
        stage: "complete",
        message: "Fast cuts export is ready",
        outputPath,
        planPath: input.workspace.planPath
      });
      return;
    }

    input.jobs.update(input.jobId, {
      status: "running",
      stage: "export_full_render",
      message: "Rendering complete edit for export",
      planPath: input.workspace.planPath
    });
    await renderRoughCut(plan, input.workspace, processRunner, {
      audioCleanup: input.settings.audioCleanup,
      audioDucking: input.settings.audioDucking
    });
    const roughCutPath = await pickExportSource(input.workspace, plan.source.path);
    const motionPlan = createMotionRenderPlan(plan);
    const sourcePath = motionPlan.events.length > 0
      ? await renderMotionStage({
          jobId: input.jobId,
          jobs: input.jobs,
          workspace: input.workspace,
          sourcePath: roughCutPath,
          plan,
          motionPlan,
          canvasSize: getExportCanvasSize(input.settings, plan.source),
          renderQuality: input.settings.quality,
          motionRenderer,
          processRunner
        })
      : roughCutPath;
    const captionOverlays = await createCaptionOverlayImages(
      plan,
      input.workspace.renders,
      getExportCanvasSize(input.settings, plan.source)
    );

    input.jobs.update(input.jobId, {
      status: "running",
      stage: "export_render",
      message: "Rendering final export",
      planPath: input.workspace.planPath,
      outputPath
    });

    const result = await processRunner(
      getConfig().ffmpegPath,
      buildExportArgs(sourcePath, outputPath, { ...input.settings, audioCleanup: false }, plan.source, captionOverlays, getRenderedDurationSec(plan)),
      {
        timeoutMs: EXPORT_TIMEOUT_MS
      }
    );
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || "FFmpeg export failed");
    }

    input.jobs.update(input.jobId, {
      status: "passed",
      stage: "complete",
      message: "Export is ready",
      outputPath,
      planPath: input.workspace.planPath
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown export error";
    input.jobs.update(input.jobId, {
      status: "failed",
      stage: "failed",
      message: "Export failed",
      outputPath,
      planPath: input.workspace.planPath,
      error: message
    });
  }
}

function buildExportArgs(
  inputPath: string,
  outputPath: string,
  settings: ExportSettings,
  source: { width: number; height: number },
  captionOverlays: CaptionOverlayImage[] = [],
  durationSec: number | null = null
) {
  const args = ["-y", "-i", inputPath];
  captionOverlays.forEach((overlay) => {
    args.push("-loop", "1", "-i", overlay.path);
  });
  if (captionOverlays.length > 0) {
    args.push("-filter_complex", getExportFilterComplex(settings, source, captionOverlays), "-map", "[outv]", "-map", "0:a?");
  } else {
    const filter = getExportVideoFilter(settings, source);
    if (filter) {
      args.push("-vf", filter);
    }
  }
  if (settings.audioCleanup) {
    args.push("-af", "afftdn,loudnorm=I=-16:TP=-1.5:LRA=11,acompressor=threshold=-18dB:ratio=2:attack=12:release=180");
  }
  args.push(
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-preset",
    settings.quality === "maxima" ? "slow" : "veryfast",
    "-crf",
    settings.quality === "maxima" ? "18" : "23",
  );
  args.push(...getOutputColorArgs(settings));
  if (durationSec !== null) {
    args.push("-t", String(roundTime(durationSec)));
  }
  args.push(
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    outputPath
  );
  return args;
}

async function renderMotionStage(input: {
  jobId: string;
  jobs: JobStore;
  workspace: ProjectWorkspace;
  sourcePath: string;
  plan: ReturnType<typeof editPlanSchema.parse>;
  motionPlan: ReturnType<typeof createMotionRenderPlan>;
  canvasSize: { width: number; height: number };
  renderQuality: ExportSettings["quality"];
  motionRenderer: typeof renderRemotionMotion;
  processRunner: ExportProcessRunner;
}) {
  let lastReportedPercent = -1;
  input.jobs.update(input.jobId, {
    status: "running",
    stage: "export_motion",
    message: `Rendering ${input.motionPlan.events.length} Remotion motions`,
    planPath: input.workspace.planPath
  });
  return input.motionRenderer({
    sourcePath: input.sourcePath,
    plan: input.plan,
    motionPlan: input.motionPlan,
    workspace: input.workspace,
    canvasSize: input.canvasSize,
    renderQuality: input.renderQuality,
    onProgress: (progress) => {
      const percent = Math.max(0, Math.min(99, Math.floor(progress.progress * 100)));
      if (percent < lastReportedPercent + 3 && percent !== 99) return;
      lastReportedPercent = percent;
      input.jobs.update(input.jobId, {
        status: "running",
        stage: "export_motion",
        message: `Rendering ${input.motionPlan.events.length} Remotion motions - ${percent}%`,
        planPath: input.workspace.planPath
      });
    }
  }, input.processRunner);
}

function getExportVideoFilter(settings: ExportSettings, source: { width: number; height: number }) {
  const filters: string[] = [];
  const target = getTargetSize(settings, source);
  if (target) {
    filters.push(`scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease`);
    filters.push(`pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2:color=black`);
  }
  if (settings.sdrMode === "convert_to_sdr") {
    filters.push("colorspace=iall=bt2020:all=bt709:format=yuv420p");
  } else if (filters.length > 0) {
    filters.push("format=yuv420p");
  }
  return filters.length > 0 ? filters.join(",") : null;
}

function getOutputColorArgs(settings: ExportSettings) {
  if (settings.sdrMode !== "convert_to_sdr") return [];
  return ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"];
}

function getExportFilterComplex(settings: ExportSettings, source: { width: number; height: number }, captionOverlays: CaptionOverlayImage[]) {
  const baseFilter = getExportVideoFilter(settings, source);
  const parts = [`[0:v]${baseFilter ?? "null"}[vbase]`];
  let previousLabel = "vbase";

  captionOverlays.forEach((overlay, index) => {
    const outputLabel = index === captionOverlays.length - 1 ? "outv" : `vcap${index + 1}`;
    parts.push(
      `[${previousLabel}][${index + 1}:v]overlay=0:0:enable='between(t,${roundTime(overlay.startSec)},${roundTime(overlay.endSec)})'[${outputLabel}]`
    );
    previousLabel = outputLabel;
  });

  return parts.join(";");
}

function getTargetSize(settings: ExportSettings, source: { width: number; height: number }) {
  if (settings.resolution === "original") return null;
  const format = settings.format === "original"
    ? source.height > source.width ? "vertical" : "horizontal"
    : settings.format;
  if (format === "vertical") {
    return settings.resolution === "4k" ? { width: 2160, height: 3840 } : { width: 1080, height: 1920 };
  }
  return settings.resolution === "4k" ? { width: 3840, height: 2160 } : { width: 1920, height: 1080 };
}

async function pickExportSource(workspace: ProjectWorkspace, fallbackSourcePath: string) {
  const roughCutPath = path.join(workspace.renders, "rough-cut.mp4");
  return access(roughCutPath).then(() => roughCutPath, () => fallbackSourcePath);
}

function normalizeOutputFileName(fileName: string) {
  const trimmed = fileName.trim();
  return trimmed.toLowerCase().endsWith(".mp4") ? trimmed : `${trimmed}.mp4`;
}

function getExportCanvasSize(settings: ExportSettings, source: { width: number; height: number }) {
  return getTargetSize(settings, source) ?? { width: source.width, height: source.height };
}

function getRenderedDurationSec(plan: ReturnType<typeof editPlanSchema.parse>) {
  return plan.segments.at(-1)?.timelineEndSec ?? plan.source.durationSec;
}

function roundTime(value: number) {
  return Math.round(value * 1000) / 1000;
}
