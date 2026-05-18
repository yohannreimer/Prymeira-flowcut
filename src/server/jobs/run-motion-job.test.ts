import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CAPTION_SETTINGS } from "../../shared/caption-settings";
import { DEFAULT_COLOR_ADJUSTMENTS } from "../../shared/color-presets";
import { withTempDir } from "../../test/fixtures";
import { createProjectWorkspace } from "../workspace";
import { createJobStore } from "./job-store";
import { runMotionJob } from "./run-motion-job";

async function writePlan(planPath: string, sourcePath: string) {
  await mkdir(path.dirname(planPath), { recursive: true });
  await writeFile(planPath, JSON.stringify({
    id: "plan_project_1",
    projectId: "project_1",
    version: 1,
    source: {
      path: sourcePath,
      durationSec: 40,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true
    },
    segments: [
      { id: "seg_1", sourceStartSec: 0, sourceEndSec: 40, timelineStartSec: 0, timelineEndSec: 40, reason: "kept speech/content" }
    ],
    removed: [],
    sections: [
      { id: "section_hook", type: "hook", startSec: 0, endSec: 20, label: "Gancho", confidence: 0.8, warnings: [], treatments: {} }
    ],
    captions: [],
    captionSettings: DEFAULT_CAPTION_SETTINGS,
    overlays: [],
    color: { presetId: "neutral", label: "Neutro", adjustments: DEFAULT_COLOR_ADJUSTMENTS },
    video: { flipHorizontal: false },
    audio: { music: null, voiceTargetLufs: -16 },
    qa: { status: "passed", warnings: [] },
    publishReadiness: { status: "needs_review", checks: [] },
    createdAt: "2026-05-05T00:00:00.000Z"
  }));
}

describe("runMotionJob", () => {
  it("transcribes when needed, asks AI for motion, and saves the section slots", async () => {
    await withTempDir("ai-editor-motion-job-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const sourcePath = path.join(workspace.uploads, "source.mp4");
      await writeFile(sourcePath, "fake video");
      await writeFile(path.join(workspace.renders, "rough-cut.mp4"), "fake rough cut");
      await writePlan(workspace.planPath, sourcePath);
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath });
      const transcribeWithWhisper = vi.fn().mockResolvedValue([
        { startSec: 0, endSec: 3, text: "A ideia central do video aparece aqui", words: [] }
      ]);
      const planMotionWithAI = vi.fn().mockResolvedValue([
        {
          enabled: true,
          slots: [{
            id: "ai_motion_1_hook_title",
            kind: "hook_title",
            startSec: 0.3,
            endSec: 5,
            label: "A ideia central",
            payload: { title: "A ideia central", generatedBy: "openai" }
          }]
        }
      ]);

      await runMotionJob({ jobId: job.id, workspace, jobs }, {
        transcribeWithWhisper,
        planMotionWithAI
      });

      expect(transcribeWithWhisper).toHaveBeenCalledWith(path.join(workspace.renders, "rough-cut.mp4"));
      expect(planMotionWithAI).toHaveBeenCalled();
      const plan = JSON.parse(await readFile(workspace.planPath, "utf8"));
      expect(plan.sections[0].treatments.motion.slots[0]).toMatchObject({
        label: "A ideia central",
        payload: { generatedBy: "openai" }
      });
      expect(jobs.get(job.id)).toMatchObject({
        status: "passed",
        stage: "complete",
        message: "Planned 1 AI motions"
      });
    });
  });
});
