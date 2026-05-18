type BadgeVariant = "processing" | "ready" | "waiting";

type StatusBadgeProps = {
  variant: BadgeVariant;
  label: string;
};

const STYLES: Record<BadgeVariant, React.CSSProperties> = {
  processing: {
    background: "var(--shell-blue-dim)", color: "var(--shell-blue)",
    border: "1px solid var(--shell-blue-border)"
  },
  ready: {
    background: "var(--shell-green-dim)", color: "var(--shell-green)",
    border: "1px solid var(--shell-green-border)"
  },
  waiting: {
    background: "rgba(255,255,255,0.04)", color: "#444",
    border: "1px solid #222"
  }
};

export function StatusBadge({ variant, label }: StatusBadgeProps) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      padding: "4px 10px", borderRadius: 999,
      textTransform: "uppercase", letterSpacing: "0.5px",
      whiteSpace: "nowrap",
      ...STYLES[variant]
    }}>
      {label}
    </span>
  );
}
