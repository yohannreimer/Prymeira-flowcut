import { describe, expect, it } from "vitest";
import { buildColorFilter, COLOR_PRESETS } from "./color-presets";

describe("color presets", () => {
  it("includes a strong LOG to YouTube correction preset", () => {
    const preset = COLOR_PRESETS.find((item) => item.id === "log_to_rec709");

    expect(preset?.label).toBe("LOG -> YouTube");
    expect(buildColorFilter("log_to_rec709")).toContain("eq=gamma=");
    expect(buildColorFilter("log_to_rec709")).toContain("saturation=1.45");
    expect(buildColorFilter("log_to_rec709")).toContain("colorlevels=");
  });
});
