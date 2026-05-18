import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MediaProbe } from "../media/probe";
import { generateVerticalShortPayloads as defaultGenerateVerticalShortPayloads, type VerticalShortPayloads } from "./ai-payloads";
import type { MediaFactoryConfig } from "./config";
import { getHumanPackageName, getPackageSlug, renamePackageDirectory } from "./files";
import { createInitialManifest, writeManifest, type MediaFactoryManifest } from "./manifest";
import { silentProgressReporter, type ProgressReporter } from "./progress";
import { processSupoClipVideo as defaultProcessSupoClipVideo, type SupoClipClip } from "./supoclip-client";

type SupoClipResult = Awaited<ReturnType<typeof defaultProcessSupoClipVideo>>;
type SupoClipClipWithBytes = SupoClipClip & { bytes: Uint8Array };

export type ProcessVerticalPackageInput = {
  sourcePath: string;
  sourceHash: string;
  metadata: MediaProbe;
  inputDir: string;
  outputDir: string;
  supoclip: MediaFactoryConfig["supoclip"];
  ai?: MediaFactoryConfig["ai"];
  now?: Date;
  authSecret?: string;
  deps?: {
    processSupoClipVideo?: typeof defaultProcessSupoClipVideo;
    generateVerticalShortPayloads?: typeof defaultGenerateVerticalShortPayloads;
    progress?: ProgressReporter;
  };
};

