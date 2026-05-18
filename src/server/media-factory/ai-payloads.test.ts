import { describe, expect, it, vi } from "vitest";
import { generateHorizontalPayloads, generateVerticalShortPayloads } from "./ai-payloads";

describe("generateHorizontalPayloads", () => {
  it("returns parsed horizontal payloads from the injected OpenAI client", async () => {
    const fakeClient = {
      responses: {
        parse: vi.fn().mockResolvedValue({
          output_parsed: {
            youtube: {
              title: "Titulo",
              description: "Desc",
              hashtags: ["#ia"],
              chapters: [{ time: "00:00", title: "Inicio" }],
              language: "pt",
              madeForKids: false,
              privacyStatus: "private"
            },
            podcast: {
              title: "Titulo",
              description: "Desc",
              summary: "Resumo",
              notes: ["Ponto 1"],
              audioPath: "podcast/podcast-audio.mp3"
            },
            x: {
              posts: ["Post 1", "Post 2", "Post 3"],
              hashtags: ["#ia"],
              sourceVideo: "youtube/youtube.mp4"
            }
          }
        })
      }
    };

    await expect(
      generateHorizontalPayloads({
        transcriptText: "Transcricao do video sobre IA aplicada a criacao de conteudo.",
        transcriptSegments: [
          { startSec: 0, endSec: 8, text: "Abertura sobre empreendedorismo", words: [] },
          { startSec: 68, endSec: 92, text: "Mídias sociais viraram alavanca de negócio", words: [] }
        ],
        sourceTitle: "video",
        client: fakeClient
      })
    ).resolves.toEqual({
      youtube: {
        title: "Titulo",
        description: "Desc",
        hashtags: ["#ia"],
        chapters: [{ time: "00:00", title: "Inicio" }],
        language: "pt",
        madeForKids: false,
        privacyStatus: "private"
      },
      podcast: {
        title: "Titulo",
        description: "Desc",
        summary: "Resumo",
        notes: ["Ponto 1"],
        audioPath: "podcast/podcast-audio.mp3"
      },
      x: {
        posts: ["Post 1", "Post 2", "Post 3"],
        hashtags: ["#ia"],
        sourceVideo: "youtube/youtube.mp4"
      }
    });
    expect(fakeClient.responses.parse).toHaveBeenCalledTimes(1);
    const request = fakeClient.responses.parse.mock.calls[0][0];
    expect(JSON.stringify(request.input)).toContain("titulo clicavel");
    expect(JSON.stringify(request.input)).toContain("00:00");
    expect(JSON.stringify(request.input)).toContain("01:08");
    expect(JSON.stringify(request.input)).toContain("voz do proprio criador");
    expect(JSON.stringify(request.input)).toContain("proibido escrever em terceira pessoa");
    expect(JSON.stringify(request.input)).toContain("neste video, Yohann fala");
  });

  it("throws instead of returning fallback payloads when AI is disabled", async () => {
    await expect(
      generateHorizontalPayloads({
        transcriptText: "Nao deve chamar a IA.",
        sourceTitle: "meu_video-final  01.mp4",
        ai: { enabled: false }
      })
    ).rejects.toThrow("IA obrigatoria para gerar payloads horizontais");
  });

  it("rejects third-person YouTube and podcast descriptions from the AI", async () => {
    const fakeClient = {
      responses: {
        parse: vi.fn().mockResolvedValue({
          output_parsed: {
            youtube: {
              title: "Titulo",
              description: "Neste vídeo, Yohan fala sobre um dia difícil de empreendedor.",
              hashtags: ["#negocios"],
              chapters: [{ time: "00:00", title: "Inicio" }],
              language: "pt",
              madeForKids: false,
              privacyStatus: "private"
            },
            podcast: {
              title: "Podcast",
              description: "O episódio aborda rotina empreendedora.",
              summary: "Resumo",
              notes: ["Ponto 1"],
              audioPath: "podcast/podcast-audio.mp3"
            },
            x: {
              posts: ["Post 1"],
              hashtags: ["#negocios"],
              sourceVideo: "youtube/youtube.mp4"
            }
          }
        })
      }
    };

    await expect(
      generateHorizontalPayloads({
        transcriptText: "Transcricao.",
        sourceTitle: "video",
        client: fakeClient
      })
    ).rejects.toThrow("A IA retornou descricao em terceira pessoa");
  });
});

describe("generateVerticalShortPayloads", () => {
  it("returns platform payloads for each vertical clip from the injected OpenAI client", async () => {
    const fakeClient = {
      responses: {
        parse: vi.fn().mockResolvedValue({
          output_parsed: {
            clips: [
              {
                clipId: "clip-1",
                youtubeShorts: {
                  title: "Esse corte explica o ponto central",
                  description: "Descricao pronta para o Shorts.",
                  hashtags: ["#shorts", "#ia"],
                  privacyStatus: "private"
                },
                instagram: {
                  caption: "Legenda pronta para Reels.",
                  hashtags: ["#reels", "#ia"]
                },
                tiktok: {
                  caption: "Legenda pronta para TikTok.",
                  hashtags: ["#tiktok", "#ia"]
                }
              }
            ]
          }
        })
      }
    };

    await expect(
      generateVerticalShortPayloads({
        sourceTitle: "aula completa",
        clips: [{ clipId: "clip-1", title: "Ponto central", startTime: "00:10", endTime: "00:35", score: 92 }],
        client: fakeClient
      })
    ).resolves.toEqual({
      clips: [
        {
          clipId: "clip-1",
          youtubeShorts: {
            title: "Esse corte explica o ponto central",
            description: "Descricao pronta para o Shorts.",
            hashtags: ["#shorts", "#ia"],
            privacyStatus: "private"
          },
          instagram: {
            caption: "Legenda pronta para Reels.",
            hashtags: ["#reels", "#ia"]
          },
          tiktok: {
            caption: "Legenda pronta para TikTok.",
            hashtags: ["#tiktok", "#ia"]
          }
        }
      ]
    });
    expect(fakeClient.responses.parse).toHaveBeenCalledTimes(1);
  });

  it("throws instead of returning vertical fallback payloads when AI is disabled", async () => {
    await expect(
      generateVerticalShortPayloads({
        sourceTitle: "aula_completa.mp4",
        clips: [{ clipId: "clip-1", title: "Melhor trecho", startTime: "00:10", endTime: "00:35" }],
        ai: { enabled: false }
      })
    ).rejects.toThrow("IA obrigatoria para gerar payloads verticais");
  });

  it("throws when the AI omits one of the expected vertical clips", async () => {
    const fakeClient = {
      responses: {
        parse: vi.fn().mockResolvedValue({
          output_parsed: {
            clips: [
              {
                clipId: "clip-1",
                youtubeShorts: {
                  title: "Corte 1",
                  description: "Descricao",
                  hashtags: [],
                  privacyStatus: "private"
                },
                instagram: { caption: "Corte 1", hashtags: [] },
                tiktok: { caption: "Corte 1", hashtags: [] }
              }
            ]
          }
        })
      }
    };

    await expect(
      generateVerticalShortPayloads({
        sourceTitle: "aula_completa.mp4",
        clips: [
          { clipId: "clip-1", title: "Trecho 1" },
          { clipId: "clip-2", title: "Trecho 2" }
        ],
        client: fakeClient
      })
    ).rejects.toThrow("A IA nao retornou payload para o clip clip-2");
  });
});
