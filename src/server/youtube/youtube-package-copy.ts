import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { EditPlan } from "../../shared/edit-plan";

export const youtubePackageCopySchema = z.object({
  title: z.string().min(12).max(95),
  description: z.string().min(120).max(5000),
  thumbnailPrompts: z.array(z.string().min(500).max(4000)).length(5)
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
          "Os prompts de thumbnail precisam ser extremamente detalhados para ChatGPT/GPT Image ou para um agente gerar Remotion/HTML/CSS: use as quatro imagens e os dois clipes curtos de referencia do rosto, preserve identidade, use composicao profissional, contraste alto, pouco texto e direcao visual de alta conversao.",
          "Os clipes identity-ref-01.mp4 e identity-ref-02.mp4 servem para fidedignidade: angulos, microexpressoes, proporcoes do rosto, cabelo, barba, pele, iluminacao e jeito natural da pessoa.",
          "Sempre entregue exatamente 5 prompts de thumbnail no estilo V9 polished: cinco ideias visualmente diferentes, criadas para render premium em 16:9, master 2560x1440 e leitura perfeita em celular.",
          "Cada prompt deve servir como direcao criativa completa para Remotion/HTML/CSS ou geracao visual equivalente, nao como referencia para copiar thumbnails antigas.",
          "Cada variacao precisa parecer um teste A/B real de CTR para maximizar cliques, com conceito, estrutura e tese de clique diferentes, nao apenas troca de cor ou texto.",
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
    "3. Exatamente 5 prompts de thumbnail para colar no ChatGPT ou enviar para um agente renderizar com Remotion/HTML/CSS, junto com 4 imagens e os 2 clipes de referencia do rosto do criador.",
    "",
    "Regras das 5 variacoes de thumbnail:",
    "- Retorne 5 prompts completos no campo thumbnailPrompts, nao resuma e nao junte tudo em uma unica ideia.",
    "- Cada prompt deve dizer explicitamente para usar as 4 imagens e os 2 clipes identity-ref-01.mp4 e identity-ref-02.mp4 como referencia de identidade/rosto.",
    "- Explique que os clipes sao referencia de fidedignidade da pessoa: movimento real, angulos, microexpressoes, cabelo, pele, barba, proporcoes e iluminacao. Nao peça para copiar um frame literal dos clipes.",
    "- Cada prompt deve pedir thumbnail 16:9 profissional, nitida, com render em master 2560x1440 e downsample para 1280x720, tipografia grande, poucos elementos finos e leitura instantanea em tela pequena.",
    "- Nao use as thumbnails antigas como referencia visual. Use a direcao criativa que gerou a rodada V9 polished e adapte ao assunto real deste video.",
    "- Conceito 1 = fiz mesmo assim: thumb premium com contraste preto/creme/amarelo, texto emocional de resistencia/execucao, rosto pequeno ou medio em moldura, sensacao de canal/episodio novo.",
    "- Conceito 2 = conflito vs resultado: composicao split, lado esquerdo com problema/trava/risco, lado direito com resultado/criacao/ganho; texto grande nos dois lados e simbolo simples de conclusao.",
    "- Conceito 3 = manchete editorial: capa jornal/revista limpa, fundo claro, manchete forte em duas linhas, tarja amarela em uma frase-chave, subtitulo curto e foto do criador em moldura editorial.",
    "- Conceito 4 = sistema/status: interface tipo OS/tarefa/checklist/progresso, mostrando uma virada de estado do video; texto principal de uma palavra ou frase curta e itens grandes o suficiente para celular.",
    "- Conceito 5 = rede social/negocio: cards de rede social ou celular, seta/fluxo visual, tese de negocio/atencao/plataforma do video; se o assunto nao for Instagram, adaptar para o canal, ativo, app ou plataforma central do video.",
    "- Em cada prompt, inclua texto curto para a thumbnail com no maximo 4 palavras, e explique por que esse texto aumenta o clique.",
    "- Explique composicao, pose/expressao, iluminacao, contraste, cor, hierarquia visual, fundo, assets usados, elementos do tema do video e nivel de intensidade.",
    "- Priorize CTR maximo sem clickbait vazio: tensao visual, contraste emocional, promessa clara, curiosidade aberta e cara de thumbnail pensada, nao montagem automatica.",
    "- Evite poluicao visual, texto pequeno, aparencia amadora, thumbnails genericas, distorcao do rosto, dedos estranhos, bokeh/gradiente generico e qualquer mudanca de identidade.",
    "- Nao entregue variacoes cosmeticas. As 5 precisam ter conceitos realmente diferentes para testar qual geraria mais cliques.",
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
