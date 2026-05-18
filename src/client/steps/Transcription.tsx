import { Monitor, Smartphone } from "lucide-react";
import type { EditPlanSummary, ProjectJob } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { SkeletonLoader } from "../components/SkeletonLoader";

type TranscriptionProps = {
  editPlan: EditPlanSummary | null;
  captionJob: ProjectJob | null;
  isCaptioning: boolean;
  videoOrientation: "horizontal" | "vertical";
  onGenerateCaptions: () => void;
};

function formatTimestamp(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

export function Transcription({
  editPlan,
  captionJob,
  isCaptioning,
  videoOrientation,
  onGenerateCaptions
}: TranscriptionProps) {
  const isRunning = isCaptioning || (captionJob !== null && ["queued", "running"].includes(captionJob.status));
  const hasCaptions = Boolean(editPlan?.captions.length);
  const isFailed = captionJob?.status === "failed";
  const captions = editPlan?.captions ?? [];
  const captionCount = captions.length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#e8e4de", letterSpacing: "-0.3px" }}>
            {isRunning ? "Gerando transcrição" : hasCaptions ? "Transcrição gerada" : "Transcrição"}
          </div>
          <div style={{ fontSize: 12, color: "#484845", marginTop: 3 }}>
            {isRunning ? "Transcrição com IA · ~2 min" :
             hasCaptions ? `${captionCount} segmentos · SRT + VTT` :
             "Aguardando corte"}
          </div>
        </div>
        <StatusBadge
          variant={isRunning ? "processing" : hasCaptions ? "ready" : "waiting"}
          label={isRunning ? "● Processando" : hasCaptions ? "✓ Transcrito" : "Aguardando"}
        />
      </div>

      {/* Orientation tag */}
      {(hasCaptions || isRunning) && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 10, padding: "4px 10px", borderRadius: 4,
          border: "1px solid var(--shell-border-soft)", color: "#555", marginBottom: 12
        }}>
          {videoOrientation === "horizontal"
            ? <><Monitor size={11} /> Horizontal · YouTube</>
            : <><Smartphone size={11} /> Vertical · Reels / Shorts</>
          }
        </div>
      )}

      {/* Processing */}
      {isRunning && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <SkeletonLoader width="88%" />
          <SkeletonLoader width="70%" />
          <SkeletonLoader width="80%" />
          <SkeletonLoader width="55%" />
        </div>
      )}

      {/* Failed */}
      {isFailed && !isRunning && (
        <div style={{
          padding: "10px 14px", borderRadius: 8,
          background: "rgba(159,77,72,0.1)", border: "1px solid rgba(159,77,72,0.25)",
          color: "var(--danger)", fontSize: 12, marginBottom: 12
        }}>
          {captionJob?.error ?? "Falha na transcrição."}
        </div>
      )}

      {/* Done: horizontal — simple transcript list */}
      {hasCaptions && !isRunning && videoOrientation === "horizontal" && (
        <div>
          <p style={{ fontSize: 11, color: "#555", lineHeight: 1.6, marginBottom: 12 }}>
            Transcrição gerada. Usada para criar título, descrição e tags — não aparece no vídeo.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 260, overflowY: "auto" }}>
            {captions.slice(0, 20).map((cap, i) => (
              <div key={cap.id} style={{
                padding: "6px 8px", borderRadius: 6,
                background: "var(--shell-surface)",
                border: i === 0 ? "1px solid rgba(252,192,9,0.2)" : "1px solid transparent"
              }}>
                <div style={{ fontSize: 9, color: "#3a3a38", marginBottom: 2, fontVariantNumeric: "tabular-nums" }}>
                  {formatTimestamp(cap.startSec)} — {formatTimestamp(cap.endSec)}
                </div>
                <div style={{ fontSize: 11, color: i === 0 ? "#ccc" : "#777", lineHeight: 1.4 }}>
                  {cap.text}
                </div>
              </div>
            ))}
            {captions.length > 20 && (
              <div style={{ fontSize: 10, color: "#3a3a38", padding: "4px 8px" }}>
                + {captions.length - 20} segmentos
              </div>
            )}
          </div>
          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", fontSize: 10 }}>
            <span style={{ color: "#3a3a38" }}>{captionCount} segmentos · SRT + VTT gerados</span>
          </div>
        </div>
      )}

      {/* Done: vertical — future placeholder */}
      {hasCaptions && !isRunning && videoOrientation === "vertical" && (
        <div>
          <div style={{
            padding: "14px", borderRadius: 8,
            background: "var(--shell-surface)", border: "1px solid var(--shell-border)",
            fontSize: 12, color: "#555", lineHeight: 1.6
          }}>
            Editor de legenda no vídeo disponível para conteúdo vertical em breve.
          </div>
        </div>
      )}

      {/* Not yet started — generate button */}
      {!hasCaptions && !isRunning && !isFailed && editPlan && (
        <button
          type="button"
          onClick={onGenerateCaptions}
          style={{
            padding: "10px 20px", borderRadius: 8,
            background: "var(--shell-gold)", border: "none",
            fontSize: 12, fontWeight: 800, color: "#111",
            textTransform: "uppercase", letterSpacing: "0.5px",
            cursor: "pointer"
          }}
        >
          Gerar transcrição
        </button>
      )}
    </div>
  );
}
