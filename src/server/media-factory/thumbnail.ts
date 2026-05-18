import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getConfig } from "../config";
import { runProcess, type ProcessOptions, type ProcessResult } from "../media/process";

type ThumbnailProcessRunner = (
  command: string,
  args: string[],
  options?: ProcessOptions
) => Promise<ProcessResult>;

export type GenerateYouTubeThumbnailsResult = {
  selected: "thumbnail.png";
  options: string[];
  brief: string;
};

export type GenerateYouTubeThumbnailsInput = {
  videoPath: string;
  outputDir: string;
  title: string;
  durationSec: number;
  ffmpegPath?: string;
  processRunner?: ThumbnailProcessRunner;
};

const THUMBNAIL_WIDTH = 1280;
const THUMBNAIL_HEIGHT = 720;
const FRAME_TIMEOUT_MS = 5 * 60 * 1000;

const TEMPLATES = [
  { accent: "#ffd400", shadow: "#090909", align: "left", label: "impacto" },
  { accent: "#ff3b30", shadow: "#080808", align: "right", label: "alerta" },
  { accent: "#12d6ff", shadow: "#05090f", align: "left", label: "clareza" }
] as const;

export async function generateYouTubeThumbnails(
  input: GenerateYouTubeThumbnailsInput
): Promise<GenerateYouTubeThumbnailsResult> {
  const thumbnailsDir = path.join(input.outputDir, "thumbnails");
  const framesDir = path.join(thumbnailsDir, ".frames");
  await rm(thumbnailsDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  const framePaths = await extractFrames({
    videoPath: input.videoPath,
    outputDir: framesDir,
    durationSec: input.durationSec,
    ffmpegPath: input.ffmpegPath ?? getConfig().ffmpegPath,
    processRunner: input.processRunner ?? runProcess
  });
  const lines = buildThumbnailLines(input.title);
  const optionPaths: string[] = [];

  for (const [index, template] of TEMPLATES.entries()) {
    const relativePath = `thumbnails/opcao-${String(index + 1).padStart(2, "0")}.png`;
    const outputPath = path.join(input.outputDir, relativePath);
    await renderThumbnail({
      framePath: framePaths[index],
      outputPath,
      lines,
      template,
      index
    });
    optionPaths.push(relativePath);
  }

  await copyFile(path.join(input.outputDir, optionPaths[0]), path.join(input.outputDir, "thumbnail.png"));
  const brief = createThumbnailBrief({ title: input.title, lines, options: optionPaths });
  await writeFile(path.join(input.outputDir, "thumbnail-brief.json"), `${JSON.stringify(brief, null, 2)}\n`);
  await rm(framesDir, { recursive: true, force: true });

  return {
    selected: "thumbnail.png",
    options: optionPaths,
    brief: "thumbnail-brief.json"
  };
}

async function extractFrames({
  videoPath,
  outputDir,
  durationSec,
  ffmpegPath,
  processRunner
}: {
  videoPath: string;
  outputDir: string;
  durationSec: number;
  ffmpegPath: string;
  processRunner: ThumbnailProcessRunner;
}) {
  const times = selectThumbnailFrameTimes(durationSec);
  const framePaths: string[] = [];

  for (const [index, timeSec] of times.entries()) {
    const framePath = path.join(outputDir, `frame-${String(index + 1).padStart(2, "0")}.jpg`);
    const result = await processRunner(
      ffmpegPath,
      [
        "-y",
        "-ss",
        String(timeSec),
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        "-vf",
        `scale=${THUMBNAIL_WIDTH}:${THUMBNAIL_HEIGHT}:force_original_aspect_ratio=increase,crop=${THUMBNAIL_WIDTH}:${THUMBNAIL_HEIGHT},unsharp=5:5:0.5`,
        framePath
      ],
      { timeoutMs: FRAME_TIMEOUT_MS }
    );
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || `FFmpeg failed extracting thumbnail frame ${index + 1}`);
    }
    framePaths.push(framePath);
  }

  return framePaths;
}

export function selectThumbnailFrameTimes(durationSec: number) {
  const safeDuration = Math.max(1, Number.isFinite(durationSec) ? durationSec : 1);
  return [0.18, 0.5, 0.78].map((pct) =>
    Number(Math.min(Math.max(0.2, safeDuration * pct), Math.max(0.2, safeDuration - 0.2)).toFixed(3))
  );
}

