import { spawn } from "node:child_process";
import { getConfig } from "./config";
import type { AppConfig } from "./config";

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_MAX_OUTPUT_LENGTH = 8192;

export type DependencyResult = {
  name: string;
  available: boolean;
  detail: string;
};

export type SpawnedBinary = {
  stdout: {
    on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  };
  stderr: {
    on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  };
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "close", listener: (code: number | null) => void): unknown;
  kill(): boolean;
};

export type SpawnBinary = (command: string, args: string[]) => SpawnedBinary;

export type DependencyCheckOptions = {
  spawnBinary?: SpawnBinary;
  timeoutMs?: number;
  maxOutputLength?: number;
};

export function parseDependencyResult(name: string, exitCode: number | null, output: string): DependencyResult {
  const detail = output.trim().split("\n")[0] ?? "";
  return {
    name,
    available: exitCode === 0,
    detail: detail || (exitCode === 0 ? "available" : "not available")
  };
}

async function checkBinary(
  name: string,
  command: string,
  args: string[],
  options: DependencyCheckOptions = {}
): Promise<DependencyResult> {
  return new Promise((resolve) => {
    const child = (options.spawnBinary ?? spawn)(command, args);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxOutputLength = options.maxOutputLength ?? DEFAULT_MAX_OUTPUT_LENGTH;
    let output = "";
    let settled = false;

    const timeout = setTimeout(() => {
      child.kill();
      settle({ name, available: false, detail: `Timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    function settle(result: DependencyResult) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(result);
    }

    function appendOutput(chunk: Buffer | string) {
      if (output.length >= maxOutputLength) {
        return;
      }

      output = (output + chunk.toString()).slice(0, maxOutputLength);
    }

    child.stdout.on("data", (chunk) => {
      appendOutput(chunk);
    });
    child.stderr.on("data", (chunk) => {
      appendOutput(chunk);
    });
    child.on("error", (error) => {
      settle({ name, available: false, detail: error.message });
    });
    child.on("close", (code) => {
      settle(parseDependencyResult(name, code, output));
    });
  });
}

export async function checkDependencies(config: AppConfig = getConfig(), options: DependencyCheckOptions = {}) {
  const [ffmpeg, ffprobe, autoEditor] = await Promise.all([
    checkBinary("ffmpeg", config.ffmpegPath, ["-version"], options),
    checkBinary("ffprobe", config.ffprobePath, ["-version"], options),
    checkBinary("auto-editor", config.autoEditorPath, ["--version"], options)
  ]);

  return {
    required: [ffmpeg, ffprobe],
    optional: [autoEditor],
    canRender: ffmpeg.available && ffprobe.available,
    canAutoEdit: autoEditor.available
  };
}
