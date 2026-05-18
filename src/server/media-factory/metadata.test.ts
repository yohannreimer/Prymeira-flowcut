import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HorizontalPayloads } from "./ai-payloads";
import { createInitialMetadata, writeHorizontalMetadataPackage } from "./metadata";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(tmpdir(), "media-factory-metadata-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { force: true, recursive: true });
});

describe("createInitialMetadata", () => {
  it("creates deterministic metadata from a normalized filename stem", () => {
    expect(createInitialMetadata({ sourcePath: "/media/Entrada/meu_video-final  01.mp4" })).toEqual({
      title: "meu video final 01",
      description: "Conteudo gerado automaticamente a partir de meu video final 01.",
      hashtags: ["#video", "#conteudo"],
      xThread: [
        "Novo conteudo: meu video final 01",
        "Assista ao video completo para ver os pontos principais.",
        "Qual foi o insight mais util para voce?"
      ]
    });
  });

  it("falls back to Video when the filename stem has no title text", () => {
    expect(createInitialMetadata({ sourcePath: path.join(tempDir, "   .mp4") })).toEqual({
      title: "Video",
      description: "Conteudo gerado automaticamente a partir de Video.",
      hashtags: ["#video", "#conteudo"],
      xThread: [
        "Novo conteudo: Video",
        "Assista ao video completo para ver os pontos principais.",
        "Qual foi o insight mais util para voce?"
      ]
    });
  });
});

describe("writeHorizontalMetadataPackage", () => {
  it("writes the horizontal metadata package files", async () => {
    const packageDir = path.join(tempDir, "package");
    const sourcePath = path.join(tempDir, "demo_video-final.mp4");

    await writeHorizontalMetadataPackage({ packageDir, sourcePath });

    await expect(fs.readFile(path.join(packageDir, "youtube", "title.txt"), "utf8")).resolves.toBe(
      "demo video final\n"
    );
    await expect(fs.readFile(path.join(packageDir, "youtube", "description.txt"), "utf8")).resolves.toBe(
      "Conteudo gerado automaticamente a partir de demo video final.\n"
    );
    await expect(fs.readFile(path.join(packageDir, "youtube", "hashtags.txt"), "utf8")).resolves.toBe(
      "#video #conteudo\n"
    );
    await expect(fs.readFile(path.join(packageDir, "youtube", "chapters.txt"), "utf8")).resolves.toBe(
      "00:00 Inicio\n"
    );
    await expect(fs.readFile(path.join(packageDir, "podcast", "title.txt"), "utf8")).resolves.toBe(
      "demo video final\n"
    );
    await expect(fs.readFile(path.join(packageDir, "podcast", "description.txt"), "utf8")).resolves.toBe(
      "Conteudo gerado automaticamente a partir de demo video final.\n"
    );
    await expect(fs.readFile(path.join(packageDir, "x", "thread.json"), "utf8")).resolves.toBe(
      `${JSON.stringify(
        {
          posts: [
            "Novo conteudo: demo video final",
            "Assista ao video completo para ver os pontos principais.",
            "Qual foi o insight mais util para voce?"
          ]
        },
        null,
        2
      )}\n`
    );
    await expect(fs.readFile(path.join(packageDir, "transcript", "transcript.vtt"), "utf8")).resolves.toBe(
      "WEBVTT\n\n"
    );
  });

  it("writes transcript and platform payload files when provided", async () => {
    const packageDir = path.join(tempDir, "package-with-payloads");
    const sourcePath = path.join(tempDir, "demo_video-final.mp4");
    const segments = [{ startSec: 0, endSec: 2, text: "Oi mundo", words: [] }];
    const vtt = "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nOi mundo\n";
    const text = "Oi mundo";
    const payloads: HorizontalPayloads = {
      youtube: {
        title: "Titulo com gancho",
        description: "Descricao persuasiva para o publico.",
        hashtags: ["#video", "#negocios"],
        chapters: [
          { time: "00:00", title: "Abertura" },
          { time: "01:12", title: "Ideia central" }
        ],
        language: "pt",
        madeForKids: false,
        privacyStatus: "private"
      },
      podcast: {
        title: "Titulo editorial do podcast",
        description: "Descricao editorial do podcast.",
        summary: "Resumo",
        notes: ["Nota"],
        audioPath: "podcast/podcast-audio.mp3"
      },
      x: {
        posts: ["Post 1", "Post 2"],
        hashtags: ["#video"],
        sourceVideo: "youtube/youtube.mp4"
      }
    };

    await writeHorizontalMetadataPackage({
      packageDir,
      sourcePath,
      transcript: {
        segments,
        vtt,
        text
      },
      payloads
    });

    await expect(fs.readFile(path.join(packageDir, "youtube", "payload.json"), "utf8")).resolves.toBe(
      `${JSON.stringify(payloads.youtube, null, 2)}\n`
    );
    await expect(fs.readFile(path.join(packageDir, "youtube", "title.txt"), "utf8")).resolves.toBe(
      "Titulo com gancho\n"
    );
    await expect(fs.readFile(path.join(packageDir, "youtube", "description.txt"), "utf8")).resolves.toBe(
      "Descricao persuasiva para o publico.\n"
    );
    await expect(fs.readFile(path.join(packageDir, "youtube", "hashtags.txt"), "utf8")).resolves.toBe(
      "#video #negocios\n"
    );
    await expect(fs.readFile(path.join(packageDir, "youtube", "chapters.txt"), "utf8")).resolves.toBe(
      "00:00 Abertura\n01:12 Ideia central\n"
    );
    await expect(fs.readFile(path.join(packageDir, "podcast", "payload.json"), "utf8")).resolves.toBe(
      `${JSON.stringify(payloads.podcast, null, 2)}\n`
    );
    await expect(fs.readFile(path.join(packageDir, "podcast", "title.txt"), "utf8")).resolves.toBe(
      "Titulo editorial do podcast\n"
    );
    await expect(fs.readFile(path.join(packageDir, "podcast", "description.txt"), "utf8")).resolves.toBe(
      "Descricao editorial do podcast.\n"
    );
    await expect(fs.readFile(path.join(packageDir, "x", "payload.json"), "utf8")).resolves.toBe(
      `${JSON.stringify(payloads.x, null, 2)}\n`
    );
    await expect(fs.readFile(path.join(packageDir, "x", "thread.json"), "utf8")).resolves.toBe(
      `${JSON.stringify({ posts: ["Post 1", "Post 2"] }, null, 2)}\n`
    );
    await expect(fs.readFile(path.join(packageDir, "transcript", "transcript.txt"), "utf8")).resolves.toBe(
      `${text}\n`
    );
    await expect(fs.readFile(path.join(packageDir, "transcript", "transcript.json"), "utf8")).resolves.toBe(
      `${JSON.stringify({ segments }, null, 2)}\n`
    );
    await expect(fs.readFile(path.join(packageDir, "transcript", "transcript.vtt"), "utf8")).resolves.toBe(vtt);
  });
});
