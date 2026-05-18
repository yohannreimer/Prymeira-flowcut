import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { EditPlan } from "../../shared/edit-plan";

const thumbnailConceptIds = [
  "fiz_mesmo_assim",
  "conflito_resultado",
  "manchete_editorial",
  "sistema_status",
  "rede_social_negocio"
] as const;

const thumbnailRenderTextSchema = z.object({
  headline: z.array(z.string().min(1).max(32)).min(1).max(3),
  subhead: z.string().min(4).max(90),
  badge: z.string().min(2).max(24),
  stamp: z.string().min(2).max(48),
  leftLabel: z.string().min(2).max(32),
  rightLabel: z.string().min(2).max(32),
  checklistBad: z.string().min(2).max(40),
  checklistGood: z.array(z.string().min(2).max(40)).length(2),
  tags: z.array(z.string().min(2).max(34)).length(3)
});

const thumbnailPromptSchema = z.object({
  conceptId: z.enum(thumbnailConceptIds),
  title: z.string().min(4).max(80),
  renderText: thumbnailRenderTextSchema,
  prompt: z.string().min(500).max(5000)
});

const v9ThumbnailStyleGuide = [
  "Biblioteca V9 polished obrigatoria para thumbnails. Nao copie arquivos antigos; replique a gramatica visual destes layouts e adapte texto/tema ao video atual.",
  "V9 1 / fiz_mesmo_assim: layout premium meio editorial. Canvas 2560x1440; fundo creme #f1e5ce; bloco preto grande inclinado ocupando a esquerda com clip-path diagonal; titulo enorme em 3 linhas, peso 900, creme e amarelo #ffd20a, sombra preta pesada; rosto em tile quadrado pequeno/medio no canto direito inferior com borda arredondada, sombra e offset amarelo; pill preta no topo direito; simbolo de plus grande amarelo; duas barras horizontais decorativas na base esquerda; selo amarelo inclinado perto do rosto. Sensacao: 'criei mesmo assim', execucao no dia travado, canal/episodio novo.",
  "V9 2 / conflito_resultado: split antes/depois dramatico. Dois lados com screenshots/fundos escurecidos; wash vermelho escuro no problema e amarelo/dourado no resultado; barra diagonal amarela grossa no centro com contorno/sombra preta; texto gigante no lado esquerdo para a trava/problema e card amarelo grande no lado direito para resultado; rosto em moldura central inferior, vertical, com borda preta e sombra amarela; check grande amarelo no canto inferior direito. Sensacao: 'dia travado' versus 'canal criado'.",
  "V9 3 / manchete_editorial: capa jornal/revista limpa. Fundo creme com textura de pontos muito sutil; masthead serifado no topo esquerdo; data/rotulo curto no topo direito; linha preta horizontal grossa; manchete serifada enorme em duas linhas, com a palavra-chave sobre tarja amarela e sombra preta; subtitulo/dek embaixo; tags editoriais na base com linhas; foto do criador em moldura retangular a direita com borda preta, offset amarelo e caption preto/amarelo. Sensacao: bastidor empreendedor, processo real, sem maquiagem.",
  "V9 4 / sistema_status: Operis OS/status claro. Fundo com print/interface do trabalho escurecido; janela grande preta/translucida na esquerda com barra superior de app e bolinhas amarelas; badge amarelo 'STATUS' ou equivalente; palavra principal gigante em creme; checklist grande com um item ruim em vermelho/cinza e dois itens bons com checks amarelos; barra de progresso amarela; rosto grande a direita em recorte vertical arredondado. Sensacao: tarefa do dia, progresso, continuei, sistema executando.",
  "V9 5 / rede_social_negocio: Instagram/cards pro. Fundo preto quente com brilho amarelo controlado; badge amarelo no topo esquerdo; titulo gigante em 3 linhas, creme, com uma palavra dentro de caixa amarela; subtitulo amarelo forte; dois cards/celulares inclinados a direita, um fantasma atras e um real na frente com rosto do criador; seta amarela grande desenhada conectando texto ao card. Sensacao: midia social como ativo de negocio, atencao vira ativo, plataforma/ canal nao opcional.",
  "Todas as variacoes precisam pedir composicao renderizavel em Remotion/HTML/CSS, com medidas relativas, hierarquia clara, paleta preto/creme/amarelo com acentos pontuais, tipografia gigante, sombras pesadas quando fizer sentido, poucos elementos finos e leitura perfeita em celular.",
  "Em cada prompt final, inclua explicitamente: usar 4 imagens thumbnail-ref-01.jpg a thumbnail-ref-04.jpg e os clipes identity-ref-01.mp4 e identity-ref-02.mp4 como referencia de identidade; usar os clipes para movimento, microexpressoes, angulos, cabelo, pele, barba, proporcoes e luz; nao copiar frame literal; adaptar os textos do template ao tema real do video."
].join("\n");

