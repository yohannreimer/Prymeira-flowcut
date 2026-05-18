import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CAPTION_SETTINGS } from "../../shared/caption-settings";
import type { EditPlan } from "../../shared/edit-plan";
import { generateYoutubePackageCopy } from "./youtube-package-copy";

function createPlan(): EditPlan {
  return {
    id: "plan_project_1",
    projectId: "project_1",
    version: 1,
    source: {
      path: "/tmp/source.mp4",
      durationSec: 120,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true
    },
    segments: [
      { id: "seg_1", sourceStartSec: 0, sourceEndSec: 120, timelineStartSec: 0, timelineEndSec: 120, reason: "kept speech/content" }
    ],
    removed: [],
    sections: [
      {
        id: "section_hook",
        type: "hook",
        startSec: 0,
        endSec: 18,
        label: "Automacao de thumbnails para YouTube",
        confidence: 0.9,
        warnings: [],
        treatments: {}
      }
    ],
    captions: [],
    captionSettings: DEFAULT_CAPTION_SETTINGS,
    overlays: [],
    color: { presetId: "neutral", label: "Neutral", adjustments: {
      intensity: 1,
      exposure: 0,
      contrast: 1,
      saturation: 1,
      temperature: 0,
      tint: 0,
      vignette: 0
    } },
    video: { flipHorizontal: false },
    audio: { music: null, voiceTargetLufs: -16 },
    qa: { status: "passed", warnings: [] },
    publishReadiness: { status: "needs_review", checks: [] },
    createdAt: "2026-05-05T00:00:00.000Z"
  };
}

describe("generateYoutubePackageCopy", () => {
  it("asks the model for exactly three high-CTR thumbnail variations", async () => {
    const parse = vi.fn().mockResolvedValue({
      output_parsed: {
        title: "Esse Fluxo De Thumbnail Aumenta Cliques",
        description: "Uma descricao pronta para YouTube com gancho, contexto, promessa concreta e chamada para acao natural.",
        thumbnailPrompts: [
          "Prompt A ".repeat(70),
          "Prompt B ".repeat(70),
          "Prompt C ".repeat(70)
        ],
        thumbnailPromptWithoutFace: "Prompt sem foto ".repeat(70)
      }
    });

    await generateYoutubePackageCopy(createPlan(), "A thumbnail precisa fazer a pessoa clicar antes de ler o titulo.", {
      openaiClient: { responses: { parse } }
    });

    const request = parse.mock.calls[0][0];
    const systemPrompt = request.input[0].content as string;
    const userPrompt = request.input[1].content as string;
    expect(systemPrompt).toContain("exatamente 3 variacoes");
    expect(systemPrompt).toContain("1 thumbnail sem foto");
    expect(systemPrompt).toContain("maximizar cliques");
    expect(systemPrompt).toContain("dois clipes curtos");
    expect(userPrompt).toContain("Retorne 3 prompts completos");
    expect(userPrompt).toContain("thumbnailPromptWithoutFace");
    expect(userPrompt).toContain("Nao use rosto");
    expect(userPrompt).toContain("nao invente uma pessoa parecida");
    expect(userPrompt).toContain("4 imagens e os 2 clipes");
    expect(userPrompt).toContain("Variacao 1 = curiosidade");
    expect(userPrompt).toContain("Variacao 2 = erro");
    expect(userPrompt).toContain("Variacao 3 = ganho");
  });
});
