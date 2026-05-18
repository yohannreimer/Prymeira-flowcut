import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createVtt, transcribeWithWhisper as defaultTranscribeWithWhisper } from "../captions/whisper";
import { createJobStore, type JobStatus, type ProjectJob } from "../jobs/job-store";
import { runExportJob as defaultRunExportJob, type RunExportJobInput } from "../jobs/run-export-job";
import { runProjectJob as defaultRunProjectJob, type RunProjectJobInput } from "../jobs/run-project-job";
import type { MediaProbe } from "../media/probe";
import { createProjectWorkspace } from "../workspace";
import { generateHorizontalPayloads as defaultGenerateHorizontalPayloads } from "./ai-payloads";
import { extractPodcastAudio as defaultExtractPodcastAudio } from "./audio";
import type { MediaFactoryConfig } from "./config";
import { getHumanPackageName, getPackageSlug, renamePackageDirectory } from "./files";
import { createInitialManifest, writeManifest, type MediaFactoryManifest } from "./manifest";
import { writeHorizontalMetadataPackage } from "./metadata";
import {
  findBackgroundMusicTracks as defaultFindBackgroundMusicTracks,
  mixBackgroundMusicIntoVideo as defaultMixBackgroundMusicIntoVideo,
  selectBackgroundMusicTrack as defaultSelectBackgroundMusicTrack
} from "./music";
import { silentProgressReporter, type ProgressReporter } from "./progress";
import { generateYouTubeThumbnails as defaultGenerateYouTubeThumbnails } from "./thumbnail";

export type ProcessHorizontalPackageInput = {
  sourcePath: string;
  sourceHash: string;
  metadata: MediaProbe;
  inputDir: string;
  outputDir: string;
  backgroundMusic?: {
    enabled: boolean;
    musicDir?: string | null;
    volume: number;
    selection: "random";
  };
  ai?: MediaFactoryConfig["ai"];
  now?: Date;
  deps?: {
    runProjectJob?: (input: RunProjectJobInput) => Promise<void>;
    runExportJob?: (input: RunExportJobInput) => Promise<void>;
    extractPodcastAudio?: typeof defaultExtractPodcastAudio;
    findBackgroundMusicTracks?: typeof defaultFindBackgroundMusicTracks;
    selectBackgroundMusicTrack?: typeof defaultSelectBackgroundMusicTrack;
    mixBackgroundMusicIntoVideo?: typeof defaultMixBackgroundMusicIntoVideo;
    transcribeWithWhisper?: typeof defaultTranscribeWithWhisper;
    generateHorizontalPayloads?: typeof defaultGenerateHorizontalPayloads;
    generateYouTubeThumbnails?: typeof defaultGenerateYouTubeThumbnails;
    progress?: ProgressReporter;
  };
};

type ProcessHorizontalPackageResult = {
  packageDir: string;
  manifestPath: string;
};

