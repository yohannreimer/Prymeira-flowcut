import { z } from "zod";

export const colorPresetSchema = z.enum([
  "neutral",
  "log_to_rec709",
  "creator_clean",
  "studio_warm",
  "cinematic_teal",
  "soft_film",
  "screen_tutorial",
  "moody_contrast",
  "mono_editorial",
  "punchy",
  "warm",
  "clean_screen",
  "high_contrast"
]);
export type ColorPresetId = z.infer<typeof colorPresetSchema>;

export const colorAdjustmentsSchema = z.object({
  intensity: z.number().finite().min(0).max(1).default(1),
  exposure: z.number().finite().min(-0.2).max(0.2).default(0),
  contrast: z.number().finite().min(0.75).max(1.35).default(1),
  saturation: z.number().finite().min(0.6).max(1.6).default(1),
  temperature: z.number().finite().min(-0.25).max(0.25).default(0),
  tint: z.number().finite().min(-0.2).max(0.2).default(0),
  vignette: z.number().finite().min(0).max(0.7).default(0)
});

export type ColorAdjustments = z.infer<typeof colorAdjustmentsSchema>;

export type ColorPreset = {
  id: ColorPresetId;
  label: string;
  description: string;
  swatch: string;
  ffmpegFilter: string | null;
};

export const DEFAULT_COLOR_ADJUSTMENTS: ColorAdjustments = colorAdjustmentsSchema.parse({});

export const COLOR_PRESETS: ColorPreset[] = [
  { id: "neutral", label: "Neutro", description: "Mantém o arquivo sem look criativo.", swatch: "linear-gradient(90deg, #b9aea0, #f2ead9)", ffmpegFilter: null },
  {
    id: "log_to_rec709",
    label: "LOG -> YouTube",
    description: "Converte imagem lavada/LOG para contraste, pele e saturação de YouTube.",
    swatch: "linear-gradient(90deg, #393936, #b99b67, #f7d37b, #fbfaf4)",
    ffmpegFilter: "eq=gamma=0.82:contrast=1.34:saturation=1.45:brightness=0.025,colorlevels=rimin=0.035:gimin=0.035:bimin=0.035:romax=0.96:gomax=0.96:bomax=0.96,colorbalance=rs=0.025:gs=0.005:bs=-0.025"
  },
  { id: "creator_clean", label: "Creator clean", description: "Pele limpa, leve punch e branco bem controlado.", swatch: "linear-gradient(90deg, #20201e, #fbfaf4, #509ad4)", ffmpegFilter: "eq=contrast=1.06:saturation=1.08:brightness=0.012,colorbalance=rs=0.015:bs=-0.015" },
  { id: "studio_warm", label: "Studio warm", description: "Look quente e agradável para talking head.", swatch: "linear-gradient(90deg, #34231c, #d89a00, #fbfaf4)", ffmpegFilter: "eq=contrast=1.05:saturation=1.12:brightness=0.008,colorbalance=rs=0.05:gs=0.01:bs=-0.05" },
  { id: "cinematic_teal", label: "Cinematic teal", description: "Sombras frias, pele quente e contraste de cinema.", swatch: "linear-gradient(90deg, #102c33, #d89a00, #f4efe3)", ffmpegFilter: "eq=contrast=1.12:saturation=1.14:brightness=-0.006,colorbalance=rs=-0.04:bs=0.07:rh=0.035:bh=-0.025" },
  { id: "soft_film", label: "Soft film", description: "Contraste macio, saturação segura e highlights suaves.", swatch: "linear-gradient(90deg, #2f2b28, #c6aa7d, #f4efe3)", ffmpegFilter: "eq=contrast=0.96:saturation=0.92:brightness=0.012,colorlevels=rimin=0.015:gimin=0.015:bimin=0.015:romax=0.97:gomax=0.97:bomax=0.97" },
  { id: "screen_tutorial", label: "Tela tutorial", description: "Preserva texto de tela e reduz saturação exagerada.", swatch: "linear-gradient(90deg, #30302d, #fbfaf4, #9fc4df)", ffmpegFilter: "eq=contrast=1.04:saturation=0.9:brightness=0.018,unsharp=5:5:0.35" },
  { id: "moody_contrast", label: "Moody contrast", description: "Contraste forte com pretos densos para vídeos dramáticos.", swatch: "linear-gradient(90deg, #111110, #746b60, #fcc009)", ffmpegFilter: "eq=contrast=1.2:saturation=0.98:brightness=-0.018,colorlevels=rimin=0.025:gimin=0.025:bimin=0.025" },
  { id: "mono_editorial", label: "Mono editorial", description: "Preto e branco limpo para cortes mais autorais.", swatch: "linear-gradient(90deg, #10100f, #77766f, #fbfaf4)", ffmpegFilter: "hue=s=0,eq=contrast=1.18:brightness=0.006" },
  { id: "punchy", label: "Vibrante", description: "Saturado e rápido para conteúdo social.", swatch: "linear-gradient(90deg, #171716, #fcc009, #509ad4)", ffmpegFilter: "eq=contrast=1.08:saturation=1.18:brightness=0.01" },
  { id: "warm", label: "Quente", description: "Aquece a imagem sem pesar as sombras.", swatch: "linear-gradient(90deg, #4d2d1f, #d89a00, #f4efe3)", ffmpegFilter: "eq=contrast=1.03:saturation=1.12:brightness=0.008,colorbalance=rs=0.035:bs=-0.035" },
  { id: "clean_screen", label: "Tela limpa", description: "Legibilidade para gravações de tela.", swatch: "linear-gradient(90deg, #30302d, #fbfaf4, #509ad4)", ffmpegFilter: "eq=contrast=1.04:saturation=0.95:brightness=0.015" },
  { id: "high_contrast", label: "Alto contraste", description: "Aumenta presença com pretos mais firmes.", swatch: "linear-gradient(90deg, #10100f, #fbfaf4)", ffmpegFilter: "eq=contrast=1.16:saturation=1.05:brightness=-0.01" }
];

export function getColorPreset(id: ColorPresetId = "neutral") {
  return COLOR_PRESETS.find((preset) => preset.id === id) ?? COLOR_PRESETS[0];
}

export function buildColorFilter(presetId: ColorPresetId = "neutral", adjustments: Partial<ColorAdjustments> = {}) {
  const preset = getColorPreset(presetId);
  const normalized = colorAdjustmentsSchema.parse(adjustments);
  const filters = preset.ffmpegFilter ? [preset.ffmpegFilter] : [];
  const intensity = normalized.intensity;
  const contrast = mix(1, normalized.contrast, intensity);
  const saturation = mix(1, normalized.saturation, intensity);
  const brightness = normalized.exposure * intensity;
  const redShift = (normalized.temperature + normalized.tint * 0.45) * intensity;
  const greenShift = (-normalized.tint * 0.35) * intensity;
  const blueShift = (-normalized.temperature + normalized.tint * 0.2) * intensity;

  if (brightness !== 0 || contrast !== 1 || saturation !== 1) {
    filters.push(`eq=contrast=${round(contrast)}:saturation=${round(saturation)}:brightness=${round(brightness)}`);
  }
  if (redShift !== 0 || greenShift !== 0 || blueShift !== 0) {
    filters.push(`colorbalance=rs=${round(redShift)}:gs=${round(greenShift)}:bs=${round(blueShift)}`);
  }
  if (normalized.vignette > 0) {
    filters.push(`vignette=PI/5:${round(normalized.vignette * intensity)}`);
  }

  return filters.length > 0 ? filters.join(",") : null;
}

function mix(base: number, value: number, intensity: number) {
  return base + (value - base) * intensity;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
