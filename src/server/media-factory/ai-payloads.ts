import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { WhisperSegment } from "../captions/whisper";
import type { MediaFactoryConfig } from "./config";

export const horizontalPayloadSchema = z.object({
  youtube: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    hashtags: z.array(z.string()).default([]),
    chapters: z.array(z.object({ time: z.string(), title: z.string() })).default([]),
    language: z.string().default("pt"),
    madeForKids: z.boolean().default(false),
    privacyStatus: z.enum(["private", "unlisted", "public"]).default("private")
  }),
  podcast: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    summary: z.string().min(1),
    notes: z.array(z.string()).default([]),
    audioPath: z.string().default("podcast/podcast-audio.mp3")
  }),
  x: z.object({
    posts: z.array(z.string()).min(1),
    hashtags: z.array(z.string()).default([]),
    sourceVideo: z.string().default("youtube/youtube.mp4")
  })
});

export type HorizontalPayloads = z.infer<typeof horizontalPayloadSchema>;

export const verticalShortPayloadSchema = z.object({
  clips: z.array(
    z.object({
      clipId: z.string().min(1),
      youtubeShorts: z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        hashtags: z.array(z.string()).default([]),
        privacyStatus: z.enum(["private", "unlisted", "public"]).default("private")
      }),
      instagram: z.object({
        caption: z.string().min(1),
        hashtags: z.array(z.string()).default([])
      }),
      tiktok: z.object({
        caption: z.string().min(1),
        hashtags: z.array(z.string()).default([])
      })
    })
  )
});

export type VerticalShortPayloads = z.infer<typeof verticalShortPayloadSchema>;
export type VerticalShortPayloadClipInput = {
  clipId: string;
  title?: string;
  startTime?: unknown;
  endTime?: unknown;
  score?: unknown;
};

export type OpenAIMediaFactoryClient = {
  responses: {
    parse: (input: Record<string, unknown>) => Promise<{ output_parsed: unknown | null }>;
  };
};

export async function generateHorizontalPayloads(input: {
  transcriptText: string;
  transcriptSegments?: WhisperSegment[];
  sourceTitle: string;
  ai?: Partial<MediaFactoryConfig["ai"]>;
  client?: OpenAIMediaFactoryClient;
  apiKey?: string;
}): Promise<HorizontalPayloads> {
  if (input.ai?.enabled === false) {
    throw new Error("IA obrigatoria para gerar payloads horizontais. Ative ai.enabled e configure OPENAI_API_KEY.");
  }

  const apiKey = input.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey && !input.client) {
    throw new Error("OPENAI_API_KEY nao configurada. Defina a chave no ambiente ou em .env.local.");
  }

  const client = input.client ?? (new OpenAI({ apiKey }) as unknown as OpenAIMediaFactoryClient);
  const response = await client.responses.parse({
    model: input.ai?.model ?? process.env.OPENAI_MEDIA_FACTORY_MODEL ?? "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: [
          "Voce e uma estrategista senior de crescimento para YouTube, podcast e X.",
          "Seu trabalho e transformar uma transcricao bruta em embalagem editorial que aumenta clique, retencao e clareza sem enganar.",
          "Crie titulo clicavel, descricao em voz do proprio criador e capitulos uteis em portugues do Brasil.",
          "Prepare payloads para YouTube, podcast e X usando apenas informacoes presentes no titulo e na transcricao.",
          "Use defaults privados para YouTube: privacyStatus private, madeForKids false e language pt.",
          "Nao invente fatos, links, convidados, patrocinadores ou promessas fora da transcricao.",
          "Evite titulo burocratico, generico ou meramente descritivo; procure tensão, curiosidade e promessa concreta sem clickbait vazio.",
          "E proibido escrever em terceira pessoa: nao use formulas como 'neste video, Yohann fala', 'Yohann explica', 'o criador comenta' ou 'o episodio aborda'.",
          "Escreva como se a descricao fosse publicada pelo proprio canal: 'nesse video eu...', 'a ideia aqui e...', 'eu compartilho...'. Evite emojis.",
          "Responda somente no schema solicitado."
        ].join(" ")
      },
      {
        role: "user",
        content: buildHorizontalPayloadPrompt(input.sourceTitle, input.transcriptText, input.transcriptSegments)
      }
    ],
    text: {
      format: zodTextFormat(horizontalPayloadSchema, "media_factory_horizontal_payload")
    }
  });

  if (!response.output_parsed) {
    throw new Error("A IA nao retornou payloads horizontais validos.");
  }

  return validateHorizontalPayloadVoice(horizontalPayloadSchema.parse(response.output_parsed));
}

