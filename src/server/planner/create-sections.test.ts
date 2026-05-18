import { describe, expect, it } from "vitest";
import type { RemovedInterval, TimelineSegment } from "../../shared/edit-plan";
import { createTimelineSections } from "./create-sections";

const segments: TimelineSegment[] = [
  { id: "seg_1", sourceStartSec: 0, sourceEndSec: 8, timelineStartSec: 0, timelineEndSec: 8, reason: "kept speech/content" },
  { id: "seg_2", sourceStartSec: 12, sourceEndSec: 42, timelineStartSec: 8, timelineEndSec: 38, reason: "kept speech/content" }
];

const removed: RemovedInterval[] = [
  { id: "cut_1", startSec: 8, endSec: 12, reason: "silence" }
];

describe("createTimelineSections", () => {
  it("creates a hook section at the start of the rendered timeline", () => {
    const sections = createTimelineSections({ segments, removed, sourceWidth: 1920, sourceHeight: 1080 });
    expect(sections[0]).toMatchObject({ type: "hook", startSec: 0, label: "Gancho" });
    expect(sections[0].endSec).toBeLessThanOrEqual(30);
    expect(sections[0].treatments.motion).toMatchObject({
      enabled: true,
      slots: expect.arrayContaining([
        expect.objectContaining({ kind: "hook_title" }),
        expect.objectContaining({ kind: "zoom" }),
        expect.objectContaining({ kind: "focus_frame" })
      ])
    });
  });

  it("creates problem sections from removed intervals mapped onto the review timeline", () => {
    const sections = createTimelineSections({ segments, removed, sourceWidth: 1920, sourceHeight: 1080 });
    expect(sections.some((section) => section.type === "problem" && section.label === "Silencio removido")).toBe(true);
  });

  it("uses screen as the default content section for horizontal sources", () => {
    const sections = createTimelineSections({ segments, removed: [], sourceWidth: 1920, sourceHeight: 1080 });
    expect(sections.some((section) => section.type === "screen")).toBe(true);
    expect(sections.find((section) => section.type === "screen")?.treatments.motion?.slots).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "callout" })])
    );
  });

  it("uses talking head as the default content section for vertical sources", () => {
    const sections = createTimelineSections({ segments, removed: [], sourceWidth: 1080, sourceHeight: 1920 });
    expect(sections.some((section) => section.type === "talking_head")).toBe(true);
  });
});
