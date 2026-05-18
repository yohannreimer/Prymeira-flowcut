import { getConfig } from "../config";
import { runProcess } from "../media/process";

export type MediaFactoryProcessRunner = typeof runProcess;

export const PODCAST_AUDIO_TIMEOUT_MS = 30 * 60 * 1000;

export type ExtractPodcastAudioInput = {
  inputPath: string;
  outputPath: string;
  ffmpegPath?: string;
  processRunner?: MediaFactoryProcessRunner;
};

export async function extractPodcastAudio(input: ExtractPodcastAudioInput): Promise<void> {
  const ffmpegPath = input.ffmpegPath ?? getConfig().ffmpegPath;
  const processRunner = input.processRunner ?? runProcess;
  const result = await processRunner(
    ffmpegPath,
    ["-y", "-i", input.inputPath, "-vn", "-c:a", "libmp3lame", "-b:a", "192k", "-ar", "44100", input.outputPath],
    { timeoutMs: PODCAST_AUDIO_TIMEOUT_MS }
  );

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || "Podcast audio extraction failed");
  }
}
