import { describe, expect, it } from "vitest";
import { createSectionMotionSlots } from "./motion-presets";

describe("createSectionMotionSlots", () => {
  it("creates hook motions for an existing section without requiring a new draft", () => {
    const slots = createSectionMotionSlots({ type: "hook", startSec: 0, endSec: 30 });

    expect(slots.map((slot) => slot.kind)).toEqual(["hook_title", "zoom", "focus_frame"]);
    expect(slots.every((slot) => slot.startSec >= 0 && slot.endSec <= 30)).toBe(true);
  });

  it("creates screen motions inside the selected section window", () => {
    const slots = createSectionMotionSlots({ type: "screen", startSec: 30, endSec: 90 });

    expect(slots.map((slot) => slot.kind)).toEqual(["callout", "highlight"]);
    expect(slots.every((slot) => slot.startSec >= 30 && slot.endSec <= 90)).toBe(true);
  });

  it("skips tiny sections because they would create noisy motion", () => {
    expect(createSectionMotionSlots({ type: "problem", startSec: 12, endSec: 14 })).toEqual([]);
  });
});
