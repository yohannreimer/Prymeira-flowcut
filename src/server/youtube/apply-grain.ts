import sharp from "sharp";

/**
 * Composites a film-grain noise layer over a PNG thumbnail.
 * intensity maps to Gaussian sigma: 0.08 → sigma≈6, 0.10 → sigma≈8, 0.12 → sigma≈10.
 * Fails silently — on error, leaves the file unchanged if input === output.
 */
export async function applyGrain(
  inputPath: string,
  outputPath: string,
  intensity: number = 0.08
): Promise<void> {
  try {
    const { width = 1280, height = 720 } = await sharp(inputPath).metadata();
    const sigma = Math.round(intensity * 75);

    const noiseBuffer = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
        noise: { type: "gaussian", mean: 128, sigma },
      },
    })
      .toFormat("png")
      .toBuffer();

    await sharp(inputPath)
      .composite([{ input: noiseBuffer, blend: "soft-light" }])
      .png()
      .toFile(outputPath);
  } catch {
    if (inputPath !== outputPath) {
      await sharp(inputPath).png().toFile(outputPath);
    }
  }
}