export async function generateVerticalShortPayloads(input: {
  sourceTitle: string;
  clips: VerticalShortPayloadClipInput[];
  ai?: Partial<MediaFactoryConfig["ai"]>;
  client?: OpenAIMediaFactoryClient;
  apiKey?: string;
}): Promise<VerticalShortPayloads> {
  if (input.ai?.enabled === false) {
    throw new Error("IA obrigatoria para gerar payloads verticais. Ative ai.enabled e configure OPENAI_API_KEY.");
  }

  const apiKey = input.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey && !input.client) {
    throw new Error("OPENAI_API_KEY nao configurada. Defina a chave no ambiente ou em .env.local.");
  }

  const client = input.client ?? (new OpenAI({ apiKey }) as unknown as OpenAIMediaFactoryClient);
  const response = await client.responses.parse({
    model: input.ai?.model ?? process.env.OPENAI_MEDIA_FACTORY_MODEL ?? "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: [
          "Voce e uma estrategista senior de cortes verticais.",
          "Crie copy em portugues do Brasil pronta para YouTube Shorts, Instagram Reels e TikTok.",
          "Use somente o titulo do video e metadados dos cortes; nao invente fatos especificos.",
          "Nao use emojis. Mantenha linguagem natural, especifica e sem clickbait vazio.",
          "Responda somente no schema solicitado."
        ].join(" ")
      },
      {
        role: "user",
        content: buildVerticalShortPayloadPrompt(input.sourceTitle, input.clips)
      }
    ],
    text: {
      format: zodTextFormat(verticalShortPayloadSchema, "media_factory_vertical_short_payload")
    }
  });

  if (!response.output_parsed) {
    throw new Error("A IA nao retornou payloads verticais validos.");
  }

  return normalizeVerticalPayloadClipOrder({
    payloads: verticalShortPayloadSchema.parse(response.output_parsed),
    clips: input.clips
  });
}

function buildHorizontalPayloadPrompt(
  sourceTitle: string,
  transcriptText: string,
  transcriptSegments: WhisperSegment[] | undefined
) {
  return [
    `Titulo ou arquivo de origem: ${sourceTitle}`,
    "",
    "Crie payloads horizontais em portugues do Brasil:",
    "1. YouTube: titulo clicavel com curiosidade real, descricao em voz do proprio criador, hashtags relevantes, capitulos com timestamps reais, language pt, madeForKids false e privacyStatus private.",
    "2. Podcast: titulo de episodio, descricao editorial/autoral para ouvintes, resumo claro, notas em bullets curtos e audioPath podcast/podcast-audio.mp3.",
    "3. X: thread de 3 a 6 posts com uma ideia por post, hashtags relevantes e sourceVideo youtube/youtube.mp4.",
    "",
    "Regras:",
    "- O titulo deve gerar vontade de clicar sem clickbait vazio: use tensão real, curiosidade específica e promessa concreta.",
    "- A descricao deve abrir com um gancho forte em primeira pessoa ou voz direta do canal.",
    "- E proibido escrever em terceira pessoa. Nao use: 'neste video, Yohann fala', 'Yohann explica', 'o criador comenta', 'o episodio aborda'.",
    "- Nao fale como sistema, nao diga 'conteudo gerado automaticamente' e nao escreva para o Yohann.",
    "- Use linguagem natural, humana, autoral e editorial, como texto que o proprio canal publicaria.",
    "- Hashtags devem ser especificas ao assunto; evite #video e #conteudo quando houver tema melhor.",
    "- Para capitulos, use os timestamps dos segmentos. Crie 3 a 8 capitulos quando houver mudanças claras de assunto; se o video for curto ou monotema, use 1 a 3.",
    "- Nao use emojis.",
    "- Nao crie timestamp que nao exista nos segmentos; arredonde para mm:ss.",
    "",
    "Transcricao com timestamps:",
    formatTranscriptSegments(transcriptSegments),
    "",
    "Transcricao corrida:",
    truncateTranscript(transcriptText)
  ].join("\n");
}

