import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { withTempDir } from "../../test/fixtures";
import { createInitialManifest, writeManifest } from "./manifest";
import type { ProcessHorizontalPackageInput } from "./horizontal-pipeline";
import { silentProgressReporter, type ProgressReporter } from "./progress";
import type { ProcessVerticalPackageInput } from "./vertical-pipeline";
import { getBackgroundMusicFromEnv, runMediaFactoryOnce } from "./cli";

const execFileAsync = promisify(execFile);

const horizontalMetadata = {
  durationSec: 120,
  width: 1920,
  height: 1080,
  fps: 30,
  hasAudio: true
};

const verticalMetadata = {
  durationSec: 45,
  width: 1080,
  height: 1920,
  fps: 30,
  hasAudio: true
};

async function createSource(rootDir: string, fileName: string) {
  const inputDir = path.join(rootDir, "Entrada");
  await mkdir(inputDir, { recursive: true });
  const sourcePath = path.join(inputDir, fileName);
  await writeFile(sourcePath, "video");
  return sourcePath;
}

async function writeConfig(rootDir: string, config: Record<string, unknown>) {
  await writeFile(path.join(rootDir, "config.json"), `${JSON.stringify(config, null, 2)}\n`);
}

function captureProgress() {
  const lines: string[] = [];
  const progress: ProgressReporter = {
    info: (message) => lines.push(message),
    warn: (message) => lines.push(message),
    poll: (message) => lines.push(message)
  };

  return { lines, progress };
}

