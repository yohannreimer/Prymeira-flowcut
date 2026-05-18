import { writeFile } from "node:fs/promises";
import path from "node:path";
import { buildColorFilter } from "../../shared/color-presets";
import type { EditPlan } from "../../shared/edit-plan";
import { getConfig } from "../config";
import { runProcess } from "../media/process";
import type { ProcessOptions, ProcessResult } from "../media/process";
import type { ProjectWorkspace } from "../workspace";

export const DEFAULT_ROUGH_CUT_RENDER_TIMEOUT_MS = 30 * 60 * 1000;

export type RoughCutProcessRunner = (
  command: string,
  args: string[],
  options?: ProcessOptions
) => Promise<ProcessResult>;

export type RenderRoughCutOptions = {
  outputFileName?: string;
  commandLogFileName?: string;
  audioCleanup?: boolean;
  audioDucking?: boolean;
  videoCrf?: string;
  videoPreset?: string;
};

const VOICE_CLEANUP_FILTER = "afftdn,loudnorm=I=-16:TP=-1.5:LRA=11,acompressor=threshold=-18dB:ratio=2:attack=12:release=180";

function ffmpegConcatFilter(plan: EditPlan) {
  const parts: string[] = [];
  const labels: string[] = [];
  const colorFilter = buildColorFilter(plan.color.presetId as Parameters<typeof buildColorFilter>[0], plan.color.adjustments);

  plan.segments.forEach((segment, index) => {
    const videoFilters = [
      `trim=start=${segment.sourceStartSec}:end=${segment.sourceEndSec}`,
      "setpts=PTS-STARTPTS",
      ...(plan.video?.flipHorizontal ? ["hflip"] : [])
    ];
    parts.push(`[0:v]${videoFilters.join(",")}[v${index}]`);
    if (plan.source.hasAudio) {
      parts.push(
        `[0:a]atrim=start=${segment.sourceStartSec}:end=${segment.sourceEndSec},asetpts=PTS-STARTPTS[a${index}]`
      );
      labels.push(`[v${index}][a${index}]`);
    } else {
      labels.push(`[v${index}]`);
    }
  });

  const concatAudioLabel = plan.source.hasAudio ? "[outa]" : "";
  const audioOutput = plan.source.hasAudio ? `:a=1[concatv]${concatAudioLabel}` : ":a=0[concatv]";
  parts.push(`${labels.join("")}concat=n=${plan.segments.length}:v=1${audioOutput}`);

  let videoLabel = "concatv";
  if (colorFilter) {
    parts.push(`[${videoLabel}]${colorFilter}[captionbase]`);
    videoLabel = "captionbase";
  }

  parts.push(`[${videoLabel}]format=yuv420p[outv]`);
  return parts.join(";");
}

function buildRoughCutFilter(plan: EditPlan, options: RenderRoughCutOptions) {
  const filter = ffmpegConcatFilter(plan);
  const audioFilters: string[] = [filter];

  if (!plan.source.hasAudio && !plan.audio.music) {
    return { filter, audioMap: null as string | null };
  }

  const voiceLabel = options.audioCleanup && plan.source.hasAudio
    ? (() => {
        audioFilters.push(`[outa]${VOICE_CLEANUP_FILTER}[voiceclean]`);
        return "voiceclean";
      })()
    : "outa";

  if (plan.audio.music) {
    const musicDuration = getRenderedDurationSec(plan);
    if (plan.source.hasAudio) {
      audioFilters.push(`[1:a]volume=${plan.audio.music.gainDb}dB[music]`);
      const musicLabel = options.audioDucking
        ? (() => {
            audioFilters.push(`[music][${voiceLabel}]sidechaincompress=threshold=0.04:ratio=8:attack=20:release=260[musicduck]`);
            return "musicduck";
          })()
        : "music";
      audioFilters.push(`[${voiceLabel}][${musicLabel}]amix=inputs=2:duration=first:dropout_transition=0[aout]`);
    } else {
      audioFilters.push(`[1:a]volume=${plan.audio.music.gainDb}dB,atrim=duration=${musicDuration},asetpts=PTS-STARTPTS[aout]`);
    }
    return { filter: audioFilters.join(";"), audioMap: "aout" };
  }

  return { filter: audioFilters.join(";"), audioMap: voiceLabel };
}

function getRenderedDurationSec(plan: EditPlan) {
  return plan.segments.reduce((duration, segment) => Math.max(duration, segment.timelineEndSec), 0);
}

export async function renderRoughCut(
  plan: EditPlan,
  workspace: ProjectWorkspace,
  processRunner: RoughCutProcessRunner = runProcess,
  options: RenderRoughCutOptions = {}
) {
  const config = getConfig();
  const outputPath = path.join(workspace.renders, options.outputFileName ?? "rough-cut.mp4");
  const commandLogPath = path.join(workspace.renders, options.commandLogFileName ?? "rough-cut-command.json");

  const args = [
    "-y",
    "-i",
    plan.source.path,
  ];
  if (plan.audio.music) {
    args.push("-stream_loop", "-1", "-i", plan.audio.music.path);
  }
  const renderFilter = buildRoughCutFilter(plan, options);
  args.push(
    "-filter_complex",
    renderFilter.filter,
    "-map",
    "[outv]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-preset",
    options.videoPreset ?? "veryfast",
    "-crf",
    options.videoCrf ?? "23"
  );
  if (renderFilter.audioMap) {
    args.push("-map", `[${renderFilter.audioMap}]`, "-c:a", "aac");
  }
  args.push("-movflags", "+faststart", outputPath);

  await writeFile(commandLogPath, JSON.stringify({ renderer: "ffmpeg", command: config.ffmpegPath, args }, null, 2));
  let result;
  try {
    result = await processRunner(config.ffmpegPath, args, { timeoutMs: DEFAULT_ROUGH_CUT_RENDER_TIMEOUT_MS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown FFmpeg error";
    throw new Error(`rough cut render failed: ${message}`);
  }

  if (result.exitCode !== 0) {
    throw new Error(`rough cut render failed: ${result.stderr || result.stdout}`);
  }

  return outputPath;
}
