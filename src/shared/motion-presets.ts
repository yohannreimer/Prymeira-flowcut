import type { SectionMotionTreatment, TimelineSection, TimelineSectionType } from "./edit-plan";
import { clampSeconds } from "./time";

type MotionSlot = SectionMotionTreatment["slots"][number];

export function createSectionMotionSlots(section: Pick<TimelineSection, "type" | "startSec" | "endSec">): MotionSlot[] {
  if (section.type === "hook") {
    return createHookMotionSlots(section.endSec);
  }
  return createContentMotionSlots(section.type, section.startSec, section.endSec);
}

export function createHookMotionSlots(hookEndSec: number): MotionSlot[] {
  const slots: MotionSlot[] = [
    {
      id: "motion_hook_title",
      kind: "hook_title",
      startSec: 0.35,
      endSec: clampSeconds(Math.min(5.8, hookEndSec)),
      label: "Gancho visual",
      payload: { eyebrow: "Ideia central", tone: "editorial" }
    },
    {
      id: "motion_hook_retention_zoom",
      kind: "zoom",
      startSec: 0,
      endSec: clampSeconds(Math.min(13, hookEndSec)),
      label: "Zoom de retenção",
      payload: { from: 1, to: 1.065, anchor: "center" }
    },
    {
      id: "motion_hook_focus_frame",
      kind: "focus_frame",
      startSec: clampSeconds(Math.min(6.2, hookEndSec * 0.45)),
      endSec: clampSeconds(Math.min(11.8, hookEndSec)),
      label: "Ponto de atenção",
      payload: { intensity: "premium" }
    }
  ];
  return slots.filter(hasPositiveDuration);
}

export function createContentMotionSlots(
  type: TimelineSectionType,
  sectionStartSec: number,
  sectionEndSec: number
): MotionSlot[] {
  const durationSec = sectionEndSec - sectionStartSec;
  if (durationSec < 8) return [];
  if (type === "screen" || type === "hybrid") {
    const slots: MotionSlot[] = [
      {
        id: "motion_screen_callout",
        kind: "callout",
        startSec: clampSeconds(sectionStartSec + 1.2),
        endSec: clampSeconds(Math.min(sectionStartSec + 6.8, sectionEndSec)),
        label: "Detalhe importante na tela",
        payload: { position: "right", tone: "clean" }
      },
      {
        id: "motion_screen_highlight",
        kind: "highlight",
        startSec: clampSeconds(sectionStartSec + 7.5),
        endSec: clampSeconds(Math.min(sectionStartSec + 11.5, sectionEndSec)),
        label: "Área de foco",
        payload: { shape: "frame" }
      }
    ];
    return slots.filter(hasPositiveDuration);
  }
  const slots: MotionSlot[] = [
    {
      id: "motion_talking_head_lower_third",
      kind: "lower_third",
      startSec: clampSeconds(sectionStartSec + 1),
      endSec: clampSeconds(Math.min(sectionStartSec + 5.5, sectionEndSec)),
      label: "Contexto do tópico",
      payload: { tone: "minimal" }
    },
    {
      id: "motion_talking_head_micro_zoom",
      kind: "zoom",
      startSec: clampSeconds(sectionStartSec + 6),
      endSec: clampSeconds(Math.min(sectionStartSec + 14, sectionEndSec)),
      label: "Micro zoom",
      payload: { from: 1, to: 1.035, anchor: "center" }
    }
  ];
  return slots.filter(hasPositiveDuration);
}

function hasPositiveDuration(slot: MotionSlot) {
  return slot.endSec > slot.startSec;
}
