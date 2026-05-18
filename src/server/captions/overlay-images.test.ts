import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../../test/fixtures";
import type { EditPlan } from "../../shared/edit-plan";
import { createCaptionOverlayImages } from "./overlay-images";

function createPlan(): EditPlan {
  return {
    id: "plan_1",
    projectId: "project_1",
    version: 1,
    source: {
      path: "/tmp/source.mov",
      durationSec: 8,
      width: 1080,
      height: 1920,
      fps: 30,
      hasAudio: true
    },
    segments: [
      { id: "seg_1", sourceStartSec: 0, sourceEndSec: 8, timelineStartSec: 0, timelineEndSec: 8, reason: "kept speech/content" }
    ],
    removed: [],
    sections: [],
    captions: [
      {
        id: "cap_1",
        startSec: 0,
        endSec: 2,
        text: "ficar em silencio e",
        styleId: "focus_word",
        words: [
          { id: "w1", startSec: 0, endSec: 0.5, text: "ficar" },
          { id: "w2", startSec: 0.5, endSec: 1, text: "em" },
          { id: "w3", startSec: 1, endSec: 1.5, text: "silencio" },
          { id: "w4", startSec: 1.5, endSec: 2, text: "e" }
        ]
      }
    ],
    captionSettings: {
      enabled: true,
      styleId: "focus_word",
      displayMode: "block_highlight",
      fontId: "system_bold",
      fontSizePct: 6,
      wordsPerBlock: 4,
      positionYPct: 82,
      maxWidthPct: 88,
      primaryColor: "#fbfaf4",
      activeColor: "#fcc009",
      outlineColor: "#171716",
      outlineWidthPct: 0.28,
      shadow: true,
      uppercase: false
    },
    overlays: [],
    color: { presetId: "neutral", label: "Neutral", adjustments: { intensity: 1, exposure: 0, contrast: 1, saturation: 1, temperature: 0, tint: 0, vignette: 0 } },
    video: { flipHorizontal: false },
    audio: { music: null, voiceTargetLufs: -16 },
    qa: { status: "passed", warnings: [] },
    publishReadiness: { status: "needs_review", checks: [] },
    createdAt: "2026-05-06T00:00:00.000Z"
  };
}

