import { describe, expect, it, vi } from "vitest";
import {
  extractPodcastAudio,
  PODCAST_AUDIO_TIMEOUT_MS,
  type MediaFactoryProcessRunner
} from "./audio";

describe("extractPodcastAudio", () => {
  it("runs ffmpeg with MP3 podcast audio extraction arguments", async () => {
    const processRunner = vi.fn<MediaFactoryProcessRunner>().mockResolvedValue({
      exitCode: 0,
      stdout: "",
      stderr: ""
    });

    await extractPodcastAudio({
      inputPath: "/media/input/video.mp4",
      outputPath: "/media/output/podcast.mp3",
      ffmpegPath: "/usr/local/bin/ffmpeg",
      processRunner
    });

    expect(processRunner).toHaveBeenCalledWith(
      "/usr/local/bin/ffmpeg",
      [
        "-y",
        "-i",
        "/media/input/video.mp4",
        "-vn",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        "-ar",
        "44100",
        "/media/output/podcast.mp3"
      ],
      { timeoutMs: PODCAST_AUDIO_TIMEOUT_MS }
    );
  });

  it("throws stderr when ffmpeg exits with a nonzero status", async () => {
    const processRunner = vi.fn<MediaFactoryProcessRunner>().mockResolvedValue({
      exitCode: 1,
      stdout: "stdout details",
      stderr: "ffmpeg failed"
    });

    await expect(
      extractPodcastAudio({
        inputPath: "/media/input/video.mp4",
        outputPath: "/media/output/podcast.mp3",
        ffmpegPath: "ffmpeg",
        processRunner
      })
    ).rejects.toThrow("ffmpeg failed");
  });
});
