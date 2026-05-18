import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  BACKGROUND_MUSIC_TIMEOUT_MS,
  findBackgroundMusicTracks,
  mixBackgroundMusicIntoVideo,
  selectBackgroundMusicTrack,
  type MediaFactoryMusicProcessRunner
} from "./music";

describe("findBackgroundMusicTracks", () => {
  it("recursively finds supported music files sorted and ignores unsupported files", () => {
    const rootDir = path.join(os.tmpdir(), `media-factory-music-${randomUUID()}`);
    const nestedDir = path.join(rootDir, "nested");
    const deeperDir = path.join(nestedDir, "deeper");
    mkdirSync(deeperDir, { recursive: true });
    writeFileSync(path.join(rootDir, "voice.txt"), "");
    writeFileSync(path.join(rootDir, "theme.MP3"), "");
    writeFileSync(path.join(nestedDir, "bed.wav"), "");
    writeFileSync(path.join(nestedDir, "cover.jpg"), "");
    writeFileSync(path.join(deeperDir, "loop.ogg"), "");

    expect(findBackgroundMusicTracks(rootDir)).toEqual([
      path.join(nestedDir, "bed.wav"),
      path.join(deeperDir, "loop.ogg"),
      path.join(rootDir, "theme.MP3")
    ]);
  });

  it("returns an empty list when the directory does not exist", () => {
    expect(findBackgroundMusicTracks(path.join(os.tmpdir(), `missing-music-${randomUUID()}`))).toEqual([]);
  });
});

describe("selectBackgroundMusicTrack", () => {
  it("returns null for an empty track list", () => {
    expect(selectBackgroundMusicTrack([])).toBeNull();
  });

  it("selects deterministically when a seed is provided", () => {
    const tracks = ["/music/a.mp3", "/music/b.wav", "/music/c.ogg"];

    expect(selectBackgroundMusicTrack(tracks, "launch-001")).toBe(selectBackgroundMusicTrack(tracks, "launch-001"));
  });
});

describe("mixBackgroundMusicIntoVideo", () => {
  it("runs ffmpeg with stream-looped background music while copying video", async () => {
    const processRunner = vi.fn<MediaFactoryMusicProcessRunner>().mockResolvedValue({
      exitCode: 0,
      stdout: "",
      stderr: ""
    });

    await mixBackgroundMusicIntoVideo({
      inputVideoPath: "/media/input/youtube.mp4",
      musicPath: "/media/music/bed.mp3",
      outputVideoPath: "/media/output/youtube-with-music.mp4",
      volume: 0.08,
      ffmpegPath: "/usr/local/bin/ffmpeg",
      processRunner
    });

    expect(processRunner).toHaveBeenCalledWith(
      "/usr/local/bin/ffmpeg",
      [
        "-y",
        "-i",
        "/media/input/youtube.mp4",
        "-stream_loop",
        "-1",
        "-i",
        "/media/music/bed.mp3",
        "-filter_complex",
        "[1:a]volume=0.08[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]",
        "-map",
        "0:v:0",
        "-map",
        "[aout]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "/media/output/youtube-with-music.mp4"
      ],
      { timeoutMs: BACKGROUND_MUSIC_TIMEOUT_MS }
    );
  });

  it("throws stderr when ffmpeg exits with a nonzero status", async () => {
    const processRunner = vi.fn<MediaFactoryMusicProcessRunner>().mockResolvedValue({
      exitCode: 1,
      stdout: "stdout details",
      stderr: "mix failed"
    });

    await expect(
      mixBackgroundMusicIntoVideo({
        inputVideoPath: "/media/input/youtube.mp4",
        musicPath: "/media/music/bed.mp3",
        outputVideoPath: "/media/output/youtube-with-music.mp4",
        volume: 0.08,
        ffmpegPath: "ffmpeg",
        processRunner
      })
    ).rejects.toThrow("mix failed");
  });

  it.each([-0.01, 0.31, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid background music volume %s",
    async (volume) => {
      const processRunner = vi.fn<MediaFactoryMusicProcessRunner>();

      await expect(
        mixBackgroundMusicIntoVideo({
          inputVideoPath: "/media/input/youtube.mp4",
          musicPath: "/media/music/bed.mp3",
          outputVideoPath: "/media/output/youtube-with-music.mp4",
          volume,
          ffmpegPath: "ffmpeg",
          processRunner
        })
      ).rejects.toThrow("Background music volume must be between 0 and 0.3");
      expect(processRunner).not.toHaveBeenCalled();
    }
  );
});
