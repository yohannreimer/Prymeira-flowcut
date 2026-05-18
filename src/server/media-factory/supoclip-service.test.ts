import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { withTempDir } from "../../test/fixtures";
import { ensureSupoClipReady } from "./supoclip-service";
import type { MediaFactoryConfig } from "./config";

function supoclipConfig(rootDir: string, overrides: Partial<MediaFactoryConfig["supoclip"]> = {}) {
  return {
    enabled: true,
    rootDir,
    backendUrl: "http://localhost:8000",
    autoStart: true,
    userId: "media-factory",
    maxClips: 5,
    minClipDurationSec: 12,
    captionTemplate: "default",
    processingMode: "fast",
    outputFormat: "vertical",
    addSubtitles: true,
    cutLongPauses: true,
    ...overrides
  } satisfies MediaFactoryConfig["supoclip"];
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function createSupoClipRoot(rootDir: string) {
  await mkdir(rootDir, { recursive: true });
  await writeFile(path.join(rootDir, "docker-compose.yml"), "services: {}\n");
}

describe("ensureSupoClipReady", () => {
  it("does nothing when SupoClip already responds healthy", async () => {
    await withTempDir("supoclip-ready-", async (rootDir) => {
      await createSupoClipRoot(rootDir);
      const execFile = vi.fn();
      const fetch = vi.fn().mockResolvedValue(jsonResponse({ status: "healthy" }));

      await expect(
        ensureSupoClipReady(supoclipConfig(rootDir), {
          execFile,
          fetch
        })
      ).resolves.toBeUndefined();

      expect(fetch).toHaveBeenCalledWith(new URL("http://localhost:8000/health"), expect.any(Object));
      expect(execFile).not.toHaveBeenCalled();
    });
  });

  it("opens Docker, starts docker compose, and waits for health when SupoClip is down", async () => {
    await withTempDir("supoclip-autostart-", async (rootDir) => {
      await createSupoClipRoot(rootDir);
      const fetch = vi.fn()
        .mockRejectedValueOnce(new Error("down"))
        .mockRejectedValueOnce(new Error("starting"))
        .mockResolvedValue(jsonResponse({ status: "healthy" }));
      let dockerInfoCalls = 0;
      const execFile = vi.fn(async (file: string, args: readonly string[]) => {
        if (file === "docker" && args.join(" ") === "info") {
          dockerInfoCalls += 1;
        }
        if (file === "docker" && args.join(" ") === "info" && dockerInfoCalls === 1) {
          throw new Error("docker down");
        }
        return {};
      });

      await expect(
        ensureSupoClipReady(supoclipConfig(rootDir), {
          execFile,
          fetch,
          sleep: vi.fn().mockResolvedValue(undefined),
          maxWaitMs: 1_000,
          pollIntervalMs: 1
        })
      ).resolves.toBeUndefined();

      expect(execFile).toHaveBeenCalledWith("docker", ["info"]);
      expect(execFile).toHaveBeenCalledWith("open", ["-a", "Docker"]);
      expect(execFile).toHaveBeenCalledWith("docker", ["compose", "version"]);
      expect(execFile).toHaveBeenCalledWith("docker", ["compose", "up", "-d"], { cwd: rootDir });
    });
  });

  it("throws a clear error when autostart is disabled and SupoClip is down", async () => {
    await withTempDir("supoclip-no-autostart-", async (rootDir) => {
      await createSupoClipRoot(rootDir);

      await expect(
        ensureSupoClipReady(supoclipConfig(rootDir, { autoStart: false }), {
          fetch: vi.fn().mockRejectedValue(new Error("down"))
        })
      ).rejects.toThrow("SupoClip nao respondeu em http://localhost:8000");
    });
  });
});
