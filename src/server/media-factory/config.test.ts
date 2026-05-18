import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadMediaFactoryConfigFromFile, resolveMediaFactoryConfig } from "./config";

describe("resolveMediaFactoryConfig", () => {
  it("resolves defaults from the required root directory", () => {
    const rootDir = path.resolve("workspace/media-factory");

    expect(resolveMediaFactoryConfig({ rootDir })).toEqual({
      rootDir,
      inputDir: path.join(rootDir, "Entrada"),
      outputDir: path.join(rootDir, "Saida"),
      approvalMode: "manual",
      horizontal: {
        youtube: true,
        podcast: true,
        xThread: true
      },
      backgroundMusic: {
        enabled: false,
        musicDir: null,
        volume: 0.08,
        selection: "random"
      },
      vertical: {
        supoclip: false,
        maxClips: 5,
        captionTemplate: "padrao-yohann"
      },
      publishers: {
        youtube: "dry-run",
        instagram: "dry-run",
        tiktok: "dry-run",
        x: "dry-run",
        spotify: "dry-run"
      },
      ai: {
        enabled: false,
        provider: "openai",
        model: "gpt-4.1-mini",
        transcriptionModel: "whisper-1",
        language: "pt",
        promptVersions: {}
      },
      supoclip: {
        enabled: false,
        rootDir: "/Users/yohannreimer/Documents/supoclip",
        backendUrl: "http://localhost:8000",
        autoStart: true,
        userId: "media-factory",
        maxClips: 5,
        minClipDurationSec: 12,
        captionTemplate: "default",
        processingMode: "fast",
        outputFormat: "vertical",
        addSubtitles: true,
        cutLongPauses: true
      }
    });
  });

  it("resolves the config-file defaults for AI and SupoClip", () => {
    const rootDir = path.resolve("workspace/media-factory");

    expect(resolveMediaFactoryConfig({ rootDir })).toMatchObject({
      backgroundMusic: {
        enabled: false,
        musicDir: null,
        volume: 0.08,
        selection: "random"
      },
      ai: {
        enabled: false,
        provider: "openai",
        model: "gpt-4.1-mini",
        transcriptionModel: "whisper-1",
        language: "pt"
      },
      supoclip: {
        enabled: false,
        rootDir: "/Users/yohannreimer/Documents/supoclip",
        backendUrl: "http://localhost:8000",
        autoStart: true,
        userId: "media-factory",
        maxClips: 5,
        minClipDurationSec: 12,
        captionTemplate: "default",
        processingMode: "fast",
        outputFormat: "vertical",
        addSubtitles: true,
        cutLongPauses: true
      }
    });
  });

  it("loads config from a JSON file and lets file values override fallback defaults", async () => {
    const rootDir = path.resolve("workspace/media-factory");
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "media-factory-config-"));
    const configPath = path.join(tempDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify({ backgroundMusic: { volume: 0.04 } }), "utf8");

    await expect(loadMediaFactoryConfigFromFile(configPath, { rootDir })).resolves.toMatchObject({
      rootDir,
      backgroundMusic: {
        volume: 0.04
      }
    });
  });

  it("merges partial overrides with nested defaults", () => {
    const rootDir = path.resolve("workspace/media-factory");
    const musicDir = path.join(rootDir, "Music");

    expect(
      resolveMediaFactoryConfig({
        rootDir,
        outputDir: "/tmp/media-output",
        approvalMode: "automatic",
        backgroundMusic: {
          enabled: true,
          musicDir,
          volume: 0.12
        },
        publishers: {
          youtube: "live",
          instagram: "disabled"
        },
        ai: {
          model: "gpt-5.1",
          promptVersions: {
            youtube: "v2"
          }
        }
      })
    ).toMatchObject({
      inputDir: path.join(rootDir, "Entrada"),
      outputDir: "/tmp/media-output",
      approvalMode: "automatic",
      backgroundMusic: {
        enabled: true,
        musicDir,
        volume: 0.12,
        selection: "random"
      },
      publishers: {
        youtube: "live",
        instagram: "disabled",
        tiktok: "dry-run",
        x: "dry-run",
        spotify: "dry-run"
      },
      ai: {
        provider: "openai",
        model: "gpt-5.1",
        transcriptionModel: "whisper-1",
        language: "pt",
        promptVersions: {
          youtube: "v2"
        }
      }
    });
  });

  it("rejects invalid publisher modes", () => {
    expect(() =>
      resolveMediaFactoryConfig(({
        rootDir: "/tmp/media-factory",
        publishers: {
          youtube: "preview"
        }
      }) as unknown as Parameters<typeof resolveMediaFactoryConfig>[0])
    ).toThrow();
  });

  it("rejects unsupported background music selection modes", () => {
    expect(() =>
      resolveMediaFactoryConfig(({
        rootDir: "/tmp/media-factory",
        backgroundMusic: {
          selection: "first"
        }
      }) as unknown as Parameters<typeof resolveMediaFactoryConfig>[0])
    ).toThrow();
  });

  it.each([-0.01, 0.31, Number.POSITIVE_INFINITY, Number.NaN])(
    "rejects invalid background music volume %s",
    (volume) => {
      expect(() =>
        resolveMediaFactoryConfig({
          rootDir: "/tmp/media-factory",
          backgroundMusic: {
            volume
          }
        })
      ).toThrow();
    }
  );

  it.each([
    ["rootDir", { rootDir: "" }],
    ["inputDir", { rootDir: "/tmp/media-factory", inputDir: "" }],
    ["outputDir", { rootDir: "/tmp/media-factory", outputDir: "   " }],
    ["backgroundMusic.musicDir", { rootDir: "/tmp/media-factory", backgroundMusic: { musicDir: "" } }],
    ["vertical.captionTemplate", { rootDir: "/tmp/media-factory", vertical: { captionTemplate: "   " } }]
  ])("rejects empty %s settings", (_setting, config) => {
    expect(() => resolveMediaFactoryConfig(config)).toThrow();
  });
});
