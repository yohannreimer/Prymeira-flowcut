import { useState } from "react";
import { Check, Maximize2, X } from "lucide-react";

export type ThumbnailOption = {
  name: string;
  url: string;
};

type ThumbnailPickerProps = {
  options: ThumbnailOption[];
  selectedName: string | null;
  onSelect: (name: string) => void;
};

export function ThumbnailPicker({ options, selectedName, onSelect }: ThumbnailPickerProps) {
  const [lightboxName, setLightboxName] = useState<string | null>(null);
  const lightboxOption = options.find((o) => o.name === lightboxName) ?? null;

  return (
    <>
      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {options.map((opt, i) => {
          const isSelected = opt.name === selectedName;
          return (
            <div
              key={opt.name}
              onClick={() => onSelect(opt.name)}
              style={{
                borderRadius: 8, overflow: "hidden",
                border: `2px solid ${isSelected ? "var(--shell-gold)" : "var(--shell-border)"}`,
                cursor: "pointer", position: "relative", background: "#111",
                transition: "border-color 0.15s"
              }}
            >
              <img
                src={opt.url}
                alt={`Thumbnail opção ${i + 1}`}
                style={{ width: "100%", aspectRatio: "16/9", display: "block", objectFit: "cover" }}
              />

              {/* Label tag */}
              <div style={{
                position: "absolute", top: 5, left: 5,
                fontSize: 8, fontWeight: 700,
                background: isSelected ? "rgba(252,192,9,0.9)" : "rgba(0,0,0,0.8)",
                color: isSelected ? "#111" : "#888",
                padding: "2px 6px", borderRadius: 3,
                textTransform: "uppercase", letterSpacing: "0.5px"
              }}>
                {String(i + 1).padStart(2, "0")}
              </div>

              {/* Checkmark */}
              {isSelected && (
                <div style={{
                  position: "absolute", top: 5, right: 5,
                  width: 18, height: 18,
                  background: "var(--shell-gold)", borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  <Check size={10} color="#111" />
                </div>
              )}

              {/* Expand icon */}
              <div
                onClick={(e) => { e.stopPropagation(); setLightboxName(opt.name); }}
                style={{
                  position: "absolute", bottom: 5, right: 5,
                  width: 22, height: 22,
                  background: "rgba(0,0,0,0.7)", borderRadius: 4,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer"
                }}
              >
                <Maximize2 size={11} color="#aaa" />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 10, color: "#3a3a38", marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
        Clique para selecionar · ícone para ampliar
      </div>

      {/* Lightbox */}
      {lightboxOption && (
        <div
          onClick={() => setLightboxName(null)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.92)",
            zIndex: 9999,
            display: "flex", alignItems: "center", justifyContent: "center"
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: "relative", width: 720, maxWidth: "90vw" }}
          >
            {/* Close */}
            <div
              onClick={() => setLightboxName(null)}
              style={{
                position: "absolute", top: -36, right: 0,
                width: 28, height: 28,
                background: "var(--shell-border)", borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", border: "1px solid var(--shell-border-soft)"
              }}
            >
              <X size={14} color="#666" />
            </div>

            <img
              src={lightboxOption.url}
              alt="Preview ampliado"
              style={{ width: "100%", borderRadius: 10, display: "block" }}
            />

            <div style={{ textAlign: "center", fontSize: 12, color: "#666", marginTop: 12 }}>
              {lightboxOption.name}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => { onSelect(lightboxOption.name); setLightboxName(null); }}
                style={{
                  padding: "8px 18px", borderRadius: 7,
                  background: "var(--shell-gold)", border: "none",
                  fontSize: 11, fontWeight: 700, color: "#111",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 6
                }}
              >
                <Check size={12} /> Usar esta thumbnail
              </button>
              <button
                type="button"
                onClick={() => setLightboxName(null)}
                style={{
                  padding: "8px 18px", borderRadius: 7,
                  background: "var(--shell-border)", border: "1px solid var(--shell-border-soft)",
                  fontSize: 11, fontWeight: 700, color: "#666",
                  cursor: "pointer"
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
