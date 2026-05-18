import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createJobStore } from "./job-store";
import { runManualRenderJob } from "./run-manual-render-job";
import { createProjectWorkspace } from "../workspace";
import { withTempDir } from "../../test/fixtures";

async function writePlan(planPath: string) {
  await mkdir(path.dirname(planPath), { recursive: true });
  await writeFile(planPath, JSON.stringify({
    id: "plan_project_1",
    projectId: "project_1",
    version: 1,
    source: {
      path: "/tmp/source.mov",
      durationSec: 10,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true
    },
    segments: [
      { id: "seg_1", sourceStartSec: 0, sourceEndSec: 2, timelineStartSec: 0, timelineEndSec: 2, reason: "kept speech/content" }
    ],
    removed: [
      { id: "cut_1", startSec: 2, endSec: 3, reason: "silence" },
      { id: "cut_2", startSec: 5, endSec: 7, reason: "silence" }
    ],
    captions: [],
    overlays: [],
    color: { presetId: "neutral", label: "Neutral" },
    audio: { music: null, voiceTargetLufs: -16 },
    qa: { status: "passed", warnings: [] },
    createdAt: "2026-05-05T00:00:00.000Z"
  }));
}

async function writeCaptionedPlan(planPath: string) {
  await mkdir(path.dirname(planPath), { recursive: true });
  await writeFile(planPath, JSON.stringify({
    id: "plan_project_1",
    projectId: "project_1",
    version: 1,
    source: {
      path: "/tmp/source.mov",
      durationSec: 10,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true
    },
    segments: [
      { id: "seg_1", sourceStartSec: 0, sourceEndSec: 10, timelineStartSec: 0, timelineEndSec: 10, reason: "kept speech/content" }
    ],
    removed: [],
    captions: [
      {
        id: "cap_1",
        startSec: 0.2,
        endSec: 1.4,
        text: "Teste de legenda",
        styleId: "focus_word",
        words: [
          { id: "cap_1_w1", startSec: 0.2, endSec: 0.6, text: "Teste" },
          { id: "cap_1_w2", startSec: 0.6, endSec: 1.0, text: "de" },
          { id: "cap_1_w3", startSec: 1.0, endSec: 1.4, text: "legenda" }
        ]
      }
    ],
    captionSettings: {
      enabled: true,
      styleId: "focus_word",
      displayMode: "block_highlight",
      fontId: "system_bold",
      fontSizePct: 6,
      wordsPerBlock: 3,
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
    color: { presetId: "neutral", label: "Neutral" },
    audio: { music: null, voiceTargetLufs: -16 },
    qa: { status: "passed", warnings: [] },
    createdAt: "2026-05-05T00:00:00.000Z"
  }));
}

describe("runManualRenderJob", () => {
  it("rewrites the plan with only selected cuts and renders it", async () => {
    await withTempDir("ai-editor-manual-render-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      await writePlan(workspace.planPath);
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath: "/tmp/source.mov" });
      const renderPath = path.join(workspace.renders, "preview-sample.mp4");
      const renderRoughCut = vi.fn().mockResolvedValue(renderPath);
      const runBasicQa = vi.fn().mockResolvedValue({ status: "passed", warnings: [] });

      await runManualRenderJob({
        jobId: job.id,
        workspace,
        jobs,
        activeCutIds: ["cut_2"]
      }, {
        renderRoughCut,
        runBasicQa,
        now: () => new Date("2026-05-06T00:00:00.000Z")
      });

      const plan = JSON.parse(await readFile(workspace.planPath, "utf8"));
      expect(plan.removed).toEqual([{ id: "cut_2", startSec: 5, endSec: 7, reason: "silence" }]);
      expect(plan.segments.map((segment: { sourceStartSec: number; sourceEndSec: number }) => [
        segment.sourceStartSec,
        segment.sourceEndSec
      ])).toEqual([[0, 5], [7, 10]]);
      expect(renderRoughCut).toHaveBeenCalledWith(
        expect.objectContaining({
          removed: [{ id: "cut_2", startSec: 5, endSec: 7, reason: "silence" }]
        }),
        workspace,
        undefined,
        expect.objectContaining({ outputFileName: "preview-sample.mp4", commandLogFileName: "preview-sample-command.json" })
      );
      expect(jobs.get(job.id)).toMatchObject({
        status: "passed",
        stage: "complete",
        outputPath: renderPath,
        planPath: workspace.planPath
      });
      expect(runBasicQa).toHaveBeenCalledWith(renderPath, { expectedHasAudio: true });
    });
  });

  it("keeps existing captions when the render does not change cuts", async () => {
    await withTempDir("ai-editor-manual-render-captions-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      await writeCaptionedPlan(workspace.planPath);
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath: "/tmp/source.mov" });
      const renderPath = path.join(workspace.renders, "rough-cut.mp4");

      await runManualRenderJob({
        jobId: job.id,
        workspace,
        jobs,
        activeCutIds: [],
        colorPresetId: "creator_clean"
      }, {
        renderRoughCut: vi.fn().mockResolvedValue(renderPath),
        runBasicQa: vi.fn().mockResolvedValue({ status: "passed", warnings: [] })
      });

      const plan = JSON.parse(await readFile(workspace.planPath, "utf8"));
      expect(plan.captions).toHaveLength(1);
      expect(plan.captions[0].words).toHaveLength(3);
      expect(plan.captionSettings.displayMode).toBe("block_highlight");
    });
  });

  it("renders only a short preview sample while saving the complete plan", async () => {
    await withTempDir("ai-editor-manual-render-preview-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      await writePlan(workspace.planPath);
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath: "/tmp/source.mov" });
      const renderPath = path.join(workspace.renders, "preview-sample.mp4");
      const renderRoughCut = vi.fn().mockResolvedValue(renderPath);

      await runManualRenderJob({
        jobId: job.id,
        workspace,
        jobs,
        activeCutIds: ["cut_1", "cut_2"],
        flipHorizontal: true,
        audioCleanup: true,
        audioDucking: true,
        preview: { enabled: true, durationSec: 2, focusSourceSec: 5 }
      }, {
        renderRoughCut,
        runBasicQa: vi.fn().mockResolvedValue({ status: "passed", warnings: [] })
      });

      const savedPlan = JSON.parse(await readFile(workspace.planPath, "utf8"));
      expect(savedPlan.video.flipHorizontal).toBe(true);
      expect(savedPlan.segments.map((segment: { sourceStartSec: number; sourceEndSec: number }) => [
        segment.sourceStartSec,
        segment.sourceEndSec
      ])).toEqual([[0, 2], [3, 5], [7, 10]]);

      const previewPlan = renderRoughCut.mock.calls[0][0];
      expect(previewPlan.segments.map((segment: { sourceStartSec: number; sourceEndSec: number }) => [
        segment.sourceStartSec,
        segment.sourceEndSec
      ])).toEqual([[4, 5], [7, 8]]);
      expect(renderRoughCut.mock.calls[0][3]).toEqual(expect.objectContaining({
        outputFileName: "preview-sample.mp4",
        commandLogFileName: "preview-sample-command.json",
        audioCleanup: true,
        audioDucking: true
      }));
    });
  });
});
