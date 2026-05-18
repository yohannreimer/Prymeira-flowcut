import { getConfig } from "../config";
import { runProcess } from "./process";
import type { ProcessOptions, ProcessResult } from "./process";

export type MediaProbe = {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
};

export const DEFAULT_MEDIA_PROBE_TIMEOUT_MS = 30000;

export type MediaProbeProcessRunner = (
  command: string,
  args: string[],
  options?: ProcessOptions
) => Promise<ProcessResult>;

export function parseFps(value: string) {
  const [num, den] = value.split("/").map(Number);
  const fps = den === undefined ? num : num / den;
  if (!Number.isFinite(num) || (den !== undefined && (!Number.isFinite(den) || den === 0)) || !Number.isFinite(fps)) {
    throw new Error("ffprobe returned invalid fps");
  }
  return fps;
}

function parseRotation(stream: { tags?: { rotate?: unknown }; side_data_list?: Array<{ rotation?: unknown }> }) {
  const tagRotation = typeof stream.tags?.rotate === "string" ? Number(stream.tags.rotate) : Number.NaN;
  const sideDataRotation = stream.side_data_list
    ?.map((sideData) => Number(sideData.rotation))
    .find((rotation) => Number.isFinite(rotation));
  const rotation = Number.isFinite(tagRotation) ? tagRotation : sideDataRotation;
  return Number.isFinite(rotation) ? Math.abs(Number(rotation)) % 180 : 0;
}

function assertFinitePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`ffprobe returned invalid ${label}`);
  }
}

export async function probeMedia(inputPath: string, processRunner: MediaProbeProcessRunner = runProcess): Promise<MediaProbe> {
  const config = getConfig();
  const result = await processRunner(
    config.ffprobePath,
    [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,width,height,r_frame_rate:stream_tags=rotate:stream_side_data=rotation:format=duration",
      "-of",
      "json",
      inputPath
    ],
    { timeoutMs: DEFAULT_MEDIA_PROBE_TIMEOUT_MS }
  );

  if (result.exitCode !== 0) {
    throw new Error(`ffprobe failed: ${result.stderr || result.stdout}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error("ffprobe returned malformed JSON");
  }

  const root = parsed as {
    streams?: Array<{
      codec_type?: unknown;
      width?: unknown;
      height?: unknown;
      r_frame_rate?: unknown;
      tags?: { rotate?: unknown };
      side_data_list?: Array<{ rotation?: unknown }>;
    }>;
    format?: { duration?: unknown };
  };
  const stream = root.streams?.find((candidate) => candidate.codec_type === "video");
  if (!stream || !root.format) {
    throw new Error("ffprobe returned no video stream metadata");
  }

  const durationSec = Number(root.format.duration);
  const width = Number(stream.width);
  const height = Number(stream.height);
  const rotation = parseRotation(stream);
  const frameRate = typeof stream.r_frame_rate === "string" ? parseFps(stream.r_frame_rate) : Number.NaN;

  assertFinitePositive(durationSec, "duration");
  assertFinitePositive(width, "width");
  assertFinitePositive(height, "height");
  assertFinitePositive(frameRate, "fps");

  return {
    durationSec: Number(durationSec.toFixed(3)),
    width: rotation === 90 ? height : width,
    height: rotation === 90 ? width : height,
    fps: Number(frameRate.toFixed(3)),
    hasAudio: root.streams?.some((candidate) => candidate.codec_type === "audio") ?? false
  };
}
