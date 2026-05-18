import type { TimelineSection, TimelineSectionType } from "../shared/edit-plan";

export function getSelectedSection(sections: TimelineSection[], selectedSectionId: string | null) {
  if (!selectedSectionId) return null;
  return sections.find((section) => section.id === selectedSectionId) ?? null;
}

export function getNextSelectedSectionId(currentSectionId: string | null, nextSection: TimelineSection) {
  return currentSectionId === nextSection.id ? null : nextSection.id;
}

export function filterSectionsByType(sections: TimelineSection[], type: TimelineSectionType | "all") {
  return type === "all" ? sections : sections.filter((section) => section.type === type);
}

export function replaceSection(sections: TimelineSection[], nextSection: TimelineSection) {
  return sections.map((section) => (section.id === nextSection.id ? nextSection : section));
}
