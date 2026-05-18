import { Film, Video } from "lucide-react";
import { VIDEO_FILE_INPUT_ACCEPT } from "../../shared/video-formats";
import type { ProjectLibraryItem } from "../../shared/project-library";
import { formatBytes } from "../api";
import { StatusBadge } from "../components/StatusBadge";

type VideoUploadProps = {
  fileLimitBytes: number | undefined;
  isFileTooLarge: boolean;
  error: string | null;
  projects: ProjectLibraryItem[];
  onFileSelected: (file: File | null) => void;
  onStartUpload: () => void;
  file: File | null;
  isUploading: boolean;
};

export function VideoUpload({
  fileLimitBytes,
  isFileTooLarge,
  error,
  projects,
  onFileSelected,
  onStartUpload,
  file,
  isUploading
}: VideoUploadProps) {
  const recentProjects = projects.slice(0, 3);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#e8e4de", letterSpacing: "-0.3px" }}>
            Envie seu vídeo
          </div>
          <div style={{ fontSize: 12, color: "#484845", marginTop: 3 }}>
            MP4, MOV ou MKV · até {fileLimitBytes ? formatBytes(fileLimitBytes) : "5GB"}
          </div>
        </div>
        <StatusBadge variant="waiting" label="Aguardando" />
      </div>

      {/* Drop zone */}
      <label style={{
        display: "block",
        border: isFileTooLarge ? "1.5px dashed var(--danger)" : "1.5px dashed var(--shell-border-soft)",
        borderRadius: 12,
        padding: "40px 32px",
        textAlign: "center",
        background: "var(--shell-surface)",
        cursor: "pointer",
        marginBottom: 16
      }}>
        <input
          type="file"
          accept={VIDEO_FILE_INPUT_ACCEPT}
          style={{ display: "none" }}
          onChange={(e) => onFileSelected(e.currentTarget.files?.[0] ?? null)}
        />
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: "#444" }}>
          <Film size={32} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#ccc", marginBottom: 4 }}>
          {file ? file.name : "Arraste o vídeo aqui"}
        </div>
        <div style={{ fontSize: 11, color: "#444" }}>
          {file ? formatBytes(file.size) : "ou clique para selecionar do Finder"}
        </div>
        {file && !isUploading && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onStartUpload(); }}
            style={{
              display: "inline-block", marginTop: 16,
              background: "var(--shell-gold)", color: "#111",
              fontSize: 11, fontWeight: 800,
              padding: "9px 20px", borderRadius: 8,
              textTransform: "uppercase", letterSpacing: "0.5px",
              border: "none", cursor: "pointer"
            }}
          >
            Enviar vídeo
          </button>
        )}
        {isUploading && (
          <div style={{ marginTop: 16, fontSize: 12, color: "var(--shell-blue)" }}>
            Enviando…
          </div>
        )}
      </label>

      {/* Error */}
      {(error || isFileTooLarge) && (
        <div style={{
          padding: "10px 14px", borderRadius: 8,
          background: "rgba(159,77,72,0.1)", border: "1px solid rgba(159,77,72,0.25)",
          color: "var(--danger)", fontSize: 12, marginBottom: 14
        }}>
          {isFileTooLarge ? "Arquivo acima do limite configurado." : error}
        </div>
      )}

      {/* Recent projects */}
      {recentProjects.length > 0 && (
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#333", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Projetos recentes
          </div>
          {recentProjects.map((project) => (
            <div key={project.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "7px 10px", borderRadius: 7,
              background: "var(--shell-surface)", marginBottom: 4
            }}>
              <Video size={13} color="#3a3a38" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {project.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
