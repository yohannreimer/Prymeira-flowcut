import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../../test/fixtures";
import { createInitialManifest, writeManifest } from "./manifest";
import { approveReadyPackages } from "./approval";

async function createReadyPackage(rootDir: string, id: string) {
  const packageDir = path.join(rootDir, "Saida", "ready-to-approve", id);
  await fs.mkdir(packageDir, { recursive: true });
  const manifest = createInitialManifest({
    id,
    status: "ready_to_approve",
    source: {
      path: path.join(rootDir, "Processados", `${id}.mp4`),
      hash: "abcdef1234567890",
      orientation: "vertical",
      durationSec: 30,
      width: 1080,
      height: 1920,
      hasAudio: true
    },
    pipeline: "vertical_short_clips",
    now: new Date("2026-05-11T12:00:00.000Z")
  });
  await writeManifest(path.join(packageDir, "manifest.json"), {
    ...manifest,
    outputs: [{ type: "short_video", path: "shorts/rank-01/clip.mp4" }],
    publishPlan: {
      youtubeShorts: { mode: "dry-run", clips: ["shorts/rank-01/youtube-shorts-payload.json"] }
    }
  });
  await fs.mkdir(path.join(packageDir, "shorts/rank-01"), { recursive: true });
  await fs.writeFile(path.join(packageDir, "shorts/rank-01/clip.mp4"), "clip");
  return packageDir;
}

describe("approveReadyPackages", () => {
  it("moves ready packages into approved and updates their manifests", async () => {
    await withTempDir("media-factory-approval-", async (rootDir) => {
      await createReadyPackage(rootDir, "package-one");
      await createReadyPackage(rootDir, "package-two");

      const result = await approveReadyPackages({
        rootDir,
        now: new Date("2026-05-11T13:00:00.000Z")
      });

      expect(result).toEqual({
        approved: [
          path.join(rootDir, "Saida", "approved", "package-one"),
          path.join(rootDir, "Saida", "approved", "package-two")
        ],
        skipped: []
      });
      await expect(fs.stat(path.join(rootDir, "Saida", "ready-to-approve", "package-one"))).rejects.toThrow();

      const manifest = JSON.parse(
        await fs.readFile(path.join(rootDir, "Saida", "approved", "package-one", "manifest.json"), "utf8")
      );
      expect(manifest.status).toBe("approved");
      expect(manifest.updatedAt).toBe("2026-05-11T13:00:00.000Z");
      expect(manifest.outputs).toEqual([{ type: "short_video", path: "shorts/rank-01/clip.mp4" }]);
    });
  });

  it("can approve only one selected package id", async () => {
    await withTempDir("media-factory-approval-one-", async (rootDir) => {
      await createReadyPackage(rootDir, "package-one");
      await createReadyPackage(rootDir, "package-two");

      const result = await approveReadyPackages({
        rootDir,
        packageIds: ["package-two"],
        now: new Date("2026-05-11T13:00:00.000Z")
      });

      expect(result.approved).toEqual([path.join(rootDir, "Saida", "approved", "package-two")]);
      await expect(fs.readFile(path.join(rootDir, "Saida", "ready-to-approve", "package-one", "manifest.json"), "utf8")).resolves.toContain(
        '"id": "package-one"'
      );
    });
  });

  it("removes deleted shorts from outputs and publish plans before approval", async () => {
    await withTempDir("media-factory-approval-prune-", async (rootDir) => {
      const packageDir = path.join(rootDir, "Saida", "ready-to-approve", "package-one");
      await fs.mkdir(path.join(packageDir, "shorts/rank-01"), { recursive: true });
      const manifest = createInitialManifest({
        id: "package-one",
        status: "ready_to_approve",
        source: {
          path: path.join(rootDir, "Processados", "source.mp4"),
          hash: "abcdef1234567890",
          orientation: "vertical",
          durationSec: 30,
          width: 1080,
          height: 1920,
          hasAudio: true
        },
        pipeline: "vertical_short_clips",
        now: new Date("2026-05-11T12:00:00.000Z")
      });
      await fs.writeFile(path.join(packageDir, "shorts/rank-01/clip.mp4"), "clip");
      await fs.writeFile(path.join(packageDir, "shorts/rank-01/youtube-shorts-payload.json"), "{}");
      await fs.writeFile(path.join(packageDir, "shorts/rank-01/instagram-reels-payload.json"), "{}");
      await fs.writeFile(path.join(packageDir, "shorts/rank-01/tiktok-payload.json"), "{}");
      await writeManifest(path.join(packageDir, "manifest.json"), {
        ...manifest,
        outputs: [
          { type: "short_video", path: "shorts/rank-01/clip.mp4" },
          { type: "youtube_shorts_payload", path: "shorts/rank-01/youtube-shorts-payload.json" },
          { type: "short_video", path: "shorts/rank-02/clip.mp4" },
          { type: "youtube_shorts_payload", path: "shorts/rank-02/youtube-shorts-payload.json" },
          { type: "instagram_reels_payload", path: "shorts/rank-02/instagram-reels-payload.json" },
          { type: "tiktok_payload", path: "shorts/rank-02/tiktok-payload.json" }
        ],
        publishPlan: {
          youtubeShorts: {
            mode: "dry-run",
            clips: [
              "shorts/rank-01/youtube-shorts-payload.json",
              "shorts/rank-02/youtube-shorts-payload.json"
            ]
          },
          instagram: {
            mode: "dry-run",
            clips: [
              "shorts/rank-01/instagram-reels-payload.json",
              "shorts/rank-02/instagram-reels-payload.json"
            ]
          },
          tiktok: {
            mode: "dry-run",
            clips: ["shorts/rank-01/tiktok-payload.json", "shorts/rank-02/tiktok-payload.json"]
          }
        }
      });

      const result = await approveReadyPackages({
        rootDir,
        now: new Date("2026-05-11T13:00:00.000Z")
      });

      const approvedManifestPath = path.join(result.approved[0], "manifest.json");
      const approvedManifest = JSON.parse(await fs.readFile(approvedManifestPath, "utf8"));
      expect(approvedManifest.outputs).toEqual([
        { type: "short_video", path: "shorts/rank-01/clip.mp4" },
        { type: "youtube_shorts_payload", path: "shorts/rank-01/youtube-shorts-payload.json" }
      ]);
      expect(approvedManifest.publishPlan).toEqual({
        youtubeShorts: {
          mode: "dry-run",
          clips: ["shorts/rank-01/youtube-shorts-payload.json"]
        },
        instagram: {
          mode: "dry-run",
          clips: ["shorts/rank-01/instagram-reels-payload.json"]
        },
        tiktok: {
          mode: "dry-run",
          clips: ["shorts/rank-01/tiktok-payload.json"]
        }
      });
    });
  });
});
