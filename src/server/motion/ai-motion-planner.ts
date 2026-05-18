import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { EditPlan, SectionMotionTreatment, TimelineSection } from "../../shared/edit-plan";
import type { WhisperSegment } from "../captions/whisper";

const AI_MOTION_KINDS = ["zoom", "callout", "highlight", "lower_third", "hook_title", "kinetic_keyword", "focus_frame", "chapter_card"] as const;
type MotionSlot = SectionMotionTreatment["slots"][number];

const aiMotionDecisionSchema = z.object({
  editorialSummary: z.string().min(8).max(600),
  motions: z.array(z.object({
    sectionId: z.string().min(1).nullable(),
    kind: z.enum(AI_MOTION_KINDS),
    startSec: z.number().finite().nonnegative(),
    endSec: z.number().finite().nonnegative(),
    title: z.string().min(2).max(90),
    subtitle: z.string().max(140).nullable(),
    keyword: z.string().max(48).nullable(),
    visualDirection: z.string().min(6).max(220),
    reason: z.string().min(6).max(240),
    intensity: z.enum(["subtle", "medium", "strong"]),
    position: z.enum(["left", "right", "center", "bottom"])
  })).min(1).max(12)
});

type AiMotionDecision = z.infer<typeof aiMotionDecisionSchema>;

type OpenAIMotionClient = {
  responses: {
    parse: (input: Record<string, unknown>) => Promise<{ output_parsed: AiMotionDecision | null }>;
  };
};

export type PlanMotionWithAIDeps = {
  apiKey?: string;
  model?: string;
  openaiClient?: OpenAIMotionClient;
};

export async function planMotionWithAI(
  plan: EditPlan,
  transcript: WhisperSegment[],
  deps: PlanMotionWithAIDeps = {}
): Promise<SectionMotionTreatment[]> {
  const apiKey = deps.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey && !deps.openaiClient) {
    throw new Error("OPENAI_API_KEY não configurada. Defina a chave no ambiente ou em .env.local.");
  }

  const client = deps.openaiClient ?? (new OpenAI({ apiKey }) as unknown as OpenAIMotionClient);
  const response = await client.responses.parse({
    model: deps.model ?? process.env.OPENAI_MOTION_MODEL ?? "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: [
          "Voce e uma editora senior de videos longos para YouTube.",
          "Planeje motions de Remotion baseados no que a pessoa realmente fala.",
          "Nunca use labels genericas como Gancho, Ponto de atencao ou Observe este ponto.",
          "Nunca deixe texto editorial parado por muito tempo: cada motion deve parecer uma intervencao premium de 3 a 6 segundos.",
          "Evite cobrir o rosto da pessoa. Em talking head horizontal, prefira left ou bottom; use right somente se o assunto exigir.",
          "Os primeiros 20 segundos sao o hook e precisam obrigatoriamente de motion.",
          "Prefira poucos motions bons a muitos efeitos aleatorios.",
          "Todos os campos do schema sao obrigatorios; use null quando sectionId, subtitle ou keyword nao existirem.",
          "Responda somente no schema solicitado."
        ].join(" ")
      },
      {
        role: "user",
        content: buildMotionPrompt(plan, transcript)
      }
    ],
    text: {
      format: zodTextFormat(aiMotionDecisionSchema, "youtube_motion_plan")
    }
  });

  const decision = response.output_parsed;
  if (!decision) {
    throw new Error("A IA nao retornou um plano de motion valido.");
  }

  return createSectionMotionTreatments(plan, transcript, decision);
}

export function createSectionMotionTreatments(
  plan: EditPlan,
  transcript: WhisperSegment[],
  decision: AiMotionDecision
): SectionMotionTreatment[] {
  const grouped = new Map<string, MotionSlot[]>();

  decision.motions.forEach((motion, index) => {
    const section = findTargetSection(plan.sections, motion.sectionId, motion.startSec, motion.endSec);
    if (!section) return;
    const slot = createMotionSlot(section, transcript, motion, index);
    if (!slot) return;
    grouped.set(section.id, [...(grouped.get(section.id) ?? []), slot]);
  });

  ensureHookMotion(plan, transcript, grouped);

  return plan.sections.map((section) => {
    const slots = (grouped.get(section.id) ?? [])
      .sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec)
      .slice(0, section.type === "hook" ? 4 : 3);
    return { enabled: slots.length > 0, slots };
  });
}

function buildMotionPrompt(plan: EditPlan, transcript: WhisperSegment[]) {
  const durationSec = plan.segments.at(-1)?.timelineEndSec ?? plan.source.durationSec;
  const targetMotionCount = Math.min(10, Math.max(4, Math.ceil(durationSec / 140) + 2));
  return [
    `Video: YouTube longo em portugues, ${round(durationSec)}s renderizados.`,
    `Meta: planejar ${targetMotionCount} motions editoriais, sendo pelo menos 1 nos primeiros 20s.`,
    "Tipos permitidos: hook_title, kinetic_keyword, callout, focus_frame, lower_third, chapter_card, zoom, highlight.",
    "Duracao editorial: hook_title ate 5.5s, kinetic_keyword ate 3.6s, outros motions ate 4.8s. Planeje como cortes visuais curtos.",
    "Use hook_title ou kinetic_keyword no hook. Use callout/highlight para tela. Use lower_third/focus_frame/zoom para talking head.",
    "Cada title deve ser copy real do assunto falado, curta e forte.",
    "sectionId, subtitle e keyword tambem sao campos obrigatorios; quando nao souber, retorne null.",
    "",
    "Trechos inteligentes:",
    plan.sections.map((section) => `${section.id}: ${section.type}, ${round(section.startSec)}-${round(section.endSec)}s, label=${section.label}`).join("\n"),
    "",
    "Transcricao com timestamps:",
    transcriptToPrompt(transcript)
  ].join("\n");
}

