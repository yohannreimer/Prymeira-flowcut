import { describe, expect, it } from "vitest";
import type { TimelineSection } from "../shared/edit-plan";
import { filterSectionsByType, getNextSelectedSectionId, getSelectedSection, replaceSection } from "./section-model";

const sections: TimelineSection[] = [
  {
    id: "s1",
    type: "hook",
    startSec: 0,
    endSec: 10,
    label: "Gancho",
    confidence: 1,
    warnings: [],
    treatments: {}
  },
  {
    id: "s2",
    type: "screen",
    startSec: 10,
    endSec: 40,
    label: "Tela",
    confidence: 0.7,
    warnings: [],
    treatments: {}
  }
];

describe("section-model", () => {
  it("selects by id or returns null", () => {
    expect(getSelectedSection(sections, "s2")?.type).toBe("screen");
    expect(getSelectedSection(sections, "missing")).toBeNull();
  });

  it("filters sections by type", () => {
    expect(filterSectionsByType(sections, "screen")).toHaveLength(1);
  });

  it("replaces a section without changing order", () => {
    const next = replaceSection(sections, { ...sections[1], label: "Tela editada" });
    expect(next.map((section) => section.id)).toEqual(["s1", "s2"]);
    expect(next[1].label).toBe("Tela editada");
  });

  it("clears selection when the same section is selected again", () => {
    expect(getNextSelectedSectionId("s1", sections[0])).toBeNull();
    expect(getNextSelectedSectionId(null, sections[0])).toBe("s1");
    expect(getNextSelectedSectionId("s2", sections[0])).toBe("s1");
  });
});
