import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Caption, CaptionSettings, CaptionWord, EditPlan } from "../../shared/edit-plan";
import { getSectionAtTime, mergeSectionCaptionSettings } from "../../shared/sections";

export type CaptionOverlayImage = {
  path: string;
  startSec: number;
  endSec: number;
};

type CaptionOverlaySize = {
  width: number;
  height: number;
};

type CaptionBlock = {
  words: CaptionWord[];
  activeOffset: number;
};

type CaptionOverlayEvent = {
  startSec: number;
  endSec: number;
  text: Array<{ text: string; active: boolean }>;
  settings: CaptionSettings;
};

export async function createCaptionOverlayImages(
  plan: EditPlan,
  rendersPath: string,
  size: CaptionOverlaySize
): Promise<CaptionOverlayImage[]> {
  if (plan.captions.length === 0) {
    return [];
  }

  const overlayDir = path.join(rendersPath, "caption-overlays");
  await rm(overlayDir, { recursive: true, force: true });
  await mkdir(overlayDir, { recursive: true });

  const events = plan.captions.flatMap((caption) => captionToEvents(caption, plan.captionSettings, plan.sections));
  const overlays: CaptionOverlayImage[] = [];
  for (const [index, event] of events.entries()) {
    const imagePath = path.join(overlayDir, `caption-overlay-${String(index + 1).padStart(3, "0")}.png`);
    await sharp(Buffer.from(createCaptionSvg(event.text, event.settings, size))).png().toFile(imagePath);
    overlays.push({ path: imagePath, startSec: event.startSec, endSec: event.endSec });
  }

  return overlays;
}

function captionToEvents(caption: Caption, globalSettings: CaptionSettings, sections: EditPlan["sections"]): CaptionOverlayEvent[] {
  const words = normalizeCaptionWords(caption);
  if (words.length === 0) return [];

  return words.flatMap((word, index) => {
    const settings = getEffectiveCaptionSettingsAtTime(globalSettings, sections, word.startSec);
    if (!settings.enabled) return [];

    if (settings.displayMode === "word_ping") {
      return {
        startSec: word.startSec,
        endSec: word.endSec,
        text: [{ text: transformText(word.text, settings), active: true }],
        settings
      };
    }

    const block = getCaptionBlock(words, index, settings.wordsPerBlock);
    const visibleWords = settings.displayMode === "stacked"
      ? block.words.slice(0, block.activeOffset + 1)
      : block.words;

    return {
      startSec: word.startSec,
      endSec: word.endSec,
      text: visibleWords.map((blockWord, wordIndex) => ({
        text: transformText(blockWord.text, settings),
        active: settings.displayMode !== "classic" && wordIndex === block.activeOffset
      })),
      settings
    };
  });
}

function getEffectiveCaptionSettingsAtTime(
  globalSettings: CaptionSettings,
  sections: EditPlan["sections"],
  timeSec: number
) {
  return mergeSectionCaptionSettings(globalSettings, getSectionAtTime(sections, timeSec));
}

function createCaptionSvg(
  words: Array<{ text: string; active: boolean }>,
  settings: CaptionSettings,
  size: CaptionOverlaySize
) {
  const fontSize = Math.round(size.width * settings.fontSizePct / 100);
  const strokeWidth = Math.max(0, Math.round(size.width * settings.outlineWidthPct / 100));
  const maxLineWidth = size.width * settings.maxWidthPct / 100;
  const lines = wrapWords(words, maxLineWidth, fontSize);
  const lineHeight = Math.round(fontSize * 1.04);
  const y = Math.round(size.height * settings.positionYPct / 100) - Math.round((lines.length - 1) * lineHeight / 2);
  const fontFamily = fontForSvg(settings.fontId);
  const shadow = settings.shadow
    ? `<filter id="shadow" x="-12%" y="-12%" width="124%" height="124%"><feDropShadow dx="0" dy="${Math.max(1, Math.round(fontSize * 0.035))}" stdDeviation="${Math.max(1, Math.round(fontSize * 0.025))}" flood-color="#000000" flood-opacity="0.25"/></filter>`
    : "";
  const textLines = lines.map((line, lineIndex) => {
    const tspans = line.map((word, wordIndex) => {
      const suffix = wordIndex === line.length - 1 ? "" : " ";
      return `<tspan fill="${word.active ? settings.activeColor : settings.primaryColor}">${escapeXml(word.text + suffix)}</tspan>`;
    }).join("");
    return `<text x="${Math.round(size.width / 2)}" y="${Math.round(y + lineIndex * lineHeight)}" xml:space="preserve" font-family="${fontFamily}" font-size="${fontSize}" font-weight="950" text-anchor="middle" stroke="${settings.outlineColor}" stroke-width="${strokeWidth}" paint-order="stroke fill" stroke-linejoin="round" filter="${settings.shadow ? "url(#shadow)" : ""}">${tspans}</text>`;
  }).join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">`,
    "<defs>",
    shadow,
    "</defs>",
    textLines,
    "</svg>"
  ].join("");
}

function wrapWords(words: Array<{ text: string; active: boolean }>, maxWidth: number, fontSize: number) {
  const lines: Array<Array<{ text: string; active: boolean }>> = [];
  let current: Array<{ text: string; active: boolean }> = [];

  words.forEach((word) => {
    const next = [...current, word];
    if (current.length > 0 && measureLine(next, fontSize) > maxWidth) {
      lines.push(current);
      current = [word];
    } else {
      current = next;
    }
  });

  if (current.length > 0) lines.push(current);
  return lines;
}

function measureLine(words: Array<{ text: string }>, fontSize: number) {
  if (words.length === 0) return 0;
  const wordsWidth = words.reduce((total, word) => total + measureWord(word.text, fontSize), 0);
  return wordsWidth + (words.length - 1) * fontSize * 0.32;
}

function measureWord(text: string, fontSize: number) {
  return text.length * fontSize * 0.56;
}

function normalizeCaptionWords(caption: Caption): CaptionWord[] {
  if (caption.words.length > 0) {
    return caption.words;
  }

  const words = caption.text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const duration = caption.endSec - caption.startSec;
  return words.map((word, index) => ({
    id: `${caption.id}_fallback_${index + 1}`,
    startSec: caption.startSec + duration * index / words.length,
    endSec: caption.startSec + duration * (index + 1) / words.length,
    text: word
  }));
}

function getCaptionBlock(words: CaptionWord[], activeIndex: number, wordsPerBlock: number): CaptionBlock {
  const safeWordsPerBlock = Math.max(1, wordsPerBlock);
  const blockStart = Math.floor(activeIndex / safeWordsPerBlock) * safeWordsPerBlock;
  const blockWords = words.slice(blockStart, blockStart + safeWordsPerBlock);
  return {
    words: blockWords,
    activeOffset: Math.max(0, activeIndex - blockStart)
  };
}

function transformText(text: string, settings: CaptionSettings) {
  return settings.uppercase ? text.toUpperCase() : text;
}

function fontForSvg(fontId: CaptionSettings["fontId"]) {
  if (fontId === "editorial") return "Georgia, Times New Roman, serif";
  if (fontId === "condensed") return "Arial Narrow, Impact, sans-serif";
  if (fontId === "mono") return "Menlo, monospace";
  return "Arial, Helvetica, sans-serif";
}

function escapeXml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
