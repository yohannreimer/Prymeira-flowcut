import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Caption, EditPlan } from "../../shared/edit-plan";
import { editPlanSchema } from "../../shared/edit-plan";
import { getConfig } from "../config";
import { runProcess } from "../media/process";
import type { ProcessOptions, ProcessResult } from "../media/process";
import type { ProjectWorkspace } from "../workspace";
import { generateYoutubePackageCopy } from "../youtube/youtube-package-copy";
import type { YoutubePackageCopy } from "../youtube/youtube-package-copy";
import type { JobStore } from "./job-store";

export type YoutubePackageProcessRunner = (
  command: string,
  args: string[],
  options?: ProcessOptions
) => Promise<ProcessResult>;

export type RunYoutubePackageJobInput = {
  jobId: string;
  workspace: ProjectWorkspace;
  jobs: JobStore;
};

export type RunYoutubePackageJobDeps = {
  generateYoutubePackageCopy?: typeof generateYoutubePackageCopy;
};

const FRAME_COUNT = 4;
const FRAME_TIMEOUT_MS = 5 * 60 * 1000;
const IDENTITY_CLIP_DURATION_SEC = 4;

export async function runYoutubePackageJob(
  input: RunYoutubePackageJobInput,
  processRunner: YoutubePackageProcessRunner = runProcess,
  deps: RunYoutubePackageJobDeps = {}
) {
  const copyGenerator = deps.generateYoutubePackageCopy ?? generateYoutubePackageCopy;
  let packageDir: string | null = null;

  try {
    input.jobs.update(input.jobId, {
      status: "running",
      stage: "youtube_package_prepare",
      message: "Preparing YouTube package",
      planPath: input.workspace.planPath
    });

    const plan = editPlanSchema.parse(JSON.parse(await readFile(input.workspace.planPath, "utf8")));
    if (plan.captions.length === 0) {
      throw new Error("Gere as legendas primeiro para a IA ler a transcricao do video.");
    }

    packageDir = path.join(input.workspace.root, "download", "youtube-package");
    await rm(packageDir, { recursive: true, force: true });
    await mkdir(packageDir, { recursive: true });

    const transcript = captionsToTranscriptText(plan.captions);
    await writeFile(path.join(packageDir, "transcricao.txt"), transcript);

    input.jobs.update(input.jobId, {
      status: "running",
      stage: "youtube_package_ai",
      message: "Writing YouTube title, description and thumbnail prompt",
      outputPath: packageDir,
      planPath: input.workspace.planPath
    });

    const copy = await copyGenerator(plan, transcript);
    await writeCopyFiles(packageDir, copy);

    const sourcePath = await pickFrameSource(input.workspace, plan.source.path);
    input.jobs.update(input.jobId, {
      status: "running",
      stage: "youtube_package_frames",
      message: "Extracting thumbnail reference frames and identity clips",
      outputPath: packageDir,
      planPath: input.workspace.planPath
    });
    await extractReferenceFrames(plan, sourcePath, packageDir, processRunner);
    await extractIdentityClips(plan, sourcePath, packageDir, processRunner);

    input.jobs.update(input.jobId, {
      status: "passed",
      stage: "complete",
      message: "YouTube package is ready",
      outputPath: packageDir,
      planPath: input.workspace.planPath
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown YouTube package error";
    input.jobs.update(input.jobId, {
      status: "failed",
      stage: "failed",
      message: "YouTube package failed",
      outputPath: packageDir,
      planPath: input.workspace.planPath,
      error: message
    });
  }
}

function captionsToTranscriptText(captions: Caption[]) {
  return captions
    .slice()
    .sort((a, b) => a.startSec - b.startSec)
    .map((caption) => `[${formatTime(caption.startSec)} - ${formatTime(caption.endSec)}] ${caption.text.replace(/\s+/g, " ").trim()}`)
    .join("\n");
}

async function writeCopyFiles(packageDir: string, copy: YoutubePackageCopy) {
  await Promise.all([
    writeFile(path.join(packageDir, "titulo.txt"), `${copy.title.trim()}\n`),
    writeFile(path.join(packageDir, "descricao.txt"), `${copy.description.trim()}\n`),
    writeFile(path.join(packageDir, "prompt-thumbnail.txt"), formatThumbnailPrompts(copy.thumbnailPrompts))
  ]);
}

function formatThumbnailPrompts(prompts: string[]) {
  const facePrompts = prompts.map((prompt, index) => [
    `VARIACAO ${index + 1}`,
    "",
    prompt.trim()
  ].join("\n"));
  return `${facePrompts.join("\n\n---\n\n")}\n`;
}

async function pickFrameSource(workspace: ProjectWorkspace, fallbackSourcePath: string) {
  const roughCutPath = path.join(workspace.renders, "rough-cut.mp4");
  return access(roughCutPath).then(() => roughCutPath, () => fallbackSourcePath);
}

async function extractReferenceFrames(
  plan: EditPlan,
  sourcePath: string,
  packageDir: string,
  processRunner: YoutubePackageProcessRunner
) {
  const times = selectFrameTimes(plan);
  for (const [index, timeSec] of times.entries()) {
    const outputPath = path.join(packageDir, `thumbnail-ref-${String(index + 1).padStart(2, "0")}.jpg`);
    const result = await processRunner(
      getConfig().ffmpegPath,
      [
        "-y",
        "-ss",
        String(timeSec),
        "-i",
        sourcePath,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        "-vf",
        "scale=1280:-2",
        outputPath
      ],
      { timeoutMs: FRAME_TIMEOUT_MS }
    );
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || `FFmpeg failed extracting frame ${index + 1}`);
    }
  }
}

