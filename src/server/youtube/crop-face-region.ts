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
 * Detects the face region in an image using GPT-4o Vision,
 * crops to that region with generous padding, and saves a portrait-friendly crop.
 *
 * Falls back to a right-bottom crop heuristic if no API key is available,
 * and falls back to the original image if detection fails entirely.
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

    const key = apiKey ?? process.env.OPENAI_API_KEY;

    if (!key && !deps.chatCompletionsCreate) {
      // No API key: heuristic crop — take right 40% × bottom 70% (common PiP position)
      await applyHeuristicCrop(inputPath, outputPath, imgWidth, imgHeight);
      return;
    }

    const base64 = buffer.toString("base64");
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
                "Find the human face in this image.",
                "Return a bounding box that tightly frames the face and shoulders — include space above the head (about 20% extra) and below the chin.",
                "Express coordinates as percentages of the image dimensions (0 to 100).",
                "Return JSON only: {\"found\": true, \"x\": <left%>, \"y\": <top%>, \"w\": <width%>, \"h\": <height%>}",
                "If no face is visible, return {\"found\": false}.",
              ].join(" "),
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 80,
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
      await applyHeuristicCrop(inputPath, outputPath, imgWidth, imgHeight);
      return;
    }

    await applyCrop(inputPath, outputPath, parsed as FaceCropResult, imgWidth, imgHeight);
  } catch {
    // Last resort: copy original
    try {
      await sharp(inputPath).jpeg({ quality: 95 }).toFile(outputPath);
    } catch {
      // ignore
    }
  }
}

async function applyCrop(
  inputPath: string,
  outputPath: string,
  coords: FaceCropResult,
  imgWidth: number,
  imgHeight: number
): Promise<void> {
  // Add 10% padding around the detected region
  const padX = coords.w * 0.10;
  const padY = coords.h * 0.10;

  const rawX = Math.max(0, (coords.x - padX) / 100) * imgWidth;
  const rawY = Math.max(0, (coords.y - padY) / 100) * imgHeight;
  const rawW = Math.min(100, coords.w + padX * 2) / 100 * imgWidth;
  const rawH = Math.min(100, coords.h + padY * 2) / 100 * imgHeight;

  const left = Math.round(Math.max(0, rawX));
  const top = Math.round(Math.max(0, rawY));
  const width = Math.round(Math.min(imgWidth - left, rawW));
  const height = Math.round(Math.min(imgHeight - top, rawH));

  if (width < 40 || height < 40) {
    await sharp(inputPath).jpeg({ quality: 95 }).toFile(outputPath);
    return;
  }

  await sharp(inputPath)
    .extract({ left, top, width, height })
    .jpeg({ quality: 95 })
    .toFile(outputPath);
}

async function applyHeuristicCrop(
  inputPath: string,
  outputPath: string,
  imgWidth: number,
  imgHeight: number
): Promise<void> {
  // Heuristic for PiP screen recordings: face is typically in one corner.
  // Take right 42% × bottom 75% — covers most common PiP placements.
  const left = Math.round(imgWidth * 0.58);
  const top = Math.round(imgHeight * 0.25);
  const width = imgWidth - left;
  const height = imgHeight - top;

  await sharp(inputPath)
    .extract({ left, top, width, height })
    .jpeg({ quality: 95 })
    .toFile(outputPath);
}
