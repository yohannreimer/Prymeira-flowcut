import { describe, expect, it } from "vitest";
import { CUT_PRESETS, cutPresetSchema, getCutPreset } from "./cut-presets";

describe("cut presets", () => {
  it("defines conservative, normal, and aggressive silence profiles", () => {
    expect(cutPresetSchema.parse("conservative")).toBe("conservative");
    expect(cutPresetSchema.parse("normal")).toBe("normal");
    expect(cutPresetSchema.parse("aggressive")).toBe("aggressive");
    expect(CUT_PRESETS.map((preset) => preset.id)).toEqual(["conservative", "normal", "aggressive"]);
  });

  it("makes aggressive cutting more noise-tolerant than normal and conservative", () => {
    expect(getCutPreset("conservative").noiseDb).toBeLessThan(getCutPreset("normal").noiseDb);
    expect(getCutPreset("normal").noiseDb).toBeLessThan(getCutPreset("aggressive").noiseDb);
  });
});
