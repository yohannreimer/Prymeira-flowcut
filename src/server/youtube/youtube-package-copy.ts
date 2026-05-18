import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { EditPlan } from "../../shared/edit-plan";

export const youtubePackageCopySchema = z.object({
  title: z.string().min(12).max(95),
  description: z.string().min(120).max(5000),
  thumbnailPrompts: z.array(z.string().min(500).max(4000)).length(3),
  thumbnailPromptWithoutFace: z.string().min(500).max(4000)
});

export type YoutubePackageCopy = z.infer<typeof youtubePackageCopySchema>;

type OpenAIYoutubePackageClient = {
  responses: {
    parse: (input: Record<string, unknown>) => Promise<{ output_parsed: YoutubePackageCopy | null }>;
  };
};

export type GenerateYoutubePackageCopyDeps = {
  apiKey?: string;
  model?: string;
  openaiClient?: OpenAIYoutubePackageClient;
};

export async function generateYoutubePackageCopy(
  plan: EditPlan,
  transcript: string,
  deps: GenerateYoutubePackageCopyDeps = {}
): Promise<YoutubePackageCopy> {
  const apiKey = deps.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey && !deps.openaiClient) {
    throw new Error("OPENAI_API_KEY nao configurada. Defina a chave no ambiente ou em .env.local.");
  }

  const client = deps.openaiClient ?? (new OpenAI({ apiKey }) as unknown as OpenAIYoutubePackageClient);
  const response = await client.responses.parse({
    model: deps.model ?? process.env.OPENAI_YOUTUBE_PACKAGE_MODEL ?? "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: [
          "Voce e uma estrategista senior de crescimento para YouTube, especialista em retencao, CTR e embalagem editorial.",
          "Sua entrega precisa ser agressivamente util, especifica ao video e pronta para publicar.",
          "Nao use promessas falsas, clickbait vazio, emojis, hashtags genericas ou linguagem corporativa.",
          "O titulo deve vender curiosidade clara e beneficio concreto sem parecer sensacionalista barato.",
          "A descricao deve parecer escrita por um criador humano: gancho inicial, contexto, promessa do video e CTA limpo.",
          "Os prompts de thumbnail precisam ser extremamente detalhados para ChatGPT/GPT Image: use as quatro imagens e os dois clipes curtos de referencia do rosto, preserve identidade, use expressao forte, composicao profissional, contraste alto, pouco texto e direcao visual de alta conversao.",
          "Os clipes identity-ref-01.mp4 e identity-ref-02.mp4 servem para fidedignidade: angulos, microexpressoes, proporcoes do rosto, cabelo, barba, pele, iluminacao e jeito natural da pessoa.",
          "Sempre entregue exatamente 3 variacoes de thumbnail, cada uma com angulo psicologico diferente para maximizar cliques: curiosidade, medo/erro ou ganho claro.",
          "Tambem entregue exatamente 1 thumbnail sem foto, sem rosto e sem pessoa parecida, usando um conceito visual chamativo baseado no tema real do video.",
          "Cada variacao precisa parecer um teste A/B real de CTR, nao apenas uma troca de cor ou texto.",
          "Responda somente no schema solicitado."
        ].join(" ")
      },
      {
        role: "user",
        content: buildYoutubePackagePrompt(plan, transcript)
      }
    ],
    text: {
      format: zodTextFormat(youtubePackageCopySchema, "youtube_package_copy")
    }
  });

  if (!response.output_parsed) {
    throw new Error("A IA nao retornou um pacote de YouTube valido.");
  }
  return response.output_parsed;
}