function transcriptToPrompt(transcript: WhisperSegment[]) {
  const lines = transcript
    .filter((segment) => segment.text.trim().length > 0)
    .map((segment) => `[${round(segment.startSec)}-${round(segment.endSec)}] ${segment.text.replace(/\s+/g, " ").trim()}`);
  const joined = lines.join("\n");
  return joined.length > 52000 ? `${joined.slice(0, 52000)}\n[transcricao truncada por tamanho]` : joined;
}

function findTargetSection(sections: TimelineSection[], sectionId: string | null, startSec: number, endSec: number) {
  if (sectionId) {
    const exact = sections.find((section) => section.id === sectionId);
    if (exact) return exact;
  }
  const midpoint = startSec + (endSec - startSec) / 2;
  return sections.find((section) => midpoint >= section.startSec && midpoint <= section.endSec)
    ?? sections.find((section) => startSec < section.endSec && endSec > section.startSec)
    ?? sections[0];
}

function createMotionSlot(
  section: TimelineSection,
  transcript: WhisperSegment[],
  motion: AiMotionDecision["motions"][number],
  index: number
): MotionSlot | null {
  const maxEnd = section.type === "hook" ? Math.min(section.endSec, 20) : section.endSec;
  const startSec = clamp(round(motion.startSec), section.startSec, Math.max(section.startSec, maxEnd - 0.4));
  const maxDuration = getMaxMotionDurationSec(motion.kind, section.type);
  const requestedEnd = Math.max(motion.endSec, startSec + 1.2);
  const cappedEnd = Math.min(requestedEnd, startSec + maxDuration);
  const endSec = clamp(round(requestedEnd), startSec + 0.8, maxEnd);
  const cappedSlotEnd = clamp(round(cappedEnd), startSec + 0.8, endSec);
  if (cappedSlotEnd <= startSec) return null;

  const label = normalizeMotionLabel(motion.title, transcript, startSec, cappedSlotEnd);
  return {
    id: `ai_motion_${index + 1}_${motion.kind}`,
    kind: motion.kind,
    startSec,
    endSec: cappedSlotEnd,
    label,
    payload: {
      title: label,
      subtitle: motion.subtitle ?? "",
      keyword: motion.keyword ?? "",
      visualDirection: motion.visualDirection,
      reason: motion.reason,
      intensity: motion.intensity,
      position: motion.position,
      generatedBy: "openai"
    }
  };
}

function getMaxMotionDurationSec(kind: MotionSlot["kind"], sectionType: TimelineSection["type"]) {
  if (kind === "hook_title") return 5.5;
  if (kind === "kinetic_keyword") return 3.6;
  if (kind === "chapter_card") return 4.2;
  if (sectionType === "screen" || sectionType === "hybrid") return 4.8;
  return 4.5;
}

function ensureHookMotion(plan: EditPlan, transcript: WhisperSegment[], grouped: Map<string, MotionSlot[]>) {
  const hookSection = plan.sections.find((section) => section.type === "hook") ?? plan.sections[0];
  if (!hookSection) return;
  const existingHook = [...grouped.values()].flat().some((slot) => slot.startSec < 20);
  if (existingHook) return;

  const title = normalizeMotionLabel("", transcript, 0, Math.min(20, hookSection.endSec));
  const fallback: MotionSlot = {
    id: "ai_motion_hook_required",
    kind: "hook_title",
    startSec: 0.3,
    endSec: Math.min(5.5, hookSection.endSec, 20),
    label: title,
    payload: {
      title,
      subtitle: "Ponto central dos primeiros segundos",
      keyword: title.split(" ")[0] ?? "",
      visualDirection: "Titulo editorial com entrada forte para reter o inicio.",
      reason: "Todo video longo precisa de um hook visual nos primeiros 20 segundos.",
      intensity: "strong",
      position: "center",
      generatedBy: "fallback"
    }
  };
  grouped.set(hookSection.id, [fallback, ...(grouped.get(hookSection.id) ?? [])]);
}

function normalizeMotionLabel(label: string, transcript: WhisperSegment[], startSec: number, endSec: number) {
  const cleanLabel = label.replace(/\s+/g, " ").trim();
  if (cleanLabel && !isGenericLabel(cleanLabel)) return cleanLabel;
  const nearby = transcript
    .filter((segment) => segment.endSec > startSec && segment.startSec < endSec + 4)
    .map((segment) => segment.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const words = nearby.split(" ").filter(Boolean).slice(0, 8);
  return words.length ? words.join(" ") : "Ideia principal do trecho";
}

function isGenericLabel(label: string) {
  const normalized = label.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return ["gancho", "gancho visual", "ponto de atencao", "observe este ponto", "contexto do topico"].includes(normalized);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number(value.toFixed(3));
}
