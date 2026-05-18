import { describe, expect, it } from "vitest";
import { DEFAULT_CAPTION_SETTINGS } from "./caption-settings";
import type { TimelineSection } from "./edit-plan";
import { getSectionAtTime, getSectionLabel, mergeSectionCaptionSettings, sectionOverlapsRange } from "./sections";

const sections: TimelineSection[] = [
  { id: "s1", type: "hook", startSec: 0, endSec: 10, label: "Gancho", confidence: 1, warnings: [], treatments: {} },
  { id: "s2", type: "screen", startSec: 10, endSec: 30, label: "Tela", confidence: 0.8, warnings: [], treatments: { captions: { enabled: false } } }
];

describe("section helpers", () => {
  it("finds the section active at a timeline time", () => {
    expect(getSectionAtTime(sections, 12)?.id).toBe("s2");
  });

  it("prefers content sections over hook sections when both overlap", () => {
    const overlappingSections: TimelineSection[] = [
      { id: "hook", type: "hook", startSec: 0, endSec: 8, label: "Gancho", confidence: 0.7, warnings: [], treatments: {} },
      { id: "screen", type: "screen", startSec: 0, endSec: 8, label: "Tela", confidence: 0.45, warnings: [], treatments: {} }
    ];

    expect(getSectionAtTime(overlappingSections, 4)?.id).toBe("screen");
  });

  it("detects overlap with caption ranges", () => {
    expect(sectionOverlapsRange(sections[1], 9.9, 10.1)).toBe(true);
    expect(sectionOverlapsRange(sections[1], 0, 9.9)).toBe(false);
  });

  it("merges section caption settings over global settings", () => {
    expect(mergeSectionCaptionSettings(DEFAULT_CAPTION_SETTINGS, sections[1])).toMatchObject({
      enabled: false,
      styleId: DEFAULT_CAPTION_SETTINGS.styleId
    });
  });

  it("returns Portuguese labels", () => {
    expect(getSectionLabel("talking_head")).toBe("Rosto");
  });
});
