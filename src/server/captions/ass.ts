import type { Caption, CaptionSettings, CaptionWord, EditPlan } from "../../shared/edit-plan";

export type CaptionAssSize = {
  width: number;
  height: number;
};

type CaptionBlock = {
  words: CaptionWord[];
  activeOffset: number;
};

export function createCaptionAss(plan: EditPlan, size: CaptionAssSize) {
  const settings = plan.captionSettings;
  const fontSize = Math.round(size.height * settings.fontSizePct / 100);
  const outline = Math.max(0, Math.round(size.height * settings.outlineWidthPct / 100));
  const marginV = Math.round(size.height * (100 - settings.positionYPct) / 100);
  const style = [
    "Style: Default",
    fontForAss(settings.fontId),
    fontSize,
    assColor(settings.primaryColor),
    "&H000000FF",
    assColor(settings.outlineColor),
    "&H99000000",
    boldForAss(settings.fontId),
    0,
    0,
    0,
    100,
    100,
    0,
    0,
    1,
    outline,
    settings.shadow ? 2 : 0,
    2,
    40,
    40,
    marginV,
    1
  ].join(",");
  const events = plan.captions.flatMap((caption) => captionToEvents(caption, settings));

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${size.width}`,
    `PlayResY: ${size.height}`,
    "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    style,
    "",
    "[Events]",
    "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    ...events
  ].join("\n");
}

function captionToEvents(caption: Caption, settings: CaptionSettings) {
  const words = normalizeCaptionWords(caption);
  if (!settings.enabled || words.length === 0) {
    return [];
  }

  if (settings.displayMode === "word_ping") {
    return words.map((word) => assDialogue(word.startSec, word.endSec, transformText(word.text, settings)));
  }

  return words.map((word, index) => {
    const block = getCaptionBlock(words, index, settings.wordsPerBlock);
    const text = renderBlockText(block, settings);
    return assDialogue(word.startSec, word.endSec, text);
  });
}

function normalizeCaptionWords(caption: Caption): CaptionWord[] {
  if (caption.words.length > 0) {
    return caption.words;
  }

  const words = caption.text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const duration = caption.endSec - caption.startSec;
  return words.map((word, index) => {
    const startSec = caption.startSec + duration * index / words.length;
    const endSec = caption.startSec + duration * (index + 1) / words.length;
    return {
      id: `${caption.id}_fallback_${index + 1}`,
      startSec,
      endSec,
      text: word
    };
  });
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

function renderBlockText(block: CaptionBlock, settings: CaptionSettings) {
  const words = settings.displayMode === "stacked"
    ? block.words.slice(0, block.activeOffset + 1)
    : block.words;

  return words.map((word, index) => {
    const text = escapeAssText(transformText(word.text, settings));
    if (settings.displayMode === "classic" || index !== block.activeOffset) {
      return text;
    }
    return `{\\c${assColorTag(settings.activeColor)}}${text}{\\c${assColorTag(settings.primaryColor)}}`;
  }).join(" ");
}

function assDialogue(startSec: number, endSec: number, text: string) {
  return `Dialogue: 0,${assTimestamp(startSec)},${assTimestamp(endSec)},Default,,0,0,0,,${text}`;
}

function assTimestamp(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const centiseconds = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function transformText(text: string, settings: CaptionSettings) {
  return settings.uppercase ? text.toUpperCase() : text;
}

function escapeAssText(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\n/g, "\\N");
}

function assColor(hex: string) {
  return `&H00${hexToBbGgRr(hex)}`;
}

function assColorTag(hex: string) {
  return `&H${hexToBbGgRr(hex)}&`;
}

function hexToBbGgRr(hex: string) {
  const clean = hex.replace("#", "");
  const rr = clean.slice(0, 2);
  const gg = clean.slice(2, 4);
  const bb = clean.slice(4, 6);
  return `${bb}${gg}${rr}`.toUpperCase();
}

function fontForAss(fontId: CaptionSettings["fontId"]) {
  if (fontId === "editorial") return "Georgia";
  if (fontId === "condensed") return "Arial Narrow";
  if (fontId === "mono") return "Menlo";
  return "Arial";
}

function boldForAss(fontId: CaptionSettings["fontId"]) {
  return fontId === "editorial" || fontId === "mono" ? 0 : -1;
}
