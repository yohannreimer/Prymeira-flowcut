import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createInitialManifest,
  mediaFactoryManifestSchema,
  updateManifest,
  writeManifest,
  type MediaFactoryManifest
} from "./manifest";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(tmpdir(), "media-factory-manifest-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { force: true, recursive: true });
});

describe("createInitialManifest", () => {
  it("creates a strict initial manifest with empty output and publish state", () => {
    const manifest = createInitialManifest({
      id: "2026-05-11-video-abcdef12",
      status: "detected",
      source: {
        path: "/media/Entrada/video.mp4",
        hash: "abcdef123456",
        orientation: "horizontal",
        durationSec: 123.45,
        width: 1920,
        height: 1080,
        hasAudio: true
      },
      pipeline: "horizontal_youtube_podcast_x",
      now: "2026-05-11T12:00:00.000Z"
    });

    expect(manifest).toEqual({
      id: "2026-05-11-video-abcdef12",
      status: "detected",
      source: {
        path: "/media/Entrada/video.mp4",
        hash: "abcdef123456",
        orientation: "horizontal",
        durationSec: 123.45,
        width: 1920,
        height: 1080,
        hasAudio: true
      },
      pipeline: "horizontal_youtube_podcast_x",
      outputs: [],
      publishPlan: {},
      publishResults: [],
      createdAt: "2026-05-11T12:00:00.000Z",
      updatedAt: "2026-05-11T12:00:00.000Z"
    });
  });
});

describe("mediaFactoryManifestSchema", () => {
  it("rejects invalid manifest values", () => {
    const result = mediaFactoryManifestSchema.safeParse({
      id: "",
      status: "preview",
      source: {
        path: "/media/Entrada/video.mp4",
        hash: "abcdef123456",
        orientation: "diagonal",
        durationSec: Number.POSITIVE_INFINITY,
        width: 1920.5,
        height: 0,
        hasAudio: true
      },
      pipeline: "horizontal_youtube_podcast_x",
      outputs: [{ type: "", path: "/media/out.mp4" }],
      publishPlan: {},
      publishResults: [{ platform: "youtube", mode: "preview", status: "pending" }],
      createdAt: "2026-05-11T12:00:00.000Z",
      updatedAt: "2026-05-11T12:00:00.000Z"
    });

    expect(result.success).toBe(false);
  });

  it.each(["/absolute/video.mp4", "C:/outside.mp4", "C:\\outside.mp4", "../outside.mp4", "youtube/../outside.mp4"])(
    "rejects unsafe output path %s",
    (outputPath) => {
      const manifest = createInitialManifest({
        id: "video-1",
        status: "ready_to_approve",
        source: {
          path: "/media/Entrada/video.mp4",
          hash: "abcdef123456",
          orientation: "horizontal",
          durationSec: 120,
          width: 1920,
          height: 1080,
          hasAudio: true
        },
        pipeline: "horizontal_youtube_podcast_x",
        now: "2026-05-11T12:00:00.000Z"
      });

      expect(
        mediaFactoryManifestSchema.safeParse({
          ...manifest,
          outputs: [{ type: "youtube_video", path: outputPath }]
        }).success
      ).toBe(false);
    }
  );

  it("rejects invalid timestamps", () => {
    expect(() =>
      createInitialManifest({
        id: "video-1",
        status: "detected",
        source: {
          path: "/media/Entrada/video.mp4",
          hash: "abcdef123456",
          orientation: "horizontal",
          durationSec: 120,
          width: 1920,
          height: 1080,
          hasAudio: true
        },
        pipeline: "horizontal_youtube_podcast_x",
        now: "not-a-date"
      })
    ).toThrow();
  });

  it("defaults publish result retry counts", () => {
    const manifest = createInitialManifest({
      id: "video-1",
      status: "publishing",
      source: {
        path: "/media/Entrada/video.mp4",
        hash: "abcdef123456",
        orientation: "horizontal",
        durationSec: 120,
        width: 1920,
        height: 1080,
        hasAudio: true
      },
      pipeline: "horizontal_youtube_podcast_x",
      now: "2026-05-11T12:00:00.000Z"
    });

    expect(
      mediaFactoryManifestSchema.parse({
        ...manifest,
        publishResults: [{ platform: "youtube", mode: "dry-run", status: "pending" }]
      }).publishResults
    ).toEqual([{ platform: "youtube", mode: "dry-run", status: "pending", retryCount: 0 }]);
  });
});

describe("updateManifest", () => {
  it("applies status and output patches and refreshes updatedAt", () => {
    const manifest = createInitialManifest({
      id: "video-1",
      status: "processing",
      source: {
        path: "/media/Entrada/video.mp4",
        hash: "abcdef123456",
        orientation: "vertical",
        durationSec: 30,
        width: 1080,
        height: 1920,
        hasAudio: false
      },
      pipeline: "vertical_short_clips",
      now: "2026-05-11T12:00:00.000Z"
    });

    expect(
      updateManifest(
        {
          manifest,
          now: "2026-05-11T12:30:00.000Z"
        },
        {
          status: "ready_to_approve",
          outputs: [{ type: "short", path: "shorts/clip.mp4" }]
        }
      )
    ).toEqual({
      ...manifest,
      status: "ready_to_approve",
      outputs: [{ type: "short", path: "shorts/clip.mp4" }],
      updatedAt: "2026-05-11T12:30:00.000Z"
    });
  });
});

describe("writeManifest", () => {
  it("writes formatted JSON with a trailing newline", async () => {
    const manifest: MediaFactoryManifest = createInitialManifest({
      id: "video-1",
      status: "detected",
      source: {
        path: "/media/Entrada/video.mp4",
        hash: "abcdef123456",
        orientation: "horizontal",
        durationSec: 120,
        width: 1920,
        height: 1080,
        hasAudio: true
      },
      pipeline: "horizontal_youtube_podcast_x",
      now: "2026-05-11T12:00:00.000Z"
    });
    const manifestPath = path.join(tempDir, "manifest.json");

    await writeManifest(manifestPath, manifest);

    await expect(fs.readFile(manifestPath, "utf8")).resolves.toBe(`${JSON.stringify(manifest, null, 2)}\n`);
  });
});
