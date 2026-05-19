import { AlignLeft, Check, Image, List, Type } from "lucide-react";
import type { ProjectJob, YoutubePackageSummary } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { ThumbnailPicker } from "../components/ThumbnailPicker";
import { getGeneratedThumbnailAssets } from "../youtube-package-ui";

type YouTubePackageProps = {
  youtubePackageSummary: YoutubePackageSummary | null;
  youtubePackageJob: ProjectJob | null;
  isGeneratingYoutubePackage: boolean;
  selectedGeneratedThumbnailName: string | null;
  onSelectGeneratedThumbnail: (name: string) => void;
  onGenerateYoutubePackage: () => void;
  publicationTitle: string;
  publicationDescription: string;
  onPublicationTitleChange: (title: string) => void;
  onPublicationDescriptionChange: (desc: string) => void;
  onNext: () => void;
};

export function YouTubePackage({
  youtubePackageSummary,
  youtubePackageJob,
  isGeneratingYoutubePackage,
  selectedGeneratedThumbnailName,
  onSelectGeneratedThumbnail,
  onGenerateYoutubePackage,
  publicationTitle,
  publicationDescription,
  onPublicationTitleChange,
  onPublicationDescriptionChange,
  onNext,
}: YouTubePackageProps) {
  const isRunning =
    isGeneratingYoutubePackage ||
    (youtubePackageJob !== null &&
      ["queued", "running"].includes(youtubePackageJob.status ?? ""));
  const hasPackage = youtubePackageSummary?.status === "ready";
  const generatedThumbnails = getGeneratedThumbnailAssets(youtubePackageSummary);

  const fieldStyle: React.CSSProperties = {
    fontSize: 11,
    color: "#bbb",
    background: "var(--shell-surface)",
    border: "1px solid var(--shell-border-soft)",
    borderRadius: 6,
    padding: "7px 10px",
    width: "100%",
    lineHeight: 1.5,
    fontFamily: "inherit",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 700,
    color: "#444",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    display: "flex",
    alignItems: "center",
    gap: 5,
    marginBottom: 4,
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: "#e8e4de",
              letterSpacing: "-0.3px",
            }}
          >
            {isRunning
              ? "Gerando pacote"
              : hasPackage
                ? "Pacote pronto"
                : "Pacote YouTube"}
          </div>
          <div style={{ fontSize: 12, color: "#484845", marginTop: 3 }}>
            {isRunning
              ? "Gerando título, descrição, capítulos e thumbnails…"
              : hasPackage
                ? "Revise e edite antes de publicar"
                : "Aguardando transcrição"}
          </div>
        </div>
        <StatusBadge
          variant={isRunning ? "processing" : hasPackage ? "ready" : "waiting"}
          label={isRunning ? "● Gerando" : hasPackage ? "✓ Pronto" : "Aguardando"}
        />
      </div>

      {/* Processing */}
      {isRunning && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SkeletonLoader width="80%" />
          <SkeletonLoader width="65%" />
          <SkeletonLoader width="90%" />
        </div>
      )}

      {/* Not started */}
      {!hasPackage && !isRunning && (
        <button
          type="button"
          onClick={onGenerateYoutubePackage}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            background: "var(--shell-gold)",
            border: "none",
            fontSize: 12,
            fontWeight: 800,
            color: "#111",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            cursor: "pointer",
          }}
        >
          Gerar pacote YouTube
        </button>
      )}

      {/* Two-pane layout when ready */}
      {hasPackage && youtubePackageSummary && !isRunning && (
        <div style={{ display: "flex", gap: 20 }}>
          {/* Left: metadata */}
          <div
            style={{
              flex: "0 0 52%",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div>
              <div style={labelStyle}>
                <Type size={9} /> Título
              </div>
              <input
                value={publicationTitle || youtubePackageSummary.title || ""}
                onChange={(e) => onPublicationTitleChange(e.currentTarget.value)}
                style={fieldStyle}
              />
            </div>

            <div>
              <div style={labelStyle}>
                <AlignLeft size={9} /> Descrição
              </div>
              <textarea
                rows={4}
                value={
                  publicationDescription ||
                  youtubePackageSummary.description ||
                  ""
                }
                onChange={(e) =>
                  onPublicationDescriptionChange(e.currentTarget.value)
                }
                style={{ ...fieldStyle, resize: "vertical" }}
              />
            </div>

            {/* Chapters */}
            {youtubePackageSummary.chapters && (
              <div>
                <div style={labelStyle}>
                  <List size={9} /> Capítulos{" "}
                  <span
                    style={{
                      fontSize: 8,
                      color: "#3a3a38",
                      fontWeight: 400,
                      textTransform: "none",
                      letterSpacing: 0,
                      marginLeft: 4,
                    }}
                  >
                    gerados da transcrição
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {youtubePackageSummary.chapters
                    .split("\n")
                    .filter(Boolean)
                    .map((line, i) => {
                      const [ts, ...rest] = line.split(" ");
                      return (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 8px",
                            borderRadius: 5,
                            background: "var(--shell-surface)",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: "var(--shell-gold)",
                              fontVariantNumeric: "tabular-nums",
                              minWidth: 36,
                            }}
                          >
                            {ts}
                          </span>
                          <span style={{ fontSize: 10, color: "#888", flex: 1 }}>
                            {rest.join(" ")}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Thumbnail ideas count */}
            {youtubePackageSummary.thumbnailIdeas.length > 0 && (
              <div style={{ fontSize: 10, color: "#3a3a38", paddingTop: 4 }}>
                {youtubePackageSummary.thumbnailIdeas.length} ideias de thumbnail
                geradas
              </div>
            )}
          </div>

          {/* Right: thumbnail picker */}
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>
              <Image size={9} /> Thumbnail
            </div>
            {generatedThumbnails.length > 0 ? (
              <ThumbnailPicker
                options={generatedThumbnails}
                selectedName={selectedGeneratedThumbnailName}
                onSelect={onSelectGeneratedThumbnail}
              />
            ) : (
              <div
                style={{
                  padding: "20px",
                  borderRadius: 8,
                  background: "var(--shell-surface)",
                  border: "1px solid var(--shell-border)",
                  fontSize: 11,
                  color: "#444",
                  textAlign: "center",
                }}
              >
                Nenhuma thumbnail gerada ainda.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Next step CTA */}
      {hasPackage && !isRunning && (
        <div style={{
          marginTop: 16,
          padding: "12px 16px", borderRadius: 8,
          background: "rgba(76,175,125,0.07)", border: "1px solid rgba(76,175,125,0.2)",
          display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#4caf7d", fontWeight: 600 }}>
            <Check size={13} color="#4caf7d" />
            Pacote pronto · pronto para publicar
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
            Ir para publicar →
          </button>
        </div>
      )}
    </div>
  );
}
