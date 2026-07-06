import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MediaProbe } from "../media/probe";
import { processSupoClipVideo as defaultProcessSupoClipVideo, type SupoClipClip } from "../media-factory/supoclip-client";
import { createEditPlanFromSilences } from "../planner/create-edit-plan";
import type { ProjectWorkspace } from "../workspace";
import type { JobStore } from "./job-store";

type SupoClipClipWithBytes = SupoClipClip & { bytes: Uint8Array };

export type VerticalProjectSupoClipConfig = {
  enabled: boolean;
  backendUrl: string;
  userId: string;
  authSecret?: string;
  captionTemplate: string;
  processingMode: "fast" | "balanced" | "quality";
  outputFormat: "vertical" | "original";
  addSubtitles: boolean;
  cutLongPauses: boolean;
  maxClips: number;
  minClipDurationSec: number;
};

export type RunVerticalProjectJobInput = {
  jobId: string;
  workspace: ProjectWorkspace;
  sourcePath: string;
  jobs: JobStore;
  metadata: MediaProbe;
};

export type RunVerticalProjectJobDeps = {
  processSupoClipVideo?: typeof defaultProcessSupoClipVideo;
  config?: VerticalProjectSupoClipConfig;
  now?: () => Date;
};

export async function runVerticalProjectJob(input: RunVerticalProjectJobInput, deps: RunVerticalProjectJobDeps = {}) {
  const processSupoClipVideo = deps.processSupoClipVideo ?? defaultProcessSupoClipVideo;
  const config = deps.config ?? getVerticalProjectSupoClipConfigFromEnv();
  const now = deps.now ?? (() => new Date());
  let activeStage = "supoclip_upload";

  try {
    if (!config.enabled) {
      throw new Error("SupoClip vertical processing is disabled. Set SUPOCLIP_ENABLED=true.");
    }

    input.jobs.update(input.jobId, {
      status: "running",
      stage: "supoclip_upload",
      message: "Sending vertical video to SupoClip"
    });
    const result = await processSupoClipVideo({
      backendUrl: config.backendUrl,
      userId: config.userId,
      authSecret: config.authSecret,
      sourcePath: input.sourcePath,
      title: path.parse(input.sourcePath).name,
      captionTemplate: config.captionTemplate,
      processingMode: config.processingMode,
      outputFormat: config.outputFormat,
      addSubtitles: config.addSubtitles,
      cutLongPauses: config.cutLongPauses
    });

    activeStage = "supoclip_download";
    input.jobs.update(input.jobId, {
      status: "running",
      stage: activeStage,
      message: "Downloading SupoClip vertical cuts"
    });
    const warnings: string[] = [];
    const clips = rankClips(filterValidClips(result.clips, input.metadata.durationSec, config.minClipDurationSec, warnings))
      .slice(0, config.maxClips);
    if (clips.length === 0) {
      throw new Error("SupoClip returned no valid vertical clips.");
    }

    const writtenClips = await writeVerticalClips({
      workspace: input.workspace,
      projectId: input.workspace.projectId,
      sourceTitle: path.parse(input.sourcePath).name,
      clips
    });
    const previewPath = path.join(input.workspace.renders, "rough-cut.mp4");
    await copyFile(path.join(input.workspace.root, writtenClips[0].videoPath), previewPath);
    await writePlan(input, now, warnings);
    await writeVerticalPackage({
      workspace: input.workspace,
      sourcePath: input.sourcePath,
      metadata: input.metadata,
      taskId: result.taskId,
      clips: writtenClips,
      warnings,
      now: now()
    });

    input.jobs.update(input.jobId, {
      status: warnings.length > 0 ? "warning" : "passed",
      stage: "vertical_review_ready",
      message: "SupoClip vertical cuts ready",
      outputPath: previewPath,
      planPath: input.workspace.planPath,
      warnings
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown vertical SupoClip error";
    input.jobs.update(input.jobId, {
      status: "failed",
      stage: activeStage,
      message: "Vertical SupoClip job failed",
      error: message
    });
  }
}

export function getVerticalProjectSupoClipConfigFromEnv(env: NodeJS.ProcessEnv = process.env): VerticalProjectSupoClipConfig {
  return {
    enabled: parseBoolean(env.SUPOCLIP_ENABLED, false),
    backendUrl: env.SUPOCLIP_BACKEND_URL?.trim() || "http://localhost:8000",
    userId: env.SUPOCLIP_USER_ID?.trim() || "media-factory",
    authSecret: env.SUPOCLIP_AUTH_SECRET?.trim() || env.BACKEND_AUTH_SECRET?.trim() || undefined,
    captionTemplate: env.SUPOCLIP_CAPTION_TEMPLATE?.trim() || "default",
    processingMode: parseEnum(env.SUPOCLIP_PROCESSING_MODE, ["fast", "balanced", "quality"], "fast"),
    outputFormat: parseEnum(env.SUPOCLIP_OUTPUT_FORMAT, ["vertical", "original"], "vertical"),
    addSubtitles: parseBoolean(env.SUPOCLIP_ADD_SUBTITLES, true),
    cutLongPauses: parseBoolean(env.SUPOCLIP_CUT_LONG_PAUSES, true),
    maxClips: parsePositiveInt(env.SUPOCLIP_MAX_CLIPS, 5),
    minClipDurationSec: parsePositiveNumber(env.SUPOCLIP_MIN_CLIP_DURATION_SEC, 12)
  };
}

async function writePlan(input: RunVerticalProjectJobInput, now: () => Date, warnings: string[]) {
  const plan = createEditPlanFromSilences({
    projectId: input.workspace.projectId,
    sourcePath: input.sourcePath,
    durationSec: input.metadata.durationSec,
    width: input.metadata.width,
    height: input.metadata.height,
    fps: input.metadata.fps,
    hasAudio: input.metadata.hasAudio,
    silences: [],
    marginSec: 0,
    now: now().toISOString()
  });
  plan.qa = {
    status: warnings.length > 0 ? "warning" : "passed",
    warnings
  };
  await writeJson(input.workspace.planPath, plan);
}

async function writeVerticalClips(input: {
  workspace: ProjectWorkspace;
  projectId: string;
  sourceTitle: string;
  clips: SupoClipClipWithBytes[];
}) {
  const written: Array<{
    id: string;
    rank: number;
    title: string;
    startSec: number | null;
    endSec: number | null;
    durationSec: number | null;
    score: number | null;
    videoPath: string;
    clipUrl: string;
    payloads: {
      youtubeShorts: string;
      instagram: string;
      tiktok: string;
    };
  }> = [];

  for (const [index, clip] of input.clips.entries()) {
    const rank = index + 1;
    const rankDir = `rank-${String(rank).padStart(2, "0")}`;
    const clipDir = path.join("shorts", rankDir);
    const absoluteClipDir = path.join(input.workspace.root, clipDir);
    const videoPath = path.join(clipDir, "clip.mp4");
    const title = getClipTitle(clip, input.sourceTitle, rank);
    const payloads = {
      youtubeShorts: path.join(clipDir, "youtube-shorts-payload.json"),
      instagram: path.join(clipDir, "instagram-reels-payload.json"),
      tiktok: path.join(clipDir, "tiktok-payload.json")
    };

    await mkdir(absoluteClipDir, { recursive: true });
    await writeFile(path.join(input.workspace.root, videoPath), clip.bytes);
    await writeJson(path.join(absoluteClipDir, "metadata.json"), {
      ...clip,
      bytes: undefined,
      rank,
      durationSec: getClipDurationSec(clip),
      startSec: parseTimestampSec(clip.start_time),
      endSec: parseTimestampSec(clip.end_time)
    });
    await writeJson(path.join(input.workspace.root, payloads.youtubeShorts), {
      video: videoPath,
      title,
      description: `${title}\n\n#shorts`,
      hashtags: ["#shorts"],
      privacyStatus: "private"
    });
    await writeJson(path.join(input.workspace.root, payloads.instagram), {
      video: videoPath,
      caption: title,
      hashtags: ["#reels"]
    });
    await writeJson(path.join(input.workspace.root, payloads.tiktok), {
      video: videoPath,
      caption: title,
      hashtags: ["#tiktok"]
    });

    written.push({
      id: clip.clip_id,
      rank,
      title,
      startSec: parseTimestampSec(clip.start_time) ?? null,
      endSec: parseTimestampSec(clip.end_time) ?? null,
      durationSec: getClipDurationSec(clip) ?? null,
      score: getScore(clip),
      videoPath,
      clipUrl: `/api/projects/${encodeURIComponent(input.projectId)}/vertical-package/clips/${rankDir}/clip.mp4`,
      payloads
    });
  }

  return written;
}

async function writeVerticalPackage(input: {
  workspace: ProjectWorkspace;
  sourcePath: string;
  metadata: MediaProbe;
  taskId: string;
  clips: Awaited<ReturnType<typeof writeVerticalClips>>;
  warnings: string[];
  now: Date;
}) {
  await writeJson(path.join(input.workspace.root, "vertical-package.json"), {
    projectId: input.workspace.projectId,
    taskId: input.taskId,
    status: "ready",
    source: {
      path: input.sourcePath,
      durationSec: input.metadata.durationSec,
      width: input.metadata.width,
      height: input.metadata.height,
      fps: input.metadata.fps,
      hasAudio: input.metadata.hasAudio
    },
    clips: input.clips,
    warnings: input.warnings,
    createdAt: input.now.toISOString(),
    updatedAt: input.now.toISOString()
  });
}

function filterValidClips(clips: SupoClipClipWithBytes[], sourceDurationSec: number, minClipDurationSec: number, warnings: string[]) {
  return clips.filter((clip) => {
    const durationSec = getClipDurationSec(clip);
    if (durationSec !== undefined && durationSec < minClipDurationSec) {
      warnings.push(`SupoClip discarded ${clip.clip_id}: duration ${durationSec.toFixed(1)}s is below ${minClipDurationSec}s.`);
      return false;
    }
    const startSec = parseTimestampSec(clip.start_time);
    if (startSec !== undefined && startSec >= sourceDurationSec) {
      warnings.push(`SupoClip discarded ${clip.clip_id}: start ${startSec.toFixed(1)}s is outside the source video.`);
      return false;
    }
    const endSec = parseTimestampSec(clip.end_time);
    if (startSec !== undefined && endSec !== undefined && endSec <= startSec) {
      warnings.push(`SupoClip discarded ${clip.clip_id}: invalid time range.`);
      return false;
    }
    return clip.bytes.byteLength > 0;
  });
}

function rankClips(clips: SupoClipClipWithBytes[]) {
  return clips
    .map((clip, index) => ({ clip, index }))
    .sort((left, right) => {
      const leftScore = getScore(left.clip);
      const rightScore = getScore(right.clip);
      if (leftScore !== null || rightScore !== null) {
        return (rightScore ?? -Infinity) - (leftScore ?? -Infinity) || left.index - right.index;
      }
      return left.index - right.index;
    })
    .map(({ clip }) => clip);
}

function getClipTitle(clip: SupoClipClip, sourceTitle: string, rank: number) {
  return typeof clip.title === "string" && clip.title.trim() ? clip.title.trim() : `${sourceTitle} - corte ${String(rank).padStart(2, "0")}`;
}

function getClipDurationSec(clip: SupoClipClip) {
  if (typeof clip.duration === "number" && Number.isFinite(clip.duration)) return clip.duration;
  if (typeof clip.duration_sec === "number" && Number.isFinite(clip.duration_sec)) return clip.duration_sec;
  const startSec = parseTimestampSec(clip.start_time);
  const endSec = parseTimestampSec(clip.end_time);
  if (startSec !== undefined && endSec !== undefined) return endSec - startSec;
  return undefined;
}

function getScore(clip: SupoClipClip): number | null {
  for (const key of ["score", "relevance_score", "virality_score"]) {
    const value = clip[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function parseTimestampSec(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return numeric;
  const parts = trimmed.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return undefined;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return undefined;
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseEnum<T extends string>(value: string | undefined, values: readonly T[], fallback: T): T {
  return values.includes(value as T) ? value as T : fallback;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