export const youtubePackageCopySchema = z.object({
  title: z.string().min(12).max(95),
  description: z.string().min(120).max(5000),
  chapters: z.array(z.object({
    time: z.string().regex(/^\d{1,2}:\d{2}(?::\d{2})?$/),
    title: z.string().min(3).max(70)
  })).min(1).max(8),
  thumbnailPrompts: z.array(thumbnailPromptSchema).length(5)
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
          "Crie capitulos no campo chapters com timestamps reais e titulos curtos em portugues, prontos para entrar na descricao do YouTube.",
          "Os prompts de thumbnail precisam ser extremamente detalhados para ChatGPT/GPT Image ou para um agente gerar Remotion/HTML/CSS: use as quatro imagens e os dois clipes curtos de referencia do rosto, preserve identidade, use composicao profissional, contraste alto, pouco texto e direcao visual de alta conversao.",
          "Os clipes identity-ref-01.mp4 e identity-ref-02.mp4 servem para fidedignidade: angulos, microexpressoes, proporcoes do rosto, cabelo, barba, pele, iluminacao e jeito natural da pessoa.",
          "Sempre entregue exatamente 5 objetos no campo thumbnailPrompts. Cada objeto deve ter conceptId, title, renderText e prompt. Nao coloque varios prompts dentro do mesmo objeto.",
          "O campo renderText e o texto final renderizado na thumbnail, nao uma descricao. Ele precisa ser especifico ao video atual e deve controlar headline, subhead, badge, stamp, leftLabel, rightLabel, checklistBad, checklistGood e tags.",
          "Os conceptIds obrigatorios, nesta ordem, sao: fiz_mesmo_assim, conflito_resultado, manchete_editorial, sistema_status, rede_social_negocio.",
          "Cada objeto precisa ser um prompt de thumbnail no estilo V9 polished: ideias visualmente diferentes, criadas para render premium em 16:9, master 2560x1440 e leitura perfeita em celular.",
          "Cada prompt deve servir como direcao criativa completa para Remotion/HTML/CSS ou geracao visual equivalente, nao como referencia para copiar thumbnails antigas.",
          v9ThumbnailStyleGuide,
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
    "3. chapters: 1 a 8 capitulos com timestamps reais baseados na transcricao e nas secoes editoriais. Use formato 00:00 Titulo ou 01:23 Titulo, sem inventar assuntos ausentes.",
    "4. Exatamente 5 prompts de thumbnail para colar no ChatGPT ou enviar para um agente renderizar com Remotion/HTML/CSS, junto com 4 imagens e os 2 clipes de referencia do rosto do criador.",
    "",
    "Regras das 5 variacoes de thumbnail:",
    "- Retorne chapters fora de thumbnailPrompts. Os chapters devem usar timestamps reais da transcricao ou do plano, prontos para entrar na descricao do YouTube.",
    "- Retorne 5 objetos completos no campo thumbnailPrompts, exatamente nesta ordem: fiz_mesmo_assim, conflito_resultado, manchete_editorial, sistema_status, rede_social_negocio.",
    "- Cada objeto deve ter: conceptId, title, renderText e prompt. O campo prompt deve conter somente o prompt daquela variacao, nunca texto das outras variacoes.",
    "- renderText deve trazer os textos finais que vao aparecer na imagem, especificos do video atual, sem reciclar nomes fixos do template.",
    "- renderText.headline: 1 a 3 linhas, texto curtissimo de thumbnail com no maximo 4 palavras no total quando possivel.",
    "- renderText.subhead: apoio curto, concreto e clicavel, nunca generico.",
    "- renderText.badge e renderText.stamp: microcopy curta que contextualiza o video atual.",
    "- renderText.leftLabel e renderText.rightLabel: contraste do layout antes/depois ou problema/resultado.",
    "- renderText.checklistBad: uma trava real citada ou inferida da transcricao; renderText.checklistGood: exatamente 2 ganhos/acoes reais.",
    "- renderText.tags: exatamente 3 tags editoriais curtas tiradas da tese do video.",
    "- Cada prompt deve dizer explicitamente para usar as 4 imagens e os 2 clipes identity-ref-01.mp4 e identity-ref-02.mp4 como referencia de identidade/rosto.",
    "- Explique que os clipes sao referencia de fidedignidade da pessoa: movimento real, angulos, microexpressoes, cabelo, pele, barba, proporcoes e iluminacao. Nao peça para copiar um frame literal dos clipes.",
    "- Cada prompt deve pedir thumbnail 16:9 profissional, nitida, com render em master 2560x1440 e downsample para 1280x720, tipografia grande, poucos elementos finos e leitura instantanea em tela pequena.",
    "- Nao use as thumbnails antigas como arquivos de referencia. Use a biblioteca V9 abaixo como prompt/gramatica visual para criar novas thumbs do video atual.",
    "",
    v9ThumbnailStyleGuide,
    "",
    "- Conceito 1 = fiz mesmo assim: siga o layout V9 1.",
    "- Conceito 2 = conflito vs resultado: siga o layout V9 2.",
    "- Conceito 3 = manchete editorial: siga o layout V9 3.",
    "- Conceito 4 = sistema/status: siga o layout V9 4.",
    "- Conceito 5 = rede social/negocio: siga o layout V9 5; se o assunto nao for Instagram, adaptar para o canal, ativo, app ou plataforma central do video.",
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
