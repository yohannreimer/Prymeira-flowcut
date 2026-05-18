import type { CaptionSettings } from "./caption-settings";
import type { TimelineSection, TimelineSectionType } from "./edit-plan";

export const SECTION_LABELS: Record<TimelineSectionType, string> = {
  hook: "Gancho",
  talking_head: "Rosto",
  screen: "Tela",
  hybrid: "Tela + rosto",
  problem: "Problema",
  chapter: "Capitulo"
};

export function getSectionLabel(type: TimelineSectionType) {
  return SECTION_LABELS[type];
}

export function getSectionAtTime(sections: TimelineSection[], timeSec: number): TimelineSection | null {
  const activeSections = sections.filter((section) => section.startSec <= timeSec && section.endSec > timeSec);
  return (
    activeSections.find((section) => section.type !== "hook" && section.type !== "chapter") ??
    activeSections[0] ??
    null
  );
}

export function sectionOverlapsRange(
  section: Pick<TimelineSection, "startSec" | "endSec">,
  startSec: number,
  endSec: number
): boolean {
  return section.startSec < endSec && section.endSec > startSec;
}

export function getSectionsForRange(sections: TimelineSection[], startSec: number, endSec: number): TimelineSection[] {
  return sections.filter((section) => sectionOverlapsRange(section, startSec, endSec));
}

export function mergeSectionCaptionSettings(global: CaptionSettings, section: TimelineSection | null): CaptionSettings {
  if (!section?.treatments.captions) {
    return global;
  }

  return { ...global, ...section.treatments.captions };
}
