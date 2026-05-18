import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempDir } from "../../test/fixtures";
import type { JobStore } from "../jobs/job-store";
import type { ProjectWorkspace } from "../workspace";
import type { HorizontalPayloads } from "./ai-payloads";
import { processHorizontalPackage } from "./horizontal-pipeline";

const metadataWithAudio = {
  durationSec: 120,
  width: 1920,
  height: 1080,
  fps: 30,
  hasAudio: true
};

async function passProjectJob(input: { jobId: string; workspace: ProjectWorkspace; jobs: JobStore }) {
  input.jobs.update(input.jobId, {
    status: "passed",
    stage: "complete",
    message: "Project complete",
    planPath: input.workspace.planPath,
    outputPath: path.join(input.workspace.renders, "rough-cut.mp4")
  });
}

async function passExportJob(input: { jobId: string; workspace: ProjectWorkspace; jobs: JobStore; settings: { fileName: string } }) {
  await mkdir(input.workspace.renders, { recursive: true });
  const outputPath = path.join(input.workspace.renders, input.settings.fileName);
  await writeFile(outputPath, "video");
  input.jobs.update(input.jobId, {
    status: "passed",
    stage: "complete",
    message: "Export complete",
    outputPath,
    planPath: input.workspace.planPath
  });
}

async function createSource(dir: string) {
  const inputDir = path.join(dir, "Entrada");
  const outputDir = path.join(dir, "Saida");
  await mkdir(inputDir, { recursive: true });
  const sourcePath = path.join(inputDir, "aula.mp4");
  await writeFile(sourcePath, "source");

  return { inputDir, outputDir, sourcePath };
}

async function writeMockThumbnails(input: { outputDir: string }) {
  await mkdir(path.join(input.outputDir, "thumbnails"), { recursive: true });
  await Promise.all([
    writeFile(path.join(input.outputDir, "thumbnail.png"), "thumbnail"),
    writeFile(path.join(input.outputDir, "thumbnails/opcao-01.png"), "thumbnail-1"),
    writeFile(path.join(input.outputDir, "thumbnails/opcao-02.png"), "thumbnail-2"),
    writeFile(path.join(input.outputDir, "thumbnails/opcao-03.png"), "thumbnail-3"),
    writeFile(path.join(input.outputDir, "thumbnail-brief.json"), "{}")
  ]);
  return {
    selected: "thumbnail.png" as const,
    options: ["thumbnails/opcao-01.png", "thumbnails/opcao-02.png", "thumbnails/opcao-03.png"],
    brief: "thumbnail-brief.json"
  };
}

function createPayloads(title = "Aula"): HorizontalPayloads {
  return {
    youtube: {
      title,
      description: "Desc",
      hashtags: ["#video"],
      chapters: [{ time: "00:00", title: "Inicio" }],
      language: "pt",
      madeForKids: false,
      privacyStatus: "private"
    },
    podcast: {
      title: "Podcast",
      description: "Desc",
      summary: "Resumo",
      notes: ["Nota"],
      audioPath: "podcast/podcast-audio.mp3"
    },
    x: {
      posts: ["Post 1"],
      hashtags: ["#video"],
      sourceVideo: "youtube/youtube.mp4"
    }
  };
}