describe("createCaptionOverlayImages", () => {
  it("sizes exported captions from video width like the browser preview", async () => {
    await withTempDir("ai-editor-caption-overlay-", async (dir) => {
      const renders = path.join(dir, "renders");
      await mkdir(renders, { recursive: true });
      await writeFile(path.join(renders, "placeholder"), "");

      const [overlay] = await createCaptionOverlayImages(createPlan(), renders, { width: 540, height: 960 });
      const box = await alphaBounds(overlay.path);

      expect(box.height).toBeLessThan(90);
    });
  });

  it("skips captions inside sections with disabled caption treatment", async () => {
    await withTempDir("ai-editor-caption-overlay-", async (dir) => {
      const renders = path.join(dir, "renders");
      await mkdir(renders, { recursive: true });
      await writeFile(path.join(renders, "placeholder"), "");
      const plan = createPlan();
      plan.sections = [
        {
          id: "section_1",
          type: "screen",
          startSec: 0,
          endSec: 3,
          label: "Tela",
          confidence: 0.9,
          warnings: [],
          treatments: { captions: { enabled: false } }
        }
      ];

      const overlays = await createCaptionOverlayImages(plan, renders, { width: 540, height: 960 });

      expect(overlays).toEqual([]);
    });
  });

  it("uses section caption settings over disabled global captions", async () => {
    await withTempDir("ai-editor-caption-overlay-", async (dir) => {
      const renders = path.join(dir, "renders");
      await mkdir(renders, { recursive: true });
      await writeFile(path.join(renders, "placeholder"), "");
      const plan = createPlan();
      plan.captionSettings = { ...plan.captionSettings, enabled: false };
      plan.sections = [
        {
          id: "section_1",
          type: "talking_head",
          startSec: 0,
          endSec: 3,
          label: "Rosto",
          confidence: 0.9,
          warnings: [],
          treatments: { captions: { enabled: true } }
        }
      ];

      const overlays = await createCaptionOverlayImages(plan, renders, { width: 540, height: 960 });

      expect(overlays).toHaveLength(4);
    });
  });

  it("only skips overlay events after a caption crosses into a disabled section", async () => {
    await withTempDir("ai-editor-caption-overlay-", async (dir) => {
      const renders = path.join(dir, "renders");
      await mkdir(renders, { recursive: true });
      await writeFile(path.join(renders, "placeholder"), "");
      const plan = createPlan();
      plan.captions = [
        {
          id: "cap_crossing",
          startSec: 1.8,
          endSec: 2.2,
          text: "antes depois",
          styleId: "focus_word",
          words: [
            { id: "w_before", startSec: 1.8, endSec: 2, text: "antes" },
            { id: "w_after", startSec: 2, endSec: 2.2, text: "depois" }
          ]
        }
      ];
      plan.sections = [
        {
          id: "section_hook",
          type: "hook",
          startSec: 0,
          endSec: 2,
          label: "Gancho",
          confidence: 0.9,
          warnings: [],
          treatments: {}
        },
        {
          id: "section_screen",
          type: "screen",
          startSec: 2,
          endSec: 4,
          label: "Tela",
          confidence: 0.9,
          warnings: [],
          treatments: { captions: { enabled: false } }
        }
      ];

      const overlays = await createCaptionOverlayImages(plan, renders, { width: 540, height: 960 });

      expect(overlays).toHaveLength(1);
      expect(overlays[0]).toMatchObject({ startSec: 1.8, endSec: 2 });
    });
  });

  it("switches display mode after a caption crosses into another section", async () => {
    await withTempDir("ai-editor-caption-overlay-", async (dir) => {
      const renders = path.join(dir, "renders");
      await mkdir(renders, { recursive: true });
      await writeFile(path.join(renders, "placeholder"), "");
      const plan = createPlan();
      plan.captionSettings = { ...plan.captionSettings, displayMode: "block_highlight", wordsPerBlock: 4 };
      plan.captions = [
        {
          id: "cap_crossing_mode",
          startSec: 1.6,
          endSec: 2.4,
          text: "primeira segunda curta ok",
          styleId: "focus_word",
          words: [
            { id: "w1", startSec: 1.6, endSec: 1.8, text: "primeira" },
            { id: "w2", startSec: 1.8, endSec: 2, text: "segunda" },
            { id: "w3", startSec: 2, endSec: 2.2, text: "curta" },
            { id: "w4", startSec: 2.2, endSec: 2.4, text: "ok" }
          ]
        }
      ];
      plan.sections = [
        {
          id: "section_hook",
          type: "hook",
          startSec: 0,
          endSec: 2,
          label: "Gancho",
          confidence: 0.9,
          warnings: [],
          treatments: {}
        },
        {
          id: "section_screen",
          type: "screen",
          startSec: 2,
          endSec: 4,
          label: "Tela",
          confidence: 0.9,
          warnings: [],
          treatments: { captions: { displayMode: "word_ping" } }
        }
      ];

      const overlays = await createCaptionOverlayImages(plan, renders, { width: 540, height: 960 });
      const beforeBoundary = await alphaBounds(overlays[1].path);
      const afterBoundary = await alphaBounds(overlays[2].path);

      expect(overlays).toHaveLength(4);
      expect(overlays[2]).toMatchObject({ startSec: 2, endSec: 2.2 });
      expect(afterBoundary.width).toBeLessThan(beforeBoundary.width * 0.75);
    });
  });
});

async function alphaBounds(imagePath: string) {
  const image = sharp(imagePath).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha > 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  return { width: maxX - minX + 1, height: maxY - minY + 1 };
}
