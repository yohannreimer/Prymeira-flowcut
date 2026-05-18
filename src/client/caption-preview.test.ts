import { describe, expect, it } from "vitest";
import { DEFAULT_CAPTION_SETTINGS } from "../shared/caption-settings";
import type { CaptionWord, TimelineSection } from "../shared/edit-plan";
import {
  appendMediaCacheBust,
  getActiveWordIndex,
  getCaptionBlock,
  getEffectiveCaptionPreviewSettings,
  getVisibleWorkspaceTabs,
  getProgressPercentFromMessage
} from "./App";

const words: CaptionWord[] = [
  { id: "w1", text: "Fazendo", startSec: 0.94, endSec: 1.5 },
  { id: "w2", text: "esse", startSec: 1.5, endSec: 1.78 },
  { id: "w3", text: "video", startSec: 1.78, endSec: 1.96 },
  { id: "w4", text: "para", startSec: 1.96, endSec: 2.24 },
  { id: "w5", text: "testar", startSec: 2.24, endSec: 3.04 },
  { id: "w6", text: "entao", startSec: 3.28, endSec: 3.32 },
  { id: "w7", text: "agora", startSec: 3.32, endSec: 3.52 },
  { id: "w8", text: "vou", startSec: 3.72, endSec: 3.78 }
];

describe("caption preview timing", () => {
  it("keeps the current word during Whisper gaps instead of resetting to the first word", () => {
    expect(getActiveWordIndex(words, 3.12)).toBe(4);
  });

  it("moves forward at the next word start", () => {
    expect(getActiveWordIndex(words, 3.29)).toBe(5);
  });

  it("uses the first or last word outside the word range", () => {
    expect(getActiveWordIndex(words, 0.2)).toBe(0);
    expect(getActiveWordIndex(words, 8)).toBe(7);
  });

  it("keeps the block on the active word across a timing gap", () => {
    const block = getCaptionBlock(words, getActiveWordIndex(words, 3.12), 4);
    expect(block.words.map((word) => word.text)).toEqual(["testar", "entao", "agora", "vou"]);
    expect(block.activeOffset).toBe(0);
  });

  it("uses disabled caption treatment from the active preview section", () => {
    const sections: TimelineSection[] = [
      {
        id: "section_1",
        type: "screen",
        startSec: 1,
        endSec: 4,
        label: "Tela",
        confidence: 0.9,
        warnings: [],
        treatments: { captions: { enabled: false, uppercase: true } }
      }
    ];

    expect(getEffectiveCaptionPreviewSettings(DEFAULT_CAPTION_SETTINGS, sections, 2)).toMatchObject({
      enabled: false,
      uppercase: true,
      styleId: DEFAULT_CAPTION_SETTINGS.styleId
    });
  });
});

describe("job progress helpers", () => {
  it("reads exact Remotion progress from job messages", () => {
    expect(getProgressPercentFromMessage("Rendering 5 Remotion motions - 37%")).toBe(37);
    expect(getProgressPercentFromMessage("Rendering final export")).toBeNull();
  });
});

describe("workspace navigation helpers", () => {
  it("keeps projects available before a video is loaded", () => {
    expect(getVisibleWorkspaceTabs(false).map((tab) => tab.id)).toEqual(["projects"]);
    expect(getVisibleWorkspaceTabs(true).map((tab) => tab.id)).toContain("color");
  });

  it("cache-busts mutable preview media urls", () => {
    expect(appendMediaCacheBust("/media/project_1/preview-sample.mp4", "job_1")).toBe(
      "/media/project_1/preview-sample.mp4?v=job_1"
    );
    expect(appendMediaCacheBust("/media/project_1/preview-sample.mp4?x=1", "job_1")).toBe(
      "/media/project_1/preview-sample.mp4?x=1&v=job_1"
    );
    expect(appendMediaCacheBust(null, "job_1")).toBeNull();
  });
});
