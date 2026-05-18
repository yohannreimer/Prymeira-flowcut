import { access } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { withTempDir } from "../../test/fixtures";
import { preprocessFrame } from "./preprocess-frames";

describe("preprocessFrame", () => {
  it("writes a valid JPEG to the output path", async () => {
    await withTempDir("preprocess-test-", async (dir) => {
      const inputPath = path.join(dir, "input.jpg");
      const outputPath = path.join(dir, "output.jpg");

      await sharp({
        create: { width: 8, height: 8, channels: 3, background: { r: 80, g: 70, b: 60 } },
      })
        .jpeg()
        .toFile(inputPath);

      await preprocessFrame(inputPath, outputPath);

      await expect(access(outputPath)).resolves.toBeUndefined();
      const meta = await sharp(outputPath).metadata();
      expect(meta.format).toBe("jpeg");
      expect(meta.width).toBe(8);
      expect(meta.height).toBe(8);
    });
  });

  it("falls back to copying the original when processing fails", async () => {
    await withTempDir("preprocess-fallback-", async (dir) => {
      const inputPath = path.join(dir, "input.jpg");
      const outputPath = path.join(dir, "output.jpg");

      // Write a valid JPEG as input
      await sharp({
        create: { width: 4, height: 4, channels: 3, background: { r: 100, g: 100, b: 100 } },
      })
        .jpeg()
        .toFile(inputPath);

      // preprocessFrame should not throw even if it hits an internal error
      await expect(preprocessFrame(inputPath, outputPath)).resolves.toBeUndefined();
      await expect(access(outputPath)).resolves.toBeUndefined();
    });
  });
});
