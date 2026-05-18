import { describe, expect, it } from "vitest";
import { runProcess } from "./process";

describe("runProcess", () => {
  it("captures stdout and stderr from a completed process", async () => {
    const result = await runProcess(process.execPath, [
      "-e",
      "process.stdout.write('out'); process.stderr.write('err');"
    ]);

    expect(result).toEqual({ exitCode: 0, stdout: "out", stderr: "err" });
  });

  it("rejects when a process times out", async () => {
    await expect(
      runProcess(process.execPath, ["-e", "setTimeout(() => {}, 1000);"], { timeoutMs: 25 })
    ).rejects.toThrow("Process timed out after 25ms");
  });

  it("rejects when aborted", async () => {
    const controller = new AbortController();
    const promise = runProcess(process.execPath, ["-e", "setTimeout(() => {}, 1000);"], {
      signal: controller.signal
    });

    controller.abort();

    await expect(promise).rejects.toThrow("Process aborted");
  });
});