export async function processVerticalPackage(input: ProcessVerticalPackageInput): Promise<{ packageDir: string; manifestPath: string }> {
  assertValidSourceHash(input.sourceHash);
  const processSupoClipVideo = input.deps?.processSupoClipVideo ?? defaultProcessSupoClipVideo;
  const generateVerticalShortPayloads = input.deps?.generateVerticalShortPayloads ?? defaultGenerateVerticalShortPayloads;
  const progress = input.deps?.progress ?? silentProgressReporter;
  const now = input.now ?? new Date();
  const slug = getPackageSlug({ filePath: input.sourcePath, hash: input.sourceHash, now });
  const packageDir = path.join(input.outputDir, "ready-to-approve", slug);
  const manifestPath = path.join(packageDir, "manifest.json");

  await mkdir(packageDir, { recursive: true });

  const initialManifest = createInitialManifest({
    id: slug,
    status: "processing",
    source: {
      path: input.sourcePath,
      hash: input.sourceHash,
      orientation: "vertical",
      durationSec: input.metadata.durationSec,
      width: input.metadata.width,
      height: input.metadata.height,
      hasAudio: input.metadata.hasAudio
    },
    pipeline: "vertical_short_clips",
    now
  });
  await writeManifest(manifestPath, initialManifest);

  try {
    if (!input.supoclip.enabled) {
      throw new Error("SupoClip is disabled for the vertical short clips pipeline");
    }

    progress.info("SupoClip gerando cortes verticais");
    const result = await processSupoClipVideo({
      backendUrl: input.supoclip.backendUrl,
      userId: input.supoclip.userId,
      authSecret: input.authSecret ?? process.env.BACKEND_AUTH_SECRET,
      sourcePath: input.sourcePath,
      title: path.parse(input.sourcePath).name,
      captionTemplate: input.supoclip.captionTemplate,
      processingMode: input.supoclip.processingMode,
      outputFormat: input.supoclip.outputFormat,
      addSubtitles: input.supoclip.addSubtitles,
      cutLongPauses: input.supoclip.cutLongPauses,
      progress
    });

    const validClips = filterValidShortClips({
      clips: result.clips,
      sourceDurationSec: input.metadata.durationSec,
      minClipDurationSec: input.supoclip.minClipDurationSec,
      progress
    });
    const rankedClips = rankClips(validClips).slice(0, input.supoclip.maxClips ?? 5);
    if (rankedClips.length === 0) {
      throw new Error("SupoClip returned no valid clips for the vertical short clips package");
    }

    progress.info(input.ai?.enabled ? "Gerando payloads verticais com IA" : "Gerando payloads verticais");
    const payloads = await generateVerticalShortPayloads({
      sourceTitle: path.parse(input.sourcePath).name,
      clips: rankedClips.map(createVerticalPayloadClipInput),
      ai: input.ai ?? { enabled: false }
    });
    const writtenClips = await writeShortClipsPackage({
      packageDir,
      sourceTitle: path.parse(input.sourcePath).name,
      clips: rankedClips,
      payloads
    });
    const taskPath = "supoclip/task.json";
    await mkdir(path.join(packageDir, "supoclip"), { recursive: true });
    await writeJson(path.join(packageDir, taskPath), createTaskMetadata({ input, result, clipCount: writtenClips.length }));

    const finalPackageId = getHumanPackageName({
      kind: "Shorts",
      title: payloads.clips[0]?.youtubeShorts.title ?? path.parse(input.sourcePath).name,
      now
    });
    const finalPackageDir = await renamePackageDirectory({
      packageDir,
      desiredName: finalPackageId
    });
    const finalManifestPath = path.join(finalPackageDir, "manifest.json");

    await writeManifest(finalManifestPath, {
      ...initialManifest,
      id: finalPackageId,
      status: "ready_to_approve",
      outputs: createOutputs({ clipDirs: writtenClips.map((clip) => clip.dir), taskPath }),
      publishPlan: createPublishPlan(writtenClips.map((clip) => clip.dir)),
      updatedAt: now.toISOString()
    });

    return { packageDir: finalPackageDir, manifestPath: finalManifestPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown vertical pipeline error";
    await writeManifest(manifestPath, {
      ...initialManifest,
      status: "failed",
      error: {
        stage: "vertical_pipeline",
        message
      },
      updatedAt: new Date().toISOString()
    });
    throw error;
  }

  return { packageDir, manifestPath };
}

function assertValidSourceHash(sourceHash: string) {
  if (!/^[a-f0-9]{16,}$/i.test(sourceHash)) {
    throw new Error("Media Factory source hash must be a hex string");
  }
}

function filterValidShortClips({
  clips,
  sourceDurationSec,
  minClipDurationSec,
  progress
}: {
  clips: SupoClipResult["clips"];
  sourceDurationSec: number;
  minClipDurationSec: number;
  progress: ProgressReporter;
}): SupoClipResult["clips"] {
  return clips.filter((clip) => {
    const durationSec = getClipDurationSec(clip);
    if (durationSec !== undefined && durationSec < minClipDurationSec) {
      progress.warn(`SupoClip descartou ${clip.clip_id}: duracao ${durationSec.toFixed(1)}s menor que ${minClipDurationSec}s`);
      return false;
    }

    const startSec = parseTimestampSec(clip.start_time);
    if (startSec !== undefined && startSec >= sourceDurationSec) {
      progress.warn(`SupoClip descartou ${clip.clip_id}: inicio ${startSec.toFixed(1)}s fora do video`);
      return false;
    }

    const endSec = parseTimestampSec(clip.end_time);
    if (startSec !== undefined && endSec !== undefined && endSec <= startSec) {
      progress.warn(`SupoClip descartou ${clip.clip_id}: intervalo invalido`);
      return false;
    }

    return true;
  });
}

function rankClips(clips: SupoClipResult["clips"]): SupoClipClipWithBytes[] {
  const indexed = clips.map((clip, index) => ({ clip, index }));
  const hasScores = indexed.some(({ clip }) => typeof clip.score === "number" && Number.isFinite(clip.score));

  if (!hasScores) {
    return indexed.map(({ clip }) => clip);
  }

  return indexed
    .sort((left, right) => {
      const leftScore = getScore(left.clip);
      const rightScore = getScore(right.clip);
      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }
      return left.index - right.index;
    })
    .map(({ clip }) => clip);
}

async function writeShortClipsPackage({
  packageDir,
  sourceTitle,
  clips,
  payloads
}: {
  packageDir: string;
  sourceTitle: string;
  clips: SupoClipClipWithBytes[];
  payloads: VerticalShortPayloads;
}) {
  const writtenClips: Array<{ dir: string }> = [];
  const payloadsByClipId = new Map(payloads.clips.map((payload) => [payload.clipId, payload]));

  for (const [index, clip] of clips.entries()) {
    const rank = String(index + 1).padStart(2, "0");
    const clipDir = `shorts/rank-${rank}`;
    const absoluteClipDir = path.join(packageDir, clipDir);
    const videoPath = `${clipDir}/clip.mp4`;
    const title = `${sourceTitle} - corte ${rank}`;
    const payload = payloadsByClipId.get(clip.clip_id);

    assertValidClipBytes(clip, rank);
    await mkdir(absoluteClipDir, { recursive: true });
    await writeFile(path.join(absoluteClipDir, "clip.mp4"), clip.bytes);
    await writeJson(path.join(absoluteClipDir, "metadata.json"), createClipMetadata({ clip, rank: index + 1 }));
    await writeJson(path.join(absoluteClipDir, "youtube-shorts-payload.json"), {
      video: videoPath,
      ...(payload?.youtubeShorts ?? {
        title,
        description: `Corte ${rank} de ${sourceTitle}.`,
        hashtags: ["#shorts"],
        privacyStatus: "private"
      })
    });
    await writeJson(path.join(absoluteClipDir, "instagram-reels-payload.json"), {
      video: videoPath,
      ...(payload?.instagram ?? {
        caption: title,
        hashtags: ["#reels"]
      })
    });
    await writeJson(path.join(absoluteClipDir, "tiktok-payload.json"), {
      video: videoPath,
      ...(payload?.tiktok ?? {
        caption: title,
        hashtags: ["#tiktok"]
      })
    });
    writtenClips.push({ dir: clipDir });
  }

  return writtenClips;
}

