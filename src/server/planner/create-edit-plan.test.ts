import { describe, expect, it } from "vitest";
import { createEditPlanFromSilences, createTimelineSegments } from "./create-edit-plan";

describe("createEditPlanFromSilences", () => {
  it("creates kept segments around silence with margin", () => {
    const plan = createEditPlanFromSilences({
      projectId: "project_1",
      sourcePath: "/tmp/source.mp4",
      durationSec: 12,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
      silences: [{ startSec: 4, endSec: 7, durationSec: 3 }],
      marginSec: 0.25,
      now: "2026-05-05T00:00:00.000Z"
    });

    expect(plan.removed).toEqual([{ id: "cut_1", startSec: 4.25, endSec: 6.75, reason: "silence" }]);
    expect(plan.segments).toEqual([
      {
        id: "seg_1",
        sourceStartSec: 0,
        sourceEndSec: 4.25,
        timelineStartSec: 0,
        timelineEndSec: 4.25,
        reason: "kept speech/content"
      },
      {
        id: "seg_2",
        sourceStartSec: 6.75,
        sourceEndSec: 12,
        timelineStartSec: 4.25,
        timelineEndSec: 9.5,
        reason: "kept speech/content"
      }
    ]);
  });

  it("keeps the whole video when no silences are removable", () => {
    const plan = createEditPlanFromSilences({
      projectId: "project_1",
      sourcePath: "/tmp/source.mp4",
      durationSec: 5,
      width: 1280,
      height: 720,
      fps: 30,
      hasAudio: true,
      silences: [],
      marginSec: 0.2,
      now: "2026-05-05T00:00:00.000Z"
    });

    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].sourceStartSec).toBe(0);
    expect(plan.segments[0].sourceEndSec).toBe(5);
  });

  it("normalizes source duration to match generated segment precision", () => {
    const plan = createEditPlanFromSilences({
      projectId: "project_1",
      sourcePath: "/tmp/source.mp4",
      durationSec: 5.0006,
      width: 1280,
      height: 720,
      fps: 30,
      hasAudio: true,
      silences: [],
      marginSec: 0.2,
      now: "2026-05-05T00:00:00.000Z"
    });

    expect(plan.source.durationSec).toBe(5.001);
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].sourceEndSec).toBe(5.001);
  });

  it("rejects negative margin", () => {
    expect(() =>
      createEditPlanFromSilences({
        projectId: "project_1",
        sourcePath: "/tmp/source.mp4",
        durationSec: 5,
        width: 1280,
        height: 720,
        fps: 30,
        hasAudio: true,
        silences: [{ startSec: 2, endSec: 3, durationSec: 1 }],
        marginSec: -0.1,
        now: "2026-05-05T00:00:00.000Z"
      })
    ).toThrow("marginSec must be nonnegative");
  });

  it("merges overlapping silences in source order", () => {
    const plan = createEditPlanFromSilences({
      projectId: "project_1",
      sourcePath: "/tmp/source.mp4",
      durationSec: 12,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
      silences: [
        { startSec: 6, endSec: 8, durationSec: 2 },
        { startSec: 2, endSec: 7, durationSec: 5 }
      ],
      marginSec: 0,
      now: "2026-05-05T00:00:00.000Z"
    });

    expect(plan.removed).toEqual([{ id: "cut_1", startSec: 2, endSec: 8, reason: "silence" }]);
    expect(plan.segments.map((segment) => [segment.sourceStartSec, segment.sourceEndSec])).toEqual([
      [0, 2],
      [8, 12]
    ]);
  });

  it("keeps the whole video when silence would remove the entire source", () => {
    const plan = createEditPlanFromSilences({
      projectId: "project_1",
      sourcePath: "/tmp/source.mp4",
      durationSec: 5,
      width: 1280,
      height: 720,
      fps: 30,
      hasAudio: true,
      silences: [{ startSec: 0, endSec: 5, durationSec: 5 }],
      marginSec: 0,
      now: "2026-05-05T00:00:00.000Z"
    });

    expect(plan.removed).toEqual([]);
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].sourceStartSec).toBe(0);
    expect(plan.segments[0].sourceEndSec).toBe(5);
  });

  it("clamps silence partially outside source duration", () => {
    const plan = createEditPlanFromSilences({
      projectId: "project_1",
      sourcePath: "/tmp/source.mp4",
      durationSec: 5,
      width: 1280,
      height: 720,
      fps: 30,
      hasAudio: true,
      silences: [{ startSec: 4, endSec: 8, durationSec: 4 }],
      marginSec: 0,
      now: "2026-05-05T00:00:00.000Z"
    });

    expect(plan.removed).toEqual([{ id: "cut_1", startSec: 4, endSec: 5, reason: "silence" }]);
    expect(plan.segments).toEqual([
      {
        id: "seg_1",
        sourceStartSec: 0,
        sourceEndSec: 4,
        timelineStartSec: 0,
        timelineEndSec: 4,
        reason: "kept speech/content"
      }
    ]);
  });

  it("drops boundary-only cuts", () => {
    const plan = createEditPlanFromSilences({
      projectId: "project_1",
      sourcePath: "/tmp/source.mp4",
      durationSec: 5,
      width: 1280,
      height: 720,
      fps: 30,
      hasAudio: true,
      silences: [{ startSec: -1, endSec: 0, durationSec: 1 }],
      marginSec: 0,
      now: "2026-05-05T00:00:00.000Z"
    });

    expect(plan.removed).toEqual([]);
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].sourceStartSec).toBe(0);
    expect(plan.segments[0].sourceEndSec).toBe(5);
  });

  it("keeps the whole video when margin makes silence non-removable", () => {
    const plan = createEditPlanFromSilences({
      projectId: "project_1",
      sourcePath: "/tmp/source.mp4",
      durationSec: 5,
      width: 1280,
      height: 720,
      fps: 30,
      hasAudio: true,
      silences: [{ startSec: 2, endSec: 2.2, durationSec: 0.2 }],
      marginSec: 0.2,
      now: "2026-05-05T00:00:00.000Z"
    });

    expect(plan.removed).toEqual([]);
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].sourceStartSec).toBe(0);
    expect(plan.segments[0].sourceEndSec).toBe(5);
  });

  it("adds intelligent sections to new edit plans", () => {
    const plan = createEditPlanFromSilences({
      projectId: "project_1",
      sourcePath: "/tmp/source.mp4",
      durationSec: 12,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
      silences: [{ startSec: 8, endSec: 12, durationSec: 4 }],
      marginSec: 0,
      now: "2026-05-05T00:00:00.000Z"
    });

    expect(plan.sections.some((section) => section.type === "hook")).toBe(true);
    expect(plan.sections.some((section) => section.type === "screen")).toBe(true);
    expect(plan.sections.some((section) => section.type === "problem")).toBe(true);
  });
});

