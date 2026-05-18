import { describe, expect, it } from "vitest";
import type { ManualCut } from "../shared/manual-edits";
import {
  buildTimelineSnapshot,
  clampCut,
  compareManualDurations,
  createTimelineHistory,
  dragCutEdge,
  getRestoredTimelineSnapshot,
  getZoomWindow,
  pushTimelineHistory,
  redoTimelineHistory,
  timeToWindowPercent,
  undoTimelineHistory
} from "./timeline-model";

const cuts: ManualCut[] = [
  { id: "cut_1", startSec: 10, endSec: 15 },
  { id: "cut_2", startSec: 30, endSec: 42 }
];

describe("timeline manual cut model", () => {
  it("clamps cuts to video bounds while preserving the minimum cut duration", () => {
    expect(clampCut({ id: "cut_1", startSec: -4, endSec: 2 }, { videoDurationSec: 20, minDurationSec: 3 })).toEqual({
      id: "cut_1",
      startSec: 0,
      endSec: 3
    });

    expect(clampCut({ id: "cut_2", startSec: 19, endSec: 35 }, { videoDurationSec: 20, minDurationSec: 3 })).toEqual({
      id: "cut_2",
      startSec: 17,
      endSec: 20
    });
  });

  it("drags the start edge without crossing the end edge or video bounds", () => {
    expect(dragCutEdge(cuts[0], "start", 14.8, { videoDurationSec: 60, minDurationSec: 2 })).toEqual({
      id: "cut_1",
      startSec: 13,
      endSec: 15
    });

    expect(dragCutEdge(cuts[0], "start", -2, { videoDurationSec: 60, minDurationSec: 2 })).toEqual({
      id: "cut_1",
      startSec: 0,
      endSec: 15
    });
  });

  it("drags the end edge without crossing the start edge or video bounds", () => {
    expect(dragCutEdge(cuts[1], "end", 30.4, { videoDurationSec: 60, minDurationSec: 2 })).toEqual({
      id: "cut_2",
      startSec: 30,
      endSec: 32
    });

    expect(dragCutEdge(cuts[1], "end", 75, { videoDurationSec: 60, minDurationSec: 2 })).toEqual({
      id: "cut_2",
      startSec: 30,
      endSec: 60
    });
  });

  it("builds undo and redo state for active cuts and active cut ids", () => {
    const initial = buildTimelineSnapshot(cuts, ["cut_1", "cut_2"]);
    const history = createTimelineHistory(initial);
    const restoredSecond = buildTimelineSnapshot(cuts, ["cut_1"]);
    const movedFirst = buildTimelineSnapshot([{ ...cuts[0], startSec: 11, endSec: 15 }, cuts[1]], ["cut_1"]);

    const withRestoredSecond = pushTimelineHistory(history, restoredSecond);
    const withMovedFirst = pushTimelineHistory(withRestoredSecond, movedFirst);

    const undone = undoTimelineHistory(withMovedFirst);
    expect(undone.present).toEqual(restoredSecond);
    expect(undone.future).toEqual([movedFirst]);

    const redone = redoTimelineHistory(undone);
    expect(redone.present).toEqual(movedFirst);
    expect(redone.past).toEqual([initial, restoredSecond]);
  });

  it("calculates a zoom window and maps times to percentages inside it", () => {
    const window = getZoomWindow({ videoDurationSec: 120, centerSec: 50, zoom: 4 });

    expect(window).toEqual({ startSec: 35, endSec: 65, durationSec: 30 });
    expect(timeToWindowPercent(35, window)).toBe(0);
    expect(timeToWindowPercent(50, window)).toBe(50);
    expect(timeToWindowPercent(80, window)).toBe(100);
  });

  it("clamps zoom windows at media edges", () => {
    expect(getZoomWindow({ videoDurationSec: 120, centerSec: 5, zoom: 3 })).toEqual({
      startSec: 0,
      endSec: 40,
      durationSec: 40
    });
  });

  it("restores all cuts and compares before and after durations", () => {
    const before = buildTimelineSnapshot(cuts, ["cut_1", "cut_2"]);
    const after = getRestoredTimelineSnapshot(cuts);

    expect(after).toEqual({ activeCuts: [], activeCutIds: [] });
    expect(compareManualDurations(120, cuts, before.activeCutIds, after.activeCutIds)).toEqual({
      beforeDurationSec: 103,
      afterDurationSec: 120,
      deltaSec: 17,
      removedBeforeSec: 17,
      removedAfterSec: 0
    });
  });
});
