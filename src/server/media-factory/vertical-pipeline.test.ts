import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempDir } from "../../test/fixtures";
import type { ProgressReporter } from "./progress";
import { processVerticalPackage } from "./vertical-pipeline";

const metadataWithAudio = {
  durationSec: 120,
  width: 1080,
  height: 1920,
  fps: 30,
  hasAudio: true
};

async function createSource(dir: string) {
  const inputDir = path.join(dir, "Entrada");
  const outputDir = path.join(dir, "Saida");
  await fs.mkdir(inputDir, { recursive: true });
  const sourcePath = path.join(inputDir, "aula.mp4");
  await fs.writeFile(sourcePath, "source");

  return { inputDir, outputDir, sourcePath };
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
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

function supoclipConfig(overrides: Partial<Parameters<typeof processVerticalPackage>[0]["supoclip"]> = {}) {
  return {
    enabled: true,
    rootDir: "/supoclip",
    backendUrl: "http://user:pass@localhost:8000/path?token=secret",
    autoStart: false,
    userId: "media-factory",
    maxClips: 5,
    minClipDurationSec: 12,
    captionTemplate: "default",
    processingMode: "fast",
    outputFormat: "vertical",
    addSubtitles: true,
    cutLongPauses: true,
    ...overrides
  } satisfies Parameters<typeof processVerticalPackage>[0]["supoclip"];
}

function aiConfig() {
  return {
    enabled: true,
    provider: "openai",
    model: "gpt-4.1-mini",
    transcriptionModel: "whisper-1",
    language: "pt",
    promptVersions: {}
  } satisfies NonNullable<Parameters<typeof processVerticalPackage>[0]["ai"]>;
}

function createVerticalPayloadsForClips(clips: Array<{ clip_id?: string; title?: string }>) {
  return {
    clips: clips.map((clip) => ({
      clipId: clip.clip_id ?? "clip",
      youtubeShorts: {
        title: clip.title ?? `Titulo ${clip.clip_id}`,
        description: `Descricao ${clip.clip_id}`,
        hashtags: ["#shorts"],
        privacyStatus: "private" as const
      },
      instagram: {
        caption: `Caption reels ${clip.clip_id}`,
        hashtags: ["#reels"]
      },
      tiktok: {
        caption: `Caption tiktok ${clip.clip_id}`,
        hashtags: ["#tiktok"]
      }
    }))
  };
}

function createVerticalPayloadGenerator(clips: Array<{ clip_id?: string; title?: string }>) {
  return vi.fn().mockResolvedValue(createVerticalPayloadsForClips(clips));
}

function clip({
  id,
  score,
  byte = 1,
  rank = 999,
  duration,
  startTime,
  endTime
}: {
  id: string;
  score?: number;
  byte?: number;
  rank?: number;
  duration?: number;
  startTime?: string;
  endTime?: string;
}) {
  return {
    clip_id: id,
    title: `Clip ${id}`,
    rank,
    ...(score === undefined ? {} : { score }),
    ...(duration === undefined ? {} : { duration }),
    ...(startTime === undefined ? {} : { start_time: startTime }),
    ...(endTime === undefined ? {} : { end_time: endTime }),
    bytes: new Uint8Array([byte])
  };
}

describe("processVerticalPackage", () => {
  it("creates a sorted ready-to-approve vertical shorts package capped to the configured max clips", async () => {
    await withTempDir("media-factory-vertical-", async (dir) => {
      const { inputDir, outputDir, sourcePath } = await createSource(dir);
      const processSupoClipVideo = vi.fn().mockResolvedValue({
        taskId: "task-123",
        clips: [
          clip({ id: "low", score: 10, byte: 10 }),
          clip({ id: "highest", score: 99, byte: 99 }),
          clip({ id: "middle", score: 50, byte: 50 }),
          clip({ id: "high", score: 80, byte: 80 }),
          clip({ id: "lower", score: 20, byte: 20 }),
          clip({ id: "lowest", score: 1, byte: 1 })
        ]
      });

      const result = await processVerticalPackage({
        sourcePath,
        sourceHash: "abcdef1234567890",
        metadata: metadataWithAudio,
        inputDir,
        outputDir,
        supoclip: supoclipConfig(),
        ai: aiConfig(),
        now: new Date("2026-05-11T12:00:00.000Z"),
        deps: {
          processSupoClipVideo,
          generateVerticalShortPayloads: createVerticalPayloadGenerator([
            { clip_id: "highest", title: "Clip highest" },
            { clip_id: "high", title: "Clip high" },
            { clip_id: "middle", title: "Clip middle" },
            { clip_id: "lower", title: "Clip lower" },
            { clip_id: "low", title: "Clip low" }
          ])
        }
      });

      expect(result.packageDir).toBe(path.join(outputDir, "ready-to-approve", "2026-05-11 - Shorts - Clip highest"));
      expect(result.manifestPath).toBe(path.join(result.packageDir, "manifest.json"));
      expect(await exists(path.join(result.packageDir, "shorts/rank-01/clip.mp4"))).toBe(true);
      expect(await exists(path.join(result.packageDir, "shorts/rank-05/clip.mp4"))).toBe(true);
      expect(await exists(path.join(result.packageDir, "shorts/rank-06/clip.mp4"))).toBe(false);
      expect(
        JSON.parse(await fs.readFile(path.join(result.packageDir, "shorts/rank-01/youtube-shorts-payload.json"), "utf8"))
      ).toMatchObject({ video: "shorts/rank-01/clip.mp4" });

      const rankOneMetadata = JSON.parse(await fs.readFile(path.join(result.packageDir, "shorts/rank-01/metadata.json"), "utf8"));
      expect(rankOneMetadata).toMatchObject({
        clip_id: "highest",
        score: 99,
        rank: 1
      });

      const task = JSON.parse(await fs.readFile(path.join(result.packageDir, "supoclip/task.json"), "utf8"));
      expect(task.settings).toMatchObject({ backendOrigin: "http://localhost:8000" });
      expect(task.settings).not.toHaveProperty("backendUrl");

      const manifest = JSON.parse(await fs.readFile(result.manifestPath, "utf8"));
      expect(manifest.id).toBe("2026-05-11 - Shorts - Clip highest");
      expect(manifest.status).toBe("ready_to_approve");
      expect(manifest.outputs.map((output: { path: string }) => output.path)).toEqual([
        "shorts/rank-01/clip.mp4",
        "shorts/rank-01/metadata.json",
        "shorts/rank-01/youtube-shorts-payload.json",
        "shorts/rank-01/instagram-reels-payload.json",
        "shorts/rank-01/tiktok-payload.json",
        "shorts/rank-02/clip.mp4",
        "shorts/rank-02/metadata.json",
        "shorts/rank-02/youtube-shorts-payload.json",
        "shorts/rank-02/instagram-reels-payload.json",
        "shorts/rank-02/tiktok-payload.json",
        "shorts/rank-03/clip.mp4",
        "shorts/rank-03/metadata.json",
        "shorts/rank-03/youtube-shorts-payload.json",
        "shorts/rank-03/instagram-reels-payload.json",
        "shorts/rank-03/tiktok-payload.json",
        "shorts/rank-04/clip.mp4",
        "shorts/rank-04/metadata.json",
        "shorts/rank-04/youtube-shorts-payload.json",
        "shorts/rank-04/instagram-reels-payload.json",
        "shorts/rank-04/tiktok-payload.json",
        "shorts/rank-05/clip.mp4",
        "shorts/rank-05/metadata.json",
        "shorts/rank-05/youtube-shorts-payload.json",
        "shorts/rank-05/instagram-reels-payload.json",
        "shorts/rank-05/tiktok-payload.json",
        "supoclip/task.json"
      ]);
      for (const output of manifest.outputs as Array<{ path: string }>) {
        expect(await exists(path.join(result.packageDir, output.path))).toBe(true);
      }
      expect(manifest.publishPlan).toEqual({
        youtubeShorts: {
          mode: "dry-run",
          clips: [
            "shorts/rank-01/youtube-shorts-payload.json",
            "shorts/rank-02/youtube-shorts-payload.json",
            "shorts/rank-03/youtube-shorts-payload.json",
            "shorts/rank-04/youtube-shorts-payload.json",
            "shorts/rank-05/youtube-shorts-payload.json"
          ]
        },
        instagram: {
          mode: "dry-run",
          clips: [
            "shorts/rank-01/instagram-reels-payload.json",
            "shorts/rank-02/instagram-reels-payload.json",
            "shorts/rank-03/instagram-reels-payload.json",
            "shorts/rank-04/instagram-reels-payload.json",
            "shorts/rank-05/instagram-reels-payload.json"
          ]
        },
        tiktok: {
          mode: "dry-run",
          clips: [
            "shorts/rank-01/tiktok-payload.json",
            "shorts/rank-02/tiktok-payload.json",
            "shorts/rank-03/tiktok-payload.json",
            "shorts/rank-04/tiktok-payload.json",
            "shorts/rank-05/tiktok-payload.json"
          ]
        }
      });
    });
  });

  it("preserves API order when clips do not have numeric scores", async () => {
    await withTempDir("media-factory-vertical-no-scores-", async (dir) => {
      const { inputDir, outputDir, sourcePath } = await createSource(dir);
      const processSupoClipVideo = vi.fn().mockResolvedValue({
        taskId: "task-no-scores",
        clips: [
          clip({ id: "first", byte: 1 }),
          clip({ id: "second", byte: 2 }),
          clip({ id: "third", byte: 3 })
        ]
      });

      const result = await processVerticalPackage({
        sourcePath,
        sourceHash: "abcdef1234567890",
        metadata: metadataWithAudio,
        inputDir,
        outputDir,
        supoclip: supoclipConfig(),
        ai: aiConfig(),
        now: new Date("2026-05-11T12:00:00.000Z"),
        deps: {
          processSupoClipVideo,
          generateVerticalShortPayloads: createVerticalPayloadGenerator([
            { clip_id: "first", title: "Clip first" },
            { clip_id: "second", title: "Clip second" },
            { clip_id: "third", title: "Clip third" }
          ])
        }
      });

      await expect(fs.readFile(path.join(result.packageDir, "shorts/rank-01/metadata.json"), "utf8")).resolves.toContain(
        '"clip_id": "first"'
      );
      await expect(fs.readFile(path.join(result.packageDir, "shorts/rank-02/metadata.json"), "utf8")).resolves.toContain(
        '"clip_id": "second"'
      );
    });
  });

  it("writes AI-ready social payloads for vertical clips", async () => {
    await withTempDir("media-factory-vertical-ai-payloads-", async (dir) => {
      const { inputDir, outputDir, sourcePath } = await createSource(dir);
      const generateVerticalShortPayloads = vi.fn().mockResolvedValue({
        clips: [
          {
            clipId: "first",
            youtubeShorts: {
              title: "Titulo do Shorts",
              description: "Descricao para Shorts",
              hashtags: ["#shorts", "#ia"],
              privacyStatus: "private"
            },
            instagram: {
              caption: "Caption para Reels",
              hashtags: ["#reels", "#ia"]
            },
            tiktok: {
              caption: "Caption para TikTok",
              hashtags: ["#tiktok", "#ia"]
            }
          }
        ]
      });

      const result = await processVerticalPackage({
        sourcePath,
        sourceHash: "abcdef1234567890",
        metadata: metadataWithAudio,
        inputDir,
        outputDir,
        supoclip: supoclipConfig({ maxClips: 1 }),
        ai: {
          enabled: true,
          provider: "openai",
          model: "gpt-4.1-mini",
          transcriptionModel: "whisper-1",
          language: "pt",
          promptVersions: {}
        },
        now: new Date("2026-05-11T12:00:00.000Z"),
        deps: {
          processSupoClipVideo: vi.fn().mockResolvedValue({
            taskId: "task-ai",
            clips: [clip({ id: "first", score: 50, duration: 20, byte: 1 })]
          }),
          generateVerticalShortPayloads
        }
      });

      expect(generateVerticalShortPayloads).toHaveBeenCalledWith({
        sourceTitle: "aula",
        clips: [
          expect.objectContaining({
            clipId: "first",
            title: "Clip first",
            score: 50
          })
        ],
        ai: expect.objectContaining({ enabled: true })
      });
      await expect(
        fs.readFile(path.join(result.packageDir, "shorts/rank-01/youtube-shorts-payload.json"), "utf8")
      ).resolves.toContain('"title": "Titulo do Shorts"');
      await expect(
        fs.readFile(path.join(result.packageDir, "shorts/rank-01/instagram-reels-payload.json"), "utf8")
      ).resolves.toContain('"caption": "Caption para Reels"');
      await expect(
        fs.readFile(path.join(result.packageDir, "shorts/rank-01/tiktok-payload.json"), "utf8")
      ).resolves.toContain('"caption": "Caption para TikTok"');
    });
  });

  it("filters out tiny clips and clips starting outside the source duration before ranking", async () => {
    await withTempDir("media-factory-vertical-quality-gate-", async (dir) => {
      const { inputDir, outputDir, sourcePath } = await createSource(dir);
      const { lines, progress } = captureProgress();
      const processSupoClipVideo = vi.fn().mockResolvedValue({
        taskId: "task-quality",
        clips: [
          clip({ id: "one-frame", score: 100, duration: 0.6, startTime: "02:44", endTime: "03:15" }),
          clip({ id: "outside", score: 99, duration: 22, startTime: "03:20", endTime: "03:42" }),
          clip({ id: "valid", score: 50, duration: 30, startTime: "00:10", endTime: "00:40", byte: 50 })
        ]
      });

      const result = await processVerticalPackage({
        sourcePath,
        sourceHash: "abcdef1234567890",
        metadata: { ...metadataWithAudio, durationSec: 120 },
        inputDir,
        outputDir,
        supoclip: supoclipConfig({ minClipDurationSec: 12 }),
        ai: aiConfig(),
        now: new Date("2026-05-11T12:00:00.000Z"),
        deps: {
          processSupoClipVideo,
          generateVerticalShortPayloads: createVerticalPayloadGenerator([{ clip_id: "valid", title: "Clip valid" }]),
          progress
        }
      });

      await expect(fs.readFile(path.join(result.packageDir, "shorts/rank-01/metadata.json"), "utf8")).resolves.toContain(
        '"clip_id": "valid"'
      );
      expect(await exists(path.join(result.packageDir, "shorts/rank-02/clip.mp4"))).toBe(false);
      expect(lines.join("\n")).toContain("SupoClip descartou one-frame");
      expect(lines.join("\n")).toContain("SupoClip descartou outside");
      const task = JSON.parse(await fs.readFile(path.join(result.packageDir, "supoclip/task.json"), "utf8"));
      expect(task.clipCount).toBe(1);
      expect(task.returnedClipCount).toBe(3);
      expect(task.settings.minClipDurationSec).toBe(12);
    });
  });

  it("marks the manifest failed when SupoClip returns no clips", async () => {
    await withTempDir("media-factory-vertical-empty-", async (dir) => {
      const { inputDir, outputDir, sourcePath } = await createSource(dir);

      await expect(
        processVerticalPackage({
          sourcePath,
          sourceHash: "abcdef1234567890",
          metadata: metadataWithAudio,
          inputDir,
          outputDir,
          supoclip: supoclipConfig(),
          now: new Date("2026-05-11T12:00:00.000Z"),
          deps: {
            processSupoClipVideo: vi.fn().mockResolvedValue({ taskId: "task-empty", clips: [] })
          }
        })
      ).rejects.toThrow("SupoClip returned no valid clips");

      const manifestPath = path.join(outputDir, "ready-to-approve", "2026-05-11-aula-abcdef12", "manifest.json");
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      expect(manifest.status).toBe("failed");
      expect(manifest.error).toEqual({
        stage: "vertical_pipeline",
        message: "SupoClip returned no valid clips for the vertical short clips package"
      });
    });
  });

  it("marks the manifest failed when a selected clip has invalid bytes", async () => {
    await withTempDir("media-factory-vertical-invalid-bytes-", async (dir) => {
      const { inputDir, outputDir, sourcePath } = await createSource(dir);

      await expect(
        processVerticalPackage({
          sourcePath,
          sourceHash: "abcdef1234567890",
          metadata: metadataWithAudio,
          inputDir,
          outputDir,
          supoclip: supoclipConfig(),
          ai: aiConfig(),
          now: new Date("2026-05-11T12:00:00.000Z"),
          deps: {
            generateVerticalShortPayloads: createVerticalPayloadGenerator([{ clip_id: "empty", title: "Clip empty" }]),
            processSupoClipVideo: vi.fn().mockResolvedValue({
              taskId: "task-invalid",
              clips: [
                {
                  clip_id: "empty",
                  score: 100,
                  bytes: new Uint8Array()
                }
              ]
            })
          }
        })
      ).rejects.toThrow("SupoClip clip empty for rank 01 returned invalid or empty bytes");

      const manifestPath = path.join(outputDir, "ready-to-approve", "2026-05-11-aula-abcdef12", "manifest.json");
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      expect(manifest.status).toBe("failed");
      expect(manifest.error).toEqual({
        stage: "vertical_pipeline",
        message: "SupoClip clip empty for rank 01 returned invalid or empty bytes"
      });
    });
  });
});