describe("createTimelineSegments", () => {
  it("rebuilds contiguous timeline segments around a manually edited cut list", () => {
    expect(createTimelineSegments(10, [
      { id: "cut_2", startSec: 4, endSec: 6, reason: "silence" }
    ])).toEqual([
      {
        id: "seg_1",
        sourceStartSec: 0,
        sourceEndSec: 4,
        timelineStartSec: 0,
        timelineEndSec: 4,
        reason: "kept speech/content"
      },
      {
        id: "seg_2",
        sourceStartSec: 6,
        sourceEndSec: 10,
        timelineStartSec: 4,
        timelineEndSec: 8,
        reason: "kept speech/content"
      }
    ]);
  });

  it("sorts and merges manually edited cuts before rebuilding timeline segments", () => {
    expect(createTimelineSegments(12, [
      { id: "cut_2", startSec: 6, endSec: 8, reason: "silence" },
      { id: "cut_1", startSec: 2, endSec: 4, reason: "silence" },
      { id: "cut_3", startSec: 3.5, endSec: 6.5, reason: "silence" }
    ])).toEqual([
      {
        id: "seg_1",
        sourceStartSec: 0,
        sourceEndSec: 2,
        timelineStartSec: 0,
        timelineEndSec: 2,
        reason: "kept speech/content"
      },
      {
        id: "seg_2",
        sourceStartSec: 8,
        sourceEndSec: 12,
        timelineStartSec: 2,
        timelineEndSec: 6,
        reason: "kept speech/content"
      }
    ]);
  });
});
