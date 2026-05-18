import { describe, expect, it } from "vitest";
import { DEFAULT_CAPTION_SETTINGS } from "../../shared/caption-settings";
import { DEFAULT_COLOR_ADJUSTMENTS } from "../../shared/color-presets";
import type { EditPlan } from "../../shared/edit-plan";
import { assessPublishReadiness } from "./publish-readiness";

const basePlan: EditPlan = {
  id: "plan_1",
  projectId: "project_1",
  version: 1,
  source: {
    path: "/tmp/source.mp4",
    durationSec: 10,
    width: 1920,
    height: 1080,
    fps: 30,
    hasAudio: true
  },
  segments: [
    {
      id: "seg_1",
      sourceStartSec: 0,
      sourceEndSec: 10,
      timelineStartSec: 0,
      timelineEndSec: 10,
      reason: "full clip"
    }
  ],
  removed: [],
  sections: [],
  captions: [],
  captionSettings: DEFAULT_CAPTION_SETTINGS,
  overlays: [],
  color: {
    presetId: "neutral",
    label: "Neutral",
    adjustments: DEFAULT_COLOR_ADJUSTMENTS
  },
  video: {
    flipHorizontal: false
  },
  audio: {
    music: null,
    voiceTargetLufs: -16
  },
  qa: {
    status: "passed",
    warnings: []
  },
  publishReadiness: {
    status: "needs_review",
    checks: []
  },
  createdAt: "2026-05-05T00:00:00.000Z"
};

describe("assessPublishReadiness", () => {
  it("blocks when captions are enabled but no captions exist", () => {
    const readiness = assessPublishReadiness(basePlan, {
      hasLatestExport: false,
      sourceColorTransfer: "arib-std-b67"
    });

    expect(readiness.status).toBe("blocked");
    expect(readiness.checks.some((check) => check.id === "captions_missing" && check.status === "failed")).toBe(true);
  });

  it("warns when HLG/HDR source has no SDR export decision", () => {
    const readiness = assessPublishReadiness(
      { ...basePlan, captionSettings: { ...DEFAULT_CAPTION_SETTINGS, enabled: false } },
      { hasLatestExport: false, sourceColorTransfer: "arib-std-b67" }
    );

    expect(readiness.checks.some((check) => check.id === "sdr_decision" && check.status === "warning")).toBe(true);
  });

  it("warns when PQ HDR source has no SDR export decision", () => {
    const readiness = assessPublishReadiness(
      { ...basePlan, captionSettings: { ...DEFAULT_CAPTION_SETTINGS, enabled: false } },
      { hasLatestExport: true, sourceColorTransfer: "smpte2084" }
    );

    expect(readiness.status).toBe("needs_review");
    expect(readiness.checks.some((check) => check.id === "sdr_decision" && check.status === "warning")).toBe(true);
  });

  it("is ready when all checks pass", () => {
    const readiness = assessPublishReadiness(
      { ...basePlan, captionSettings: { ...DEFAULT_CAPTION_SETTINGS, enabled: false }, sections: [] },
      { hasLatestExport: true, sourceColorTransfer: "bt709", sdrMode: "preserve" }
    );

    expect(readiness.status).toBe("ready");
  });
});
