import { describe, expect, it, vi } from "vitest";
import { probeMedia, type MediaProbeProcessRunner } from "./probe";

function createRunner(stdout: string): MediaProbeProcessRunner {
  return vi.fn().mockResolvedValue({ exitCode: 0, stdout, stderr: "" });
}

describe("probeMedia", () => {
  it("throws a clear error when ffprobe returns malformed JSON", async () => {
    await expect(probeMedia("/tmp/source.mp4", createRunner("{"))).rejects.toThrow("malformed JSON");
  });

  it("throws a clear error when ffprobe returns no video stream", async () => {
    const runner = createRunner(JSON.stringify({ streams: [], format: { duration: "5" } }));

    await expect(probeMedia("/tmp/source.mp4", runner)).rejects.toThrow("no video stream");
  });

  it("rejects an fps value with a zero denominator", async () => {
    const runner = createRunner(
      JSON.stringify({
        streams: [{ codec_type: "video", width: 1920, height: 1080, r_frame_rate: "25/0" }],
        format: { duration: "5" }
      })
    );

    await expect(probeMedia("/tmp/source.mp4", runner)).rejects.toThrow("invalid fps");
  });

  it("returns hasAudio when an audio stream is present", async () => {
    const runner = createRunner(
      JSON.stringify({
        streams: [
          { codec_type: "video", width: 1920, height: 1080, r_frame_rate: "30000/1001" },
          { codec_type: "audio" }
        ],
        format: { duration: "5.1234" }
      })
    );

    await expect(probeMedia("/tmp/source.mp4", runner)).resolves.toEqual({
      durationSec: 5.123,
      width: 1920,
      height: 1080,
      fps: 29.97,
      hasAudio: true
    });
  });

  it("reports display dimensions for rotated portrait video", async () => {
    const runner = createRunner(
      JSON.stringify({
        streams: [
          {
            codec_type: "video",
            width: 1920,
            height: 1080,
            r_frame_rate: "30/1",
            side_data_list: [{}, { rotation: 90 }]
          },
          { codec_type: "audio" }
        ],
        format: { duration: "12.5" }
      })
    );

    await expect(probeMedia("/tmp/source.mov", runner)).resolves.toEqual({
      durationSec: 12.5,
      width: 1080,
      height: 1920,
      fps: 30,
      hasAudio: true
    });
  });
});