function validateHorizontalPayloadVoice(payloads: HorizontalPayloads): HorizontalPayloads {
  const checks = [
    ["youtube.description", payloads.youtube.description],
    ["podcast.description", payloads.podcast.description],
    ["podcast.summary", payloads.podcast.summary]
  ] as const;
  const badField = checks.find(([, value]) => isThirdPersonCreatorCopy(value));

  if (badField) {
    throw new Error(`A IA retornou descricao em terceira pessoa em ${badField[0]}. Gere novamente com voz autoral.`);
  }

  return payloads;
}

function isThirdPersonCreatorCopy(value: string): boolean {
  const normalized = normalizeForCopyCheck(value);
  return [
    /\bneste video[, ]+(yohan|yohann)\s+(fala|explica|comenta|organiza|mostra|aborda)\b/,
    /\bnesse video[, ]+(yohan|yohann)\s+(fala|explica|comenta|organiza|mostra|aborda)\b/,
    /\b(yohan|yohann)\s+(fala|explica|comenta|organiza|mostra|aborda)\b/,
    /\bo video\s+(tambem\s+)?(entra|aborda|mostra|explica)\b/,
    /\bo episodio\s+(tambem\s+)?(entra|aborda|mostra|explica|traz)\b/,
    /\bo criador\s+(fala|explica|comenta|mostra|aborda)\b/
  ].some((pattern) => pattern.test(normalized));
}

function normalizeForCopyCheck(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildVerticalShortPayloadPrompt(sourceTitle: string, clips: VerticalShortPayloadClipInput[]) {
  return [
    `Titulo ou arquivo de origem: ${sourceTitle}`,
    "",
    "Crie payloads para cada corte vertical listado.",
    "Para YouTube Shorts: title, description, hashtags e privacyStatus private.",
    "Para Instagram Reels e TikTok: caption e hashtags.",
    "Regras:",
    "- Preserve exatamente cada clipId recebido.",
    "- Titulo de Shorts com ate 90 caracteres.",
    "- Captions curtas, prontas para postar.",
    "- Hashtags relevantes, sem exagero.",
    "",
    "Cortes:",
    JSON.stringify(clips.map(formatVerticalClipForPrompt), null, 2)
  ].join("\n");
}

function formatVerticalClipForPrompt(clip: VerticalShortPayloadClipInput) {
  return {
    clipId: clip.clipId,
    title: clip.title ?? "",
    startTime: clip.startTime ?? null,
    endTime: clip.endTime ?? null,
    score: clip.score ?? null
  };
}

function normalizeVerticalPayloadClipOrder({
  payloads,
  clips
}: {
  payloads: VerticalShortPayloads;
  clips: VerticalShortPayloadClipInput[];
}): VerticalShortPayloads {
  const byId = new Map(payloads.clips.map((clip) => [clip.clipId, clip]));

  return {
    clips: clips.map((clip) => {
      const payload = byId.get(clip.clipId);
      if (!payload) {
        throw new Error(`A IA nao retornou payload para o clip ${clip.clipId}.`);
      }
      return payload;
    })
  };
}

function formatTranscriptSegments(segments: WhisperSegment[] | undefined): string {
  if (!segments?.length) {
    return "[sem segmentos com timestamp]";
  }

  return truncateTranscript(
    segments
      .map((segment) => `[${formatTimestamp(segment.startSec)}-${formatTimestamp(segment.endSec)}] ${segment.text}`)
      .join("\n")
  );
}

function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function truncateTranscript(transcriptText: string) {
  return transcriptText.length > 60000
    ? `${transcriptText.slice(0, 60000)}\n[transcricao truncada por tamanho]`
    : transcriptText;
}
