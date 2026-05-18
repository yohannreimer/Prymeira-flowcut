import { describe, expect, it } from "vitest";
import { analyzeSilence, parseSilencedetectOutput } from "./silence";

describe("parseSilencedetectOutput", () => {
  it("extracts silence intervals from ffmpeg output", () => {
    const output = [
      "[silencedetect @ 0x1] silence_start: 1.24",
      "[silencedetect @ 0x1] silence_end: 2.50 | silence_duration: 1.26",
      "[silencedetect @ 0x1] silence_start: 8",
      "[silencedetect @ 0x1] silence_end: 10.25 | silence_duration: 2.25"
    ].join("\n");

    expect(parseSilencedetectOutput(output)).toEqual([
      { startSec: 1.24, endSec: 2.5, durationSec: 1.26 },
      { startSec: 8, endSec: 10.25, durationSec: 2.25 }
    ]);
  });

  it("ignores incomplete silence pairs", () => {
    expect(parseSilencedetectOutput("silence_start: 4.2")).toEqual([]);
  });

  it("ignores malformed numeric tokens", () => {
    const output = [
      "silence_start: 1.2.3",
      "silence_end: 2.50 | silence_duration: 1.3",
      "silence_start: 4",
      "silence_end: 5.2abc | silence_duration: 1.2"
    ].join("\n");

    expect(parseSilencedetectOutput(output)).toEqual([]);
  });

  it("ignores silence ends without a start", () => {
    expect(parseSilencedetectOutput("silence_end: 2.50 | silence_duration: 1.3")).toEqual([]);
  });

  it("uses the latest start when starts repeat before an end", () => {
    const output = [
      "silence_start: 1",
      "silence_start: 3.25",
      "silence_end: 5 | silence_duration: 1.75"
    ].join("\n");

    expect(parseSilencedetectOutput(output)).toEqual([{ startSec: 3.25, endSec: 5, durationSec: 1.75 }]);
  });

  it("ignores incoherent intervals", () => {
    const output = [
      "silence_start: 8",
      "silence_end: 7.5 | silence_duration: 1.5",
      "silence_start: 10",
      "silence_end: 11 | silence_duration: -1"
    ].join("\n");

    expect(parseSilencedetectOutput(output)).toEqual([]);
  });

  it("derives duration from the interval when printed duration is mismatched", () => {
    const output = ["silence_start: 1", "silence_end: 2 | silence_duration: 99"].join("\n");

    expect(parseSilencedetectOutput(output)).toEqual([{ startSec: 1, endSec: 2, durationSec: 1 }]);
  });
});

describe("analyzeSilence", () => {
  it("passes a default timeout to ffmpeg and parses stderr", async () => {
    const calls: Array<{ command: string; args: string[]; timeoutMs?: number }> = [];
    const intervals = await analyzeSilence(
      "/tmp/input.mp4",
      { noiseDb: -35, minDurationSec: 0.4 },
      async (command, args, options) => {
        calls.push({ command, args, timeoutMs: options?.timeoutMs });
        return {
          exitCode: 0,
          stdout: "",
          stderr: ["silence_start: 1", "silence_end: 1.5 | silence_duration: 0.5"].join("\n")
        };
      }
    );

    expect(intervals).toEqual([{ startSec: 1, endSec: 1.5, durationSec: 0.5 }]);
    expect(calls).toEqual([
      {
        command: "ffmpeg",
        args: [
          "-hide_banner",
          "-i",
          "/tmp/input.mp4",
          "-af",
          "silencedetect=noise=-35dB:d=0.4",
          "-f",
          "null",
          "-"
        ],
        timeoutMs: 120000
      }
    ]);
  });
});
