import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CAPTION_SETTINGS } from "../../shared/caption-settings";
import { DEFAULT_COLOR_ADJUSTMENTS } from "../../shared/color-presets";
import type { EditPlan } from "../../shared/edit-plan";
import { withTempDir } from "../../test/fixtures";
import { renderRoughCut, type RoughCutProcessRunner } from "./render-rough-cut";

function createPlan(hasAudio: boolean): EditPlan {
  return {
    id: "plan_project_1",
    projectId: "project_1",
    version: 1,
    source: {
      path: "/tmp/source.mp4",
      durationSec: 10,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio
    },
    segments: [
      {
        id: "seg_1",
        sourceStartSec: 1,
        sourceEndSec: 3,
        timelineStartSec: 0,
        timelineEndSec: 2,
        reason: "kept speech/content"
      }
    ],
    removed: [],
    sections: [],
    captions: [],
    captionSettings: DEFAULT_CAPTION_SETTINGS,
    overlays: [],
    color: { presetId: "neutral", label: "Neutral", adjustments: DEFAULT_COLOR_ADJUSTMENTS },
    video: { flipHorizontal: false },
    audio: { music: null, voiceTargetLufs: -16 },
    qa: { status: "not_run", warnings: [] },
    publishReadiness: { status: "needs_review", checks: [] },
    createdAt: "2026-05-05T00:00:00.000Z"
  };
}

async function renderAndReadCommand(hasAudio: boolean) {
  return withTempDir("ai-editor-render-", async (dir) => {
    const renders = path.join(dir, "renders");
    await mkdir(renders);
    const runner: RoughCutProcessRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await renderRoughCut(createPlan(hasAudio), { projectId: "project_1", root: dir, uploads: dir, analysis: dir, renders, qa: dir, planPath: path.join(dir, "edit-plan.json") }, runner);

    const commandLog = JSON.parse(await readFile(path.join(renders, "rough-cut-command.json"), "utf8"));
    return { commandLog, runner };
  });
}

