import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createJobStore } from "./job-store";
import { runExportJob } from "./run-export-job";
import { createProjectWorkspace } from "../workspace";
import { withTempDir } from "../../test/fixtures";

async function writePlan(planPath: string, sourcePath: string) {
  await writeFile(planPath, JSON.stringify({
    id: "plan_project_1",
    projectId: "project_1",
    version: 1,
    source: {
      path: sourcePath,
      durationSec: 10,
      width: 1080,
      height: 1920,
      fps: 30,
      hasAudio: true
    },
    segments: [
      { id: "seg_1", sourceStartSec: 0, sourceEndSec: 10, timelineStartSec: 0, timelineEndSec: 10, reason: "kept speech/content" }
    ],
    removed: [],
    captions: [],
    overlays: [],
    color: { presetId: "neutral", label: "Neutral" },
    audio: { music: null, voiceTargetLufs: -16 },
    qa: { status: "passed", warnings: [] },
    createdAt: "2026-05-05T00:00:00.000Z"
  }));
}

async function writeCaptionedPlan(planPath: string, sourcePath: string) {
  await writeFile(planPath, JSON.stringify({
    id: "plan_project_1",
    projectId: "project_1",
    version: 1,
    source: {
      path: sourcePath,
      durationSec: 10,
      width: 1080,
      height: 1920,
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
        endSec: 1.3,
        text: "Fazendo esse video",
        styleId: "focus_word",
        words: [
          { id: "cap_1_w1", startSec: 0.2, endSec: 0.5, text: "Fazendo" },
          { id: "cap_1_w2", startSec: 0.5, endSec: 0.9, text: "esse" },
          { id: "cap_1_w3", startSec: 0.9, endSec: 1.3, text: "video" }
        ]
      }
    ],
    captionSettings: {
      enabled: true,
      styleId: "focus_word",
      displayMode: "block_highlight",
      fontId: "system_bold",
      fontSizePct: 5,
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

async function writeMotionPlan(planPath: string, sourcePath: string, sourceSize = { width: 1920, height: 1080 }) {
  await writeFile(planPath, JSON.stringify({
    id: "plan_project_1",
    projectId: "project_1",
    version: 1,
    source: {
      path: sourcePath,
      durationSec: 12,
      width: sourceSize.width,
      height: sourceSize.height,
      fps: 30,
      hasAudio: true
    },
    segments: [
      { id: "seg_1", sourceStartSec: 0, sourceEndSec: 12, timelineStartSec: 0, timelineEndSec: 12, reason: "kept speech/content" }
    ],
    removed: [],
    sections: [
      {
        id: "section_hook",
        type: "hook",
        startSec: 0,
        endSec: 12,
        label: "Gancho",
        confidence: 0.8,
        warnings: [],
        treatments: {
          motion: {
            enabled: true,
            slots: [{ id: "slot_1", kind: "hook_title", startSec: 0.4, endSec: 4, label: "Gancho visual", payload: {} }]
          }
        }
      }
    ],
    captions: [],
    overlays: [],
    color: { presetId: "neutral", label: "Neutral" },
    audio: { music: null, voiceTargetLufs: -16 },
    qa: { status: "passed", warnings: [] },
    createdAt: "2026-05-05T00:00:00.000Z"
  }));
}

describe("runExportJob", () => {
  it("exports from the rough cut with requested aspect and quality", async () => {
    await withTempDir("ai-editor-export-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const sourcePath = path.join(workspace.uploads, "source.mov");
      const roughCutPath = path.join(workspace.renders, "rough-cut.mp4");
      await mkdir(workspace.renders, { recursive: true });
      await writeFile(sourcePath, "source");
      await writeFile(roughCutPath, "rough");
      await writePlan(workspace.planPath, sourcePath);
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath });
      const processRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

      await runExportJob({
        jobId: job.id,
        workspace,
        jobs,
        settings: {
          renderMode: "full",
          format: "vertical",
          resolution: "1080p",
          quality: "maxima",
          fileName: "final-cut.mp4",
          audioCleanup: true,
          audioDucking: false,
          sdrMode: "preserve"
        }
      }, processRunner);

      const fullRenderArgs = processRunner.mock.calls[0][1] as string[];
      expect(fullRenderArgs).toEqual(expect.arrayContaining(["-i", sourcePath, roughCutPath]));
      expect(fullRenderArgs[fullRenderArgs.indexOf("-filter_complex") + 1]).toContain("afftdn,loudnorm");
      const exportArgs = processRunner.mock.calls.at(-1)?.[1] as string[];
      expect(exportArgs).toEqual(expect.arrayContaining([
        "-i",
        roughCutPath,
        "-vf",
        "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p",
        "-preset",
        "slow",
        "-crf",
        "18",
        path.join(workspace.renders, "final-cut.mp4")
      ]));
      expect(exportArgs).not.toContain("-af");
      expect(jobs.get(job.id)).toMatchObject({
        status: "passed",
        stage: "complete",
        message: "Export is ready",
        outputPath: path.join(workspace.renders, "final-cut.mp4")
      });
    });
  });

  it("burns enabled captions into the exported mp4 with png overlays", async () => {
    await withTempDir("ai-editor-export-captions-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const sourcePath = path.join(workspace.uploads, "source.mov");
      const roughCutPath = path.join(workspace.renders, "rough-cut.mp4");
      await mkdir(workspace.renders, { recursive: true });
      await writeFile(sourcePath, "source");
      await writeFile(roughCutPath, "rough");
      await writeCaptionedPlan(workspace.planPath, sourcePath);
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath });
      const processRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

      await runExportJob({
        jobId: job.id,
        workspace,
        jobs,
        settings: {
          renderMode: "full",
          format: "vertical",
          resolution: "1080p",
          quality: "rapida",
          fileName: "legendado.mp4",
          audioCleanup: false,
          audioDucking: false,
          sdrMode: "preserve"
        }
      }, processRunner);

      const args = processRunner.mock.calls.at(-1)?.[1] as string[];
      expect(args).toContain("-filter_complex");
      expect(args).toContain(path.join(workspace.renders, "caption-overlays", "caption-overlay-001.png"));
      expect(args[args.indexOf("-filter_complex") + 1]).toContain("overlay=");
      expect(args[args.indexOf("-filter_complex") + 1]).toContain("enable='between(t,0.2,0.5)'");
      expect(args).toContain("-t");
      expect(args[args.indexOf("-t") + 1]).toBe("10");
    });
  });

  it("converts HDR-style exports to SDR when requested", async () => {
    await withTempDir("ai-editor-export-sdr-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const sourcePath = path.join(workspace.uploads, "source.mov");
      const roughCutPath = path.join(workspace.renders, "rough-cut.mp4");
      await mkdir(workspace.renders, { recursive: true });
      await writeFile(sourcePath, "source");
      await writeFile(roughCutPath, "rough");
      await writePlan(workspace.planPath, sourcePath);
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath });
      const processRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

      await runExportJob({
        jobId: job.id,
        workspace,
        jobs,
        settings: {
          renderMode: "full",
          format: "horizontal",
          resolution: "1080p",
          quality: "rapida",
          fileName: "sdr-youtube.mp4",
          audioCleanup: false,
          audioDucking: false,
          sdrMode: "convert_to_sdr"
        }
      }, processRunner);

      const args = processRunner.mock.calls.at(-1)?.[1] as string[];
      expect(args[args.indexOf("-vf") + 1]).toBe(
        "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,colorspace=iall=bt2020:all=bt709:format=yuv420p"
      );
      expect(args).toEqual(expect.arrayContaining(["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"]));
    });
  });

  it("renders Remotion motion before the final export when motion slots are enabled", async () => {
    await withTempDir("ai-editor-export-motion-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const sourcePath = path.join(workspace.uploads, "source.mov");
      const roughCutPath = path.join(workspace.renders, "rough-cut.mp4");
      const motionPath = path.join(workspace.renders, "motion-render.mp4");
      await mkdir(workspace.renders, { recursive: true });
      await writeFile(sourcePath, "source");
      await writeFile(roughCutPath, "rough");
      await writeMotionPlan(workspace.planPath, sourcePath);
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath });
      const processRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
      const renderMotion = vi.fn().mockResolvedValue(motionPath);

      await runExportJob({
        jobId: job.id,
        workspace,
        jobs,
        settings: {
          renderMode: "full",
          format: "horizontal",
          resolution: "1080p",
          quality: "rapida",
          fileName: "motion.mp4",
          audioCleanup: false,
          audioDucking: false,
          sdrMode: "preserve"
        }
      }, processRunner, { renderRemotionMotion: renderMotion });

      expect(renderMotion).toHaveBeenCalledWith(expect.objectContaining({
        sourcePath: roughCutPath,
        canvasSize: { width: 1920, height: 1080 },
        renderQuality: "rapida",
        motionPlan: expect.objectContaining({
          events: [expect.objectContaining({ kind: "hook_title" })]
        })
      }), processRunner);
      const args = processRunner.mock.calls.at(-1)?.[1] as string[];
      expect(args).toEqual(expect.arrayContaining(["-i", motionPath, path.join(workspace.renders, "motion.mp4")]));
    });
  });

  it("renders Remotion motion at the requested export resolution instead of the 4k source size", async () => {
    await withTempDir("ai-editor-export-motion-1080-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const sourcePath = path.join(workspace.uploads, "source.mov");
      const roughCutPath = path.join(workspace.renders, "rough-cut.mp4");
      const motionPath = path.join(workspace.renders, "motion-render.mp4");
      await mkdir(workspace.renders, { recursive: true });
      await writeFile(sourcePath, "source");
      await writeFile(roughCutPath, "rough");
      await writeMotionPlan(workspace.planPath, sourcePath, { width: 3840, height: 2160 });
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath });
      const processRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
      const renderMotion = vi.fn().mockResolvedValue(motionPath);

      await runExportJob({
        jobId: job.id,
        workspace,
        jobs,
        settings: {
          renderMode: "full",
          format: "original",
          resolution: "1080p",
          quality: "rapida",
          fileName: "motion-1080.mp4",
          audioCleanup: false,
          audioDucking: false,
          sdrMode: "convert_to_sdr"
        }
      }, processRunner, { renderRemotionMotion: renderMotion });

      expect(renderMotion).toHaveBeenCalledWith(expect.objectContaining({
        canvasSize: { width: 1920, height: 1080 },
        renderQuality: "rapida"
      }), processRunner);
    });
  });

  it("updates the export job with actual Remotion progress", async () => {
    await withTempDir("ai-editor-export-motion-progress-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const sourcePath = path.join(workspace.uploads, "source.mov");
      const roughCutPath = path.join(workspace.renders, "rough-cut.mp4");
      const motionPath = path.join(workspace.renders, "motion-render.mp4");
      await mkdir(workspace.renders, { recursive: true });
      await writeFile(sourcePath, "source");
      await writeFile(roughCutPath, "rough");
      await writeMotionPlan(workspace.planPath, sourcePath);
      const baseJobs = createJobStore();
      const updates: Array<{ stage?: string; message?: string }> = [];
      const jobs = {
        ...baseJobs,
        update(id: string, patch: Parameters<typeof baseJobs.update>[1]) {
          updates.push({ stage: patch.stage, message: patch.message });
          return baseJobs.update(id, patch);
        }
      };
      const job = jobs.create({ projectId: workspace.projectId, sourcePath });
      const processRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
      const renderMotion = vi.fn().mockImplementation(async (input) => {
        input.onProgress?.({
          renderedFrames: 42,
          encodedFrames: 39,
          encodedDoneIn: null,
          renderedDoneIn: null,
          renderEstimatedTime: 9000,
          progress: 0.42,
          stitchStage: "encoding"
        });
        return motionPath;
      });

      await runExportJob({
        jobId: job.id,
        workspace,
        jobs,
        settings: {
          renderMode: "full",
          format: "horizontal",
          resolution: "1080p",
          quality: "rapida",
          fileName: "motion-progress.mp4",
          audioCleanup: false,
          audioDucking: false,
          sdrMode: "preserve"
        }
      }, processRunner, { renderRemotionMotion: renderMotion });

      expect(renderMotion).toHaveBeenCalled();
      expect(jobs.get(job.id)?.message).toBe("Export is ready");
      expect(updates).toContainEqual(expect.objectContaining({
        stage: "export_motion",
        message: "Rendering 1 Remotion motions - 42%"
      }));
      const motionCall = renderMotion.mock.calls[0][0];
      expect(motionCall).toEqual(expect.objectContaining({ onProgress: expect.any(Function) }));
    });
  });

  it("uses a fast cuts-only export without Remotion, caption overlays, or a second encode", async () => {
    await withTempDir("ai-editor-export-fast-cuts-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const sourcePath = path.join(workspace.uploads, "source.mov");
      const roughCutPath = path.join(workspace.renders, "rough-cut.mp4");
      const outputPath = path.join(workspace.renders, "fast-cuts.mp4");
      await mkdir(workspace.renders, { recursive: true });
      await writeFile(sourcePath, "source");
      await writeFile(roughCutPath, "rough");
      await writeMotionPlan(workspace.planPath, sourcePath);
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath });
      const processRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
      const renderMotion = vi.fn().mockResolvedValue(path.join(workspace.renders, "motion-render.mp4"));

      await runExportJob({
        jobId: job.id,
        workspace,
        jobs,
        settings: {
          renderMode: "fast_cuts",
          format: "horizontal",
          resolution: "1080p",
          quality: "rapida",
          fileName: "fast-cuts.mp4",
          audioCleanup: false,
          audioDucking: false,
          sdrMode: "preserve"
        }
      }, processRunner, { renderRemotionMotion: renderMotion });

      expect(renderMotion).not.toHaveBeenCalled();
      expect(processRunner).toHaveBeenCalledTimes(1);
      const args = processRunner.mock.calls[0][1] as string[];
      expect(args).toEqual(expect.arrayContaining(["-i", sourcePath, "-crf", "18", outputPath]));
      expect(args.join(" ")).not.toContain("overlay=");
      expect(args.join(" ")).not.toContain("scale=");
      expect(jobs.get(job.id)).toMatchObject({
        status: "passed",
        stage: "complete",
        message: "Fast cuts export is ready",
        outputPath
      });
    });
  });

  it("uses near-source video quality for maximum fast cuts exports", async () => {
    await withTempDir("ai-editor-export-fast-cuts-max-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const sourcePath = path.join(workspace.uploads, "source.mov");
      const outputPath = path.join(workspace.renders, "fast-cuts-max.mp4");
      await mkdir(workspace.renders, { recursive: true });
      await writeFile(sourcePath, "source");
      await writePlan(workspace.planPath, sourcePath);
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath });
      const processRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

      await runExportJob({
        jobId: job.id,
        workspace,
        jobs,
        settings: {
          renderMode: "fast_cuts",
          format: "original",
          resolution: "original",
          quality: "maxima",
          fileName: "fast-cuts-max.mp4",
          audioCleanup: false,
          audioDucking: false,
          sdrMode: "preserve"
        }
      }, processRunner);

      const args = processRunner.mock.calls[0][1] as string[];
      expect(args).toEqual(expect.arrayContaining(["-preset", "slow", "-crf", "12", outputPath]));
    });
  });

  it("exports original-aspect vertical video at real 4k when requested", async () => {
    await withTempDir("ai-editor-export-4k-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const sourcePath = path.join(workspace.uploads, "source.mov");
      const roughCutPath = path.join(workspace.renders, "rough-cut.mp4");
      await mkdir(workspace.renders, { recursive: true });
      await writeFile(sourcePath, "source");
      await writeFile(roughCutPath, "rough");
      await writePlan(workspace.planPath, sourcePath);
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath });
      const processRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

      await runExportJob({
        jobId: job.id,
        workspace,
        jobs,
        settings: {
          renderMode: "full",
          format: "original",
          resolution: "4k",
          quality: "rapida",
          fileName: "vertical-4k.mp4",
          audioCleanup: false,
          audioDucking: false,
          sdrMode: "preserve"
        }
      }, processRunner);

      const args = processRunner.mock.calls.at(-1)?.[1] as string[];
      expect(args[args.indexOf("-vf") + 1]).toBe(
        "scale=2160:3840:force_original_aspect_ratio=decrease,pad=2160:3840:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p"
      );
    });
  });

  it("applies SDR conversion before caption overlays", async () => {
    await withTempDir("ai-editor-export-sdr-captions-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const sourcePath = path.join(workspace.uploads, "source.mov");
      const roughCutPath = path.join(workspace.renders, "rough-cut.mp4");
      await mkdir(workspace.renders, { recursive: true });
      await writeFile(sourcePath, "source");
      await writeFile(roughCutPath, "rough");
      await writeCaptionedPlan(workspace.planPath, sourcePath);
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath });
      const processRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

      await runExportJob({
        jobId: job.id,
        workspace,
        jobs,
        settings: {
          renderMode: "full",
          format: "vertical",
          resolution: "1080p",
          quality: "rapida",
          fileName: "sdr-legendas.mp4",
          audioCleanup: false,
          audioDucking: false,
          sdrMode: "convert_to_sdr"
        }
      }, processRunner);

      const args = processRunner.mock.calls.at(-1)?.[1] as string[];
      const filterComplex = args[args.indexOf("-filter_complex") + 1];
      expect(filterComplex).toContain(
        "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,colorspace=iall=bt2020:all=bt709:format=yuv420p[vbase]"
      );
      expect(filterComplex.indexOf("colorspace=iall=bt2020:all=bt709:format=yuv420p")).toBeLessThan(filterComplex.indexOf("overlay="));
      expect(filterComplex).not.toContain("format=yuv420p,format=yuv420p");
      expect(args).toEqual(expect.arrayContaining(["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"]));
    });
  });

  it("uses caption settings from the export request", async () => {
    await withTempDir("ai-editor-export-caption-settings-", async (dir) => {
      const workspace = await createProjectWorkspace(dir, "project_1");
      const sourcePath = path.join(workspace.uploads, "source.mov");
      const roughCutPath = path.join(workspace.renders, "rough-cut.mp4");
      await mkdir(workspace.renders, { recursive: true });
      await writeFile(sourcePath, "source");
      await writeFile(roughCutPath, "rough");
      await writeCaptionedPlan(workspace.planPath, sourcePath);
      const jobs = createJobStore();
      const job = jobs.create({ projectId: workspace.projectId, sourcePath });
      const processRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

      await runExportJob({
        jobId: job.id,
        workspace,
        jobs,
        settings: {
          renderMode: "full",
          format: "vertical",
          resolution: "1080p",
          quality: "rapida",
          fileName: "sem-legenda.mp4",
          audioCleanup: false,
          audioDucking: false,
          sdrMode: "preserve",
          captionSettings: {
            enabled: false,
            styleId: "focus_word",
            displayMode: "block_highlight",
            fontId: "system_bold",
            fontSizePct: 5,
            wordsPerBlock: 3,
            positionYPct: 82,
            maxWidthPct: 88,
            primaryColor: "#fbfaf4",
            activeColor: "#fcc009",
            outlineColor: "#171716",
            outlineWidthPct: 0.28,
            shadow: true,
            uppercase: false
          }
        }
      }, processRunner);

      const args = processRunner.mock.calls.at(-1)?.[1] as string[];
      expect(args).not.toContain("-filter_complex");
      expect(args).not.toContain(path.join(workspace.renders, "caption-overlays", "caption-overlay-001.png"));
    });
  });
});
