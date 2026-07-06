import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempDir } from "../../test/fixtures";
import { createProjectWorkspace } from "../workspace";
import { createJobStore } from "./job-store";
import { runVerticalProjectJob } from "./run-vertical-project-job";

const metadata = {
  durationSec: 90,
  width: 1080,
  height: 1920,
  fps: 30,
  hasAudio: true
};

describe("runVerticalProjectJob", () => {
  it("writes SupoClip clips and vertical package metadata into the Flowcut project workspace", async () => {
    await withTempDir("flowcut-vertical-project-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_vertical");
      const sourcePath = path.join(workspace.uploads, "source.mp4");
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath });
      const processSupoClipVideo = vi.fn().mockResolvedValue({
        taskId: "task-123",
        clips: [
          {
            clip_id: "clip-best",
            title: "Clip best",
            score: 98,
            start_time: 12,
            end_time: 42,
            duration: 30,
            bytes: Uint8Array.from([1, 2, 3])
          },
          {
            clip_id: "clip-second",
            title: "Clip second",
            score: 77,
            start_time: 50,
            end_time: 78,
            duration: 28,
            bytes: Uint8Array.from([4, 5, 6])
          }
        ]
      });

      await runVerticalProjectJob({
        jobId: job.id,
        workspace,
        sourcePath,
        jobs,
        metadata
      }, {
        processSupoClipVideo,
        now: () => new Date("2026-06-02T12:00:00.000Z"),
        config: {
          enabled: true,
          backendUrl: "http://supoclip.test",
          userId: "media-factory",
          authSecret: "secret",
          captionTemplate: "padrao-yohann",
          processingMode: "fast",
          outputFormat: "vertical",
          addSubtitles: true,
          cutLongPauses: true,
          maxClips: 5,
          minClipDurationSec: 12
        }
      });

      expect(processSupoClipVideo).toHaveBeenCalledWith(expect.objectContaining({
        backendUrl: "http://supoclip.test",
        userId: "media-factory",
        authSecret: "secret",
        sourcePath,
        title: "source",
        outputFormat: "vertical"
      }));

      await expect(readFile(path.join(workspace.root, "shorts/rank-01/clip.mp4"))).resolves.toEqual(Buffer.from([1, 2, 3]));
      await expect(readFile(path.join(workspace.root, "shorts/rank-02/clip.mp4"))).resolves.toEqual(Buffer.from([4, 5, 6]));
      await expect(readFile(path.join(workspace.renders, "rough-cut.mp4"))).resolves.toEqual(Buffer.from([1, 2, 3]));

      const plan = JSON.parse(await readFile(workspace.planPath, "utf8"));
      expect(plan.source).toMatchObject({ width: 1080, height: 1920, durationSec: 90 });
      expect(plan.qa).toEqual({ status: "passed", warnings: [] });

      const summary = JSON.parse(await readFile(path.join(workspace.root, "vertical-package.json"), "utf8"));
      expect(summary).toMatchObject({
        projectId: workspace.projectId,
        taskId: "task-123",
        status: "ready",
        clips: [
          {
            id: "clip-best",
            rank: 1,
            title: "Clip best",
            score: 98,
            clipUrl: `/api/projects/${workspace.projectId}/vertical-package/clips/rank-01/clip.mp4`,
            payloads: {
              youtubeShorts: "shorts/rank-01/youtube-shorts-payload.json",
              instagram: "shorts/rank-01/instagram-reels-payload.json"
            }
          },
          {
            id: "clip-second",
            rank: 2,
            title: "Clip second"
          }
        ]
      });

      await expect(readFile(path.join(workspace.root, "shorts/rank-01/youtube-shorts-payload.json"), "utf8"))
        .resolves.toContain("Clip best");
      await expect(readFile(path.join(workspace.root, "shorts/rank-01/instagram-reels-payload.json"), "utf8"))
        .resolves.toContain("Clip best");
      expect(jobs.get(job.id)).toMatchObject({
        status: "passed",
        stage: "vertical_review_ready",
        message: "SupoClip vertical cuts ready",
        outputPath: path.join(workspace.renders, "rough-cut.mp4"),
        planPath: workspace.planPath,
        warnings: []
      });
    });
  });
});
