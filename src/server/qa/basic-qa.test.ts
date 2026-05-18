import { beforeEach, describe, expect, it, vi } from "vitest";
import { BLACKDETECT_TIMEOUT_MS, runBasicQa } from "./basic-qa";
import { probeMedia } from "../media/probe";
import { runProcess } from "../media/process";

vi.mock("../config", () => ({
  getConfig: () => ({ ffmpegPath: "/usr/bin/ffmpeg", ffprobePath: "/usr/bin/ffprobe" })
}));

vi.mock("../media/probe", () => ({
  probeMedia: vi.fn()
}));

vi.mock("../media/process", () => ({
  runProcess: vi.fn()
}));

describe("runBasicQa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warns for short videos and detected black frame regions", async () => {
    vi.mocked(probeMedia).mockResolvedValue({
      durationSec: 0.8,
      width: 1280,
      height: 720,
      fps: 30,
      hasAudio: true
    });
    vi.mocked(runProcess).mockResolvedValue({
      exitCode: 0,
      stdout: "",
      stderr: [
        "[blackdetect @ 0x1] black_start:0 black_end:0.7 black_duration:0.7",
        "[blackdetect @ 0x1] black_start:4 black_end:5 black_duration:1"
      ].join("\n")
    });

    await expect(runBasicQa("/tmp/render.mp4")).resolves.toEqual({
      status: "warning",
      warnings: [
        "Rendered video is shorter than one second.",
        "Detected possible black frame regions: [blackdetect @ 0x1] black_start:0 black_end:0.7 black_duration:0.7 | [blackdetect @ 0x1] black_start:4 black_end:5 black_duration:1"
      ]
    });
    expect(runProcess).toHaveBeenCalledWith(
      "/usr/bin/ffmpeg",
      [
        "-hide_banner",
        "-i",
        "/tmp/render.mp4",
        "-vf",
        "blackdetect=d=0.5:pix_th=0.1",
        "-an",
        "-f",
        "null",
        "-"
      ],
      { timeoutMs: BLACKDETECT_TIMEOUT_MS }
    );
  });

  it("warns when black-frame checks exit non-zero", async () => {
    vi.mocked(probeMedia).mockResolvedValue({
      durationSec: 8,
      width: 1280,
      height: 720,
      fps: 30,
      hasAudio: true
    });
    vi.mocked(runProcess).mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "ffmpeg failed"
    });

    await expect(runBasicQa("/tmp/render.mp4")).resolves.toEqual({
      status: "warning",
      warnings: ["Black-frame QA check failed."]
    });
  });

  it("turns rejected black-frame checks into QA warnings", async () => {
    vi.mocked(probeMedia).mockResolvedValue({
      durationSec: 8,
      width: 1280,
      height: 720,
      fps: 30,
      hasAudio: true
    });
    vi.mocked(runProcess).mockRejectedValue(new Error("Process timed out after 30000ms"));

    await expect(runBasicQa("/tmp/render.mp4")).resolves.toEqual({
      status: "warning",
      warnings: ["Black-frame QA check failed."]
    });
  });

  it("warns when audio is expected but the render has no audio track", async () => {
    vi.mocked(probeMedia).mockResolvedValue({
      durationSec: 8,
      width: 1280,
      height: 720,
      fps: 30,
      hasAudio: false
    });
    vi.mocked(runProcess).mockResolvedValue({
      exitCode: 0,
      stdout: "",
      stderr: ""
    });

    await expect(runBasicQa("/tmp/render.mp4", { expectedHasAudio: true })).resolves.toEqual({
      status: "warning",
      warnings: ["Rendered video has no audio track."]
    });
  });

  it("does not warn for missing audio when audio is not expected", async () => {
    vi.mocked(probeMedia).mockResolvedValue({
      durationSec: 8,
      width: 1280,
      height: 720,
      fps: 30,
      hasAudio: false
    });
    vi.mocked(runProcess).mockResolvedValue({
      exitCode: 0,
      stdout: "",
      stderr: ""
    });

    await expect(runBasicQa("/tmp/render.mp4", { expectedHasAudio: false })).resolves.toEqual({
      status: "passed",
      warnings: []
    });
  });
});