function buildYoutubePackagePrompt(plan: EditPlan, transcript: string) {
  const durationSec = plan.segments.at(-1)?.timelineEndSec ?? plan.source.durationSec;
  return [
    `Video em portugues para YouTube. Duracao editada aproximada: ${Math.round(durationSec)} segundos.`,
    "",
    "Trechos editoriais detectados:",
    plan.sections.length
      ? plan.sections.map((section) => `- ${section.type}: ${section.label} (${round(section.startSec)}s-${round(section.endSec)}s)`).join("\n")
      : "- Sem secoes editoriais detectadas; use a transcricao como fonte principal.",
    "",
    "Crie:",
    "1. Um titulo unico em portugues do Brasil, com alta chance de CTR, ate 95 caracteres, sem emoji.",
    "2. Uma descricao pronta para o YouTube, com primeira linha forte, resumo do valor, CTA natural e sem timestamps inventados.",
    "3. Exatamente 3 prompts de thumbnail para colar no ChatGPT junto com 4 imagens e os 2 clipes de referencia do rosto do criador.",
    "4. Exatamente 1 prompt de thumbnail sem foto no campo thumbnailPromptWithoutFace, de acordo com o tema do video, para testar CTR sem usar rosto.",
    "",
    "Regras das 3 variacoes de thumbnail:",
    "- Retorne 3 prompts completos no campo thumbnailPrompts, nao resuma e nao junte tudo em uma unica ideia.",
    "- Cada prompt deve dizer explicitamente para usar as 4 imagens e os 2 clipes identity-ref-01.mp4 e identity-ref-02.mp4 como referencia de identidade/rosto.",
    "- Explique que os clipes sao referencia de fidedignidade da pessoa: movimento real, angulos, microexpressoes, cabelo, pele, barba, proporcoes e iluminacao. Nao peça para copiar um frame literal dos clipes.",
    "- Cada prompt deve pedir thumbnail 16:9, profissional, nitida, com rosto grande, expressao forte e leitura instantanea em tela pequena.",
    "- Cada variacao precisa ter uma tese de clique diferente: Variacao 1 = curiosidade/intriga; Variacao 2 = erro, risco, perda ou choque util; Variacao 3 = ganho, resultado, transformacao ou promessa concreta.",
    "- Em cada variacao, inclua texto curto para a thumbnail com no maximo 3 palavras, e explique por que esse texto aumenta o clique.",
    "- Explique composicao, pose/expressao, iluminacao, contraste, cor, hierarquia visual, fundo, elementos do tema do video e nivel de intensidade.",
    "- Priorize CTR maximo sem clickbait vazio: tensao visual, contraste emocional, rosto reconhecivel, promessa clara e curiosidade aberta.",
    "- Evite poluicao visual, texto pequeno, aparencia amadora, thumbnails genericas, distorcao do rosto, dedos estranhos e qualquer mudanca de identidade.",
    "- Nao entregue variacoes cosmeticas. As 3 precisam ter conceitos realmente diferentes para testar qual geraria mais cliques.",
    "",
    "Regras da THUMB SEM FOTO:",
    "- Escreva um prompt completo no campo thumbnailPromptWithoutFace.",
    "- Nao use rosto, nao use pessoa, nao invente uma pessoa parecida com o criador e nao use as imagens/clipes como referencia visual.",
    "- A thumb precisa valer o teste mesmo sem rosto: conceito visual forte, objeto/simbolo central gigante, contraste alto, leitura instantanea no celular e texto com no maximo 3 palavras.",
    "- Baseie a ideia no assunto real do video e escolha um angulo de clique diferente das 3 thumbs com rosto.",
    "- Priorize curiosidade visual, tensao editorial, promessa clara e composicao memoravel. Evite abstracao generica, fundo vazio, excesso de texto e cara de banco de imagem.",
    "- Explique composicao, objeto principal, fundo, iluminacao, cores, texto curto, hierarquia visual e por que esse conceito pode aumentar cliques sem depender de rosto.",
    "",
    "Transcricao completa:",
    truncateTranscript(transcript)
  ].join("\n");
}

function truncateTranscript(transcript: string) {
  return transcript.length > 60000 ? `${transcript.slice(0, 60000)}\n[transcricao truncada por tamanho]` : transcript;
}

function round(value: number) {
  return Number(value.toFixed(1));
}