describe("runMediaFactoryOnce", () => {
  it("processes horizontal files and skips disabled vertical files in sorted order", async () => {
    await withTempDir("media-factory-cli-", async (rootDir) => {
      const verticalPath = await createSource(rootDir, "b-vertical.mp4");
      const horizontalPath = await createSource(rootDir, "a-horizontal.mov");
      const processHorizontalPackage = vi.fn<(input: ProcessHorizontalPackageInput) => Promise<unknown>>()
        .mockResolvedValue({ packageDir: "/tmp/package", manifestPath: "/tmp/package/manifest.json" });
      const getFileSha256 = vi.fn().mockResolvedValue("abcdef1234567890abcdef1234567890");

      const result = await runMediaFactoryOnce({
        rootDir,
        deps: {
          isStableFile: vi.fn().mockResolvedValue(true),
          probeMedia: vi.fn(async (filePath: string) =>
            filePath === verticalPath ? verticalMetadata : horizontalMetadata
          ),
          getFileSha256,
          processHorizontalPackage,
          progress: silentProgressReporter
        }
      });

      expect(result).toEqual({
        processed: 1,
        skipped: [
          {
            sourcePath: verticalPath,
            reason: "supoclip is disabled for vertical files"
          }
        ]
      });
      expect(processHorizontalPackage).toHaveBeenCalledTimes(1);
      expect(getFileSha256).toHaveBeenCalledTimes(1);
      expect(getFileSha256).toHaveBeenCalledWith(horizontalPath);
      expect(processHorizontalPackage).toHaveBeenCalledWith(expect.objectContaining({
        sourcePath: horizontalPath,
        sourceHash: "abcdef1234567890abcdef1234567890",
        metadata: horizontalMetadata,
        inputDir: path.join(rootDir, "Entrada"),
        outputDir: path.join(rootDir, "Saida"),
        backgroundMusic: {
          enabled: false,
          musicDir: null,
          volume: 0.08,
          selection: "random"
        }
      }));
      await expect(readFile(path.join(rootDir, "Processados", "a-horizontal.mov"), "utf8")).resolves.toBe("video");
      await expect(readFile(verticalPath, "utf8")).resolves.toBe("video");
    });
  });

  it("routes vertical files to vertical processing and reports visible progress", async () => {
    await withTempDir("media-factory-cli-vertical-", async (rootDir) => {
      const sourcePath = await createSource(rootDir, "short.mp4");
      const supoclipRootDir = path.join(rootDir, "supoclip");
      await mkdir(supoclipRootDir, { recursive: true });
      await writeFile(path.join(supoclipRootDir, ".env"), "BACKEND_AUTH_SECRET=test-secret\n");
      await writeConfig(rootDir, {
        supoclip: {
          enabled: true,
          rootDir: supoclipRootDir
        }
      });
      const processHorizontalPackage = vi.fn<(input: ProcessHorizontalPackageInput) => Promise<unknown>>();
      const processVerticalPackage = vi.fn<(input: ProcessVerticalPackageInput) => Promise<unknown>>()
        .mockResolvedValue({ packageDir: "/tmp/vertical-package", manifestPath: "/tmp/vertical-package/manifest.json" });
      const ensureSupoClipReady = vi.fn().mockResolvedValue(undefined);
      const { lines, progress } = captureProgress();

      const result = await runMediaFactoryOnce({
        rootDir,
        deps: {
          isStableFile: vi.fn().mockResolvedValue(true),
          probeMedia: vi.fn().mockResolvedValue(verticalMetadata),
          getFileSha256: vi.fn().mockResolvedValue("fedcba9876543210fedcba9876543210"),
          processHorizontalPackage,
          processVerticalPackage,
          ensureSupoClipReady,
          progress
        }
      });

      expect(result).toEqual({ processed: 1, skipped: [] });
      expect(processHorizontalPackage).not.toHaveBeenCalled();
      expect(ensureSupoClipReady).toHaveBeenCalledWith(expect.objectContaining({
        enabled: true,
        autoStart: true
      }));
      expect(processVerticalPackage).toHaveBeenCalledWith(expect.objectContaining({
        sourcePath,
        sourceHash: "fedcba9876543210fedcba9876543210",
        metadata: verticalMetadata,
        inputDir: path.join(rootDir, "Entrada"),
        outputDir: path.join(rootDir, "Saida"),
        supoclip: expect.objectContaining({ enabled: true }),
        ai: expect.objectContaining({ enabled: false }),
        authSecret: "test-secret",
        deps: expect.objectContaining({ progress })
      }));
      expect(lines.join("\n")).toContain("Config carregada");
      expect(lines.join("\n")).toContain("Arquivos encontrados: 1");
      expect(lines.join("\n")).toContain(`Processando: ${sourcePath}`);
      expect(lines.join("\n")).toContain("Rota: vertical_short_clips");
      expect(lines.join("\n")).toContain("Movido para Processados:");
      expect(lines.join("\n")).toContain("Concluido: 1 processado(s), 0 ignorado(s)");
      await expect(readFile(path.join(rootDir, "Processados", "short.mp4"), "utf8")).resolves.toBe("video");
      await expect(stat(sourcePath)).rejects.toThrow();
    });
  });

  it("skips unstable files before probing or hashing them", async () => {
    await withTempDir("media-factory-cli-unstable-", async (rootDir) => {
      const sourcePath = await createSource(rootDir, "still-copying.mp4");
      const probeMedia = vi.fn();
      const getFileSha256 = vi.fn();
      const processHorizontalPackage = vi.fn();

      const result = await runMediaFactoryOnce({
        rootDir,
        deps: {
          isStableFile: vi.fn().mockResolvedValue(false),
          probeMedia,
          getFileSha256,
          processHorizontalPackage,
          progress: silentProgressReporter
        }
      });

      expect(result).toEqual({
        processed: 0,
        skipped: [
          {
            sourcePath,
            reason: "file is still changing"
          }
        ]
      });
      expect(probeMedia).not.toHaveBeenCalled();
      expect(getFileSha256).not.toHaveBeenCalled();
      expect(processHorizontalPackage).not.toHaveBeenCalled();
      await expect(readFile(sourcePath, "utf8")).resolves.toBe("video");
    });
  });

  it("moves failed processed files to Falhou and rethrows the processing error", async () => {
    await withTempDir("media-factory-cli-failed-source-", async (rootDir) => {
      const sourcePath = await createSource(rootDir, "broken.mp4");
      const processHorizontalPackage = vi.fn<(input: ProcessHorizontalPackageInput) => Promise<unknown>>()
        .mockRejectedValue(new Error("encoder failed"));
      const { lines, progress } = captureProgress();

      await expect(
        runMediaFactoryOnce({
          rootDir,
          deps: {
            isStableFile: vi.fn().mockResolvedValue(true),
            probeMedia: vi.fn().mockResolvedValue(horizontalMetadata),
            getFileSha256: vi.fn().mockResolvedValue("abcdef1234567890abcdef1234567890"),
            processHorizontalPackage,
            progress
          }
        })
      ).rejects.toThrow("encoder failed");

      await expect(readFile(path.join(rootDir, "Falhou", "broken.mp4"), "utf8")).resolves.toBe("video");
      await expect(stat(sourcePath)).rejects.toThrow();
      expect(lines.join("\n")).toContain("Movido para Falhou:");
    });
  });

  it("passes background music overrides through to the horizontal pipeline", async () => {
    await withTempDir("media-factory-cli-music-", async (rootDir) => {
      const sourcePath = await createSource(rootDir, "lecture.mp4");
      const backgroundMusic = {
        enabled: true,
        musicDir: path.join(rootDir, "Music"),
        volume: 0.12,
        selection: "random" as const
      };
      const processHorizontalPackage = vi.fn<(input: ProcessHorizontalPackageInput) => Promise<unknown>>()
        .mockResolvedValue({ packageDir: "/tmp/package", manifestPath: "/tmp/package/manifest.json" });

      const result = await runMediaFactoryOnce({
        rootDir,
        backgroundMusic,
        deps: {
          isStableFile: vi.fn().mockResolvedValue(true),
          probeMedia: vi.fn().mockResolvedValue(horizontalMetadata),
          getFileSha256: vi.fn().mockResolvedValue("0123456789abcdef0123456789abcdef"),
          processHorizontalPackage,
          progress: silentProgressReporter
        }
      });

      expect(result).toEqual({ processed: 1, skipped: [] });
      expect(processHorizontalPackage).toHaveBeenCalledWith(expect.objectContaining({
        sourcePath,
        backgroundMusic
      }));
    });
  });

  it("preserves config background music volume when input only overrides musicDir", async () => {
    await withTempDir("media-factory-cli-music-dir-merge-", async (rootDir) => {
      const sourcePath = await createSource(rootDir, "lecture.mp4");
      const musicDir = path.join(rootDir, "EnvMusic");
      await writeConfig(rootDir, {
        backgroundMusic: {
          enabled: true,
          musicDir: path.join(rootDir, "ConfigMusic"),
          volume: 0.2
        }
      });
      const processHorizontalPackage = vi.fn<(input: ProcessHorizontalPackageInput) => Promise<unknown>>()
        .mockResolvedValue({ packageDir: "/tmp/package", manifestPath: "/tmp/package/manifest.json" });

      const result = await runMediaFactoryOnce({
        rootDir,
        backgroundMusic: {
          musicDir
        },
        deps: {
          isStableFile: vi.fn().mockResolvedValue(true),
          probeMedia: vi.fn().mockResolvedValue(horizontalMetadata),
          getFileSha256: vi.fn().mockResolvedValue("0123456789abcdef0123456789abcdef"),
          processHorizontalPackage,
          progress: silentProgressReporter
        }
      });

      expect(result).toEqual({ processed: 1, skipped: [] });
      expect(processHorizontalPackage).toHaveBeenCalledWith(expect.objectContaining({
        sourcePath,
        backgroundMusic: expect.objectContaining({
          enabled: true,
          musicDir,
          volume: 0.2,
          selection: "random"
        })
      }));
    });
  });

  it("preserves config background music musicDir when env only overrides volume", async () => {
    await withTempDir("media-factory-cli-volume-merge-", async (rootDir) => {
      const sourcePath = await createSource(rootDir, "lecture.mp4");
      const musicDir = path.join(rootDir, "ConfigMusic");
      await writeConfig(rootDir, {
        backgroundMusic: {
          enabled: true,
          musicDir,
          volume: 0.2
        }
      });
      const processHorizontalPackage = vi.fn<(input: ProcessHorizontalPackageInput) => Promise<unknown>>()
        .mockResolvedValue({ packageDir: "/tmp/package", manifestPath: "/tmp/package/manifest.json" });
      const oldMusicDir = process.env.MEDIA_FACTORY_MUSIC_DIR;
      const oldMusicVolume = process.env.MEDIA_FACTORY_MUSIC_VOLUME;

      try {
        delete process.env.MEDIA_FACTORY_MUSIC_DIR;
        process.env.MEDIA_FACTORY_MUSIC_VOLUME = "0.05";

        const result = await runMediaFactoryOnce({
          rootDir,
          backgroundMusic: getBackgroundMusicFromEnv(),
          deps: {
            isStableFile: vi.fn().mockResolvedValue(true),
            probeMedia: vi.fn().mockResolvedValue(horizontalMetadata),
            getFileSha256: vi.fn().mockResolvedValue("0123456789abcdef0123456789abcdef"),
            processHorizontalPackage,
            progress: silentProgressReporter
          }
        });

        expect(result).toEqual({ processed: 1, skipped: [] });
        expect(processHorizontalPackage).toHaveBeenCalledWith(expect.objectContaining({
          sourcePath,
          backgroundMusic: expect.objectContaining({
            enabled: true,
            musicDir,
            volume: 0.05,
            selection: "random"
          })
        }));
      } finally {
        if (oldMusicDir === undefined) {
          delete process.env.MEDIA_FACTORY_MUSIC_DIR;
        } else {
          process.env.MEDIA_FACTORY_MUSIC_DIR = oldMusicDir;
        }
        if (oldMusicVolume === undefined) {
          delete process.env.MEDIA_FACTORY_MUSIC_VOLUME;
        } else {
          process.env.MEDIA_FACTORY_MUSIC_VOLUME = oldMusicVolume;
        }
      }
    });
  });

  it("prints parseable JSON from the CLI entrypoint", async () => {
    await withTempDir("media-factory-cli-smoke-", async (rootDir) => {
      const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");

      const { stdout } = await execFileAsync(tsxBin, ["src/server/media-factory/cli.ts", rootDir], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          MEDIA_FACTORY_MUSIC_DIR: "",
          MEDIA_FACTORY_MUSIC_VOLUME: ""
        }
      });

      const finalLine = stdout.trim().split("\n").at(-1);
      expect(JSON.parse(finalLine ?? "")).toEqual({ processed: 0, skipped: [] });
    });
  });

  it("approves ready packages from the CLI entrypoint", async () => {
    await withTempDir("media-factory-cli-approve-", async (rootDir) => {
      const packageDir = path.join(rootDir, "Saida", "ready-to-approve", "package-one");
      await mkdir(packageDir, { recursive: true });
      const manifest = createInitialManifest({
        id: "package-one",
        status: "ready_to_approve",
        source: {
          path: path.join(rootDir, "Processados", "source.mp4"),
          hash: "abcdef1234567890",
          orientation: "horizontal",
          durationSec: 60,
          width: 1920,
          height: 1080,
          hasAudio: true
        },
        pipeline: "horizontal_youtube_podcast_x",
        now: new Date("2026-05-11T12:00:00.000Z")
      });
      await writeManifest(path.join(packageDir, "manifest.json"), manifest);
      const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");

      const { stdout } = await execFileAsync(tsxBin, ["src/server/media-factory/cli.ts", rootDir, "approve"], {
        cwd: process.cwd()
      });

      const finalLine = stdout.trim().split("\n").at(-1);
      const result = JSON.parse(finalLine ?? "");
      expect(result.approved).toEqual([path.join(rootDir, "Saida", "approved", "package-one")]);
      const approvedManifest = JSON.parse(
        await readFile(path.join(rootDir, "Saida", "approved", "package-one", "manifest.json"), "utf8")
      );
      expect(approvedManifest.status).toBe("approved");
    });
  });

  it("runs publish dry-run from the CLI entrypoint", async () => {
    await withTempDir("media-factory-cli-publish-", async (rootDir) => {
      const packageDir = path.join(rootDir, "Saida", "approved", "package-one");
      await mkdir(path.join(packageDir, "youtube"), { recursive: true });
      await mkdir(path.join(packageDir, "podcast"), { recursive: true });
      await mkdir(path.join(packageDir, "x"), { recursive: true });
      await writeFile(path.join(packageDir, "youtube/youtube.mp4"), "video");
      await writeFile(path.join(packageDir, "youtube/title.txt"), "Titulo\n");
      await writeFile(path.join(packageDir, "youtube/description.txt"), "Descricao\n");
      await writeFile(path.join(packageDir, "youtube/hashtags.txt"), "#video\n");
      await writeFile(path.join(packageDir, "youtube/thumbnail.png"), "thumbnail\n");
      await writeFile(path.join(packageDir, "podcast/podcast-audio.mp3"), "audio");
      await writeFile(path.join(packageDir, "podcast/title.txt"), "Podcast\n");
      await writeFile(path.join(packageDir, "podcast/description.txt"), "Descricao podcast\n");
      await writeFile(path.join(packageDir, "x/thread.json"), JSON.stringify({ posts: ["Post 1"] }));
      const manifest = createInitialManifest({
        id: "package-one",
        status: "approved",
        source: {
          path: path.join(rootDir, "Processados", "source.mp4"),
          hash: "abcdef1234567890",
          orientation: "horizontal",
          durationSec: 60,
          width: 1920,
          height: 1080,
          hasAudio: true
        },
        pipeline: "horizontal_youtube_podcast_x",
        now: new Date("2026-05-11T12:00:00.000Z")
      });
      await writeManifest(path.join(packageDir, "manifest.json"), {
        ...manifest,
        publishPlan: {
          youtube: { mode: "dry-run", video: "youtube/youtube.mp4" },
          spotify: { mode: "dry-run", audio: "podcast/podcast-audio.mp3" },
          x: { mode: "dry-run", thread: "x/thread.json" }
        }
      });
      const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");

      const { stdout } = await execFileAsync(tsxBin, ["src/server/media-factory/cli.ts", rootDir, "publish"], {
        cwd: process.cwd()
      });

      const finalLine = stdout.trim().split("\n").at(-1);
      expect(JSON.parse(finalLine ?? "").summary).toEqual({ packages: 1, ready: 1, blocked: 0 });
      await expect(readFile(path.join(rootDir, "Logs", "ultimo-dry-run-publicacao.json"), "utf8")).resolves.toContain(
        '"ready": 1'
      );
    });
  });

  it("runs live YouTube publish checks from the CLI entrypoint", async () => {
    await withTempDir("media-factory-cli-publish-youtube-live-", async (rootDir) => {
      await writeConfig(rootDir, {
        rootDir,
        publishers: {
          youtube: "live",
          instagram: "dry-run",
          tiktok: "dry-run",
          x: "dry-run",
          spotify: "dry-run"
        }
      });
      const packageDir = path.join(rootDir, "Saida", "approved", "package-one");
      await mkdir(path.join(packageDir, "youtube"), { recursive: true });
      await mkdir(path.join(packageDir, "podcast"), { recursive: true });
      await mkdir(path.join(packageDir, "x"), { recursive: true });
      await writeFile(path.join(packageDir, "youtube/youtube.mp4"), "video");
      await writeFile(path.join(packageDir, "youtube/title.txt"), "Titulo\n");
      await writeFile(path.join(packageDir, "youtube/description.txt"), "Descricao\n");
      await writeFile(path.join(packageDir, "youtube/hashtags.txt"), "#video\n");
      await writeFile(path.join(packageDir, "youtube/thumbnail.png"), "thumbnail\n");
      await writeFile(path.join(packageDir, "podcast/podcast-audio.mp3"), "audio");
      await writeFile(path.join(packageDir, "podcast/title.txt"), "Podcast\n");
      await writeFile(path.join(packageDir, "podcast/description.txt"), "Descricao podcast\n");
      await writeFile(path.join(packageDir, "x/thread.json"), JSON.stringify({ posts: ["Post 1"] }));
      const manifest = createInitialManifest({
        id: "package-one",
        status: "approved",
        source: {
          path: path.join(rootDir, "Processados", "source.mp4"),
          hash: "abcdef1234567890",
          orientation: "horizontal",
          durationSec: 60,
          width: 1920,
          height: 1080,
          hasAudio: true
        },
        pipeline: "horizontal_youtube_podcast_x",
        now: new Date("2026-05-11T12:00:00.000Z")
      });
      await writeManifest(path.join(packageDir, "manifest.json"), {
        ...manifest,
        publishPlan: {
          youtube: { mode: "live", video: "youtube/youtube.mp4" },
          spotify: { mode: "dry-run", audio: "podcast/podcast-audio.mp3" },
          x: { mode: "dry-run", thread: "x/thread.json" }
        }
      });
      const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");

      const { stdout } = await execFileAsync(tsxBin, ["src/server/media-factory/cli.ts", rootDir, "publish"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          YOUTUBE_CLIENT_ID: "",
          YOUTUBE_CLIENT_SECRET: "",
          YOUTUBE_REFRESH_TOKEN: ""
        }
      });

      const finalLine = stdout.trim().split("\n").at(-1);
      expect(JSON.parse(finalLine ?? "").summary).toEqual({ packages: 1, ready: 0, blocked: 1, livePublished: 0 });
      await expect(readFile(path.join(rootDir, "Logs", "ultimo-publicacao.json"), "utf8")).resolves.toContain(
        "YOUTUBE_REFRESH_TOKEN"
      );
    });
  });
});
