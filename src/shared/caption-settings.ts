import { z } from "zod";
import { CAPTION_STYLE_IDS, DEFAULT_CAPTION_STYLE_ID } from "./caption-styles";

export const CAPTION_FONT_IDS = ["system_bold", "editorial", "condensed", "mono"] as const;
export const CAPTION_DISPLAY_MODES = ["block_highlight", "word_ping", "stacked", "classic"] as const;

export type CaptionFontId = typeof CAPTION_FONT_IDS[number];
export type CaptionDisplayMode = typeof CAPTION_DISPLAY_MODES[number];

export const CAPTION_FONT_OPTIONS: Array<{ id: CaptionFontId; label: string; cssFamily: string }> = [
  { id: "system_bold", label: "Bold limpa", cssFamily: '"Area Normal", "Aptos", "SF Pro Display", system-ui, sans-serif' },
  { id: "editorial", label: "Editorial", cssFamily: 'Georgia, "Times New Roman", serif' },
  { id: "condensed", label: "Condensada", cssFamily: '"Aptos Condensed", "Arial Narrow", Impact, sans-serif' },
  { id: "mono", label: "Mono técnica", cssFamily: '"SF Mono", "JetBrains Mono", Menlo, monospace' }
];

export const CAPTION_DISPLAY_MODE_OPTIONS: Array<{ id: CaptionDisplayMode; label: string }> = [
  { id: "block_highlight", label: "Bloco com palavra ativa" },
  { id: "word_ping", label: "Uma palavra por vez" },
  { id: "stacked", label: "Stack progressivo" },
  { id: "classic", label: "Frase clássica" }
];

export const captionSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  styleId: z.enum(CAPTION_STYLE_IDS).default(DEFAULT_CAPTION_STYLE_ID),
  displayMode: z.enum(CAPTION_DISPLAY_MODES).default("block_highlight"),
  fontId: z.enum(CAPTION_FONT_IDS).default("system_bold"),
  fontSizePct: z.number().finite().min(3).max(12).default(6),
  wordsPerBlock: z.number().int().min(1).max(8).default(4),
  positionYPct: z.number().finite().min(50).max(94).default(82),
  maxWidthPct: z.number().finite().min(45).max(96).default(88),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#fbfaf4"),
  activeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#fcc009"),
  outlineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#171716"),
  outlineWidthPct: z.number().finite().min(0).max(1.2).default(0.28),
  shadow: z.boolean().default(true),
  uppercase: z.boolean().default(false)
});

export type CaptionSettings = z.infer<typeof captionSettingsSchema>;

export const DEFAULT_CAPTION_SETTINGS: CaptionSettings = captionSettingsSchema.parse({});

export function getCaptionFontFamily(fontId: CaptionFontId) {
  return CAPTION_FONT_OPTIONS.find((font) => font.id === fontId)?.cssFamily ?? CAPTION_FONT_OPTIONS[0].cssFamily;
}
