import { z } from "zod";

export const cutPresetSchema = z.enum(["conservative", "normal", "aggressive"]);
export type CutPresetId = z.infer<typeof cutPresetSchema>;

export type CutPreset = {
  id: CutPresetId;
  label: string;
  description: string;
  noiseDb: number;
  minDurationSec: number;
  marginSec: number;
};

export const CUT_PRESETS: CutPreset[] = [
  {
    id: "conservative",
    label: "Conservador",
    description: "Corta só pausas bem claras.",
    noiseDb: -40,
    minDurationSec: 0.9,
    marginSec: 0.25
  },
  {
    id: "normal",
    label: "Normal",
    description: "Bom para fala com ruído leve de fundo.",
    noiseDb: -35,
    minDurationSec: 0.7,
    marginSec: 0.2
  },
  {
    id: "aggressive",
    label: "Agressivo",
    description: "Remove pausas mais curtas e ignora mais ruído.",
    noiseDb: -30,
    minDurationSec: 0.5,
    marginSec: 0.1
  }
];

export function getCutPreset(id: CutPresetId = "normal") {
  return CUT_PRESETS.find((preset) => preset.id === id) ?? CUT_PRESETS[1];
}
