import { getConfig } from "../config";
import { runProcess } from "../media/process";
import type { ProcessOptions, ProcessResult } from "../media/process";

export type SilenceInterval = {
  startSec: number;
  endSec: number;
  durationSec: number;
};

export type SilenceAnalysisOptions = {
  noiseDb: number;
  minDurationSec: number;
  timeoutMs?: number;
};

export type SilenceProcessRunner = (
  command: string,
  args: string[],
  options?: ProcessOptions
) => Promise<ProcessResult>;

export const DEFAULT_SILENCE_ANALYSIS_TIMEOUT_MS = 120000;

const NUMBER_PATTERN = String.raw`([+-]?(?:\d+(?:\.\d*)?|\.\d+))`;
const SILENCE_START_PATTERN = new RegExp(String.raw`silence_start:\s*${NUMBER_PATTERN}\s*$`);
const SILENCE_END_PATTERN = new RegExp(
  String.raw`silence_end:\s*${NUMBER_PATTERN}\s*\|\s*silence_duration:\s*${NUMBER_PATTERN}\s*$`
);

export function parseSilencedetectOutput(output: string): SilenceInterval[] {
  const intervals: SilenceInterval[] = [];
  let activeStart: number | null = null;

  for (const line of output.split("\n")) {
    const startMatch = line.match(SILENCE_START_PATTERN);
    if (startMatch) {
      activeStart = Number(startMatch[1]);
      continue;
    }

    if (line.includes("silence_start:")) {
      activeStart = null;
      continue;
    }

    const endMatch = line.match(SILENCE_END_PATTERN);
    if (endMatch && activeStart !== null) {
      const endSec = Number(endMatch[1]);
      const printedDurationSec = Number(endMatch[2]);
      const durationSec = endSec - activeStart;
      const isCoherent =
        Number.isFinite(activeStart) &&
        Number.isFinite(endSec) &&
        Number.isFinite(printedDurationSec) &&
        Number.isFinite(durationSec) &&
        endSec >= activeStart &&
        durationSec >= 0 &&
        printedDurationSec >= 0;

      if (!isCoherent) {
        activeStart = null;
        continue;
      }

      intervals.push({
        startSec: Number(activeStart.toFixed(3)),
        endSec: Number(endSec.toFixed(3)),
        durationSec: Number(durationSec.toFixed(3))
      });
      activeStart = null;
      continue;
    }

    if (line.includes("silence_end:")) {
      activeStart = null;
    }
  }

  return intervals;
}

export async function analyzeSilence(
  inputPath: string,
  options: SilenceAnalysisOptions,
  processRunner: SilenceProcessRunner = runProcess
) {
  const config = getConfig();
  const result = await processRunner(
    config.ffmpegPath,
    [
      "-hide_banner",
      "-i",
      inputPath,
      "-af",
      `silencedetect=noise=${options.noiseDb}dB:d=${options.minDurationSec}`,
      "-f",
      "null",
      "-"
    ],
    { timeoutMs: options.timeoutMs ?? DEFAULT_SILENCE_ANALYSIS_TIMEOUT_MS }
  );

  if (result.exitCode !== 0) {
    throw new Error(`ffmpeg silencedetect failed: ${result.stderr || result.stdout}`);
  }

  return parseSilencedetectOutput(result.stderr);
}
