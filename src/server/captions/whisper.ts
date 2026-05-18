import { createReadStream } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { getConfig } from "../config";
import { runProcess } from "../media/process";
import type { ProcessOptions, ProcessResult } from "../media/process";

export type WhisperSegment = {
  startSec: number;
  endSec: number;
  text: string;
  words: WhisperWord[];
};

export type WhisperWord = {
  startSec: number;
  endSec: number;
  text: string;
};

export type WhisperProcessRunner = (
  command: string,
  args: string[],
  options?: ProcessOptions
) => Promise<ProcessResult>;

type OpenAITranscriptionClient = {
  audio: {
    transcriptions: {
      create: (input: Record<string, unknown>) => Promise<unknown>;
    };
  };
};

export type WhisperTranscriptionDeps = {
  apiKey?: string;
  model?: string;
  language?: string;
  openaiClient?: OpenAITranscriptionClient;
  processRunner?: WhisperProcessRunner;
};

export const DEFAULT_WHISPER_TIMEOUT_MS = 30 * 60 * 1000;

export async function transcribeWithWhisper(
  mediaPath: string,
  deps: WhisperTranscriptionDeps | WhisperProcessRunner = {}
): Promise<WhisperSegment[]> {
  if (typeof deps === "function") {
    return transcribeWithLocalWhisper(mediaPath, deps);
  }

  if (process.env.WHISPER_PROVIDER === "local") {
    return transcribeWithLocalWhisper(mediaPath, deps.processRunner);
  }

  return transcribeWithOpenAIWhisper(mediaPath, deps);
}

async function transcribeWithOpenAIWhisper(mediaPath: string, deps: WhisperTranscriptionDeps) {
  const apiKey = deps.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey && !deps.openaiClient) {
    throw new Error("OPENAI_API_KEY não configurada. Defina a chave no ambiente ou em .env.local.");
  }

  const audioPath = await extractTranscriptionAudio(mediaPath, deps.processRunner);
  const client = deps.openaiClient ?? (new OpenAI({ apiKey }) as unknown as OpenAITranscriptionClient);
  const transcription = await client.audio.transcriptions.create({
    file: createReadStream(audioPath),
    model: deps.model ?? process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1",
    language: deps.language ?? process.env.OPENAI_TRANSCRIPTION_LANGUAGE ?? "pt",
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"]
  });

  return parseOpenAITranscriptionSegments(transcription);
}

async function extractTranscriptionAudio(mediaPath: string, processRunner: WhisperProcessRunner = runProcess) {
  const config = getConfig();
  const audioPath = path.join(path.dirname(mediaPath), "openai-transcription.m4a");
  const result = await processRunner(config.ffmpegPath, [
    "-y",
    "-i",
    mediaPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "aac",
    "-b:a",
    "48k",
    audioPath
  ], { timeoutMs: DEFAULT_WHISPER_TIMEOUT_MS });

  if (result.exitCode !== 0) {
    throw new Error(`Falha ao preparar áudio para transcrição: ${result.stderr || result.stdout}`);
  }

  return audioPath;
}

async function transcribeWithLocalWhisper(
  mediaPath: string,
  processRunner: WhisperProcessRunner = runProcess
): Promise<WhisperSegment[]> {
  const scriptPath = path.resolve(process.cwd(), "scripts", "transcribe_faster_whisper.py");
  const result = await processRunner("python3", [scriptPath, mediaPath, process.env.WHISPER_MODEL ?? "base"], {
    timeoutMs: DEFAULT_WHISPER_TIMEOUT_MS
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || "Falha na transcrição local com Whisper");
  }

  const parsed = JSON.parse(result.stdout) as { segments?: Array<WhisperSegment & { words?: WhisperWord[] }> };
  return Array.isArray(parsed.segments) ? parsed.segments.map((segment) => ({
    ...segment,
    words: segment.words ?? []
  })) : [];
}

function parseOpenAITranscriptionSegments(transcription: unknown) {
  const parsed = transcription as {
    text?: unknown;
    words?: Array<{ start?: unknown; end?: unknown; word?: unknown; text?: unknown }>;
    segments?: Array<{
      start?: unknown;
      end?: unknown;
      text?: unknown;
      words?: Array<{ start?: unknown; end?: unknown; word?: unknown; text?: unknown }>;
    }>;
  };
  const topLevelWords = parseOpenAIWords(parsed.words);

  if (Array.isArray(parsed.segments)) {
    return parsed.segments
      .map((segment) => {
        const startSec = Number(segment.start);
        const endSec = Number(segment.end);
        const segmentWords = parseOpenAIWords(segment.words);
        return {
          startSec,
          endSec,
          text: String(segment.text ?? "").trim(),
          words: segmentWords.length > 0 ? segmentWords : wordsInsideRange(topLevelWords, startSec, endSec)
        };
      })
      .filter((segment) => Number.isFinite(segment.startSec) && Number.isFinite(segment.endSec) && segment.endSec > segment.startSec && segment.text.length > 0);
  }

  if (topLevelWords.length > 0) {
    return [{
      startSec: topLevelWords[0].startSec,
      endSec: topLevelWords[topLevelWords.length - 1].endSec,
      text: topLevelWords.map((word) => word.text).join(" "),
      words: topLevelWords
    }];
  }

  if (typeof parsed.text === "string" && parsed.text.trim().length > 0) {
    return [{ startSec: 0, endSec: 1, text: parsed.text.trim(), words: [] }];
  }

  return [];
}

function parseOpenAIWords(words: unknown): WhisperWord[] {
  if (!Array.isArray(words)) return [];
  return words
    .map((word) => {
      const parsed = word as { start?: unknown; end?: unknown; word?: unknown; text?: unknown };
      return {
        startSec: Number(parsed.start),
        endSec: Number(parsed.end),
        text: String(parsed.word ?? parsed.text ?? "").trim()
      };
    })
    .filter((word) => Number.isFinite(word.startSec) && Number.isFinite(word.endSec) && word.endSec > word.startSec && word.text.length > 0);
}

function wordsInsideRange(words: WhisperWord[], startSec: number, endSec: number) {
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) return [];
  return words.filter((word) => {
    const midpoint = word.startSec + (word.endSec - word.startSec) / 2;
    return midpoint >= startSec - 0.05 && midpoint <= endSec + 0.05;
  });
}

export function toVttTimestamp(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const ms = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

export function createVtt(segments: WhisperSegment[]) {
  const cues = segments.map((segment, index) => [
    String(index + 1),
    `${toVttTimestamp(segment.startSec)} --> ${toVttTimestamp(segment.endSec)}`,
    segment.text
  ].join("\n"));
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}
