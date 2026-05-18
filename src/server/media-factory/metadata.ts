import fs from "node:fs/promises";
import path from "node:path";
import type { WhisperSegment } from "../captions/whisper";
import type { HorizontalPayloads } from "./ai-payloads";

export type InitialMetadata = {
  title: string;
  description: string;
  hashtags: string[];
  xThread: string[];
};

type InitialMetadataInput = {
  sourcePath: string;
};

type WriteHorizontalMetadataPackageInput = InitialMetadataInput & {
  packageDir: string;
  transcript?: {
    segments: WhisperSegment[];
    vtt: string;
    text: string;
  };
  payloads?: HorizontalPayloads;
};

export function createInitialMetadata({ sourcePath }: InitialMetadataInput): InitialMetadata {
  const title = getTitleFromSourcePath(sourcePath);

  return {
    title,
    description: `Conteudo gerado automaticamente a partir de ${title}.`,
    hashtags: ["#video", "#conteudo"],
    xThread: [
      `Novo conteudo: ${title}`,
      "Assista ao video completo para ver os pontos principais.",
      "Qual foi o insight mais util para voce?"
    ]
  };
}

export async function writeHorizontalMetadataPackage({
  packageDir,
  sourcePath,
  transcript,
  payloads
}: WriteHorizontalMetadataPackageInput): Promise<void> {
  const metadata = createInitialMetadata({ sourcePath });
  const youtubeDir = path.join(packageDir, "youtube");
  const podcastDir = path.join(packageDir, "podcast");
  const xDir = path.join(packageDir, "x");
  const transcriptDir = path.join(packageDir, "transcript");

  await Promise.all([
    fs.mkdir(youtubeDir, { recursive: true }),
    fs.mkdir(podcastDir, { recursive: true }),
    fs.mkdir(xDir, { recursive: true }),
    fs.mkdir(transcriptDir, { recursive: true })
  ]);

  await Promise.all([
    fs.writeFile(path.join(youtubeDir, "title.txt"), `${payloads?.youtube.title ?? metadata.title}\n`),
    fs.writeFile(path.join(youtubeDir, "description.txt"), `${payloads?.youtube.description ?? metadata.description}\n`),
    fs.writeFile(path.join(youtubeDir, "hashtags.txt"), `${(payloads?.youtube.hashtags ?? metadata.hashtags).join(" ")}\n`),
    fs.writeFile(path.join(youtubeDir, "chapters.txt"), formatChapters(payloads?.youtube.chapters)),
    fs.writeFile(path.join(podcastDir, "title.txt"), `${payloads?.podcast.title ?? metadata.title}\n`),
    fs.writeFile(path.join(podcastDir, "description.txt"), `${payloads?.podcast.description ?? metadata.description}\n`),
    fs.writeFile(path.join(xDir, "thread.json"), `${JSON.stringify({ posts: payloads?.x.posts ?? metadata.xThread }, null, 2)}\n`),
    fs.writeFile(path.join(transcriptDir, "transcript.vtt"), transcript?.vtt ?? "WEBVTT\n\n")
  ]);

  await Promise.all([
    ...(payloads
      ? [
          fs.writeFile(path.join(youtubeDir, "payload.json"), `${JSON.stringify(payloads.youtube, null, 2)}\n`),
          fs.writeFile(path.join(podcastDir, "payload.json"), `${JSON.stringify(payloads.podcast, null, 2)}\n`),
          fs.writeFile(path.join(xDir, "payload.json"), `${JSON.stringify(payloads.x, null, 2)}\n`)
        ]
      : []),
    ...(transcript
      ? [
          fs.writeFile(path.join(transcriptDir, "transcript.txt"), `${transcript.text}\n`),
          fs.writeFile(path.join(transcriptDir, "transcript.json"), `${JSON.stringify({ segments: transcript.segments }, null, 2)}\n`)
        ]
      : [])
  ]);
}

function getTitleFromSourcePath(sourcePath: string): string {
  const title = path
    .parse(sourcePath)
    .name.replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return title || "Video";
}

function formatChapters(chapters: HorizontalPayloads["youtube"]["chapters"] | undefined): string {
  const normalizedChapters = chapters?.length ? chapters : [{ time: "00:00", title: "Inicio" }];
  return `${normalizedChapters.map((chapter) => `${chapter.time} ${chapter.title}`).join("\n")}\n`;
}
