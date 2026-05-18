import { describe, expect, it } from "vitest";
import { DEFAULT_CAPTION_SETTINGS } from "../../shared/caption-settings";
import { DEFAULT_COLOR_ADJUSTMENTS } from "../../shared/color-presets";
import type { EditPlan } from "../../shared/edit-plan";
import { createMotionRenderPlan } from "./motion-plan";

function createPlan(): EditPlan {
  return {
    id: "plan_1",
    projectId: "project_1",
    version: 1,
    source: { path: "/tmp/source.mp4", durationSec: 20, width: 1920, height: 1080, fps: 30, hasAudio: true },
    segments: [{ id: "seg_1", sourceStartSec: 0, sourceEndSec: 20, timelineStartSec: 0, timelineEndSec: 20, reason: "full clip" }],
    removed: [],
    sections: [
      {
        id: "section_hook",
        type: "hook",
        startSec: 0,
        endSec: 10,
        label: "Gancho",
        confidence: 0.8,
        warnings: [],
        treatments: {
          motion: {
            enabled: true,
            slots: [{ id: "slot_1", kind: "hook_title", startSec: 0.4, endSec: 4, label: "Gancho visual", payload: {} }]
          }
        }
      }
    ],
    captions: [{ id: "cap_1", startSec: 0.2, endSec: 2, text: "Como recuperar foco rapido", styleId: "youtube_clean", words: [] }],
    captionSettings: DEFAULT_CAPTION_SETTINGS,
    overlays: [],
    color: { presetId: "neutral", label: "Neutral", adjustments: DEFAULT_COLOR_ADJUSTMENTS },
    video: { flipHorizontal: false },
    audio: { music: null, voiceTargetLufs: -16 },
    qa: { status: "passed", warnings: [] },
    publishReadiness: { status: "needs_review", checks: [] },
    createdAt: "2026-05-06T00:00:00.000Z"
  };
}

describe("createMotionRenderPlan", () => {
  it("turns enabled section slots into Remotion-ready events and uses captions for hook copy", () => {
    const plan = createMotionRenderPlan(createPlan());

    expect(plan.summary).toEqual({ enabledSections: 1, hookEvents: 1 });
    expect(plan.events[0]).toMatchObject({
      id: "section_hook_slot_1",
      kind: "hook_title",
      label: "Como recuperar foco rapido"
    });
  });

  it("never sends generic hook labels to Remotion when captions are unavailable", () => {
    const rawPlan = createPlan();
    const plan = createMotionRenderPlan({
      ...rawPlan,
      captions: [],
      sections: [{
        ...rawPlan.sections[0],
        label: "Construindo sua Marca Pessoal do Jeito Certo",
        treatments: {
          motion: {
            enabled: true,
            slots: [{ id: "slot_1", kind: "hook_title", startSec: 0.4, endSec: 4, label: "Gancho visual", payload: {} }]
          }
        }
      }]
    });

    expect(plan.events[0].label).toBe("Construindo sua Marca Pessoal do Jeito Certo");
  });
});