function createVerticalPayloadClipInput(clip: SupoClipClip) {
  return {
    clipId: clip.clip_id,
    title: typeof clip.title === "string" ? clip.title : undefined,
    startTime: clip.start_time,
    endTime: clip.end_time,
    score: clip.score
  };
}

function getScore(clip: SupoClipClip): number {
  return typeof clip.score === "number" && Number.isFinite(clip.score) ? clip.score : Number.NEGATIVE_INFINITY;
}

function getClipDurationSec(clip: SupoClipClip): number | undefined {
  if (typeof clip.duration === "number" && Number.isFinite(clip.duration)) {
    return clip.duration;
  }

  const startSec = parseTimestampSec(clip.start_time);
  const endSec = parseTimestampSec(clip.end_time);
  if (startSec === undefined || endSec === undefined) {
    return undefined;
  }

  return endSec - startSec;
}

function parseTimestampSec(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const parts = value.trim().split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) {
    return undefined;
  }
  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return undefined;
}

function assertValidClipBytes(clip: SupoClipClip, rank: string): asserts clip is SupoClipClipWithBytes {
  const bytes = (clip as { bytes?: unknown }).bytes;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new Error(`SupoClip clip ${clip.clip_id} for rank ${rank} returned invalid or empty bytes`);
  }
}

function createClipMetadata({ clip, rank }: { clip: SupoClipClipWithBytes; rank: number }) {
  const { bytes: _bytes, ...metadata } = clip;
  return {
    ...metadata,
    rank
  };
}

function createTaskMetadata({
  input,
  result,
  clipCount
}: {
  input: ProcessVerticalPackageInput;
  result: SupoClipResult;
  clipCount: number;
}) {
  return {
    taskId: result.taskId,
    clipCount,
    returnedClipCount: result.clips.length,
    source: {
      path: input.sourcePath,
      hash: input.sourceHash
    },
    settings: {
      ...createBackendOriginMetadata(input.supoclip.backendUrl),
      userId: input.supoclip.userId,
      maxClips: input.supoclip.maxClips,
      minClipDurationSec: input.supoclip.minClipDurationSec,
      captionTemplate: input.supoclip.captionTemplate,
      processingMode: input.supoclip.processingMode,
      outputFormat: input.supoclip.outputFormat,
      addSubtitles: input.supoclip.addSubtitles,
      cutLongPauses: input.supoclip.cutLongPauses
    }
  };
}

function createBackendOriginMetadata(backendUrl: string): { backendOrigin?: string } {
  try {
    return {
      backendOrigin: new URL(backendUrl).origin
    };
  } catch {
    return {};
  }
}

function createOutputs({ clipDirs, taskPath }: { clipDirs: string[]; taskPath: string }): MediaFactoryManifest["outputs"] {
  return [
    ...clipDirs.flatMap((clipDir) => [
      { type: "short_video", path: `${clipDir}/clip.mp4` },
      { type: "short_metadata", path: `${clipDir}/metadata.json` },
      { type: "youtube_shorts_payload", path: `${clipDir}/youtube-shorts-payload.json` },
      { type: "instagram_reels_payload", path: `${clipDir}/instagram-reels-payload.json` },
      { type: "tiktok_payload", path: `${clipDir}/tiktok-payload.json` }
    ]),
    { type: "supoclip_task", path: taskPath }
  ];
}

function createPublishPlan(clipDirs: string[]): MediaFactoryManifest["publishPlan"] {
  return {
    youtubeShorts: {
      mode: "dry-run",
      clips: clipDirs.map((clipDir) => `${clipDir}/youtube-shorts-payload.json`)
    },
    instagram: {
      mode: "dry-run",
      clips: clipDirs.map((clipDir) => `${clipDir}/instagram-reels-payload.json`)
    },
    tiktok: {
      mode: "dry-run",
      clips: clipDirs.map((clipDir) => `${clipDir}/tiktok-payload.json`)
    }
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
