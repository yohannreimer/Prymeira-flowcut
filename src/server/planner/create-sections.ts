import type { RemovedInterval, TimelineSection, TimelineSegment, TimelineSectionType } from "../../shared/edit-plan";
import { createContentMotionSlots, createHookMotionSlots } from "../../shared/motion-presets";
import { getSectionLabel } from "../../shared/sections";
import { clampSeconds } from "../../shared/time";

type CreateTimelineSectionsInput = {
  segments: TimelineSegment[];
  removed: RemovedInterval[];
  sourceWidth: number;
  sourceHeight: number;
};

function sourceTimeToTimelineTime(segments: TimelineSegment[], sourceTimeSec: number) {
  let timelineTimeSec = 0;

  for (const segment of segments) {
    if (sourceTimeSec >= segment.sourceStartSec && sourceTimeSec <= segment.sourceEndSec) {
      return clampSeconds(segment.timelineStartSec + sourceTimeSec - segment.sourceStartSec);
    }

    if (sourceTimeSec > segment.sourceEndSec) {
      timelineTimeSec = segment.timelineEndSec;
      continue;
    }

    return clampSeconds(timelineTimeSec);
  }

  return clampSeconds(timelineTimeSec);
}

export function createTimelineSections(input: CreateTimelineSectionsInput): TimelineSection[] {
  const renderedDurationSec = input.segments.at(-1)?.timelineEndSec ?? 0;

  if (renderedDurationSec <= 0) {
    return [];
  }

  const sections: TimelineSection[] = [];
  const hookEndSec = Math.min(30, renderedDurationSec);

  sections.push({
    id: "section_hook",
    type: "hook",
    startSec: 0,
    endSec: clampSeconds(hookEndSec),
    confidence: 0.7,
    label: getSectionLabel("hook"),
    warnings: [],
    treatments: {
      captions: { enabled: false },
      motion: { enabled: true, slots: createHookMotionSlots(hookEndSec) }
    }
  });

  const contentType: TimelineSectionType = input.sourceWidth >= input.sourceHeight ? "screen" : "talking_head";

  if (hookEndSec < renderedDurationSec) {
    sections.push({
      id: "section_content_1",
      type: contentType,
      startSec: clampSeconds(hookEndSec),
      endSec: clampSeconds(renderedDurationSec),
      confidence: 0.45,
      label: getSectionLabel(contentType),
      warnings: [],
      treatments: {
        captions: { enabled: false },
        motion: {
          enabled: true,
          slots: createContentMotionSlots(contentType, hookEndSec, renderedDurationSec)
        }
      }
    });
  } else {
    sections.push({
      id: "section_content_1",
      type: contentType,
      startSec: 0,
      endSec: clampSeconds(renderedDurationSec),
      confidence: 0.45,
      label: getSectionLabel(contentType),
      warnings: [],
      treatments: {
        captions: { enabled: false },
        motion: {
          enabled: true,
          slots: createContentMotionSlots(contentType, 0, renderedDurationSec)
        }
      }
    });
  }

  input.removed.forEach((cut, index) => {
    const durationSec = Math.max(0.1, cut.endSec - cut.startSec);
    const mappedStartSec = sourceTimeToTimelineTime(input.segments, cut.startSec);
    const startSec =
      mappedStartSec >= renderedDurationSec ? Math.max(0, renderedDurationSec - durationSec) : mappedStartSec;
    const endSec = Math.min(renderedDurationSec, startSec + durationSec);

    if (endSec <= startSec) {
      return;
    }

    sections.push({
      id: `section_problem_${index + 1}`,
      type: "problem",
      startSec,
      endSec: clampSeconds(endSec),
      confidence: 0.45,
      label: cut.reason === "silence" ? "Silencio removido" : "Problema detectado",
      warnings: [`Trecho marcado como ${cut.reason}`],
      treatments: {}
    });
  });

  return sections.sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
}