export async function processHorizontalPackage(input: ProcessHorizontalPackageInput): Promise<ProcessHorizontalPackageResult> {
  assertValidSourceHash(input.sourceHash);
  const runProjectJob = input.deps?.runProjectJob ?? defaultRunProjectJob;
  const runExportJob = input.deps?.runExportJob ?? defaultRunExportJob;
  const extractPodcastAudio = input.deps?.extractPodcastAudio ?? defaultExtractPodcastAudio;
  const findBackgroundMusicTracks = input.deps?.findBackgroundMusicTracks ?? defaultFindBackgroundMusicTracks;
  const selectBackgroundMusicTrack = input.deps?.selectBackgroundMusicTrack ?? defaultSelectBackgroundMusicTrack;
  const mixBackgroundMusicIntoVideo = input.deps?.mixBackgroundMusicIntoVideo ?? defaultMixBackgroundMusicIntoVideo;
  const transcribeWithWhisper = input.deps?.transcribeWithWhisper ?? defaultTranscribeWithWhisper;
  const generateHorizontalPayloads = input.deps?.generateHorizontalPayloads ?? defaultGenerateHorizontalPayloads;
  const generateYouTubeThumbnails = input.deps?.generateYouTubeThumbnails ?? defaultGenerateYouTubeThumbnails;
  const progress = input.deps?.progress ?? silentProgressReporter;
  const aiEnabled = input.ai?.enabled === true;
  const now = input.now ?? new Date();
  const slug = getPackageSlug({ filePath: input.sourcePath, hash: input.sourceHash, now });
  const packageDir = path.join(input.outputDir, "ready-to-approve", slug);
  const youtubeDir = path.join(packageDir, "youtube");
  const podcastDir = path.join(packageDir, "podcast");

  await Promise.all([youtubeDir, podcastDir].map((dir) => mkdir(dir, { recursive: true })));

  const manifestPath = path.join(packageDir, "manifest.json");
  const initialManifest = createInitialManifest({
    id: slug,
    status: "processing",
    source: {
      path: input.sourcePath,
      hash: input.sourceHash,
      orientation: "horizontal",
      durationSec: input.metadata.durationSec,
      width: input.metadata.width,
      height: input.metadata.height,
      hasAudio: input.metadata.hasAudio
    },
    pipeline: "horizontal_youtube_podcast_x",
    now
  });
  await writeManifest(manifestPath, initialManifest);

  try {
    progress.info("Preparando pacote horizontal");
    const workspace = await createProjectWorkspace(
      path.join(packageDir, ".workspace"),
      `project_${input.sourceHash.slice(0, 12)}`
    );
    const workspaceSourcePath = path.join(workspace.uploads, `source${path.extname(input.sourcePath).toLowerCase() || ".mp4"}`);
    await copyFile(input.sourcePath, workspaceSourcePath);

    const jobs = createJobStore();
    const projectJob = jobs.create({ projectId: workspace.projectId, sourcePath: workspaceSourcePath });
    progress.info("Cortando silencios e preparando projeto");
    await runProjectJob({ jobId: projectJob.id, workspace, sourcePath: workspaceSourcePath, jobs });
    assertJobStatus({
      job: jobs.get(projectJob.id),
      label: "Project",
      allowedStatuses: ["passed", "warning"]
    });

    const wantsBackgroundMusic = wantsBackgroundMusicRender(input);
    const exportFileName = wantsBackgroundMusic ? "youtube-clean.mp4" : "youtube.mp4";
    const exportJob = jobs.create({ projectId: workspace.projectId, sourcePath: workspaceSourcePath });
    progress.info("Exportando YouTube em qualidade original");
    await runExportJob({
      jobId: exportJob.id,
      workspace,
      jobs,
      settings: {
        renderMode: "fast_cuts",
        format: "original",
        resolution: "original",
        quality: "maxima",
        fileName: exportFileName,
        audioCleanup: false,
        audioDucking: false,
        sdrMode: "preserve"
      }
    });
    const finishedExportJob = assertJobStatus({
      job: jobs.get(exportJob.id),
      label: "Export",
      allowedStatuses: ["passed"]
    });

    const renderedYoutubePath = finishedExportJob.outputPath ?? path.join(workspace.renders, exportFileName);
    const packageYoutubePath = path.join(youtubeDir, "youtube.mp4");
    const selectedBackgroundMusic = wantsBackgroundMusic && input.backgroundMusic?.musicDir
      ? selectBackgroundMusicTrack(await findBackgroundMusicTracks(input.backgroundMusic.musicDir), input.sourceHash)
      : null;

    if (selectedBackgroundMusic && input.backgroundMusic) {
      progress.info("Misturando musica de fundo");
      await mixBackgroundMusicIntoVideo({
        inputVideoPath: renderedYoutubePath,
        musicPath: selectedBackgroundMusic,
        outputVideoPath: packageYoutubePath,
        volume: input.backgroundMusic.volume
      });
      await writeFile(
        path.join(youtubeDir, "background-music.json"),
        `${JSON.stringify({ track: selectedBackgroundMusic, volume: input.backgroundMusic.volume }, null, 2)}\n`
      );
    } else {
      await copyFile(renderedYoutubePath, packageYoutubePath);
    }

    const podcastAudioPath = path.join(podcastDir, "podcast-audio.mp3");
    if (input.metadata.hasAudio) {
      progress.info("Extraindo audio do podcast");
      await extractPodcastAudio({
        inputPath: packageYoutubePath,
        outputPath: podcastAudioPath
      });
    }

    if (aiEnabled && input.metadata.hasAudio) {
      progress.info("Transcrevendo audio");
    }
    const segments = aiEnabled && input.metadata.hasAudio
      ? await transcribeWithWhisper(packageYoutubePath, {
          model: input.ai?.transcriptionModel,
          language: input.ai?.language
        })
      : [];
    const transcript = {
      segments,
      vtt: createVtt(segments),
      text: segments.map((segment) => segment.text).join("\n")
    };
    progress.info(aiEnabled ? "Gerando payloads com IA" : "Gerando payloads");
    const payloads = await generateHorizontalPayloads({
      transcriptText: transcript.text,
      transcriptSegments: transcript.segments,
      sourceTitle: path.parse(input.sourcePath).name,
      ai: input.ai ?? { enabled: false }
    });

    await writeHorizontalMetadataPackage({ packageDir, sourcePath: input.sourcePath, transcript, payloads });
    progress.info("Gerando thumbnails do YouTube");
    await generateYouTubeThumbnails({
      videoPath: packageYoutubePath,
      outputDir: youtubeDir,
      title: payloads.youtube.title,
      durationSec: input.metadata.durationSec
    });

    const finalPackageId = getHumanPackageName({
      kind: "Horizontal",
      title: payloads.youtube.title,
      now
    });
    const finalPackageDir = await renamePackageDirectory({
      packageDir,
      desiredName: finalPackageId
    });
    const finalManifestPath = path.join(finalPackageDir, "manifest.json");

    await writeManifest(finalManifestPath, {
      ...initialManifest,
      id: finalPackageId,
      status: "ready_to_approve",
      outputs: createOutputs({ hasAudio: input.metadata.hasAudio, selectedBackgroundMusic }),
      publishPlan: createPublishPlan({ hasAudio: input.metadata.hasAudio, selectedBackgroundMusic }),
      updatedAt: now.toISOString()
    });

    return { packageDir: finalPackageDir, manifestPath: finalManifestPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown horizontal pipeline error";
    await writeManifest(manifestPath, {
      ...initialManifest,
      status: "failed",
      error: {
        stage: "horizontal_pipeline",
        message
      },
      updatedAt: new Date().toISOString()
    });
    throw error;
  }

  return { packageDir, manifestPath };
}

function assertValidSourceHash(sourceHash: string) {
  if (!/^[a-f0-9]{16,}$/i.test(sourceHash)) {
    throw new Error("Media Factory source hash must be a hex string");
  }
}

function wantsBackgroundMusicRender(input: ProcessHorizontalPackageInput) {
  return Boolean(input.backgroundMusic?.enabled && input.backgroundMusic.musicDir && input.metadata.hasAudio);
}

function assertJobStatus({
  job,
  label,
  allowedStatuses
}: {
  job: ProjectJob | null;
  label: string;
  allowedStatuses: JobStatus[];
}): ProjectJob {
  if (!job) {
    throw new Error(`${label} job disappeared from job store`);
  }

  if (job.status === "failed") {
    throw new Error(`${label} job failed: ${job.error ?? job.message}`);
  }

  if (!allowedStatuses.includes(job.status)) {
    throw new Error(`${label} job did not complete successfully: status ${job.status} at ${job.stage}`);
  }

  return job;
}

function createOutputs({
  hasAudio,
  selectedBackgroundMusic
}: {
  hasAudio: boolean;
  selectedBackgroundMusic: string | null;
}): MediaFactoryManifest["outputs"] {
  return [
    { type: "youtube_video", path: "youtube/youtube.mp4" },
    ...(selectedBackgroundMusic ? [{ type: "youtube_background_music", path: "youtube/background-music.json" }] : []),
    ...(hasAudio ? [{ type: "podcast_audio", path: "podcast/podcast-audio.mp3" }] : []),
    { type: "youtube_title", path: "youtube/title.txt" },
    { type: "youtube_description", path: "youtube/description.txt" },
    { type: "youtube_hashtags", path: "youtube/hashtags.txt" },
    { type: "youtube_chapters", path: "youtube/chapters.txt" },
    { type: "youtube_thumbnail", path: "youtube/thumbnail.png" },
    { type: "youtube_thumbnail_option", path: "youtube/thumbnails/opcao-01.png" },
    { type: "youtube_thumbnail_option", path: "youtube/thumbnails/opcao-02.png" },
    { type: "youtube_thumbnail_option", path: "youtube/thumbnails/opcao-03.png" },
    { type: "youtube_thumbnail_brief", path: "youtube/thumbnail-brief.json" },
    { type: "youtube_payload", path: "youtube/payload.json" },
    { type: "podcast_title", path: "podcast/title.txt" },
    { type: "podcast_description", path: "podcast/description.txt" },
    { type: "podcast_payload", path: "podcast/payload.json" },
    { type: "x_thread", path: "x/thread.json" },
    { type: "x_payload", path: "x/payload.json" },
    { type: "transcript", path: "transcript/transcript.vtt" },
    { type: "transcript_text", path: "transcript/transcript.txt" },
    { type: "transcript_json", path: "transcript/transcript.json" }
  ];
}

function createPublishPlan({
  hasAudio,
  selectedBackgroundMusic
}: {
  hasAudio: boolean;
  selectedBackgroundMusic: string | null;
}): MediaFactoryManifest["publishPlan"] {
  return {
    youtube: {
      mode: "dry-run",
      video: "youtube/youtube.mp4",
      ...(selectedBackgroundMusic ? { backgroundMusic: "youtube/background-music.json" } : {})
    },
    spotify: {
      mode: "dry-run",
      audio: hasAudio ? "podcast/podcast-audio.mp3" : null
    },
    x: {
      mode: "dry-run",
      thread: "x/thread.json"
    }
  };
}
