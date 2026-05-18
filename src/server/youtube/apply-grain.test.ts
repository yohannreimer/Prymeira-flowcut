import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { withTempDir } from "../../test/fixtures";
import { applyGrain } from "./apply-grain";

describe("applyGrain", () => {
  it("writes a PNG file to the output path", async () => {
    await withTempDir("grain-test-", async (dir) => {
      const inputPath = path.join(dir, "input.png");
      const outputPath = path.join(dir, "output.png");

      // Create a minimal valid 4x4 PNG
      await sharp({
        create: { width: 4, height: 4, channels: 3, background: { r: 128, g: 100, b: 80 } },
      })
        .png()
        .toFile(inputPath);

      await applyGrain(inputPath, outputPath);

      await expect(access(outputPath)).resolves.toBeUndefined();
      const meta = await sharp(outputPath).metadata();
      expect(meta.format).toBe("png");
      expect(meta.width).toBe(4);
      expect(meta.height).toBe(4);
    });
  });

  it("does not throw when intensity is low", async () => {
    await withTempDir("grain-low-", async (dir) => {
      const inputPath = path.join(dir, "input.png");
      await sharp({
        create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 180, b: 160 } },
      })
        .png()
        .toFile(inputPath);

      await expect(applyGrain(inputPath, inputPath, 0.06)).resolves.toBeUndefined();
    });
  });
});
