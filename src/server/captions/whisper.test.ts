import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withTempDir } from "../../test/fixtures";
import { transcribeWithWhisper, type WhisperProcessRunner } from "./whisper";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("transcribeWithWhisper", () => {
  it("extracts compact audio and requests OpenAI Whisper word timestamps", async () => {
    await withTempDir("ai-editor-whisper-", async (dir) => {
      const mediaPath = path.join(dir, "renders", "rough-cut.mp4");
      const audioPath = path.join(dir, "renders", "openai-transcription.m4a");
      await mkdir(path.dirname(mediaPath), { recursive: true });
      await writeFile(mediaPath, "fake video");
      const processRunner: WhisperProcessRunner = vi.fn().mockImplementation(async (_command, args) => {
        await writeFile(String(args.at(-1)), "fake audio");
        return { exitCode: 0, stdout: "", stderr: "" };
      });
      const create = vi.fn().mockResolvedValue({
        words: [
          { start: 0.12, end: 0.4, word: "Oi" },
          { start: 0.45, end: 1.4, word: "mundo" },
          { start: 1.5, end: 1.9, word: "Tudo" },
          { start: 2, end: 2.8, word: "certo" }
        ],
        segments: [
          { start: 0.12, end: 1.4, text: "Oi mundo" },
          { start: 1.5, end: 2.8, text: "Tudo certo" }
        ]
      });

      const segments = await transcribeWithWhisper(mediaPath, {
        apiKey: "test-key",
        model: "whisper-1",
        language: "pt",
        processRunner,
        openaiClient: {
          audio: {
            transcriptions: {
              create
            }
          }
        }
      });

      expect(processRunner).toHaveBeenCalledWith("ffmpeg", expect.arrayContaining([
        "-i",
        mediaPath,
        "-b:a",
        "48k",
        audioPath
      ]), expect.any(Object));
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        model: "whisper-1",
        language: "pt",
        response_format: "verbose_json",
        timestamp_granularities: ["word", "segment"]
      }));
      expect(segments).toEqual([
        {
          startSec: 0.12,
          endSec: 1.4,
          text: "Oi mundo",
          words: [
            { startSec: 0.12, endSec: 0.4, text: "Oi" },
            { startSec: 0.45, endSec: 1.4, text: "mundo" }
          ]
        },
        {
          startSec: 1.5,
          endSec: 2.8,
          text: "Tudo certo",
          words: [
            { startSec: 1.5, endSec: 1.9, text: "Tudo" },
            { startSec: 2, endSec: 2.8, text: "certo" }
          ]
        }
      ]);
    });
  });

  it("requires an OpenAI key unless an injected client is provided", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(transcribeWithWhisper("/tmp/video.mp4", {
      apiKey: "",
      processRunner: vi.fn()
    })).rejects.toThrow("OPENAI_API_KEY");
  });
});
