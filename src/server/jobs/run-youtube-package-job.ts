import { access, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Caption, EditPlan } from "../../shared/edit-plan";
import { editPlanSchema } from "../../shared/edit-plan";
import { getConfig } from "../config";
import { runProcess } from "../media/process";
import type { ProcessOptions, ProcessResult } from "../media/process";
import type { ProjectWorkspace } from "../workspace";
import { renderV9ThumbnailImages } from "../youtube/v9-thumbnail-renderer";
import { generateYoutubePackageCopy } from "../youtube/youtube-package-copy";
import type { YoutubePackageCopy } from "../youtube/youtube-package-copy";
import { selectBestFrame } from "../youtube/select-best-frame";
import { preprocessFrame } from "../youtube/preprocess-frames";
import { cropFaceRegion } from "../youtube/crop-face-region";
import { selectIdentityPhoto } from "../youtube/select-identity-photo";
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
  renderV9ThumbnailImages?: typeof renderV9ThumbnailImages;
  selectBestFrame?: typeof selectBestFrame;
  preprocessFrame?: typeof preprocessFrame;
  cropFaceRegion?: typeof cropFaceRegion;
  selectIdentityPhoto?: typeof selectIdentityPhoto;
};

const CANDIDATE_COUNT = 6;
const FRAME_TIMEOUT_MS = 5 * 60 * 1000;
const IDENTITY_CLIP_DURATION_SEC = 4;

export async function runYoutubePackageJob(
  input: RunYoutubePackageJobInput,
  processRunner: YoutubePackageProcessRunner = runProcess,
  deps: RunYoutubePackageJobDeps = {}
) {
  const copyGenerator = deps.generateYoutubePackageCopy ?? generateYoutubePackageCopy;
  const thumbnailRenderer = deps.renderV9ThumbnailImages ?? renderV9ThumbnailImages;
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
    const identityPhotoPaths = await resolveIdentityPhotos(
      getConfig().workspaceRoot,
      input.workspace.root
    );
    input.jobs.update(input.jobId, {
      status: "running",
      stage: "youtube_package_frames",
      message: "Extracting thumbnail reference frames and identity clips",
      outputPath: packageDir,
      planPath: input.workspace.planPath
    });
    await extractReferenceFrames(plan, sourcePath, packageDir, processRunner, {
      selectBestFrame: deps.selectBestFrame,
      preprocessFrame: deps.preprocessFrame,
      cropFaceRegion: deps.cropFaceRegion,
      selectIdentityPhoto: deps.selectIdentityPhoto,
    }, identityPhotoPaths, copy.title);
    await extractIdentityClips(plan, sourcePath, packageDir, processRunner);

    input.jobs.update(input.jobId, {
      status: "running",
      stage: "youtube_package_thumbnails",
      message: "Rendering V9 thumbnail images",
      outputPath: packageDir,
      planPath: input.workspace.planPath
    });

    const copyWith6th = deriveBreakingNewsCopy(copy);
    await thumbnailRenderer(packageDir, copyWith6th);

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
  const promptFiles = copy.thumbnailPrompts.map((idea, index) => (
    writeFile(
      path.join(packageDir, `thumbnail-idea-${String(index + 1).padStart(2, "0")}-${THUMBNAIL_IDEA_SLUGS[index] ?? "v9"}.txt`),
      `${formatSingleThumbnailPrompt(idea, index)}\n`
    )
  ));
  await Promise.all([
    writeFile(path.join(packageDir, "titulo.txt"), `${copy.title.trim()}\n`),
    writeFile(path.join(packageDir, "descricao.txt"), `${copy.description.trim()}\n`),
    writeFile(path.join(packageDir, "chapters.txt"), formatChapters(copy.chapters)),
    writeFile(path.join(packageDir, "prompt-thumbnail.txt"), formatThumbnailPrompts(copy.thumbnailPrompts)),
    ...promptFiles
  ]);
}

function formatChapters(chapters: YoutubePackageCopy["chapters"]) {
  return `${chapters.map((chapter) => `${chapter.time.trim()} ${chapter.title.trim()}`).join("\n")}\n`;
}

const THUMBNAIL_IDEA_SLUGS = [
  "fiz-mesmo-assim",
  "conflito-resultado",
  "manchete-editorial",
  "sistema-status",
  "rede-social-negocio"
] as const;

function formatThumbnailPrompts(prompts: YoutubePackageCopy["thumbnailPrompts"]) {
  return `${prompts.map(formatSingleThumbnailPrompt).join("\n\n---\n\n")}\n`;
}

function formatSingleThumbnailPrompt(idea: YoutubePackageCopy["thumbnailPrompts"][number], index: number) {
  return [
    `VARIACAO ${index + 1}`,
    idea.title.trim(),
    "",
    idea.prompt.trim()
  ].join("\n");
}

async function pickFrameSource(workspace: ProjectWorkspace, fallbackSourcePath: string) {
  const roughCutPath = path.join(workspace.renders, "rough-cut.mp4");
  return access(roughCutPath).then(() => roughCutPath, () => fallbackSourcePath);
}

export function selectCandidateFrameTimes(plan: EditPlan): number[] {
  const durationSec = plan.segments.at(-1)?.timelineEndSec ?? plan.source.durationSec;
  const safeDuration = Math.max(1, durationSec);
  return [0.05, 0.20, 0.38, 0.55, 0.72, 0.88].map((pct) =>
    Number(
      Math.min(
        Math.max(0.5, safeDuration * pct),
        Math.max(0.5, safeDuration - 0.5)
      ).toFixed(3)
    )
  );
}

