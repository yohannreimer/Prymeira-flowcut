import { type EditPlan, editPlanSchema, type RemovedInterval, type TimelineSegment } from "../../shared/edit-plan";
import { clampSeconds } from "../../shared/time";
import type { SilenceInterval } from "../analyzers/silence";
import { createTimelineSections } from "./create-sections";

export type CreateEditPlanInput = {
  projectId: string;
  sourcePath: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  silences: SilenceInterval[];
  marginSec: number;
  now: string;
};

function clampToSource(value: number, sourceDurationSec: number) {
  return Math.min(clampSeconds(value), sourceDurationSec);
}

function createWholeVideoSegment(durationSec: number): TimelineSegment {
  const sourceEndSec = clampSeconds(durationSec);

  return {
    id: "seg_1",
    sourceStartSec: 0,
    sourceEndSec,
    timelineStartSec: 0,
    timelineEndSec: sourceEndSec,
    reason: "kept speech/content"
  };
}

function createRemovedIntervals(input: CreateEditPlanInput, sourceDurationSec: number): RemovedInterval[] {
  const candidates = input.silences
    .map((silence) => ({
      startSec: clampToSource(silence.startSec + input.marginSec, sourceDurationSec),
      endSec: clampToSource(silence.endSec - input.marginSec, sourceDurationSec),
      reason: "silence"
    }))
    .filter((interval) => interval.endSec > interval.startSec)
    .sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);

  const merged: Array<Omit<RemovedInterval, "id">> = [];

  for (const interval of candidates) {
    const previous = merged[merged.length - 1];

    if (previous && interval.startSec <= previous.endSec) {
      previous.endSec = Math.max(previous.endSec, interval.endSec);
      continue;
    }

    merged.push({ ...interval });
  }

  return merged.map((interval, index) => ({
    id: `cut_${index + 1}`,
    ...interval
  }));
}

export function createTimelineSegments(durationSec: number, removed: RemovedInterval[]): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  const normalizedRemoved = removed
    .map((cut) => ({
      ...cut,
      startSec: clampToSource(cut.startSec, durationSec),
      endSec: clampToSource(cut.endSec, durationSec)
    }))
    .filter((cut) => cut.endSec > cut.startSec)
    .sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec)
    .reduce<RemovedInterval[]>((merged, cut) => {
      const previous = merged[merged.length - 1];

      if (previous && cut.startSec <= previous.endSec) {
        previous.endSec = Math.max(previous.endSec, cut.endSec);
        return merged;
      }

      merged.push({ ...cut });
      return merged;
    }, []);
  let sourceCursor = 0;
  let timelineCursor = 0;

  for (const cut of normalizedRemoved) {
    if (cut.startSec > sourceCursor) {
      const sourceStartSec = clampSeconds(sourceCursor);
      const sourceEndSec = clampSeconds(cut.startSec);
      const duration = clampSeconds(sourceEndSec - sourceStartSec);
      segments.push({
        id: `seg_${segments.length + 1}`,
        sourceStartSec,
        sourceEndSec,
        timelineStartSec: clampSeconds(timelineCursor),
        timelineEndSec: clampSeconds(timelineCursor + duration),
        reason: "kept speech/content"
      });
      timelineCursor = clampSeconds(timelineCursor + duration);
    }

    sourceCursor = cut.endSec;
  }

  if (sourceCursor < durationSec) {
    const sourceStartSec = clampSeconds(sourceCursor);
    const sourceEndSec = clampSeconds(durationSec);
    const duration = clampSeconds(sourceEndSec - sourceStartSec);
    segments.push({
      id: `seg_${segments.length + 1}`,
      sourceStartSec,
      sourceEndSec,
      timelineStartSec: clampSeconds(timelineCursor),
      timelineEndSec: clampSeconds(timelineCursor + duration),
      reason: "kept speech/content"
    });
  }

  return segments;
}

export function createEditPlanFromSilences(input: CreateEditPlanInput): EditPlan {
  if (input.marginSec < 0) {
    throw new Error("marginSec must be nonnegative");
  }

  const sourceDurationSec = clampSeconds(input.durationSec);
  const removed = createRemovedIntervals(input, sourceDurationSec);
  const segments = createTimelineSegments(sourceDurationSec, removed);
  const safeRemoved = segments.length > 0 ? removed : [];
  const safeSegments = segments.length > 0 ? segments : [createWholeVideoSegment(sourceDurationSec)];
  const sections = createTimelineSections({
    segments: safeSegments,
    removed: safeRemoved,
    sourceWidth: input.width,
    sourceHeight: input.height
  });

  return editPlanSchema.parse({
    id: `plan_${input.projectId}`,
    projectId: input.projectId,
    version: 1,
    source: {
      path: input.sourcePath,
      durationSec: sourceDurationSec,
      width: input.width,
      height: input.height,
      fps: input.fps,
      hasAudio: input.hasAudio
    },
    segments: safeSegments,
    removed: safeRemoved,
    sections,
    captions: [],
    overlays: [],
    color: { presetId: "neutral", label: "Neutral" },
    audio: { music: null, voiceTargetLufs: -16 },
    qa: { status: "not_run", warnings: [] },
    createdAt: input.now
  });
}