function buildThumbnailLines(title: string) {
  const normalized = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  const stopWords = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "O", "A", "OS", "AS", "UM", "UMA", "QUE", "POR"]);
  const words = normalized.split(" ").filter((word) => word.length > 1 && !stopWords.has(word));
  const selected = words.slice(0, 5);
  const fallback = normalized.split(" ").filter(Boolean).slice(0, 5);
  return wrapThumbnailWords(selected.length > 0 ? selected : fallback);
}

function wrapThumbnailWords(words: string[]) {
  if (words.length <= 2) return [words.join(" ") || "NOVO VIDEO"];
  if (words.length <= 4) return [words.slice(0, 2).join(" "), words.slice(2).join(" ")];
  return [words.slice(0, 2).join(" "), words.slice(2, 5).join(" ")];
}

async function renderThumbnail({
  framePath,
  outputPath,
  lines,
  template,
  index
}: {
  framePath: string;
  outputPath: string;
  lines: string[];
  template: typeof TEMPLATES[number];
  index: number;
}) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const base = await sharp(framePath)
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: "cover" })
    .modulate({ saturation: 1.08, brightness: 1.02 })
    .linear(1.08, -8)
    .png()
    .toBuffer();

  await sharp(base)
    .composite([
      { input: Buffer.from(createOverlaySvg({ lines, template, index })), left: 0, top: 0 }
    ])
    .png()
    .toFile(outputPath);
}

function createOverlaySvg({
  lines,
  template,
  index
}: {
  lines: string[];
  template: typeof TEMPLATES[number];
  index: number;
}) {
  const textX = template.align === "left" ? 72 : 1208;
  const anchor = template.align === "left" ? "start" : "end";
  const blockX = template.align === "left" ? 0 : 570;
  const gradientDirection = template.align === "left" ? "0%" : "100%";
  const fontSize = lines.length > 1 ? 98 : 112;
  const lineHeight = Math.round(fontSize * 0.9);
  const startY = lines.length > 1 ? 430 : 462;
  const text = lines.map((line, lineIndex) => (
    `<text x="${textX}" y="${startY + lineIndex * lineHeight}" font-family="Arial Black, Impact, Arial, sans-serif" font-size="${fontSize}" font-weight="900" letter-spacing="0" text-anchor="${anchor}" fill="#ffffff" stroke="#050505" stroke-width="14" paint-order="stroke fill" stroke-linejoin="round">${escapeXml(line)}</text>`
  )).join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" viewBox="0 0 ${THUMBNAIL_WIDTH} ${THUMBNAIL_HEIGHT}">`,
    "<defs>",
    `<linearGradient id="shade" x1="${gradientDirection}" y1="0%" x2="${template.align === "left" ? "100%" : "0%"}" y2="0%"><stop offset="0%" stop-color="#000000" stop-opacity="0.88"/><stop offset="58%" stop-color="#000000" stop-opacity="0.48"/><stop offset="100%" stop-color="#000000" stop-opacity="0.06"/></linearGradient>`,
    `<filter id="drop"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#000000" flood-opacity="0.42"/></filter>`,
    "</defs>",
    `<rect width="1280" height="720" fill="url(#shade)"/>`,
    `<rect x="${blockX}" y="0" width="710" height="720" fill="${template.shadow}" opacity="0.16"/>`,
    `<rect x="${template.align === "left" ? 72 : 1092}" y="96" width="116" height="18" rx="9" fill="${template.accent}"/>`,
    `<text x="${textX}" y="156" font-family="Arial, sans-serif" font-size="34" font-weight="800" letter-spacing="0" text-anchor="${anchor}" fill="${template.accent}">${escapeXml(`OPCAO ${index + 1} / ${template.label.toUpperCase()}`)}</text>`,
    `<g filter="url(#drop)">${text}</g>`,
    `<rect x="${template.align === "left" ? 72 : 1038}" y="618" width="170" height="20" rx="10" fill="${template.accent}"/>`,
    "</svg>"
  ].join("");
}

function createThumbnailBrief({
  title,
  lines,
  options
}: {
  title: string;
  lines: string[];
  options: string[];
}) {
  return {
    sourceTitle: title,
    selected: "thumbnail.png",
    text: lines.join(" / "),
    strategy: "Frame real do video com tratamento de contraste e texto curto derivado do titulo gerado pela IA.",
    options
  };
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
