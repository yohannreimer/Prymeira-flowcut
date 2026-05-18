import type { EditPlan, PublishReadiness, PublishReadinessCheck } from "../../shared/edit-plan";

export type PublishReadinessContext = {
  hasLatestExport: boolean;
  sourceColorTransfer?: string | null;
  sdrMode?: "preserve" | "convert_to_sdr";
};

const HDR_TRANSFER_VALUES = new Set(["arib-std-b67", "smpte2084", "smpte-st-2084"]);

export function assessPublishReadiness(plan: EditPlan, context: PublishReadinessContext): PublishReadiness {
  const checks: PublishReadinessCheck[] = [];

  if (plan.captionSettings.enabled && plan.captions.length === 0) {
    checks.push({
      id: "captions_missing",
      status: "failed",
      label: "Legendas ativadas sem legenda",
      message: "Gere ou desative as legendas antes de exportar.",
      targetTab: "captions"
    });
  } else {
    checks.push({
      id: "captions_present",
      status: "passed",
      label: "Legendas",
      message: "Configuracao de legendas consistente.",
      targetTab: "captions"
    });
  }

  const unresolvedProblem = plan.sections.find((section) => section.type === "problem" && section.warnings.length > 0);
  if (unresolvedProblem) {
    checks.push({
      id: "problem_sections",
      status: "warning",
      label: "Trechos com problema",
      message: "Revise trechos marcados como problema antes da publicacao.",
      targetTab: "cut",
      sectionId: unresolvedProblem.id
    });
  }

  if (isHdrTransfer(context.sourceColorTransfer) && !context.sdrMode) {
    checks.push({
      id: "sdr_decision",
      status: "warning",
      label: "Fonte HDR/HLG",
      message: "Escolha manter HDR ou converter para SDR seguro para YouTube.",
      targetTab: "image"
    });
  }

  if (!context.hasLatestExport) {
    checks.push({
      id: "latest_export",
      status: "warning",
      label: "Export final",
      message: "Gere um export final atualizado.",
      targetTab: "export"
    });
  }

  const status = checks.some((check) => check.status === "failed")
    ? "blocked"
    : checks.some((check) => check.status === "warning")
      ? "needs_review"
      : "ready";

  return { status, checks };
}

function isHdrTransfer(value?: string | null) {
  return value ? HDR_TRANSFER_VALUES.has(value.toLowerCase()) : false;
}