describe("renderRoughCut", () => {
  it("renders audio plans with audio filters and maps", async () => {
    const { commandLog, runner } = await renderAndReadCommand(true);
    const args = commandLog.args as string[];

    expect(commandLog.renderer).toBe("ffmpeg");
    expect(runner).toHaveBeenCalledOnce();
    expect(args).toContain("[outa]");
    expect(args).toContain("-c:a");
    expect(args[args.indexOf("-filter_complex") + 1]).toContain("[0:a]atrim");
  });

  it("renders no-audio plans without audio filters or maps", async () => {
    const { commandLog } = await renderAndReadCommand(false);
    const args = commandLog.args as string[];

    expect(commandLog.renderer).toBe("ffmpeg");
    expect(args).not.toContain("[outa]");
    expect(args).not.toContain("-c:a");
    expect(args[args.indexOf("-filter_complex") + 1]).not.toContain("[0:a]");
    expect(args[args.indexOf("-filter_complex") + 1]).toContain("a=0[concatv]");
    expect(args[args.indexOf("-filter_complex") + 1]).toContain("[concatv]format=yuv420p[outv]");
  });

  it("renders background music for no-audio plans", async () => {
    await withTempDir("ai-editor-render-", async (dir) => {
      const renders = path.join(dir, "renders");
      await mkdir(renders);
      const runner: RoughCutProcessRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
      const plan = createPlan(false);
      plan.audio.music = { path: "/tmp/music.wav", gainDb: -18, duckUnderSpeechDb: -14 };

      await renderRoughCut(plan, { projectId: "project_1", root: dir, uploads: dir, analysis: dir, renders, qa: dir, planPath: path.join(dir, "edit-plan.json") }, runner);

      const commandLog = JSON.parse(await readFile(path.join(renders, "rough-cut-command.json"), "utf8"));
      const args = commandLog.args as string[];
      const filter = args[args.indexOf("-filter_complex") + 1];

      expect(args).toContain("/tmp/music.wav");
      expect(args).toContain("[aout]");
      expect(args).toContain("-c:a");
      expect(filter).toContain("[1:a]volume=-18dB,atrim=duration=2,asetpts=PTS-STARTPTS[aout]");
      expect(filter).not.toContain("[outa][music]amix");
    });
  });

  it("renders browser-playable H.264 MP4 output", async () => {
    const { commandLog } = await renderAndReadCommand(true);
    const args = commandLog.args as string[];

    expect(args).toContain("-pix_fmt");
    expect(args[args.indexOf("-pix_fmt") + 1]).toBe("yuv420p");
    expect(args).toContain("-profile:v");
    expect(args[args.indexOf("-profile:v") + 1]).toBe("high");
    expect(args).toContain("-movflags");
    expect(args[args.indexOf("-movflags") + 1]).toBe("+faststart");
  });

  it("can mirror the rendered video horizontally", async () => {
    await withTempDir("ai-editor-render-flip-", async (dir) => {
      const renders = path.join(dir, "renders");
      await mkdir(renders);
      const runner: RoughCutProcessRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
      const plan = createPlan(true);
      plan.video.flipHorizontal = true;

      await renderRoughCut(plan, { projectId: "project_1", root: dir, uploads: dir, analysis: dir, renders, qa: dir, planPath: path.join(dir, "edit-plan.json") }, runner);

      const commandLog = JSON.parse(await readFile(path.join(renders, "rough-cut-command.json"), "utf8"));
      const filter = commandLog.args[commandLog.args.indexOf("-filter_complex") + 1] as string;
      expect(filter).toContain("setpts=PTS-STARTPTS,hflip");
    });
  });

  it("applies the strong LOG correction filter during preview renders", async () => {
    await withTempDir("ai-editor-render-log-color-", async (dir) => {
      const renders = path.join(dir, "renders");
      await mkdir(renders);
      const runner: RoughCutProcessRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
      const plan = createPlan(true);
      plan.color = {
        presetId: "log_to_rec709",
        label: "LOG -> YouTube",
        adjustments: DEFAULT_COLOR_ADJUSTMENTS
      };

      await renderRoughCut(
        plan,
        { projectId: "project_1", root: dir, uploads: dir, analysis: dir, renders, qa: dir, planPath: path.join(dir, "edit-plan.json") },
        runner,
        { outputFileName: "preview-sample.mp4", commandLogFileName: "preview-sample-command.json" }
      );

      const commandLog = JSON.parse(await readFile(path.join(renders, "preview-sample-command.json"), "utf8"));
      const filter = commandLog.args[commandLog.args.indexOf("-filter_complex") + 1] as string;
      expect(filter).toContain("eq=gamma=");
      expect(filter).toContain("saturation=1.45");
      expect(filter).toContain("colorlevels=");
    });
  });

  it("applies voice cleanup in the quick render audio chain", async () => {
    await withTempDir("ai-editor-render-audio-cleanup-", async (dir) => {
      const renders = path.join(dir, "renders");
      await mkdir(renders);
      const runner: RoughCutProcessRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

      await renderRoughCut(
        createPlan(true),
        { projectId: "project_1", root: dir, uploads: dir, analysis: dir, renders, qa: dir, planPath: path.join(dir, "edit-plan.json") },
        runner,
        { audioCleanup: true }
      );

      const commandLog = JSON.parse(await readFile(path.join(renders, "rough-cut-command.json"), "utf8"));
      const filter = commandLog.args[commandLog.args.indexOf("-filter_complex") + 1] as string;
      expect(filter).toContain("[outa]afftdn,loudnorm=I=-16:TP=-1.5:LRA=11,acompressor=");
      expect(commandLog.args).toEqual(expect.arrayContaining(["-map", "[voiceclean]"]));
    });
  });

  it("ducks background music under cleaned voice when requested", async () => {
    await withTempDir("ai-editor-render-ducking-", async (dir) => {
      const renders = path.join(dir, "renders");
      await mkdir(renders);
      const runner: RoughCutProcessRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
      const plan = createPlan(true);
      plan.audio.music = { path: "/tmp/music.wav", gainDb: -18, duckUnderSpeechDb: -14 };

      await renderRoughCut(
        plan,
        { projectId: "project_1", root: dir, uploads: dir, analysis: dir, renders, qa: dir, planPath: path.join(dir, "edit-plan.json") },
        runner,
        { audioCleanup: true, audioDucking: true }
      );

      const commandLog = JSON.parse(await readFile(path.join(renders, "rough-cut-command.json"), "utf8"));
      const filter = commandLog.args[commandLog.args.indexOf("-filter_complex") + 1] as string;
      expect(filter).toContain("[music][voiceclean]sidechaincompress=");
      expect(filter).toContain("[voiceclean][musicduck]amix=");
    });
  });

  it("can write a separate preview sample without replacing the full rough cut target", async () => {
    await withTempDir("ai-editor-render-preview-", async (dir) => {
      const renders = path.join(dir, "renders");
      await mkdir(renders);
      const runner: RoughCutProcessRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

      await renderRoughCut(
        createPlan(true),
        { projectId: "project_1", root: dir, uploads: dir, analysis: dir, renders, qa: dir, planPath: path.join(dir, "edit-plan.json") },
        runner,
        { outputFileName: "preview-sample.mp4", commandLogFileName: "preview-sample-command.json" }
      );

      const commandLog = JSON.parse(await readFile(path.join(renders, "preview-sample-command.json"), "utf8"));
      const args = commandLog.args as string[];
      expect(args.at(-1)).toBe(path.join(renders, "preview-sample.mp4"));
    });
  });

  it("keeps the preview render clean when captions exist", async () => {
    await withTempDir("ai-editor-render-", async (dir) => {
      const renders = path.join(dir, "renders");
      await mkdir(renders);
      const runner: RoughCutProcessRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
      const plan = createPlan(true);
      plan.captions = [
        { id: "cap_1", startSec: 0.1, endSec: 1.8, text: "Texto na tela", styleId: "youtube_clean", words: [] }
      ];

      await renderRoughCut(plan, { projectId: "project_1", root: dir, uploads: dir, analysis: dir, renders, qa: dir, planPath: path.join(dir, "edit-plan.json") }, runner);

      const commandLog = JSON.parse(await readFile(path.join(renders, "rough-cut-command.json"), "utf8"));
      const filter = commandLog.args[commandLog.args.indexOf("-filter_complex") + 1] as string;
      expect(commandLog.args).not.toContain(path.join(renders, "caption-1.png"));
      expect(commandLog.args).not.toContain("-t");
      expect(filter).not.toContain("overlay=0:0:enable=");
    });
  });

  it("does not add word-level caption image inputs to the rough-cut preview", async () => {
    await withTempDir("ai-editor-render-", async (dir) => {
      const renders = path.join(dir, "renders");
      await mkdir(renders);
      const runner: RoughCutProcessRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
      const plan = createPlan(true);
      plan.captions = [
        {
          id: "cap_1",
          startSec: 0.1,
          endSec: 1.8,
          text: "Texto na tela",
          styleId: "focus_word",
          words: [
            { id: "cap_1_w1", startSec: 0.1, endSec: 0.5, text: "Texto" },
            { id: "cap_1_w2", startSec: 0.55, endSec: 1, text: "na" },
            { id: "cap_1_w3", startSec: 1.05, endSec: 1.8, text: "tela" }
          ]
        }
      ];

      await renderRoughCut(plan, { projectId: "project_1", root: dir, uploads: dir, analysis: dir, renders, qa: dir, planPath: path.join(dir, "edit-plan.json") }, runner);

      const commandLog = JSON.parse(await readFile(path.join(renders, "rough-cut-command.json"), "utf8"));
      const filter = commandLog.args[commandLog.args.indexOf("-filter_complex") + 1] as string;
      expect(commandLog.args).not.toContain(path.join(renders, "caption-1-word-1.png"));
      expect(commandLog.args).not.toContain(path.join(renders, "caption-1-word-2.png"));
      expect(commandLog.args).not.toContain(path.join(renders, "caption-1-word-3.png"));
      expect(filter).not.toContain("overlay=0:0:enable=");
    });
  });
});
