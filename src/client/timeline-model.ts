import type { ManualCut } from "../shared/manual-edits";

export type TimelineCutEdge = "start" | "end";

export type TimelineCutConstraints = {
  videoDurationSec: number;
  minDurationSec: number;
};

export type TimelineSnapshot = {
  activeCuts: ManualCut[];
  activeCutIds: string[];
};

export type TimelineHistory = {
  past: TimelineSnapshot[];
  present: TimelineSnapshot;
  future: TimelineSnapshot[];
};

export type TimelineZoomInput = {
  videoDurationSec: number;
  centerSec: number;
  zoom: number;
  minWindowSec?: number;
};

export type TimelineWindow = {
  startSec: number;
  endSec: number;
  durationSec: number;
};

export type ManualDurationComparison = {
  beforeDurationSec: number;
  afterDurationSec: number;
  deltaSec: number;
  removedBeforeSec: number;
  removedAfterSec: number;
};

const DEFAULT_MIN_WINDOW_SEC = 1;
const TIME_PRECISION = 1000;

export function clampCut(cut: ManualCut, constraints: TimelineCutConstraints): ManualCut {
  const videoDurationSec = getSafeNonNegative(constraints.videoDurationSec);
  const minDurationSec = Math.min(videoDurationSec, getSafeNonNegative(constraints.minDurationSec));

  let startSec = clamp(cut.startSec, 0, videoDurationSec);
  let endSec = clamp(cut.endSec, 0, videoDurationSec);

  if (endSec < startSec) {
    [startSec, endSec] = [endSec, startSec];
  }

  if (endSec - startSec < minDurationSec) {
    if (startSec + minDurationSec <= videoDurationSec) {
      endSec = startSec + minDurationSec;
    } else {
      startSec = Math.max(0, videoDurationSec - minDurationSec);
      endSec = videoDurationSec;
    }
  }

  return {
    ...cut,
    startSec: roundTime(startSec),
    endSec: roundTime(endSec)
  };
}

export function dragCutEdge(
  cut: ManualCut,
  edge: TimelineCutEdge,
  nextTimeSec: number,
  constraints: TimelineCutConstraints
): ManualCut {
  const videoDurationSec = getSafeNonNegative(constraints.videoDurationSec);
  const minDurationSec = Math.min(videoDurationSec, getSafeNonNegative(constraints.minDurationSec));

  if (edge === "start") {
    return clampCut(
      { ...cut, startSec: clamp(nextTimeSec, 0, Math.max(0, cut.endSec - minDurationSec)) },
      { videoDurationSec, minDurationSec }
    );
  }

  return clampCut(
    { ...cut, endSec: clamp(nextTimeSec, Math.min(videoDurationSec, cut.startSec + minDurationSec), videoDurationSec) },
    { videoDurationSec, minDurationSec }
  );
}

export function buildTimelineSnapshot(cuts: ManualCut[], activeCutIds: string[]): TimelineSnapshot {
  const knownIds = new Set(cuts.map((cut) => cut.id));
  const normalizedActiveCutIds = unique(activeCutIds).filter((id) => knownIds.has(id));
  const activeIdSet = new Set(normalizedActiveCutIds);

  return {
    activeCuts: cuts.filter((cut) => activeIdSet.has(cut.id)),
    activeCutIds: normalizedActiveCutIds
  };
}

export function getRestoredTimelineSnapshot(cuts: ManualCut[]): TimelineSnapshot {
  return buildTimelineSnapshot(cuts, []);
}

export function createTimelineHistory(snapshot: TimelineSnapshot): TimelineHistory {
  return {
    past: [],
    present: snapshot,
    future: []
  };
}

export function pushTimelineHistory(history: TimelineHistory, nextSnapshot: TimelineSnapshot): TimelineHistory {
  if (snapshotsEqual(history.present, nextSnapshot)) return history;

  return {
    past: [...history.past, history.present],
    present: nextSnapshot,
    future: []
  };
}

export function undoTimelineHistory(history: TimelineHistory): TimelineHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;

  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future]
  };
}

export function redoTimelineHistory(history: TimelineHistory): TimelineHistory {
  const next = history.future[0];
  if (!next) return history;

  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1)
  };
}

export function getZoomWindow(input: TimelineZoomInput): TimelineWindow {
  const videoDurationSec = getSafeNonNegative(input.videoDurationSec);
  if (videoDurationSec === 0) {
    return { startSec: 0, endSec: 0, durationSec: 0 };
  }

  const zoom = Math.max(1, getSafePositive(input.zoom, 1));
  const minWindowSec = Math.min(videoDurationSec, getSafePositive(input.minWindowSec ?? DEFAULT_MIN_WINDOW_SEC, DEFAULT_MIN_WINDOW_SEC));
  const durationSec = Math.min(videoDurationSec, Math.max(minWindowSec, videoDurationSec / zoom));
  const centerSec = clamp(input.centerSec, 0, videoDurationSec);
  const startSec = clamp(centerSec - durationSec / 2, 0, videoDurationSec - durationSec);
  const endSec = startSec + durationSec;

  return {
    startSec: roundTime(startSec),
    endSec: roundTime(endSec),
    durationSec: roundTime(durationSec)
  };
}

export function timeToWindowPercent(timeSec: number, window: TimelineWindow): number {
  if (window.durationSec <= 0) return 0;
  const percent = ((timeSec - window.startSec) / window.durationSec) * 100;
  return roundTime(clamp(percent, 0, 100));
}

export function compareManualDurations(
  videoDurationSec: number,
  cuts: ManualCut[],
  beforeActiveCutIds: string[],
  afterActiveCutIds: string[]
): ManualDurationComparison {
  const safeVideoDurationSec = getSafeNonNegative(videoDurationSec);
  const removedBeforeSec = getRemovedDuration(cuts, beforeActiveCutIds);
  const removedAfterSec = getRemovedDuration(cuts, afterActiveCutIds);
  const beforeDurationSec = Math.max(0, safeVideoDurationSec - removedBeforeSec);
  const afterDurationSec = Math.max(0, safeVideoDurationSec - removedAfterSec);

  return {
    beforeDurationSec: roundTime(beforeDurationSec),
    afterDurationSec: roundTime(afterDurationSec),
    deltaSec: roundTime(afterDurationSec - beforeDurationSec),
    removedBeforeSec: roundTime(removedBeforeSec),
    removedAfterSec: roundTime(removedAfterSec)
  };
}

function getRemovedDuration(cuts: ManualCut[], activeCutIds: string[]) {
  const activeIds = new Set(activeCutIds);
  return cuts
    .filter((cut) => activeIds.has(cut.id))
    .reduce((total, cut) => total + Math.max(0, cut.endSec - cut.startSec), 0);
}

function snapshotsEqual(left: TimelineSnapshot, right: TimelineSnapshot) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function getSafeNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function getSafePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function roundTime(value: number) {
  return Math.round(value * TIME_PRECISION) / TIME_PRECISION;
}