async function extractReferenceFrames(
  plan: EditPlan,
  sourcePath: string,
  packageDir: string,
  processRunner: YoutubePackageProcessRunner,
  deps: Pick<RunYoutubePackageJobDeps, "selectBestFrame" | "preprocessFrame" | "cropFaceRegion" | "selectIdentityPhoto">,
  identityPhotoPaths: string[],
  videoTitle: string
) {
  const times = selectCandidateFrameTimes(plan);
  const segmentDuration = Number(
    Math.min(
      6,
      Math.max(1, (plan.segments.at(-1)?.timelineEndSec ?? plan.source.durationSec) / CANDIDATE_COUNT)
    ).toFixed(3)
  );

  const candidatePaths: string[] = [];

  for (const [index, timeSec] of times.entries()) {
    const candidatePath = path.join(
      packageDir,
      `thumbnail-candidate-${String(index + 1).padStart(2, "0")}.jpg`
    );

    // Try FFmpeg thumbnail filter first
    const filterResult = await processRunner(
      getConfig().ffmpegPath,
      [
        "-y", "-ss", String(timeSec), "-t", String(segmentDuration),
        "-i", sourcePath,
        "-vf", "thumbnail=60",
        "-frames:v", "1", "-q:v", "2",
        candidatePath,
      ],
      { timeoutMs: FRAME_TIMEOUT_MS }
    );

    if (filterResult.exitCode !== 0) {
      // Fallback: single frame at timestamp
      const fallback = await processRunner(
        getConfig().ffmpegPath,
        ["-y", "-ss", String(timeSec), "-i", sourcePath,
         "-frames:v", "1", "-q:v", "2", "-vf", "scale=1280:-2",
         candidatePath],
        { timeoutMs: FRAME_TIMEOUT_MS }
      );
      if (fallback.exitCode !== 0) {
        throw new Error(
          fallback.stderr || fallback.stdout || `FFmpeg failed extracting candidate ${index + 1}`
        );
      }
    }

    candidatePaths.push(candidatePath);
  }

  const bestFrameFn = deps.selectBestFrame ?? selectBestFrame;
  const bestIdx = await bestFrameFn(candidatePaths);

  // Assemble 4 ref frames: best face (cropped) + 3 spread candidates (full frame backgrounds)
  const refCandidateIndices = [bestIdx, 1, 3, 5].map((i) =>
    Math.min(i, candidatePaths.length - 1)
  );

  const preprocessFn = deps.preprocessFrame ?? preprocessFrame;
  const cropFaceFn = deps.cropFaceRegion ?? cropFaceRegion;

  for (const [refIndex, candidateIndex] of refCandidateIndices.entries()) {
    const candidate = candidatePaths[candidateIndex]!;
    const outputPath = path.join(
      packageDir,
      `thumbnail-ref-${String(refIndex + 1).padStart(2, "0")}.jpg`
    );

    if (refIndex === 0) {
      if (identityPhotoPaths.length > 0) {
        // Identity photo library available: select best expression, skip face crop
        const selectIdentityPhotoFn = deps.selectIdentityPhoto ?? selectIdentityPhoto;
        const selectedIdx = await selectIdentityPhotoFn(identityPhotoPaths, videoTitle);
        const identityPhoto = identityPhotoPaths[selectedIdx] ?? identityPhotoPaths[0]!;
        await preprocessFn(identityPhoto, outputPath);
      } else {
        // No library: extract face from video frame (original behavior)
        const preprocessedPath = outputPath + ".pre.jpg";
        await preprocessFn(candidate, preprocessedPath);
        await cropFaceFn(preprocessedPath, outputPath);
        await unlink(preprocessedPath).catch(() => undefined);
      }
    } else {
      // ref-02/03/04 = background references: preprocess only, keep full frame
      await preprocessFn(candidate, outputPath);
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

function deriveBreakingNewsCopy(copy: YoutubePackageCopy): YoutubePackageCopy {
  const base = copy.thumbnailPrompts[0];
  if (!base) return copy;
  return {
    ...copy,
    thumbnailPrompts: [
      ...copy.thumbnailPrompts,
      {
        conceptId: "fiz_mesmo_assim",
        title: "Breaking News",
        renderText: {
          ...base.renderText,
          badge: "AO VIVO",
        },
        prompt: base.prompt,
      },
    ],
  };
}

/**
 * Resolves the identity photo library for a video.
 * Checks per-project override first, then global workspace library.
 * Returns sorted absolute paths of JPEG/PNG files, or [] if none found.
 */
async function resolveIdentityPhotos(
  workspaceRoot: string,
  projectRoot: string
): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const SUPPORTED = new Set([".jpg", ".jpeg", ".png"]);
  const candidates = [
    path.join(projectRoot, "identity-photos"),
    path.join(workspaceRoot, "identity-photos"),
  ];
  for (const dir of candidates) {
    try {
      const entries = await readdir(dir);
      const photos = entries
        .filter((f) => SUPPORTED.has(path.extname(f).toLowerCase()))
        .map((f) => path.join(dir, f))
        .sort();
      if (photos.length > 0) return photos;
    } catch {
      // directory doesn't exist — try next
    }
  }
  return [];
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
