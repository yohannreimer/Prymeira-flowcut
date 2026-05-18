import { describe, expect, it } from "vitest";
import { editPlanSchema } from "./edit-plan";
import { clampSeconds, secondsToTimecode } from "./time";

const createPlan = (overrides: Record<string, unknown> = {}) => ({
  id: "plan_1",
  projectId: "project_1",
  version: 1,
  source: {
    path: "/tmp/source.mp4",
    durationSec: 12,
    width: 1920,
    height: 1080,
    fps: 30,
    hasAudio: true
  },
  segments: [
    {
      id: "seg_1",
      sourceStartSec: 0,
      sourceEndSec: 4,
      timelineStartSec: 0,
      timelineEndSec: 4,
      reason: "opening speech"
    }
  ],
  removed: [
    {
      id: "cut_1",
      startSec: 4,
      endSec: 7,
      reason: "silence"
    }
  ],
  captions: [],
  overlays: [],
  color: { presetId: "neutral", label: "Neutral" },
  audio: { music: null, voiceTargetLufs: -16 },
  qa: { status: "not_run", warnings: [] },
  createdAt: "2026-05-05T00:00:00.000Z",
  ...overrides
});

describe("time helpers", () => {
  it("formats seconds as a timecode", () => {
    expect(secondsToTimecode(65.432)).toBe("00:01:05.432");
  });

  it("clamps seconds at zero", () => {
    expect(clampSeconds(-2)).toBe(0);
    expect(clampSeconds(2.25)).toBe(2.25);
  });

  it("rejects non-finite seconds", () => {
    expect(() => clampSeconds(Number.POSITIVE_INFINITY)).toThrow("Seconds must be finite");
    expect(() => clampSeconds(Number.NaN)).toThrow("Seconds must be finite");
  });
});

