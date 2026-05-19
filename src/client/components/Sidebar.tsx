import { Check, Loader } from "lucide-react";

export type StepStatus = "done" | "active" | "processing" | "locked";

export type SidebarStep = {
  number: number;
  label: string;
  sub: string;
  status: StepStatus;
};

type SidebarProps = {
  projectName: string | null;
  steps: SidebarStep[];
  footerLabel: string;
  footerDisabled: boolean;
  onFooterClick: () => void;
  viewingStep: number;
  onStepClick: (n: number) => void;
};

const BADGE_STYLES: Record<StepStatus, React.CSSProperties> = {
  done: {
    background: "#1b2e22", color: "#4caf7d",
    border: "1.5px solid #2a4a34"
  },
  active: {
    background: "var(--shell-gold-dim)", color: "var(--shell-gold)",
    border: "1.5px solid var(--shell-gold-border)"
  },
  processing: {
    background: "var(--shell-blue-dim)", color: "var(--shell-blue)",
    border: "1.5px solid var(--shell-blue-border)",
    animation: "shell-pulse 1.4s ease-in-out infinite"
  },
  locked: {
    background: "#161614", color: "#2a2a28",
    border: "1.5px solid #222"
  }
};

const LABEL_COLOR: Record<StepStatus, string> = {
  done: "#555",
  active: "var(--shell-gold)",
  processing: "var(--shell-blue)",
  locked: "#2a2a28"
};

const SUB_COLOR: Record<StepStatus, string> = {
  done: "#3a3a38",
  active: "rgba(252,192,9,0.5)",
  processing: "rgba(80,154,212,0.45)",
  locked: "#1e1e1c"
};

export function Sidebar({ projectName, steps, footerLabel, footerDisabled, onFooterClick, viewingStep, onStepClick }: SidebarProps) {
  return (
    <>
      {/* Top */}
      <div style={{ padding: "18px 16px 14px", borderBottom: "1px solid var(--shell-border)" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--shell-gold)", letterSpacing: "1.5px", textTransform: "uppercase" }}>
          Flowcut
        </div>
        <div style={{ fontSize: 12, color: "#444", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {projectName ?? "Sem projeto aberto"}
        </div>
      </div>

      {/* Steps */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
        {steps.map((step) => (
          <div
            key={step.number}
            onClick={step.status !== "locked" ? () => onStepClick(step.number) : undefined}
            style={{
              display: "flex", alignItems: "center", gap: 11,
              padding: "9px 14px 9px 16px",
              position: "relative",
              cursor: step.status !== "locked" ? "pointer" : "default",
              background: step.number === viewingStep ? "rgba(252,192,9,0.06)" : "transparent",
              borderLeft: step.number === viewingStep ? "2px solid var(--shell-gold)" : "2px solid transparent"
            }}
          >
            {/* Badge */}
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 800, flexShrink: 0,
              ...BADGE_STYLES[step.status]
            }}>
              {step.status === "done" ? <Check size={10} /> :
               step.status === "processing" ? <Loader size={10} /> :
               step.number}
            </div>

            {/* Labels */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.2, color: LABEL_COLOR[step.status] }}>
                {step.label}
              </div>
              <div style={{ fontSize: 10, marginTop: 1, color: SUB_COLOR[step.status] }}>
                {step.sub}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer CTA */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #1a1a18" }}>
        <button
          type="button"
          disabled={footerDisabled}
          onClick={onFooterClick}
          style={{
            width: "100%", padding: "9px",
            background: footerDisabled ? "#1e1e1c" : "var(--shell-gold)",
            border: "none", borderRadius: 8,
            fontSize: 12, fontWeight: 800,
            color: footerDisabled ? "#333" : "#111",
            textTransform: "uppercase", letterSpacing: "0.5px",
            cursor: footerDisabled ? "not-allowed" : "pointer"
          }}
        >
          {footerLabel}
        </button>
      </div>
    </>
  );
}