async function extractIdentityClips(
  plan: EditPlan,
  sourcePath: string,
  packageDir: string,
  processRunner: YoutubePackageProcessRunner
) {
  const ranges = selectIdentityClipRanges(plan);
  for (const [index, range] of ranges.entries()) {
    const outputPath = path.join(packageDir, `identity-ref-${String(index + 1).padStart(2, "0")}.mp4`);
    const result = await processRunner(
      getConfig().ffmpegPath,
      [
        "-y",
        "-ss",
        String(range.startSec),
        "-i",
        sourcePath,
        "-t",
        String(range.durationSec),
        "-vf",
        "scale=1280:-2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-an",
        outputPath
      ],
      { timeoutMs: FRAME_TIMEOUT_MS }
    );
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || `FFmpeg failed extracting identity clip ${index + 1}`);
    }
  }
}

export function selectFrameTimes(plan: EditPlan) {
  const durationSec = plan.segments.at(-1)?.timelineEndSec ?? plan.source.durationSec;
  const safeDuration = Math.max(1, durationSec);
  return [0.08, 0.32, 0.58, 0.84]
    .slice(0, FRAME_COUNT)
    .map((pct) => Number(Math.min(Math.max(0.2, safeDuration * pct), Math.max(0.2, safeDuration - 0.2)).toFixed(3)));
}

export function selectIdentityClipRanges(plan: EditPlan) {
  const durationSec = plan.segments.at(-1)?.timelineEndSec ?? plan.source.durationSec;
  const safeDuration = Math.max(1, durationSec);
  const clipDurationSec = Number(Math.min(IDENTITY_CLIP_DURATION_SEC, Math.max(0.8, safeDuration - 0.2)).toFixed(3));
  const maxStartSec = Math.max(0, safeDuration - clipDurationSec);
  const starts = [
    clamp(0.8, 0, maxStartSec),
    clamp(safeDuration * 0.55, 0, maxStartSec)
  ];
  return starts.map((startSec) => ({
    startSec: Number(startSec.toFixed(3)),
    durationSec: clipDurationSec
  }));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(value: number) {
  const totalSeconds = Math.max(0, Math.floor(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
