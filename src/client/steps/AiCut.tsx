import { Check, Download, Film } from "lucide-react";
import type { EditPlanSummary, ProjectJob, VerticalPackageSummary } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { SkeletonLoader } from "../components/SkeletonLoader";

type AiCutProps = {
  job: ProjectJob | null;
  editPlan: EditPlanSummary | null;
  verticalPackageSummary?: VerticalPackageSummary | null;
  isUploading: boolean;
  onNext: () => void;
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AiCut({ job, editPlan, verticalPackageSummary = null, isUploading, onNext }: AiCutProps) {
  const isRunning = isUploading || (job !== null && ["queued", "running"].includes(job.status));
  const verticalClips = verticalPackageSummary?.status === "ready" ? verticalPackageSummary.clips : [];
  const hasVerticalClips = verticalClips.length > 0;
  const hasCut = Boolean(job?.outputUrl) || hasVerticalClips;
  const isFailed = job?.status === "failed";

  const segments = editPlan?.segments ?? [];
  const removedIntervals = editPlan?.removed ?? [];
  const renderedSec = segments.reduce((sum, seg) => sum + (seg.timelineEndSec - seg.timelineStartSec), 0);
  const removedSec = removedIntervals.reduce((sum, r) => sum + (r.endSec - r.startSec), 0);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#e8e4de", letterSpacing: "-0.3px" }}>
            {isRunning ? "Gerando corte IA" : hasVerticalClips ? "Cortes verticais gerados" : hasCut ? "Corte gerado" : "Corte com IA"}
          </div>
          <div style={{ fontSize: 12, color: "#484845", marginTop: 3 }}>
            {isRunning ? (job?.message ?? "Detectando silêncios e segmentos · ~2 min") :
             hasVerticalClips ? `${verticalClips.length} cortes SupoClip prontos` :
             hasCut ? `${segments.length} segmentos mantidos` :
             "Aguardando vídeo"}
          </div>
        </div>
        <StatusBadge
          variant={isRunning ? "processing" : hasCut ? "ready" : "waiting"}
          label={isRunning ? "● Processando" : hasCut ? "✓ Pronto" : "Aguardando"}
        />
      </div>

      {/* Processing state */}
      {isRunning && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SkeletonLoader width="90%" />
          <SkeletonLoader width="75%" />
          <SkeletonLoader width="83%" />
          <SkeletonLoader width="60%" />
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <SkeletonLoader width="25%" height={10} borderRadius={999} />
            <SkeletonLoader width="18%" height={10} borderRadius={999} />
          </div>
        </div>
      )}

      {/* Failed state */}
      {isFailed && !isRunning && (
        <div style={{
          padding: "12px 14px", borderRadius: 8,
          background: "rgba(159,77,72,0.1)", border: "1px solid rgba(159,77,72,0.25)",
          color: "var(--danger)", fontSize: 12
        }}>
          {job?.error ?? "Falha no processamento. Tente novamente."}
        </div>
      )}

      {/* Done state: vertical SupoClip clips */}
      {hasVerticalClips && !isRunning && (
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            {verticalClips.map((clip) => (
              <div
                key={clip.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "92px minmax(0, 1fr)",
                  gap: 10,
                  padding: 10,
                  borderRadius: 8,
                  background: "var(--shell-surface)",
                  border: "1px solid var(--shell-border-soft)"
                }}
              >
                <div style={{ background: "#000", borderRadius: 7, overflow: "hidden", aspectRatio: "9 / 16" }}>
                  <video src={clip.clipUrl} controls preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
                <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 10, color: "var(--shell-gold)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Rank {String(clip.rank).padStart(2, "0")}
                    </div>
                    {typeof clip.score === "number" ? (
                      <div style={{ fontSize: 10, color: "#777", fontVariantNumeric: "tabular-nums" }}>
                        score {Math.round(clip.score)}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#d8d1c7", lineHeight: 1.25, overflowWrap: "anywhere" }}>
                    {clip.title}
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#666", fontVariantNumeric: "tabular-nums" }}>
                    {typeof clip.durationSec === "number" ? <span>{formatDuration(clip.durationSec)}</span> : null}
                    {typeof clip.startSec === "number" && typeof clip.endSec === "number" ? (
                      <span>{formatDuration(clip.startSec)}-{formatDuration(clip.endSec)}</span>
                    ) : null}
                  </div>
                  <a
                    href={clip.clipUrl}
                    download
                    style={{
                      marginTop: "auto",
                      width: "fit-content",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "7px 9px",
                      borderRadius: 6,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid var(--shell-border-soft)",
                      color: "#a9a39a",
                      fontSize: 10,
                      fontWeight: 700,
                      textDecoration: "none"
                    }}
                  >
                    <Download size={11} /> Baixar clip
                  </a>
                </div>
              </div>
            ))}
          </div>

          <div style={{
            padding: "12px 16px", borderRadius: 8,
            background: "rgba(76,175,125,0.07)", border: "1px solid rgba(76,175,125,0.2)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#4caf7d", fontWeight: 600 }}>
              <Check size={13} color="#4caf7d" />
              Cortes prontos para Shorts e Reels
            </div>
            <button
              type="button"
              onClick={onNext}
              style={{
                padding: "7px 14px", borderRadius: 6,
                background: "var(--shell-gold)", border: "none",
                fontSize: 11, fontWeight: 800, color: "#111",
                cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.5px",
                whiteSpace: "nowrap"
              }}
            >
              Publicar →
            </button>
          </div>
        </div>
      )}

      {/* Done state: video + segments */}
      {hasCut && !hasVerticalClips && editPlan && !isRunning && (
        <div>
          {/* Video player */}
          <div style={{
            background: "#000", borderRadius: 10, overflow: "hidden",
            border: "1px solid #222", marginBottom: 12
          }}>
            {job?.outputUrl ? (
              <video
                src={job.outputUrl}
                controls
                style={{ width: "100%", display: "block", maxHeight: 320 }}
              />
            ) : (
              <div style={{
                height: 160, display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <Film size={20} color="#333" />
              </div>
            )}
          </div>

          {/* Meta row */}
          <div style={{
            display: "flex", gap: 20,
            padding: "10px 14px", marginBottom: 12,
            background: "var(--shell-surface)", borderRadius: 8, border: "1px solid #1e1e1c"
          }}>
            {[
              { label: "Duração", value: formatDuration(renderedSec) },
              { label: "Segmentos", value: String(segments.length) },
              { label: "Removido", value: formatDuration(removedSec) }
            ].map(({ label, value }) => (
              <div key={label} style={{ fontSize: 11 }}>
                <div style={{ color: "#3a3a38", textTransform: "uppercase", letterSpacing: "0.5px", fontSize: 9, marginBottom: 2 }}>{label}</div>
                <div style={{ color: "#888", fontWeight: 700 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Segment list (first 5) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 16 }}>
            {segments.slice(0, 5).map((seg, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "5px 8px", borderRadius: 5,
                background: "var(--shell-surface)"
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: "var(--shell-green)" }} />
                <div style={{ fontSize: 9, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "#555" }}>
                  {formatDuration(seg.timelineStartSec)}–{formatDuration(seg.timelineEndSec)}
                </div>
                <div style={{ flex: 1, height: 3, background: "#1e1e1c", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 2, background: "var(--shell-green)", opacity: 0.5,
                    width: `${Math.min(100, ((seg.timelineEndSec - seg.timelineStartSec) / (renderedSec || 1)) * 100)}%`
                  }} />
                </div>
              </div>
            ))}
            {segments.length > 5 && (
              <div style={{ fontSize: 10, color: "#3a3a38", paddingLeft: 8, marginTop: 2 }}>
                + {segments.length - 5} segmentos
              </div>
            )}
          </div>

          {/* Next step CTA */}
          <div style={{
            padding: "12px 16px", borderRadius: 8,
            background: "rgba(76,175,125,0.07)", border: "1px solid rgba(76,175,125,0.2)",
            display: "flex", alignItems: "center", justifyContent: "space-between"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#4caf7d", fontWeight: 600 }}>
              <Check size={13} color="#4caf7d" />
              Corte gerado · pronto para transcrição
            </div>
            <button
              type="button"
              onClick={onNext}
              style={{
                padding: "7px 14px", borderRadius: 6,
                background: "var(--shell-gold)", border: "none",
                fontSize: 11, fontWeight: 800, color: "#111",
                cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.5px"
              }}
            >
              Ir para transcrição →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
