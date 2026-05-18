import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { getConfig } from "../config";
import { runProcess } from "../media/process";

export type MediaFactoryMusicProcessRunner = typeof runProcess;

export const BACKGROUND_MUSIC_TIMEOUT_MS = 30 * 60 * 1000;

const SUPPORTED_MUSIC_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"]);

export type MixBackgroundMusicInput = {
  inputVideoPath: string;
  musicPath: string;
  outputVideoPath: string;
  volume: number;
  ffmpegPath?: string;
  processRunner?: MediaFactoryMusicProcessRunner;
};

export function findBackgroundMusicTracks(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  const tracks: string[] = [];
  collectMusicTracks(dir, tracks);
  return tracks.sort();
}

export function selectBackgroundMusicTrack(tracks: string[], seed?: string): string | null {
  if (tracks.length === 0) {
    return null;
  }

  if (seed === undefined) {
    return tracks[Math.floor(Math.random() * tracks.length)];
  }

  return tracks[hashSeed(seed) % tracks.length];
}

export async function mixBackgroundMusicIntoVideo(input: MixBackgroundMusicInput): Promise<void> {
  if (!Number.isFinite(input.volume) || input.volume < 0 || input.volume > 0.3) {
    throw new Error("Background music volume must be between 0 and 0.3");
  }

  const ffmpegPath = input.ffmpegPath ?? getConfig().ffmpegPath;
  const processRunner = input.processRunner ?? runProcess;
  const result = await processRunner(
    ffmpegPath,
    [
      "-y",
      "-i",
      input.inputVideoPath,
      "-stream_loop",
      "-1",
      "-i",
      input.musicPath,
      "-filter_complex",
      `[1:a]volume=${input.volume}[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
      "-map",
      "0:v:0",
      "-map",
      "[aout]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      input.outputVideoPath
    ],
    { timeoutMs: BACKGROUND_MUSIC_TIMEOUT_MS }
  );

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || "Background music mix failed");
  }
}

function collectMusicTracks(dir: string, tracks: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      collectMusicTracks(entryPath, tracks);
      continue;
    }

    if (entry.isFile() && SUPPORTED_MUSIC_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      tracks.push(entryPath);
    }
  }
}

function hashSeed(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
