export const CAPTION_STYLE_IDS = ["youtube_clean", "word_ping", "focus_word", "stacked_pop"] as const;

export type CaptionStyleId = typeof CAPTION_STYLE_IDS[number];

export type CaptionStyle = {
  id: CaptionStyleId;
  label: string;
  description: string;
  timing: "segment" | "word";
};

export const DEFAULT_CAPTION_STYLE_ID: CaptionStyleId = "focus_word";

export const CAPTION_STYLES: CaptionStyle[] = [
  {
    id: "focus_word",
    label: "Palavra em foco",
    description: "Frase curta na tela com a palavra falada em destaque.",
    timing: "word"
  },
  {
    id: "word_ping",
    label: "Ping por palavra",
    description: "Uma palavra grande entra no ritmo exato da fala.",
    timing: "word"
  },
  {
    id: "stacked_pop",
    label: "Stack pop",
    description: "As últimas palavras aparecem em pilha com impacto visual.",
    timing: "word"
  },
  {
    id: "youtube_clean",
    label: "YouTube limpo",
    description: "Legenda clássica por frase, boa para revisão longa.",
    timing: "segment"
  }
];

export function isCaptionStyleId(value: string): value is CaptionStyleId {
  return (CAPTION_STYLE_IDS as readonly string[]).includes(value);
}

export function getCaptionStyle(id: string | undefined | null): CaptionStyle {
  return CAPTION_STYLES.find((style) => style.id === id) ?? CAPTION_STYLES.find((style) => style.id === DEFAULT_CAPTION_STYLE_ID)!;
}
