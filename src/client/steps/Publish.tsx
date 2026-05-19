import { AlertTriangle, Calendar, Check, FileText, Upload } from "lucide-react";
import type { EditPlanSummary, ProjectJob, YoutubePackageSummary } from "../api";
import { StatusBadge } from "../components/StatusBadge";

type PublishProps = {
  youtubePackageSummary: YoutubePackageSummary | null;
  editPlan: EditPlanSummary | null;
  exportJob: ProjectJob | null;
  isExporting: boolean;
  isPublishingYoutube: boolean;
  youtubePublicationUrl: string | null;
  publicationVisibility: "private" | "unlisted" | "public";
  onPublicationVisibilityChange: (v: "private" | "unlisted" | "public") => void;
  onStartFinalExport: () => void;
  onPublishYoutube: () => void;
};

const VISIBILITY_LABELS: Record<string, string> = {
  private: "Privado",
  unlisted: "Não listado",
  public: "Público"
};

type ChecklistItem = {
  ok: boolean;
  label: string;
  warn?: boolean;
};

export function Publish({
  youtubePackageSummary,
  editPlan,
  exportJob,
  isExporting,
  isPublishingYoutube,
  youtubePublicationUrl,
  publicationVisibility,
  onPublicationVisibilityChange,
  onStartFinalExport,
  onPublishYoutube
}: PublishProps) {
  const hasPackage = youtubePackageSummary?.status === "ready";
  const hasCaptions = Boolean(editPlan?.captions.length);
  const hasExport = Boolean(exportJob?.outputUrl);

  const checklist: ChecklistItem[] = [
    { ok: Boolean(editPlan?.source), label: "Vídeo pronto (1080p)" },
    { ok: hasCaptions, label: "Transcrição gerada" },
    { ok: Boolean(youtubePackageSummary?.title), label: "Título e descrição" },
    { ok: true, label: `Visibilidade: ${VISIBILITY_LABELS[publicationVisibility]}`, warn: true }
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#e8e4de", letterSpacing: "-0.3px" }}>
            {hasExport ? "Pronto para publicar" : "Publicar"}
          </div>
          <div style={{ fontSize: 12, color: "#484845", marginTop: 3 }}>
            {hasExport ? "Export final gerado · revise antes de enviar" : "Gere o export final antes de publicar"}
          </div>
        </div>
        <StatusBadge variant={hasPackage ? "ready" : "waiting"} label={hasPackage ? "✓ Tudo pronto" : "Aguardando"} />
      </div>

      {/* Visibility selector */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
          Visibilidade
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["private", "unlisted", "public"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onPublicationVisibilityChange(v)}
              style={{
                flex: 1, padding: "7px",
                background: v === publicationVisibility ? "rgba(252,192,9,0.1)" : "var(--shell-surface)",
                border: `1px solid ${v === publicationVisibility ? "rgba(252,192,9,0.35)" : "var(--shell-border-soft)"}`,
                borderRadius: 6,
                fontSize: 10, fontWeight: 600,
                color: v === publicationVisibility ? "var(--shell-gold)" : "#555",
                cursor: "pointer"
              }}
            >
              {VISIBILITY_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      {/* Checklist */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
        {checklist.map(({ ok, label, warn }) => (
          <div key={label} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 10px", borderRadius: 6,
            background: "var(--shell-surface)"
          }}>
            {ok && !warn
              ? <Check size={12} color="var(--shell-green)" />
              : ok && warn
                ? <AlertTriangle size={12} color="var(--shell-gold)" />
                : <AlertTriangle size={12} color="var(--danger)" />
            }
            <span style={{ fontSize: 11, color: "#777" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Secondary actions */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button type="button" disabled style={{
          flex: 1, padding: "8px",
          background: "var(--shell-surface)", border: "1px solid var(--shell-border-soft)",
          borderRadius: 7, fontSize: 10, color: "#444", cursor: "not-allowed",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 4
        }}>
          <Calendar size={11} /> Agendar
        </button>
        <button type="button" disabled style={{
          flex: 1, padding: "8px",
          background: "var(--shell-surface)", border: "1px solid var(--shell-border-soft)",
          borderRadius: 7, fontSize: 10, color: "#444", cursor: "not-allowed",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 4
        }}>
          <FileText size={11} /> Rascunho
        </button>
      </div>

      {/* Export + publish CTA */}
      <button
        type="button"
        onClick={hasExport ? onPublishYoutube : onStartFinalExport}
        disabled={isExporting || isPublishingYoutube || !hasPackage}
        style={{
          width: "100%", padding: "11px",
          background: isExporting || isPublishingYoutube || !hasPackage ? "var(--shell-border)" : "var(--shell-gold)",
          border: "none", borderRadius: 8,
          fontSize: 12, fontWeight: 800,
          color: isExporting || isPublishingYoutube || !hasPackage ? "#333" : "#111",
          textTransform: "uppercase", letterSpacing: "0.5px",
          cursor: isExporting || isPublishingYoutube || !hasPackage ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          marginBottom: 8
        }}
      >
        <Upload size={13} />
        {isPublishingYoutube
          ? "Publicando…"
          : isExporting
            ? "Gerando export…"
            : hasExport
              ? "Publicar no YouTube"
              : "Gerar export final"}
      </button>

      <div style={{ fontSize: 10, color: "#3a3a38", textAlign: "center", lineHeight: 1.5 }}>
        {youtubePublicationUrl
          ? <a href={youtubePublicationUrl} target="_blank" rel="noreferrer" style={{ color: "var(--shell-gold)" }}>Publicado no YouTube</a>
          : hasExport
            ? "Export pronto. Clique para enviar direto ao YouTube."
          : "Revise thumbnail, título e descrição antes de gerar o export."}
      </div>
    </div>
  );
}
