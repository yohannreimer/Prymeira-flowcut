import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { withTempDir } from "../../test/fixtures";
import { generateYouTubeThumbnails } from "./thumbnail";

describe("generateYouTubeThumbnails", () => {
  it("extracts real video frames and renders three 1280x720 thumbnail options", async () => {
    await withTempDir("media-factory-thumbnail-", async (dir) => {
      const videoPath = path.join(dir, "youtube.mp4");
      await fs.writeFile(videoPath, "video");
      const processRunner = vi.fn(async (_command: string, args: string[]) => {
        const outputPath = args.at(-1);
        if (!outputPath) throw new Error("missing output");
        await sharp({
          create: {
            width: 1280,
            height: 720,
            channels: 3,
            background: "#314155"
          }
        }).jpeg().toFile(outputPath);
        return { exitCode: 0, stdout: "", stderr: "" };
      });

      const result = await generateYouTubeThumbnails({
        videoPath,
        outputDir: path.join(dir, "youtube"),
        title: "Por que rede social virou alavanca",
        durationSec: 120,
        ffmpegPath: "/usr/bin/ffmpeg",
        processRunner
      });

      expect(result.selected).toBe("thumbnail.png");
      expect(result.options).toEqual([
        "thumbnails/opcao-01.png",
        "thumbnails/opcao-02.png",
        "thumbnails/opcao-03.png"
      ]);
      expect(processRunner).toHaveBeenCalledTimes(3);
      expect(processRunner.mock.calls[0][0]).toBe("/usr/bin/ffmpeg");
      expect(processRunner.mock.calls[0][1]).toEqual(expect.arrayContaining(["-ss", "21.6"]));

      for (const relativePath of ["thumbnail.png", ...result.options]) {
        const metadata = await sharp(path.join(dir, "youtube", relativePath)).metadata();
        expect(metadata.width).toBe(1280);
        expect(metadata.height).toBe(720);
      }

      await expect(fs.readFile(path.join(dir, "youtube", "thumbnail-brief.json"), "utf8")).resolves.toContain(
        "Por que rede social virou alavanca"
      );
    });
  });

  it("throws ffmpeg stderr when a frame cannot be extracted", async () => {
    await withTempDir("media-factory-thumbnail-fail-", async (dir) => {
      await expect(
        generateYouTubeThumbnails({
          videoPath: path.join(dir, "youtube.mp4"),
          outputDir: path.join(dir, "youtube"),
          title: "Titulo",
          durationSec: 60,
          processRunner: vi.fn().mockResolvedValue({ exitCode: 1, stdout: "", stderr: "ffmpeg broke" })
        })
      ).rejects.toThrow("ffmpeg broke");
    });
  });
});
