import { spawn } from "node:child_process";

export type ProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

export type ProcessOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

export function runProcess(command: string, args: string[], options: ProcessOptions = {}): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;

    function cleanup() {
      if (timeout) {
        clearTimeout(timeout);
      }

      options.signal?.removeEventListener("abort", abort);
    }

    function settle(result: ProcessResult) {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(result);
    }

    function fail(error: Error) {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      child.kill();
      reject(error);
    }

    function abort() {
      fail(new Error("Process aborted"));
    }

    if (options.signal?.aborted) {
      abort();
      return;
    }

    if (options.timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        fail(new Error(`Process timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs);
    }

    options.signal?.addEventListener("abort", abort, { once: true });

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", fail);
    child.on("close", (exitCode) => {
      settle({ exitCode, stdout, stderr });
    });
  });
}
