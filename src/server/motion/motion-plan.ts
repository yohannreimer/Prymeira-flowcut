import type { EditPlan, TimelineSection } from "../../shared/edit-plan";
import { getSectionLabel } from "../../shared/sections";

export type MotionEventKind =
  | "zoom"
  | "callout"
  | "highlight"
  | "lower_third"
  | "hook_title"
  | "kinetic_keyword"
  | "focus_frame"
  | "chapter_card";

export type MotionEvent = {
  id: string;
  kind: MotionEventKind;
  startSec: number;
  endSec: number;
  label: string;
  sectionType: TimelineSection["type"];
  payload: Record<string, unknown>;
};

export type MotionRenderPlan = {
  events: MotionEvent[];
  summary: {
    enabledSections: number;
    hookEvents: number;
  };
};

export function createMotionRenderPlan(plan: EditPlan): MotionRenderPlan {
  const events = plan.sections.flatMap((section) => {
    if (!section.treatments.motion?.enabled) return [];
    return section.treatments.motion.slots.map((slot) => ({
      id: `${section.id}_${slot.id}`,
      kind: slot.kind,
      startSec: slot.startSec,
      endSec: slot.endSec,
      label: getEventLabel(plan, section, slot.label, slot.startSec),
      sectionType: section.type,
      payload: slot.payload ?? {}
    }));
  });

  const normalized = events
    .filter((event) => event.endSec > event.startSec)
    .sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);

  return {
    events: normalized,
    summary: {
      enabledSections: plan.sections.filter((section) => section.treatments.motion?.enabled).length,
      hookEvents: normalized.filter((event) => event.sectionType === "hook").length
    }
  };
}

function getEventLabel(plan: EditPlan, section: TimelineSection, fallback: string, timeSec: number) {
  if (section.type === "hook") {
    const hookText = getCaptionTextNear(plan, 0, Math.min(12, section.endSec));
    if (hookText) return hookText;
    return getNonGenericText(section.label) ?? getNonGenericText(fallback) ?? "Ideia principal";
  }

  if (section.type === "screen" || section.type === "hybrid") {
    const text = getCaptionTextNear(plan, timeSec, Math.min(timeSec + 6, section.endSec));
    if (text) return text;
    return getNonGenericText(fallback) ?? getNonGenericText(section.label) ?? "Ponto importante";
  }

  if (section.type === "chapter") {
    return getNonGenericText(section.label) ?? "Novo bloco";
  }

  return getNonGenericText(fallback) ?? getNonGenericText(section.label) ?? "Ideia principal";
}

function getCaptionTextNear(plan: EditPlan, startSec: number, endSec: number) {
  const text = plan.captions
    .filter((caption) => caption.endSec > startSec && caption.startSec < endSec)
    .map((caption) => caption.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return null;
  const words = text.split(" ").filter(Boolean).slice(0, 8);
  if (words.length === 0) return null;
  return words.join(" ");
}

function getNonGenericText(text: string | undefined) {
  const clean = text?.replace(/\s+/g, " ").trim();
  if (!clean || isGenericMotionText(clean)) return null;
  return clean;
}

function isGenericMotionText(text: string) {
  const normalized = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return [
    "gancho",
    "gancho visual",
    "gancho do video",
    "observe este ponto",
    "ponto de atencao",
    "contexto do topico",
    "talking head",
    "conteudo"
  ].includes(normalized);
}
