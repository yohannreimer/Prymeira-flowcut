import sharp from "sharp";

/**
 * Preprocesses a reference frame:
 * 1. Auto white/black point (normalize)
 * 2. Subtle colour pop (saturation + brightness)
 * 3. Light sharpening
 * 4. Golden-hour grade: warm highlights, slightly cooled shadows
 *
 * Falls back to writing the original file on any error.
 */
export async function preprocessFrame(inputPath: string, outputPath: string): Promise<void> {
  try {
    await sharp(inputPath)
      .normalize()
      .modulate({ saturation: 1.15, brightness: 1.03 })
      .sharpen({ sigma: 1.0, m1: 0.5, m2: 2.0 })
      // Golden-hour grade: per-channel linear(multiplier, offset)
      // R: warm push +5%, G: neutral, B: cool -3% → subtle amber tone
      .linear([1.05, 1.01, 0.97], [5, 1, -2])
      .jpeg({ quality: 95 })
      .toFile(outputPath);
  } catch {
    await sharp(inputPath).jpeg({ quality: 95 }).toFile(outputPath);
  }
}