describe("processHorizontalPackage", () => {
  it("creates a ready-to-approve YouTube and podcast package with background music", async () => {
    await withTempDir("media-factory-horizontal-", async (dir) => {
      const { inputDir, outputDir, sourcePath } = await createSource(dir);
      const runProjectJob = vi.fn(passProjectJob);
      const runExportJob = vi.fn(passExportJob);
      const extractPodcastAudio = vi.fn().mockImplementation(async (input: { outputPath: string }) => {
        await writeFile(input.outputPath, "audio");
      });
      const findBackgroundMusicTracks = vi.fn().mockReturnValue(["/music/track.mp3"]);
      const selectBackgroundMusicTrack = vi.fn().mockReturnValue("/music/track.mp3");
      const mixBackgroundMusicIntoVideo = vi.fn().mockImplementation(async (input: { outputVideoPath: string }) => {
        await writeFile(input.outputVideoPath, "video+music");
      });
      const transcribeWithWhisper = vi.fn().mockResolvedValue([
        { startSec: 0, endSec: 2, text: "Oi mundo", words: [] }
      ]);
      const generateHorizontalPayloads = vi.fn().mockResolvedValue(createPayloads("Titulo"));
      const generateYouTubeThumbnails = vi.fn(writeMockThumbnails);
      const progress = {
        info: vi.fn(),
        warn: vi.fn(),
        poll: vi.fn()
      };

      const result = await processHorizontalPackage({
        sourcePath,
        sourceHash: "abcdef1234567890",
        metadata: metadataWithAudio,
        inputDir,
        outputDir,
        ai: {
          enabled: true,
          provider: "openai",
          model: "gpt-4.1-mini",
          transcriptionModel: "whisper-1",
          language: "pt",
          promptVersions: {}
        },
        backgroundMusic: { enabled: true, musicDir: "/music", volume: 0.08, selection: "random" },
        now: new Date("2026-05-11T12:00:00.000Z"),
        deps: {
          runProjectJob,
          runExportJob,
          extractPodcastAudio,
          findBackgroundMusicTracks,
          selectBackgroundMusicTrack,
          mixBackgroundMusicIntoVideo,
          transcribeWithWhisper,
          generateHorizontalPayloads,
          generateYouTubeThumbnails,
          progress
        }
      });

      expect(result.packageDir).toBe(path.join(outputDir, "ready-to-approve", "2026-05-11 - Horizontal - Titulo"));
      expect(result.manifestPath).toBe(path.join(result.packageDir, "manifest.json"));
      await expect(readFile(path.join(result.packageDir, "youtube", "youtube.mp4"), "utf8")).resolves.toBe("video+music");
      await expect(readFile(path.join(result.packageDir, "podcast", "podcast-audio.mp3"), "utf8")).resolves.toBe("audio");
      await expect(readFile(path.join(result.packageDir, "youtube", "background-music.json"), "utf8")).resolves.toContain("/music/track.mp3");
      await expect(readFile(path.join(result.packageDir, "youtube", "payload.json"), "utf8")).resolves.toContain('"title": "Titulo"');
      await expect(readFile(path.join(result.packageDir, "youtube", "thumbnail.png"), "utf8")).resolves.toBe("thumbnail");
      await expect(readFile(path.join(result.packageDir, "youtube", "thumbnails/opcao-03.png"), "utf8")).resolves.toBe("thumbnail-3");
      await expect(readFile(path.join(result.packageDir, "transcript", "transcript.txt"), "utf8")).resolves.toBe("Oi mundo\n");
      await expect(readFile(path.join(result.packageDir, "transcript", "transcript.json"), "utf8")).resolves.toContain('"text": "Oi mundo"');
      await expect(stat(path.join(result.packageDir, ".workspace", "project_abcdef123456", "uploads", "source.mp4"))).resolves.toBeTruthy();

      const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
      expect(manifest.id).toBe("2026-05-11 - Horizontal - Titulo");
      expect(manifest.status).toBe("ready_to_approve");
      expect(manifest.pipeline).toBe("horizontal_youtube_podcast_x");
      expect(manifest.source).toMatchObject({
        path: sourcePath,
        hash: "abcdef1234567890",
        orientation: "horizontal",
        hasAudio: true
      });
      expect(manifest.outputs.map((output: { path: string }) => output.path)).toEqual([
        "youtube/youtube.mp4",
        "youtube/background-music.json",
        "podcast/podcast-audio.mp3",
        "youtube/title.txt",
        "youtube/description.txt",
        "youtube/hashtags.txt",
        "youtube/chapters.txt",
        "youtube/thumbnail.png",
        "youtube/thumbnails/opcao-01.png",
        "youtube/thumbnails/opcao-02.png",
        "youtube/thumbnails/opcao-03.png",
        "youtube/thumbnail-brief.json",
        "youtube/payload.json",
        "podcast/title.txt",
        "podcast/description.txt",
        "podcast/payload.json",
        "x/thread.json",
        "x/payload.json",
        "transcript/transcript.vtt",
        "transcript/transcript.txt",
        "transcript/transcript.json"
      ]);
      expect(manifest.publishPlan).toMatchObject({
        youtube: {
          mode: "dry-run",
          video: "youtube/youtube.mp4",
          backgroundMusic: "youtube/background-music.json"
        },
        spotify: {
          mode: "dry-run",
          audio: "podcast/podcast-audio.mp3"
        },
        x: {
          mode: "dry-run",
          thread: "x/thread.json"
        }
      });
      expect(runExportJob).toHaveBeenCalledWith(expect.objectContaining({
        settings: expect.objectContaining({
          renderMode: "fast_cuts",
          format: "original",
          resolution: "original",
          quality: "maxima",
          fileName: "youtube-clean.mp4",
          audioCleanup: false,
          audioDucking: false,
          sdrMode: "preserve"
        })
      }));
      expect(selectBackgroundMusicTrack).toHaveBeenCalledWith(["/music/track.mp3"], "abcdef1234567890");
      expect(mixBackgroundMusicIntoVideo).toHaveBeenCalledWith({
        inputVideoPath: expect.stringContaining("youtube-clean.mp4"),
        musicPath: "/music/track.mp3",
        outputVideoPath: expect.stringContaining(path.join("youtube", "youtube.mp4")),
        volume: 0.08
      });
      expect(transcribeWithWhisper).toHaveBeenCalledWith(expect.stringContaining(path.join("youtube", "youtube.mp4")), {
        model: "whisper-1",
        language: "pt"
      });
      expect(generateHorizontalPayloads).toHaveBeenCalledWith({
        transcriptText: "Oi mundo",
        transcriptSegments: [
          { startSec: 0, endSec: 2, text: "Oi mundo", words: [] }
        ],
        sourceTitle: "aula",
        ai: {
          enabled: true,
          provider: "openai",
          model: "gpt-4.1-mini",
          transcriptionModel: "whisper-1",
          language: "pt",
          promptVersions: {}
        }
      });
      expect(generateYouTubeThumbnails).toHaveBeenCalledWith({
        videoPath: expect.stringContaining(path.join("youtube", "youtube.mp4")),
        outputDir: expect.stringContaining("youtube"),
        title: "Titulo",
        durationSec: 120
      });
      expect(progress.info).toHaveBeenCalledWith("Preparando pacote horizontal");
      expect(progress.info).toHaveBeenCalledWith("Cortando silencios e preparando projeto");
      expect(progress.info).toHaveBeenCalledWith("Exportando YouTube em qualidade original");
      expect(progress.info).toHaveBeenCalledWith("Misturando musica de fundo");
      expect(progress.info).toHaveBeenCalledWith("Extraindo audio do podcast");
      expect(progress.info).toHaveBeenCalledWith("Transcrevendo audio");
      expect(progress.info).toHaveBeenCalledWith("Gerando payloads com IA");
      expect(progress.info).toHaveBeenCalledWith("Gerando thumbnails do YouTube");
    });
  });

  it("excludes podcast audio and skips extraction when the source has no audio", async () => {
    await withTempDir("media-factory-horizontal-no-audio-", async (dir) => {
      const { inputDir, outputDir, sourcePath } = await createSource(dir);
      const extractPodcastAudio = vi.fn();
      const findBackgroundMusicTracks = vi.fn();
      const mixBackgroundMusicIntoVideo = vi.fn();
      const transcribeWithWhisper = vi.fn().mockResolvedValue([
        { startSec: 0, endSec: 2, text: "Nao deve transcrever", words: [] }
      ]);
      const generateHorizontalPayloads = vi.fn().mockResolvedValue(createPayloads());
      const generateYouTubeThumbnails = vi.fn(writeMockThumbnails);

      const result = await processHorizontalPackage({
        sourcePath,
        sourceHash: "abcdef1234567890",
        metadata: { ...metadataWithAudio, hasAudio: false },
        inputDir,
        outputDir,
        backgroundMusic: { enabled: true, musicDir: "/music", volume: 0.08, selection: "random" },
        now: new Date("2026-05-11T12:00:00.000Z"),
        deps: {
          runProjectJob: vi.fn(passProjectJob),
          runExportJob: vi.fn(passExportJob),
          extractPodcastAudio,
          findBackgroundMusicTracks,
          mixBackgroundMusicIntoVideo,
          transcribeWithWhisper,
          generateHorizontalPayloads,
          generateYouTubeThumbnails
        }
      });

      await expect(readFile(path.join(result.packageDir, "youtube", "youtube.mp4"), "utf8")).resolves.toBe("video");
      const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
      expect(manifest.outputs.map((output: { type: string }) => output.type)).not.toContain("podcast_audio");
      expect(manifest.publishPlan.spotify.audio).toBeNull();
      expect(extractPodcastAudio).not.toHaveBeenCalled();
      expect(findBackgroundMusicTracks).not.toHaveBeenCalled();
      expect(mixBackgroundMusicIntoVideo).not.toHaveBeenCalled();
      expect(transcribeWithWhisper).not.toHaveBeenCalled();
      expect(generateHorizontalPayloads).toHaveBeenCalledWith({
        transcriptText: "",
        transcriptSegments: [],
        sourceTitle: "aula",
        ai: { enabled: false }
      });
    });
  });

  it("copies the clean render and excludes background output when no music tracks are found", async () => {
    await withTempDir("media-factory-horizontal-no-tracks-", async (dir) => {
      const { inputDir, outputDir, sourcePath } = await createSource(dir);
      const transcribeWithWhisper = vi.fn().mockResolvedValue([
        { startSec: 0, endSec: 2, text: "Nao deve transcrever", words: [] }
      ]);
      const generateHorizontalPayloads = vi.fn().mockResolvedValue(createPayloads());
      const generateYouTubeThumbnails = vi.fn(writeMockThumbnails);
      const progress = {
        info: vi.fn(),
        warn: vi.fn(),
        poll: vi.fn()
      };
      const result = await processHorizontalPackage({
        sourcePath,
        sourceHash: "abcdef1234567890",
        metadata: metadataWithAudio,
        inputDir,
        outputDir,
        backgroundMusic: { enabled: true, musicDir: "/music", volume: 0.08, selection: "random" },
        now: new Date("2026-05-11T12:00:00.000Z"),
        deps: {
          runProjectJob: vi.fn(passProjectJob),
          runExportJob: vi.fn(passExportJob),
          extractPodcastAudio: vi.fn().mockImplementation(async (input: { outputPath: string }) => {
            await writeFile(input.outputPath, "audio");
          }),
          findBackgroundMusicTracks: vi.fn().mockReturnValue([]),
          selectBackgroundMusicTrack: vi.fn().mockReturnValue(null),
          mixBackgroundMusicIntoVideo: vi.fn(),
          transcribeWithWhisper,
          generateHorizontalPayloads,
          generateYouTubeThumbnails,
          progress
        }
      });

      await expect(readFile(path.join(result.packageDir, "youtube", "youtube.mp4"), "utf8")).resolves.toBe("video");
      await expect(readFile(path.join(result.packageDir, "youtube", "background-music.json"), "utf8")).rejects.toThrow();
      const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
      expect(manifest.outputs.map((output: { type: string }) => output.type)).not.toContain("youtube_background_music");
      expect(manifest.publishPlan.youtube).not.toHaveProperty("backgroundMusic");
      expect(transcribeWithWhisper).not.toHaveBeenCalled();
      expect(generateHorizontalPayloads).toHaveBeenCalledWith({
        transcriptText: "",
        transcriptSegments: [],
        sourceTitle: "aula",
        ai: { enabled: false }
      });
      expect(progress.info).toHaveBeenCalledWith("Gerando payloads");
      expect(progress.info).not.toHaveBeenCalledWith("Gerando payloads com IA");
      expect(progress.info).not.toHaveBeenCalledWith("Transcrevendo audio");
    });
  });

  it("marks the manifest failed when an export job records failure", async () => {
    await withTempDir("media-factory-horizontal-failed-export-", async (dir) => {
      const { inputDir, outputDir, sourcePath } = await createSource(dir);

      await expect(
        processHorizontalPackage({
          sourcePath,
          sourceHash: "abcdef1234567890",
          metadata: metadataWithAudio,
          inputDir,
          outputDir,
          now: new Date("2026-05-11T12:00:00.000Z"),
          deps: {
            runProjectJob: vi.fn(passProjectJob),
            runExportJob: vi.fn(async (input: { jobId: string; jobs: JobStore }) => {
              input.jobs.update(input.jobId, {
                status: "failed",
                stage: "failed",
                message: "Export failed",
                error: "encoder exploded"
              });
            })
          }
        })
      ).rejects.toThrow("Export job failed: encoder exploded");

      const manifestPath = path.join(outputDir, "ready-to-approve", "2026-05-11-aula-abcdef12", "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      expect(manifest.status).toBe("failed");
      expect(manifest.error).toEqual({
        stage: "horizontal_pipeline",
        message: "Export job failed: encoder exploded"
      });
    });
  });

  it("rejects malformed source hashes before creating package paths", async () => {
    await withTempDir("media-factory-horizontal-bad-hash-", async (dir) => {
      const { inputDir, outputDir, sourcePath } = await createSource(dir);

      await expect(
        processHorizontalPackage({
          sourcePath,
          sourceHash: "../not-a-hash",
          metadata: metadataWithAudio,
          inputDir,
          outputDir,
          now: new Date("2026-05-11T12:00:00.000Z"),
          deps: {
            runProjectJob: vi.fn(passProjectJob),
            runExportJob: vi.fn(passExportJob)
          }
        })
      ).rejects.toThrow("Media Factory source hash must be a hex string");
    });
  });
});