describe("editPlanSchema", () => {
  it("accepts a minimal rough-cut plan", () => {
    const parsed = editPlanSchema.parse(createPlan());

    expect(parsed.segments[0].timelineEndSec).toBe(4);
  });

  it("accepts caption words and keeps old caption data compatible", () => {
    const parsed = editPlanSchema.parse(
      createPlan({
        captions: [
          {
            id: "caption_1",
            startSec: 0.5,
            endSec: 2,
            text: "legenda antiga",
            styleId: "youtube_clean"
          },
          {
            id: "caption_2",
            startSec: 2,
            endSec: 3.5,
            text: "word level",
            styleId: "focus_word",
            words: [
              { id: "caption_2_w1", startSec: 2, endSec: 2.4, text: "word" },
              { id: "caption_2_w2", startSec: 2.45, endSec: 3.2, text: "level" }
            ]
          }
        ]
      })
    );

    expect(parsed.captions[0].words).toEqual([]);
    expect(parsed.captions[1].words).toHaveLength(2);
  });

  it("adds default caption settings for existing plans", () => {
    const parsed = editPlanSchema.parse(createPlan());

    expect(parsed.captionSettings).toMatchObject({
      enabled: true,
      displayMode: "block_highlight",
      wordsPerBlock: 4
    });
  });

  it("accepts timeline sections with treatment overrides", () => {
    const parsed = editPlanSchema.parse(
      createPlan({
        segments: [
          {
            id: "seg_1",
            sourceStartSec: 0,
            sourceEndSec: 12,
            timelineStartSec: 0,
            timelineEndSec: 12,
            reason: "full clip"
          }
        ],
        sections: [
          {
            id: "section_1",
            type: "hook",
            startSec: 0,
            endSec: 12,
            sourceStartSec: 0,
            sourceEndSec: 12,
            label: "Gancho",
            confidence: 0.8,
            warnings: [],
            treatments: {
              captions: { enabled: true, styleId: "focus_word" },
              audio: { voiceCleanup: true, musicDucking: true },
              image: { presetId: "creator_clean", sdrMode: "preserve" },
              motion: { enabled: false, slots: [] }
            }
          }
        ]
      })
    );

    expect(parsed.sections[0]).toMatchObject({
      type: "hook",
      treatments: {
        captions: { enabled: true, styleId: "focus_word" },
        audio: { voiceCleanup: true, musicDucking: true },
        image: { presetId: "creator_clean", sdrMode: "preserve" },
        motion: { enabled: false, slots: [] }
      }
    });
  });

  it("adds an empty sections array to old edit plans", () => {
    const parsed = editPlanSchema.parse(createPlan());

    expect(parsed.sections).toEqual([]);
  });

  it("accepts publish readiness status on edit plans", () => {
    const parsed = editPlanSchema.parse(
      createPlan({
        publishReadiness: {
          status: "needs_review",
          checks: [
            {
              id: "captions_safe_area",
              status: "warning",
              label: "Legendas fora da area segura",
              message: "Ajuste a posicao das legendas.",
              targetTab: "captions",
              sectionId: "section_1"
            }
          ]
        }
      })
    );

    expect(parsed.publishReadiness.status).toBe("needs_review");
  });

  it("rejects sections outside the rendered timeline", () => {
    expect(() =>
      editPlanSchema.parse(
        createPlan({
          sections: [
            {
              id: "section_bad",
              type: "screen",
              startSec: 0,
              endSec: 999,
              label: "Bad",
              confidence: 1,
              warnings: [],
              treatments: {}
            }
          ]
        })
      )
    ).toThrow("section must be within rendered timeline duration");
  });

  it("rejects timeline sections with incomplete source ranges", () => {
    expect(() =>
      editPlanSchema.parse(
        createPlan({
          sections: [
            {
              id: "section_bad",
              type: "screen",
              startSec: 0,
              endSec: 2,
              sourceStartSec: 0,
              label: "Bad source pair",
              confidence: 1,
              warnings: [],
              treatments: {}
            }
          ]
        })
      )
    ).toThrow("section source range must include both start and end");
  });

  it("rejects timeline sections with inverted source ranges", () => {
    expect(() =>
      editPlanSchema.parse(
        createPlan({
          sections: [
            {
              id: "section_bad",
              type: "screen",
              startSec: 0,
              endSec: 2,
              sourceStartSec: 4,
              sourceEndSec: 3,
              label: "Bad source order",
              confidence: 1,
              warnings: [],
              treatments: {}
            }
          ]
        })
      )
    ).toThrow("section sourceEndSec must be greater than sourceStartSec");
  });

  it("rejects timeline sections with source ranges beyond source duration", () => {
    expect(() =>
      editPlanSchema.parse(
        createPlan({
          sections: [
            {
              id: "section_bad",
              type: "screen",
              startSec: 0,
              endSec: 2,
              sourceStartSec: 11,
              sourceEndSec: 13,
              label: "Bad source duration",
              confidence: 1,
              warnings: [],
              treatments: {}
            }
          ]
        })
      )
    ).toThrow("section source range must be within source duration");
  });

  it("rejects section motion slots outside the parent section", () => {
    expect(() =>
      editPlanSchema.parse(
        createPlan({
          sections: [
            {
              id: "section_1",
              type: "screen",
              startSec: 0,
              endSec: 2,
              label: "Screen",
              confidence: 1,
              warnings: [],
              treatments: {
                motion: {
                  enabled: true,
                  slots: [{ id: "slot_1", kind: "zoom", startSec: 3, endSec: 4, label: "Zoom" }]
                }
              }
            }
          ]
        })
      )
    ).toThrow("motion slot must be within section duration");
  });

  it("rejects segments with inverted source times", () => {
    expect(() =>
      editPlanSchema.parse(
        createPlan({
          removed: [],
          segments: [
            {
              id: "seg_1",
              sourceStartSec: 8,
              sourceEndSec: 4,
              timelineStartSec: 0,
              timelineEndSec: 4,
              reason: "invalid"
            }
          ]
        })
      )
    ).toThrow();
  });

  it("rejects inverted caption timing", () => {
    expect(() =>
      editPlanSchema.parse(
        createPlan({
          captions: [
            {
              id: "caption_1",
              startSec: 3,
              endSec: 2,
              text: "bad caption",
              styleId: "youtube_clean"
            }
          ]
        })
      )
    ).toThrow();
  });

  it("rejects caption words outside their caption", () => {
    expect(() =>
      editPlanSchema.parse(
        createPlan({
          captions: [
            {
              id: "caption_1",
              startSec: 1,
              endSec: 2,
              text: "bad word",
              styleId: "focus_word",
              words: [{ id: "caption_1_w1", startSec: 1.4, endSec: 2.2, text: "word" }]
            }
          ]
        })
      )
    ).toThrow("caption word must be within caption duration");
  });

  it("rejects inverted overlay timing", () => {
    expect(() =>
      editPlanSchema.parse(
        createPlan({
          overlays: [
            {
              id: "overlay_1",
              kind: "callout",
              startSec: 3,
              endSec: 3,
              label: "bad overlay",
              payload: {}
            }
          ]
        })
      )
    ).toThrow();
  });

  it("rejects empty segments", () => {
    expect(() => editPlanSchema.parse(createPlan({ segments: [] }))).toThrow();
  });

  it("rejects segment beyond source duration", () => {
    expect(() =>
      editPlanSchema.parse(
        createPlan({
          source: { path: "/tmp/source.mp4", durationSec: 3, width: 1920, height: 1080, fps: 30, hasAudio: true }
        })
      )
    ).toThrow();
  });

  it("rejects non-finite source duration", () => {
    expect(() =>
      editPlanSchema.parse(
        createPlan({
          source: {
            path: "/tmp/source.mp4",
            durationSec: Number.POSITIVE_INFINITY,
            width: 1920,
            height: 1080,
            fps: 30,
            hasAudio: true
          }
        })
      )
    ).toThrow();
  });

  it("rejects non-finite source fps", () => {
    expect(() =>
      editPlanSchema.parse(
        createPlan({
          source: {
            path: "/tmp/source.mp4",
            durationSec: 12,
            width: 1920,
            height: 1080,
            fps: Number.POSITIVE_INFINITY,
            hasAudio: true
          }
        })
      )
    ).toThrow();
  });

  it("rejects non-contiguous timeline segments", () => {
    expect(() =>
      editPlanSchema.parse(
        createPlan({
          removed: [],
          segments: [
            {
              id: "seg_1",
              sourceStartSec: 0,
              sourceEndSec: 4,
              timelineStartSec: 0,
              timelineEndSec: 4,
              reason: "opening speech"
            },
            {
              id: "seg_2",
              sourceStartSec: 4,
              sourceEndSec: 6,
              timelineStartSec: 4.5,
              timelineEndSec: 6.5,
              reason: "gap"
            }
          ]
        })
      )
    ).toThrow();
  });

  it("rejects retimed segments", () => {
    expect(() =>
      editPlanSchema.parse(
        createPlan({
          removed: [],
          segments: [
            {
              id: "seg_1",
              sourceStartSec: 0,
              sourceEndSec: 4,
              timelineStartSec: 0,
              timelineEndSec: 5,
              reason: "retimed"
            }
          ]
        })
      )
    ).toThrow();
  });

  it("rejects removed intervals beyond source duration", () => {
    expect(() =>
      editPlanSchema.parse(
        createPlan({
          removed: [
            {
              id: "cut_1",
              startSec: 10,
              endSec: 13,
              reason: "beyond source"
            }
          ]
        })
      )
    ).toThrow();
  });

  it("rejects captions beyond rendered timeline duration", () => {
    expect(() =>
      editPlanSchema.parse(
        createPlan({
          captions: [
            {
              id: "caption_1",
              startSec: 3,
              endSec: 4.5,
              text: "too long",
              styleId: "youtube_clean"
            }
          ]
        })
      )
    ).toThrow();
  });

  it("rejects overlays beyond rendered timeline duration", () => {
    expect(() =>
      editPlanSchema.parse(
        createPlan({
          overlays: [
            {
              id: "overlay_1",
              kind: "highlight",
              startSec: 3,
              endSec: 4.5,
              label: "too long",
              payload: {}
            }
          ]
        })
      )
    ).toThrow();
  });

  it("accepts contiguous segments within tolerance", () => {
    const parsed = editPlanSchema.parse(
      createPlan({
        removed: [],
        segments: [
          {
            id: "seg_1",
            sourceStartSec: 0,
            sourceEndSec: 4,
            timelineStartSec: 0,
            timelineEndSec: 4,
            reason: "opening speech"
          },
          {
            id: "seg_2",
            sourceStartSec: 4,
            sourceEndSec: 6,
            timelineStartSec: 4.0005,
            timelineEndSec: 6.0005,
            reason: "follow-up"
          }
        ]
      })
    );

    expect(parsed.segments).toHaveLength(2);
  });
});
