import { readFile } from "node:fs/promises";
import sharp from "sharp";
import OpenAI from "openai";

type FaceCropResult = {
  found: boolean;
  x: number; // percentage 0-100 (left edge)
  y: number; // percentage 0-100 (top edge)
  w: number; // percentage 0-100 (width)
  h: number; // percentage 0-100 (height)
};

type CropFaceRegionDeps = {
  chatCompletionsCreate?: (params: Record<string, unknown>) => Promise<{
    choices: Array<{ message: { content: string | null } }>;
  }>;
  readImageFile?: (filePath: string) => Promise<Buffer>;
};

/**
 * Two-pass face crop for screen recordings with PiP webcam:
 * 1. Heuristic: sample 4 corner + center regions to find the camera feed
 * 2. GPT-4o: refine within the candidate region to tightly frame the face
 *
 * Falls back gracefully at each step.
 */
export async function cropFaceRegion(
  inputPath: string,
  outputPath: string,
  apiKey?: string,
  deps: CropFaceRegionDeps = {}
): Promise<void> {
  try {
    const readFn = deps.readImageFile ?? readFile;
    const buffer = await readFn(inputPath);
    const meta = await sharp(buffer).metadata();
    const imgWidth = meta.width ?? 1280;
    const imgHeight = meta.height ?? 720;

    // Pass 1: find the camera feed region via skin-tone heuristic across 5 regions
    const pipRegion = await detectPipRegion(buffer, imgWidth, imgHeight);

    // Crop to that region to get just the camera feed
    const pipBuffer = await sharp(buffer)
      .extract({
        left: pipRegion.left,
        top: pipRegion.top,
        width: pipRegion.width,
        height: pipRegion.height,
      })
      .jpeg({ quality: 95 })
      .toBuffer();

    const key = apiKey ?? process.env.OPENAI_API_KEY;

    if (!key && !deps.chatCompletionsCreate) {
      // No API: use the heuristic crop as final result
      await sharp(pipBuffer).jpeg({ quality: 95 }).toFile(outputPath);
      return;
    }

    // Pass 2: GPT-4o refines the face position within the already-cropped camera feed
    const base64 = pipBuffer.toString("base64");
    const dataUrl = `data:image/jpeg;base64,${base64}`;

    const callCreate: (params: Record<string, unknown>) => Promise<{ choices: Array<{ message: { content: string | null } }> }> =
      deps.chatCompletionsCreate ??
      (async (params) => {
        const client = new OpenAI({ apiKey: key });
        const result = await client.chat.completions.create(
          params as unknown as Parameters<typeof client.chat.completions.create>[0]
        );
        return result as { choices: Array<{ message: { content: string | null } }> };
      });

    const response = await callCreate({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            {
              type: "text",
              text: [
                "This image shows a person talking to a camera.",
                "Return a tight bounding box containing just the face and shoulders.",
                "Start the top edge AT the hair — do NOT include dark toolbars, title bars, or UI chrome above the head.",
                "If the top portion is a dark bar (app toolbar/title bar), exclude it from the bounding box.",
                "Express as percentages of THIS image (0-100).",
                "JSON only: {\"found\": true, \"x\": N, \"y\": N, \"w\": N, \"h\": N}",
                "If no person visible, return {\"found\": false}.",
              ].join(" "),
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 60,
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as Partial<FaceCropResult>;

    if (
      !parsed.found ||
      parsed.x === undefined ||
      parsed.y === undefined ||
      parsed.w === undefined ||
      parsed.h === undefined
    ) {
      // GPT-4o couldn't refine — use the heuristic camera crop
      await sharp(pipBuffer).jpeg({ quality: 95 }).toFile(outputPath);
      return;
    }

    const pipMeta = await sharp(pipBuffer).metadata();
    const pw = pipMeta.width ?? 640;
    const ph = pipMeta.height ?? 480;

    // Add generous padding so hair and shoulders are not clipped.
    // GPT-4o tends to return tight bounding boxes, so we expand outward:
    // 22% of face height on top (hair), 10% on bottom, 12% on each side.
    const faceW = (parsed.w / 100) * pw;
    const faceH = (parsed.h / 100) * ph;
    const padX = faceW * 0.12;
    const padTop = faceH * 0.22;
    const padBottom = faceH * 0.10;

    const left = Math.round(Math.max(0, (parsed.x / 100) * pw - padX));
    const top = Math.round(Math.max(0, (parsed.y / 100) * ph - padTop));
    const right = Math.round(Math.min(pw, (parsed.x / 100) * pw + faceW + padX));
    const bottom = Math.round(Math.min(ph, (parsed.y / 100) * ph + faceH + padBottom));
    const width = right - left;
    const height = bottom - top;

    if (width < 40 || height < 40) {
      await sharp(pipBuffer).jpeg({ quality: 95 }).toFile(outputPath);
      return;
    }

    await sharp(pipBuffer)
      .extract({ left, top, width, height })
      .jpeg({ quality: 95 })
      .toFile(outputPath);
  } catch {
    try {
      await sharp(inputPath).jpeg({ quality: 95 }).toFile(outputPath);
    } catch {
      // ignore
    }
  }
}

/**
 * Finds which region of the frame most likely contains the webcam PiP
 * by measuring skin-tone pixel density across 5 candidate regions.
 */
async function detectPipRegion(
  buffer: Buffer,
  imgWidth: number,
  imgHeight: number
): Promise<{ left: number; top: number; width: number; height: number }> {
  // Define 5 candidate regions: 4 corners + full-right half
  const regions = [
    // bottom-right (most common PiP position)
    { left: Math.round(imgWidth * 0.60), top: Math.round(imgHeight * 0.45), width: Math.round(imgWidth * 0.40), height: Math.round(imgHeight * 0.55) },
    // top-right
    { left: Math.round(imgWidth * 0.60), top: 0, width: Math.round(imgWidth * 0.40), height: Math.round(imgHeight * 0.55) },
    // bottom-left
    { left: 0, top: Math.round(imgHeight * 0.45), width: Math.round(imgWidth * 0.40), height: Math.round(imgHeight * 0.55) },
    // top-left
    { left: 0, top: 0, width: Math.round(imgWidth * 0.40), height: Math.round(imgHeight * 0.55) },
    // full right half (for large PiPs)
    { left: Math.round(imgWidth * 0.45), top: 0, width: Math.round(imgWidth * 0.55), height: imgHeight },
  ];

  let bestRegion = regions[0]!;
  let bestScore = -1;

  for (const region of regions) {
    try {
      const score = await scoreSkinTone(buffer, region);
      if (score > bestScore) {
        bestScore = score;
        bestRegion = region;
      }
    } catch {
      // skip failed regions
    }
  }

  return bestRegion;
}

/**
 * Counts pixels that fall in skin-tone hue range as a fraction of total pixels.
 * Higher score = more skin-tone content = more likely to contain a face.
 */
async function scoreSkinTone(
  buffer: Buffer,
  region: { left: number; top: number; width: number; height: number }
): Promise<number> {
  // Resize to tiny for fast analysis
  const { data, info } = await sharp(buffer)
    .extract(region)
    .resize(80, 60, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels ?? 3;
  let skinPixels = 0;
  const total = info.width * info.height;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;

    // Skin tone heuristic: R > G > B, R > 95, not too dark, not too light
    const isSkin =
      r > 95 &&
      g > 40 &&
      b > 20 &&
      r > g &&
      r > b &&
      Math.abs(r - g) > 15 &&
      r - b > 15 &&
      r < 250;

    if (isSkin) skinPixels++;
  }

  return skinPixels / total;
}
