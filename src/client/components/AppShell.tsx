import type { ReactNode } from "react";

type AppShellProps = {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
};

export function AppShell({ sidebar, header, children }: AppShellProps) {
  return (
    <div className="guided-shell-root">
      <div className="guided-shell-sidebar">{sidebar}</div>
      <div className="guided-shell-main">
        <div style={{
          padding: "18px 24px 16px",
          borderBottom: "1px solid var(--shell-border)",
          flexShrink: 0
        }}>
          {header}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
