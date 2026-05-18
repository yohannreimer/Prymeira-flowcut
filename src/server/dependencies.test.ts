import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { checkDependencies, parseDependencyResult, type SpawnedBinary } from "./dependencies";

describe("parseDependencyResult", () => {
  it("marks successful binaries as available", () => {
    expect(parseDependencyResult("ffmpeg", 0, "ffmpeg version 7")).toEqual({
      name: "ffmpeg",
      available: true,
      detail: "ffmpeg version 7"
    });
  });

  it("marks failed binaries as unavailable", () => {
    expect(parseDependencyResult("auto-editor", 127, "command not found")).toEqual({
      name: "auto-editor",
      available: false,
      detail: "command not found"
    });
  });
});

class FakeSpawnedBinary extends EventEmitter implements SpawnedBinary {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;

  kill(): boolean {
    this.killed = true;
    return true;
  }
}

describe("checkDependencies", () => {
  it("aggregates required and optional dependency availability", async () => {
    const results: Record<string, { code: number; output: string }> = {
      ffmpeg: { code: 0, output: "ffmpeg version 7\n" },
      ffprobe: { code: 0, output: "ffprobe version 7\n" },
      "auto-editor": { code: 127, output: "command not found\n" }
    };

    const dependencies = await checkDependencies(
      {
        workspaceRoot: "/tmp/workspace",
        ffmpegPath: "ffmpeg",
        ffprobePath: "ffprobe",
        autoEditorPath: "auto-editor",
        uploadFileSizeLimitBytes: 1024
      },
      {
        spawnBinary(command) {
          const child = new FakeSpawnedBinary();
          queueMicrotask(() => {
            child.stderr.emit("data", results[command].output);
            child.emit("close", results[command].code);
          });
          return child;
        }
      }
    );

    expect(dependencies.required).toEqual([
      { name: "ffmpeg", available: true, detail: "ffmpeg version 7" },
      { name: "ffprobe", available: true, detail: "ffprobe version 7" }
    ]);
    expect(dependencies.optional).toEqual([{ name: "auto-editor", available: false, detail: "command not found" }]);
    expect(dependencies.canRender).toBe(true);
    expect(dependencies.canAutoEdit).toBe(false);
  });

  it("times out binaries that do not exit", async () => {
    const children: FakeSpawnedBinary[] = [];

    const dependencies = await checkDependencies(
      {
        workspaceRoot: "/tmp/workspace",
        ffmpegPath: "ffmpeg",
        ffprobePath: "ffprobe",
        autoEditorPath: "auto-editor",
        uploadFileSizeLimitBytes: 1024
      },
      {
        timeoutMs: 1,
        spawnBinary() {
          const child = new FakeSpawnedBinary();
          children.push(child);
          return child;
        }
      }
    );

    expect(dependencies.required).toEqual([
      { name: "ffmpeg", available: false, detail: "Timed out after 1ms" },
      { name: "ffprobe", available: false, detail: "Timed out after 1ms" }
    ]);
    expect(dependencies.optional).toEqual([{ name: "auto-editor", available: false, detail: "Timed out after 1ms" }]);
    expect(dependencies.canRender).toBe(false);
    expect(dependencies.canAutoEdit).toBe(false);
    expect(children.every((child) => child.killed)).toBe(true);
  });
});
