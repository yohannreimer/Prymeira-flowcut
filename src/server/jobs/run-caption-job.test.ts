import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempDir } from "../../test/fixtures";
import { createProjectWorkspace } from "../workspace";
import { createJobStore } from "./job-store";
import { runCaptionJob } from "./run-caption-job";

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
      { id: "seg_1", sourceStartSec: 0, sourceEndSec: 10, timelineStartSec: 0, timelineEndSec: 10, reason: "kept speech/content" }
    ],
    removed: [],
    captions: [],
    overlays: [],
    color: { presetId: "neutral", label: "Neutro" },
    audio: { music: null, voiceTargetLufs: -16 },
    qa: { status: "passed", warnings: [] },
    createdAt: "2026-05-05T00:00:00.000Z"
  }));
}

describe("runCaptionJob", () => {
  it("transcribes, writes captions, burns them into the video, and runs QA", async () => {
    await withTempDir("ai-editor-caption-job-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      await writePlan(workspace.planPath);
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath: "/tmp/source.mov" });
      const outputPath = path.join(workspace.renders, "rough-cut.mp4");
      const transcribeWithWhisper = vi.fn().mockResolvedValue([
        {
          startSec: 0.2,
          endSec: 1.5,
          text: "Primeira legenda",
          words: [
            { startSec: 0.2, endSec: 0.7, text: "Primeira" },
            { startSec: 0.75, endSec: 1.5, text: "legenda" }
          ]
        }
      ]);
      const runBasicQa = vi.fn().mockResolvedValue({ status: "passed", warnings: [] });

      await runCaptionJob({ jobId: job.id, workspace, jobs, captionStyleId: "word_ping" }, {
        transcribeWithWhisper,
        runBasicQa
      });

      const plan = JSON.parse(await readFile(workspace.planPath, "utf8"));
      expect(plan.captions).toEqual([
        {
          id: "cap_1",
          startSec: 0.2,
          endSec: 1.5,
          text: "Primeira legenda",
          styleId: "word_ping",
          words: [
            { id: "cap_1_w1", startSec: 0.2, endSec: 0.7, text: "Primeira" },
            { id: "cap_1_w2", startSec: 0.75, endSec: 1.5, text: "legenda" }
          ]
        }
      ]);
      expect(await readFile(path.join(workspace.renders, "captions.vtt"), "utf8")).toContain("Primeira legenda");
      expect(runBasicQa).toHaveBeenCalledWith(outputPath, { expectedHasAudio: true });
      expect(jobs.get(job.id)).toMatchObject({
        status: "passed",
        stage: "complete",
        outputPath
      });
    });
  });

  it("clips Whisper timestamps to the rendered edit duration", async () => {
    await withTempDir("ai-editor-caption-job-clipped-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      await writePlan(workspace.planPath);
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath: "/tmp/source.mov" });
      const transcribeWithWhisper = vi.fn().mockResolvedValue([
        {
          startSec: 9.2,
          endSec: 10.42,
          text: "Ultima legenda estourada",
          words: [
            { startSec: 9.2, endSec: 9.8, text: "Ultima" },
            { startSec: 9.8, endSec: 10.42, text: "legenda" }
          ]
        },
        {
          startSec: 10.45,
          endSec: 11,
          text: "Fora do render",
          words: []
        }
      ]);
      const runBasicQa = vi.fn().mockResolvedValue({ status: "passed", warnings: [] });

      await runCaptionJob({ jobId: job.id, workspace, jobs, captionStyleId: "word_ping" }, {
        transcribeWithWhisper,
        runBasicQa
      });

      const plan = JSON.parse(await readFile(workspace.planPath, "utf8"));
      expect(plan.captions).toEqual([
        {
          id: "cap_1",
          startSec: 9.2,
          endSec: 10,
          text: "Ultima legenda estourada",
          styleId: "word_ping",
          words: [
            { id: "cap_1_w1", startSec: 9.2, endSec: 9.8, text: "Ultima" },
            { id: "cap_1_w2", startSec: 9.8, endSec: 10, text: "legenda" }
          ]
        }
      ]);
      expect(await readFile(path.join(workspace.renders, "captions.vtt"), "utf8")).toContain("00:00:09.199 --> 00:00:10.000");
      expect(jobs.get(job.id)).toMatchObject({
        status: "passed",
        stage: "complete",
        message: "Generated 1 captions"
      });
    });
  });
});
