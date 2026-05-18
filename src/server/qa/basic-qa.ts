import { getConfig } from "../config";
import { probeMedia } from "../media/probe";
import { runProcess } from "../media/process";

export type BasicQaReport = {
  status: "passed" | "warning" | "failed";
  warnings: string[];
};

export type BasicQaOptions = {
  expectedHasAudio?: boolean;
};

export const BLACKDETECT_TIMEOUT_MS = 30000;

function parseBlackdetect(output: string) {
  return output
    .split("\n")
    .filter((line) => line.includes("black_start"))
    .map((line) => line.trim());
}

export async function runBasicQa(inputPath: string, options: BasicQaOptions = {}): Promise<BasicQaReport> {
  const warnings: string[] = [];
  const metadata = await probeMedia(inputPath);

  if (metadata.durationSec < 1) {
    warnings.push("Rendered video is shorter than one second.");
  }

  if (options.expectedHasAudio === true && !metadata.hasAudio) {
    warnings.push("Rendered video has no audio track.");
  }

  const config = getConfig();
  try {
    const blackdetect = await runProcess(
      config.ffmpegPath,
      ["-hide_banner", "-i", inputPath, "-vf", "blackdetect=d=0.5:pix_th=0.1", "-an", "-f", "null", "-"],
      { timeoutMs: BLACKDETECT_TIMEOUT_MS }
    );

    if (blackdetect.exitCode === 0) {
      const blackFrames = parseBlackdetect(blackdetect.stderr);
      if (blackFrames.length > 0) {
        warnings.push(`Detected possible black frame regions: ${blackFrames.slice(0, 3).join(" | ")}`);
      }
    } else {
      warnings.push("Black-frame QA check failed.");
    }
  } catch {
    warnings.push("Black-frame QA check failed.");
  }

  return {
    status: warnings.length > 0 ? "warning" : "passed",
    warnings
  };
}
