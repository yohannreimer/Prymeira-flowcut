import { describe, expect, it } from "vitest";
import { DEFAULT_CAPTION_SETTINGS } from "../../shared/caption-settings";
import { DEFAULT_COLOR_ADJUSTMENTS } from "../../shared/color-presets";
import type { EditPlan } from "../../shared/edit-plan";
import { createSectionMotionTreatments } from "./ai-motion-planner";

function createPlan(): EditPlan {
  return {
    id: "plan_1",
    projectId: "project_1",
    version: 1,
    source: { path: "/tmp/source.mp4", durationSec: 80, width: 1920, height: 1080, fps: 30, hasAudio: true },
    segments: [{ id: "seg_1", sourceStartSec: 0, sourceEndSec: 80, timelineStartSec: 0, timelineEndSec: 80, reason: "full clip" }],
    removed: [],
    sections: [
      { id: "section_hook", type: "hook", startSec: 0, endSec: 30, label: "Gancho", confidence: 0.8, warnings: [], treatments: {} },
      { id: "section_content", type: "talking_head", startSec: 30, endSec: 80, label: "Conteudo", confidence: 0.6, warnings: [], treatments: {} }
    ],
    captions: [],
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

const transcript = [
  { startSec: 0, endSec: 4, text: "Hoje eu vou mostrar como transformar uma aula longa em um video melhor", words: [] },
  { startSec: 34, endSec: 39, text: "Agora a parte mais importante e organizar os blocos antes de editar", words: [] }
];

describe("createSectionMotionTreatments", () => {
  it("replaces generic AI labels with real transcript copy and keeps hook inside 20s", () => {
    const treatments = createSectionMotionTreatments(createPlan(), transcript, {
      editorialSummary: "Plano editorial para aula longa.",
      motions: [
        {
          sectionId: "section_hook",
          kind: "hook_title",
          startSec: 0.5,
          endSec: 8,
          title: "Gancho",
          subtitle: null,
          keyword: null,
          visualDirection: "Titulo editorial no inicio.",
          reason: "Criar retencao nos primeiros segundos.",
          intensity: "strong",
          position: "center"
        },
        {
          sectionId: "section_content",
          kind: "lower_third",
          startSec: 35,
          endSec: 40,
          title: "Organizar os blocos",
          subtitle: "Antes de editar",
          keyword: null,
          visualDirection: "Lower third limpo.",
          reason: "Marca a mudanca de raciocinio.",
          intensity: "medium",
          position: "bottom"
        }
      ]
    });

    expect(treatments[0].slots[0]).toMatchObject({
      kind: "hook_title",
      label: "Hoje eu vou mostrar como transformar uma aula"
    });
    expect(treatments[0].slots[0].endSec).toBeLessThanOrEqual(6);
    expect(treatments[1].slots[0].payload).toMatchObject({
      title: "Organizar os blocos",
      subtitle: "Antes de editar",
      generatedBy: "openai"
    });
  });

  it("caps long AI motions to short editorial bursts", () => {
    const treatments = createSectionMotionTreatments(createPlan(), transcript, {
      editorialSummary: "Plano editorial para aula longa.",
      motions: [
        {
          sectionId: "section_content",
          kind: "kinetic_keyword",
          startSec: 34,
          endSec: 54,
          title: "Organizar os blocos",
          subtitle: null,
          keyword: "blocos",
          visualDirection: "Keyword punch rapido.",
          reason: "Destaca uma virada importante sem cobrir o video por muito tempo.",
          intensity: "strong",
          position: "left"
        }
      ]
    });

    const slot = treatments[1].slots[0];
    expect(slot.endSec - slot.startSec).toBeLessThanOrEqual(4.5);
  });

  it("adds a required hook motion when AI only chooses later moments", () => {
    const treatments = createSectionMotionTreatments(createPlan(), transcript, {
      editorialSummary: "Plano editorial para aula longa.",
      motions: [
        {
          sectionId: "section_content",
          kind: "callout",
          startSec: 35,
          endSec: 40,
          title: "Organizar antes de editar",
          subtitle: null,
          keyword: null,
          visualDirection: "Callout lateral.",
          reason: "Reforca a tese.",
          intensity: "medium",
          position: "right"
        }
      ]
    });

    expect(treatments[0].enabled).toBe(true);
    expect(treatments[0].slots[0]).toMatchObject({
      kind: "hook_title",
      payload: { generatedBy: "fallback" }
    });
  });
});
