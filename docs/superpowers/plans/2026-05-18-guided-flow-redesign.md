# Guided Flow Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat MVP guided flow in `src/client/App.tsx` with a dark-sidebar pipeline shell, skeleton loading states, and polished per-step content panels.

**Architecture:** All existing state stays in `App.tsx` (advanced editor is out of scope). A new `GuidedShell` component replaces the current `GuidedSaasFlow` and `topbar` sections; it composes `AppShell`, `Sidebar`, and five step components. New components use inline `style` props to avoid polluting `styles.css`.

**Tech Stack:** React 19, TypeScript, Lucide React (new), Vitest (existing), inline styles (no CSS framework).

---

## Codebase orientation

Before touching any file, read these sections of `src/client/App.tsx`:
- Lines 1–70: imports — understand what's already available
- Lines 73–132: all `useState` / `useRef` declarations
- Lines 1460–1825: existing `GuidedSaasFlowProps` type + `GuidedSaasFlow` function — **this is what gets replaced**
- Lines 914–978: the `return (` block with `topbar` + `GuidedSaasFlow` usage — **this is the mount point**
- Lines 979–1459: advanced editor (`isAdvancedEditorOpen` block) — **leave this untouched**

Also read `src/client/api.ts` lines 16–82 to understand `ProjectJob`, `EditPlanSummary`, and `YoutubePackageSummary` types.

---

## File map

| Action | Path | Purpose |
|---|---|---|
| Create | `src/client/components/AppShell.tsx` | Two-column layout: sidebar + main |
| Create | `src/client/components/Sidebar.tsx` | Pipeline step list with status badges |
| Create | `src/client/components/StatusBadge.tsx` | Pill badge: processing / ready / waiting |
| Create | `src/client/components/SkeletonLoader.tsx` | Shimmer bar placeholder |
| Create | `src/client/components/ThumbnailPicker.tsx` | 2×2 grid + lightbox |
| Create | `src/client/steps/VideoUpload.tsx` | Step 1 panel |
| Create | `src/client/steps/AiCut.tsx` | Step 2 panel |
| Create | `src/client/steps/Transcription.tsx` | Step 3 panel (branches on orientation) |
| Create | `src/client/steps/YouTubePackage.tsx` | Step 4 panel |
| Create | `src/client/steps/Publish.tsx` | Step 5 panel |
| Create | `src/client/GuidedShell.tsx` | Wires all components; replaces GuidedSaasFlow |
| Modify | `src/client/App.tsx` | Swap topbar + GuidedSaasFlow → GuidedShell |
| Modify | `src/client/styles.css` | Add dark-theme tokens; remove saas-flow rules |

---

## Task 1: Install lucide-react

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install the package**

```bash
cd /Users/yohannreimer/Downloads/Locais/MediaFactory-SaaS
npm install lucide-react
```

- [ ] **Step 2: Verify it resolves**

```bash
node -e "require('./node_modules/lucide-react')" && echo "OK"
```

Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add lucide-react icon library"
```

---

## Task 2: Add dark theme CSS tokens

**Files:**
- Modify: `src/client/styles.css` (top of file, inside `:root`)

- [ ] **Step 1: Open styles.css and find the `:root` block (line 1)**

It currently ends around `--video-black: #10100f;`. Append these tokens inside `:root` after the last existing token:

```css
  /* ── Dark shell tokens ── */
  --shell-bg: #0a0a09;
  --shell-sidebar: #111110;
  --shell-main: #161614;
  --shell-surface: #1a1a18;
  --shell-border: #1e1e1c;
  --shell-border-soft: #252523;
  --shell-muted: #3a3a38;
  --shell-gold: #fcc009;
  --shell-gold-dim: rgba(252, 192, 9, 0.1);
  --shell-gold-border: rgba(252, 192, 9, 0.35);
  --shell-blue: #509ad4;
  --shell-blue-dim: rgba(80, 154, 212, 0.1);
  --shell-blue-border: rgba(80, 154, 212, 0.3);
  --shell-green: #4caf7d;
  --shell-green-dim: rgba(76, 175, 125, 0.1);
  --shell-green-border: rgba(76, 175, 125, 0.2);
```

- [ ] **Step 2: Add `.guided-shell` layout rule at the bottom of styles.css**

```css
/* ── Guided shell layout ── */
.guided-shell-root {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--shell-bg);
}
.guided-shell-sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--shell-sidebar);
  border-right: 1px solid var(--shell-border);
  display: flex;
  flex-direction: column;
}
.guided-shell-main {
  flex: 1;
  background: var(--shell-main);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
@keyframes shell-shimmer {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.85; }
}
@keyframes shell-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
```

- [ ] **Step 3: Run the build type-check**

```bash
npm run build 2>&1 | tail -5
```

Expected: exits 0 (CSS changes don't affect TS compilation).

- [ ] **Step 4: Commit**

```bash
git add src/client/styles.css
git commit -m "style: add dark shell CSS tokens and layout rules"
```

---

## Task 3: Create AppShell + Sidebar components

**Files:**
- Create: `src/client/components/AppShell.tsx`
- Create: `src/client/components/Sidebar.tsx`

- [ ] **Step 1: Create `src/client/components/AppShell.tsx`**

```tsx
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
```

- [ ] **Step 2: Create `src/client/components/Sidebar.tsx`**

```tsx
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

export function Sidebar({ projectName, steps, footerLabel, footerDisabled, onFooterClick }: SidebarProps) {
  return (
    <>
      {/* Top */}
      <div style={{ padding: "18px 16px 14px", borderBottom: "1px solid var(--shell-border)" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--shell-gold)", letterSpacing: "1.5px", textTransform: "uppercase" }}>
          MediaFactory
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
            style={{
              display: "flex", alignItems: "center", gap: 11,
              padding: "9px 14px 9px 16px",
              position: "relative",
              background: step.status === "active" ? "rgba(252,192,9,0.06)" : "transparent",
              borderLeft: step.status === "active" ? "2px solid var(--shell-gold)" : "2px solid transparent"
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
```

- [ ] **Step 3: Type-check**

```bash
npm run build 2>&1 | grep -E "error TS|Error" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/client/components/AppShell.tsx src/client/components/Sidebar.tsx
git commit -m "feat: add AppShell and Sidebar components"
```

---

## Task 4: Create StatusBadge and SkeletonLoader

**Files:**
- Create: `src/client/components/StatusBadge.tsx`
- Create: `src/client/components/SkeletonLoader.tsx`

- [ ] **Step 1: Create `src/client/components/StatusBadge.tsx`**

```tsx
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
```

- [ ] **Step 2: Create `src/client/components/SkeletonLoader.tsx`**

```tsx
type SkeletonLoaderProps = {
  width?: string;
  height?: number;
  borderRadius?: number;
};

export function SkeletonLoader({ width = "100%", height = 13, borderRadius = 6 }: SkeletonLoaderProps) {
  return (
    <div style={{
      width, height, borderRadius,
      background: "var(--shell-border)",
      animation: "shell-shimmer 1.8s ease-in-out infinite"
    }} />
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/client/components/StatusBadge.tsx src/client/components/SkeletonLoader.tsx
git commit -m "feat: add StatusBadge and SkeletonLoader utility components"
```

---

## Task 5: Create VideoUpload step

**Files:**
- Create: `src/client/steps/VideoUpload.tsx`

- [ ] **Step 1: Create `src/client/steps/VideoUpload.tsx`**

```tsx
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
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/client/steps/VideoUpload.tsx
git commit -m "feat: add VideoUpload step component"
```

---

## Task 6: Create AiCut step

**Files:**
- Create: `src/client/steps/AiCut.tsx`

- [ ] **Step 1: Create `src/client/steps/AiCut.tsx`**

```tsx
import { Film, Play } from "lucide-react";
import type { EditPlanSummary, ProjectJob } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { SkeletonLoader } from "../components/SkeletonLoader";

type AiCutProps = {
  job: ProjectJob | null;
  editPlan: EditPlanSummary | null;
  isUploading: boolean;
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AiCut({ job, editPlan, isUploading }: AiCutProps) {
  const isRunning = isUploading || (job !== null && ["queued", "running"].includes(job.status));
  const hasCut = Boolean(job?.outputUrl);
  const isFailed = job?.status === "failed";

  const sourceDuration = editPlan?.source.durationSec ?? 0;
  const segments = editPlan?.segments ?? [];
  const removedIntervals = editPlan?.removed ?? [];
  const renderedSec = segments.reduce((sum, seg) => sum + (seg.endSec - seg.startSec), 0);
  const removedSec = Math.max(0, sourceDuration - renderedSec);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#e8e4de", letterSpacing: "-0.3px" }}>
            {isRunning ? "Gerando corte IA" : hasCut ? "Corte gerado" : "Corte com IA"}
          </div>
          <div style={{ fontSize: 12, color: "#484845", marginTop: 3 }}>
            {isRunning ? (job?.message ?? "Detectando silêncios e segmentos · ~2 min") :
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

      {/* Done state: video card + segments */}
      {hasCut && editPlan && !isRunning && (
        <div>
          {/* Result card */}
          <div style={{
            background: "var(--shell-surface)", border: "1px solid #222",
            borderRadius: 12, overflow: "hidden", marginBottom: 12
          }}>
            {/* Thumbnail placeholder */}
            <div style={{
              width: "100%", height: 130,
              background: "#0f0f0e",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10
            }}>
              <Film size={20} color="#333" />
              <div style={{
                width: 34, height: 34, borderRadius: "50%",
                background: "rgba(252,192,9,0.9)",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <Play size={14} color="#111" />
              </div>
            </div>
            {/* Meta row */}
            <div style={{ padding: "12px 14px", display: "flex", gap: 20 }}>
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
          </div>

          {/* Segment list (first 5) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {segments.slice(0, 5).map((seg, i) => {
              const isRemoved = removedIntervals.some((r) => r.id === seg.id);
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 8px", borderRadius: 5,
                  background: "var(--shell-surface)"
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                    background: isRemoved ? "#2a2a28" : "var(--shell-green)"
                  }} />
                  <div style={{
                    fontSize: 9, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                    color: isRemoved ? "#2a2a28" : "#555"
                  }}>
                    {formatDuration(seg.startSec)}–{formatDuration(seg.endSec)}
                  </div>
                  <div style={{ flex: 1, height: 3, background: "#1e1e1c", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 2,
                      background: isRemoved ? "#333" : "var(--shell-green)",
                      opacity: 0.5,
                      width: `${Math.min(100, ((seg.endSec - seg.startSec) / (renderedSec || 1)) * 100)}%`
                    }} />
                  </div>
                </div>
              );
            })}
            {segments.length > 5 && (
              <div style={{ fontSize: 10, color: "#3a3a38", paddingLeft: 8, marginTop: 2 }}>
                + {segments.length - 5} segmentos
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/client/steps/AiCut.tsx
git commit -m "feat: add AiCut step component with skeleton and segment list"
```

---

## Task 7: Create Transcription step

**Files:**
- Create: `src/client/steps/Transcription.tsx`

- [ ] **Step 1: Create `src/client/steps/Transcription.tsx`**

```tsx
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
  const isRunning = isCaptioning || (captionJob !== null && ["queued", "running"].includes(captionJob.status ?? ""));
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
              <div key={cap.id ?? i} style={{
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
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/client/steps/Transcription.tsx
git commit -m "feat: add Transcription step with horizontal/vertical branching"
```

---

## Task 8: Create ThumbnailPicker component

**Files:**
- Create: `src/client/components/ThumbnailPicker.tsx`

- [ ] **Step 1: Create `src/client/components/ThumbnailPicker.tsx`**

```tsx
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

              {/* Expand icon on hover - always shown on touch */}
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
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/client/components/ThumbnailPicker.tsx
git commit -m "feat: add ThumbnailPicker with lightbox"
```

---

## Task 9: Create YouTubePackage step

**Files:**
- Create: `src/client/steps/YouTubePackage.tsx`

- [ ] **Step 1: Create `src/client/steps/YouTubePackage.tsx`**

```tsx
import { AlignLeft, Image, List, Type } from "lucide-react";
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
  onPublicationDescriptionChange
}: YouTubePackageProps) {
  const isRunning = isGeneratingYoutubePackage || (youtubePackageJob !== null && ["queued", "running"].includes(youtubePackageJob.status ?? ""));
  const hasPackage = youtubePackageSummary?.status === "ready";
  const generatedThumbnails = getGeneratedThumbnailAssets(youtubePackageSummary);

  const fieldStyle: React.CSSProperties = {
    fontSize: 11, color: "#bbb",
    background: "var(--shell-surface)",
    border: "1px solid var(--shell-border-soft)",
    borderRadius: 6, padding: "7px 10px",
    width: "100%", lineHeight: 1.5,
    fontFamily: "inherit"
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, color: "#444",
    textTransform: "uppercase", letterSpacing: "0.8px",
    display: "flex", alignItems: "center", gap: 5,
    marginBottom: 4
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#e8e4de", letterSpacing: "-0.3px" }}>
            {isRunning ? "Gerando pacote" : hasPackage ? "Pacote pronto" : "Pacote YouTube"}
          </div>
          <div style={{ fontSize: 12, color: "#484845", marginTop: 3 }}>
            {isRunning ? "Gerando título, descrição, capítulos e thumbnails…" : hasPackage ? "Revise e edite antes de publicar" : "Aguardando transcrição"}
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
            padding: "10px 20px", borderRadius: 8,
            background: "var(--shell-gold)", border: "none",
            fontSize: 12, fontWeight: 800, color: "#111",
            textTransform: "uppercase", letterSpacing: "0.5px",
            cursor: "pointer"
          }}
        >
          Gerar pacote YouTube
        </button>
      )}

      {/* Two-pane layout when ready */}
      {hasPackage && youtubePackageSummary && !isRunning && (
        <div style={{ display: "flex", gap: 20 }}>

          {/* Left: metadata */}
          <div style={{ flex: "0 0 52%", display: "flex", flexDirection: "column", gap: 12 }}>

            <div>
              <div style={labelStyle}><Type size={9} /> Título</div>
              <input
                value={publicationTitle || youtubePackageSummary.title || ""}
                onChange={(e) => onPublicationTitleChange(e.currentTarget.value)}
                style={fieldStyle}
              />
            </div>

            <div>
              <div style={labelStyle}><AlignLeft size={9} /> Descrição</div>
              <textarea
                rows={4}
                value={publicationDescription || youtubePackageSummary.description || ""}
                onChange={(e) => onPublicationDescriptionChange(e.currentTarget.value)}
                style={{ ...fieldStyle, resize: "vertical" }}
              />
            </div>

            {/* Chapters */}
            {youtubePackageSummary.chapters && (
              <div>
                <div style={labelStyle}><List size={9} /> Capítulos <span style={{ fontSize: 8, color: "#3a3a38", fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 4 }}>gerados da transcrição</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {youtubePackageSummary.chapters.split("\n").filter(Boolean).map((line, i) => {
                    const [ts, ...rest] = line.split(" ");
                    return (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "6px 8px", borderRadius: 5,
                        background: "var(--shell-surface)"
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--shell-gold)", fontVariantNumeric: "tabular-nums", minWidth: 36 }}>{ts}</span>
                        <span style={{ fontSize: 10, color: "#888", flex: 1 }}>{rest.join(" ")}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Thumbnail ideas count */}
            {youtubePackageSummary.thumbnailIdeas.length > 0 && (
              <div style={{ fontSize: 10, color: "#3a3a38", paddingTop: 4 }}>
                {youtubePackageSummary.thumbnailIdeas.length} ideias de thumbnail geradas
              </div>
            )}
          </div>

          {/* Right: thumbnail picker */}
          <div style={{ flex: 1 }}>
            <div style={labelStyle}><Image size={9} /> Thumbnail</div>
            {generatedThumbnails.length > 0 ? (
              <ThumbnailPicker
                options={generatedThumbnails}
                selectedName={selectedGeneratedThumbnailName}
                onSelect={onSelectGeneratedThumbnail}
              />
            ) : (
              <div style={{
                padding: "20px", borderRadius: 8,
                background: "var(--shell-surface)", border: "1px solid var(--shell-border)",
                fontSize: 11, color: "#444", textAlign: "center"
              }}>
                Nenhuma thumbnail gerada ainda.
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/client/steps/YouTubePackage.tsx
git commit -m "feat: add YouTubePackage step with chapters and thumbnail picker"
```

---

## Task 10: Create Publish step

**Files:**
- Create: `src/client/steps/Publish.tsx`

- [ ] **Step 1: Create `src/client/steps/Publish.tsx`**

```tsx
import { AlertTriangle, Calendar, Check, FileText, Upload } from "lucide-react";
import type { EditPlanSummary, ProjectJob, YoutubePackageSummary } from "../api";
import { StatusBadge } from "../components/StatusBadge";

type PublishProps = {
  youtubePackageSummary: YoutubePackageSummary | null;
  editPlan: EditPlanSummary | null;
  exportJob: ProjectJob | null;
  isExporting: boolean;
  publicationVisibility: "private" | "unlisted" | "public";
  onPublicationVisibilityChange: (v: "private" | "unlisted" | "public") => void;
  onStartFinalExport: () => void;
};

const VISIBILITY_LABELS: Record<string, string> = {
  private: "Privado",
  unlisted: "Não listado",
  public: "Público"
};

export function Publish({
  youtubePackageSummary,
  editPlan,
  exportJob,
  isExporting,
  publicationVisibility,
  onPublicationVisibilityChange,
  onStartFinalExport
}: PublishProps) {
  const hasPackage = youtubePackageSummary?.status === "ready";
  const hasCaptions = Boolean(editPlan?.captions.length);
  const hasExport = Boolean(exportJob?.outputUrl);

  const checklist = [
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
        onClick={onStartFinalExport}
        disabled={isExporting || !hasPackage}
        style={{
          width: "100%", padding: "11px",
          background: isExporting || !hasPackage ? "var(--shell-border)" : "var(--shell-gold)",
          border: "none", borderRadius: 8,
          fontSize: 12, fontWeight: 800,
          color: isExporting || !hasPackage ? "#333" : "#111",
          textTransform: "uppercase", letterSpacing: "0.5px",
          cursor: isExporting || !hasPackage ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          marginBottom: 8
        }}
      >
        <Upload size={13} />
        {isExporting ? "Gerando export…" : hasExport ? "Gerar novo export" : "Gerar export final"}
      </button>

      <div style={{ fontSize: 10, color: "#3a3a38", textAlign: "center", lineHeight: 1.5 }}>
        {hasExport
          ? "Export pronto. Publicação direta no YouTube disponível em breve."
          : "Revise thumbnail, título e descrição antes de gerar o export."}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/client/steps/Publish.tsx
git commit -m "feat: add Publish step component"
```

---

## Task 11: Create GuidedShell — wires everything together

**Files:**
- Create: `src/client/GuidedShell.tsx`

This component receives the same props as the old `GuidedSaasFlow` (plus a few extras). It computes `currentStep`, builds the sidebar step list, and renders the correct step panel in the main area.

- [ ] **Step 1: Create `src/client/GuidedShell.tsx`**

```tsx
import type { EditPlanSummary, ProjectJob, UploadConfig, YoutubePackageSummary } from "./api";
import { formatBytes } from "./api";
import type { ProjectLibraryItem } from "../shared/project-library";
import { AppShell } from "./components/AppShell";
import { Sidebar } from "./components/Sidebar";
import type { SidebarStep } from "./components/Sidebar";
import { VideoUpload } from "./steps/VideoUpload";
import { AiCut } from "./steps/AiCut";
import { Transcription } from "./steps/Transcription";
import { YouTubePackage } from "./steps/YouTubePackage";
import { Publish } from "./steps/Publish";

function isActiveJob(job: ProjectJob | null): boolean {
  return job !== null && ["queued", "running"].includes(job.status);
}

function deriveCurrentStep(
  file: File | null,
  job: ProjectJob | null,
  isUploading: boolean,
  hasCut: boolean,
  hasCaptions: boolean,
  hasPackage: boolean
): 1 | 2 | 3 | 4 | 5 {
  if (!file && !job && !isUploading) return 1;
  if (!hasCut) return 2;
  if (!hasCaptions) return 3;
  if (!hasPackage) return 4;
  return 5;
}

function buildSidebarSteps(
  file: File | null,
  job: ProjectJob | null,
  isUploading: boolean,
  hasCut: boolean,
  isCutRunning: boolean,
  editPlan: EditPlanSummary | null,
  hasCaptions: boolean,
  isCaptionJobRunning: boolean,
  hasPackage: boolean,
  isPackageRunning: boolean
): SidebarStep[] {
  const hasSomething = Boolean(file || job || isUploading);
  const captionCount = editPlan?.captions.length ?? 0;

  return [
    {
      number: 1,
      label: "Vídeo",
      sub: job?.projectId
        ? `${job.projectId.slice(0, 18)}…`
        : isUploading ? "Enviando…"
        : "Aguardando upload",
      status: hasSomething ? "done" : "active"
    },
    {
      number: 2,
      label: "Corte IA",
      sub: isCutRunning || isUploading ? "Analisando…"
        : hasCut ? "Pronto"
        : "Aguardando",
      status: !hasSomething ? "locked"
        : isCutRunning || isUploading ? "processing"
        : hasCut ? "done"
        : "active"
    },
    {
      number: 3,
      label: "Transcrição",
      sub: isCaptionJobRunning ? "Transcrevendo…"
        : hasCaptions ? `${captionCount} segmentos`
        : "Aguardando",
      status: !hasCut ? "locked"
        : isCaptionJobRunning ? "processing"
        : hasCaptions ? "done"
        : "active"
    },
    {
      number: 4,
      label: "Pacote YT",
      sub: isPackageRunning ? "Gerando…"
        : hasPackage ? "Pronto"
        : "Aguardando",
      status: !hasCaptions ? "locked"
        : isPackageRunning ? "processing"
        : hasPackage ? "done"
        : "active"
    },
    {
      number: 5,
      label: "Publicar",
      sub: hasPackage ? "Pronto para publicar" : "Aguardando",
      status: !hasPackage ? "locked" : "active"
    }
  ];
}

export type GuidedShellProps = {
  file: File | null;
  job: ProjectJob | null;
  editPlan: EditPlanSummary | null;
  youtubePackageSummary: YoutubePackageSummary | null;
  selectedGeneratedThumbnailName: string | null;
  isExporting: boolean;
  exportJob: ProjectJob | null;
  isUploading: boolean;
  isCaptioning: boolean;
  captionJob: ProjectJob | null;
  isGeneratingYoutubePackage: boolean;
  youtubePackageJob: ProjectJob | null;
  uploadConfig: UploadConfig | null;
  isFileTooLarge: boolean;
  error: string | null;
  projects: ProjectLibraryItem[];
  publicationTitle: string;
  publicationDescription: string;
  publicationVisibility: "private" | "unlisted" | "public";
  onFileSelected: (file: File | null) => void;
  onStartUpload: () => void;
  onGenerateCaptions: () => void;
  onGenerateYoutubePackage: () => void;
  onSelectGeneratedThumbnail: (name: string) => void;
  onPublicationTitleChange: (title: string) => void;
  onPublicationDescriptionChange: (desc: string) => void;
  onPublicationVisibilityChange: (v: "private" | "unlisted" | "public") => void;
  onStartFinalExport: () => void;
};

export function GuidedShell({
  file, job, editPlan, youtubePackageSummary,
  selectedGeneratedThumbnailName, isExporting, exportJob,
  isUploading, isCaptioning, captionJob,
  isGeneratingYoutubePackage, youtubePackageJob,
  uploadConfig, isFileTooLarge, error, projects,
  publicationTitle, publicationDescription, publicationVisibility,
  onFileSelected, onStartUpload, onGenerateCaptions,
  onGenerateYoutubePackage, onSelectGeneratedThumbnail,
  onPublicationTitleChange, onPublicationDescriptionChange,
  onPublicationVisibilityChange, onStartFinalExport
}: GuidedShellProps) {
  const hasCut = Boolean(job?.outputUrl);
  const hasCaptions = Boolean(editPlan?.captions.length);
  const hasPackage = youtubePackageSummary?.status === "ready";
  const isCutRunning = isActiveJob(job);
  const isCaptionJobRunning = isActiveJob(captionJob);
  const isPackageRunning = isActiveJob(youtubePackageJob);
  const videoOrientation: "horizontal" | "vertical" =
    editPlan && editPlan.source.width >= editPlan.source.height ? "horizontal" : "vertical";

  const currentStep = deriveCurrentStep(file, job, isUploading, hasCut, hasCaptions, hasPackage);

  const sidebarSteps = buildSidebarSteps(
    file, job, isUploading,
    hasCut, isCutRunning, editPlan,
    hasCaptions, isCaptionJobRunning,
    hasPackage, isPackageRunning
  );

  // Footer CTA label and disabled state per step
  const footerConfig: Record<number, { label: string; disabled: boolean; action: () => void }> = {
    1: { label: "Enviar vídeo", disabled: !file || isUploading, action: onStartUpload },
    2: { label: isCutRunning ? "Processando…" : "Aguardando corte", disabled: true, action: () => {} },
    3: { label: isCaptionJobRunning ? "Transcrevendo…" : "Gerar transcrição →", disabled: hasCaptions || isCaptionJobRunning || !hasCut, action: onGenerateCaptions },
    4: { label: isPackageRunning ? "Gerando…" : "Gerar pacote YT →", disabled: isPackageRunning || !hasCaptions, action: onGenerateYoutubePackage },
    5: { label: "Gerar export final →", disabled: isExporting || !hasPackage, action: onStartFinalExport }
  };
  const footer = footerConfig[currentStep];

  // Header for main area
  const stepTitles: Record<number, { title: string; desc: string }> = {
    1: { title: "Envie seu vídeo", desc: `MP4, MOV · até ${uploadConfig?.uploadFileSizeLimitBytes ? formatBytes(uploadConfig.uploadFileSizeLimitBytes) : "5GB"}` },
    2: { title: isCutRunning ? "Gerando corte IA" : hasCut ? "Corte gerado" : "Corte com IA", desc: isCutRunning ? "Detectando silêncios · ~2 min" : hasCut ? `${editPlan?.segments.length ?? 0} segmentos mantidos` : "Aguardando upload" },
    3: { title: hasCaptions ? "Transcrição gerada" : "Transcrição", desc: hasCaptions ? `${editPlan?.captions.length ?? 0} segmentos · SRT + VTT` : "Aguardando corte" },
    4: { title: hasPackage ? "Pacote pronto" : "Pacote YouTube", desc: hasPackage ? "Revise antes de publicar" : "Aguardando transcrição" },
    5: { title: "Publicar", desc: "Revise e gere o export final" }
  };
  const header = stepTitles[currentStep];

  return (
    <AppShell
      sidebar={
        <Sidebar
          projectName={job?.projectId ?? null}
          steps={sidebarSteps}
          footerLabel={footer.label}
          footerDisabled={footer.disabled}
          onFooterClick={footer.action}
        />
      }
      header={
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#e8e4de", letterSpacing: "-0.3px" }}>
              {header.title}
            </div>
            <div style={{ fontSize: 12, color: "#484845", marginTop: 3 }}>
              {header.desc}
            </div>
          </div>
        </div>
      }
    >
      {currentStep === 1 && (
        <VideoUpload
          fileLimitBytes={uploadConfig?.uploadFileSizeLimitBytes}
          isFileTooLarge={isFileTooLarge}
          error={error}
          projects={projects}
          file={file}
          isUploading={isUploading}
          onFileSelected={onFileSelected}
          onStartUpload={onStartUpload}
        />
      )}
      {currentStep === 2 && (
        <AiCut job={job} editPlan={editPlan} isUploading={isUploading} />
      )}
      {currentStep === 3 && (
        <Transcription
          editPlan={editPlan}
          captionJob={captionJob}
          isCaptioning={isCaptioning}
          videoOrientation={videoOrientation}
          onGenerateCaptions={onGenerateCaptions}
        />
      )}
      {currentStep === 4 && (
        <YouTubePackage
          youtubePackageSummary={youtubePackageSummary}
          youtubePackageJob={youtubePackageJob}
          isGeneratingYoutubePackage={isGeneratingYoutubePackage}
          selectedGeneratedThumbnailName={selectedGeneratedThumbnailName}
          onSelectGeneratedThumbnail={onSelectGeneratedThumbnail}
          onGenerateYoutubePackage={onGenerateYoutubePackage}
          publicationTitle={publicationTitle}
          publicationDescription={publicationDescription}
          onPublicationTitleChange={onPublicationTitleChange}
          onPublicationDescriptionChange={onPublicationDescriptionChange}
        />
      )}
      {currentStep === 5 && (
        <Publish
          youtubePackageSummary={youtubePackageSummary}
          editPlan={editPlan}
          exportJob={exportJob}
          isExporting={isExporting}
          publicationVisibility={publicationVisibility}
          onPublicationVisibilityChange={onPublicationVisibilityChange}
          onStartFinalExport={onStartFinalExport}
        />
      )}
    </AppShell>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/client/GuidedShell.tsx
git commit -m "feat: add GuidedShell component wiring all step panels"
```

---

## Task 12: Wire GuidedShell into App.tsx

**Files:**
- Modify: `src/client/App.tsx`

This task replaces the `topbar` section and the `GuidedSaasFlow` call (lines ~914–977) with `GuidedShell`. The advanced editor block (`{isAdvancedEditorOpen ? (` onwards) is **unchanged**.

- [ ] **Step 1: Add the import at the top of App.tsx**

After the existing import block (around line 40), add:

```tsx
import { GuidedShell } from "./GuidedShell";
```

- [ ] **Step 2: Replace the topbar section and GuidedSaasFlow call**

Find this block in `App.tsx` (lines ~914–977):

```tsx
  return (
    <main className="app-shell">
      <section className="topbar">
        ...
      </section>

      <GuidedSaasFlow
        file={file}
        job={job}
        ...
        onToggleAdvanced={() => setIsAdvancedEditorOpen((value) => !value)}
      />
```

Replace the entire `return (` up to (but NOT including) `{isAdvancedEditorOpen ? (` with:

```tsx
  return (
    <>
      <GuidedShell
        file={file}
        job={job}
        editPlan={editPlan}
        youtubePackageSummary={youtubePackageSummary}
        selectedGeneratedThumbnailName={selectedGeneratedThumbnailName}
        isExporting={isExporting}
        exportJob={exportJob}
        isUploading={isUploading}
        isCaptioning={isCaptioning}
        captionJob={captionJob}
        isGeneratingYoutubePackage={isGeneratingYoutubePackage}
        youtubePackageJob={youtubePackageJob}
        uploadConfig={uploadConfig}
        isFileTooLarge={Boolean(isFileTooLarge)}
        error={error}
        projects={projects}
        publicationTitle={publicationTitle}
        publicationDescription={publicationDescription}
        publicationVisibility={publicationVisibility}
        onFileSelected={resetForSelectedFile}
        onStartUpload={() => void startUpload()}
        onGenerateCaptions={() => void onGenerateCaptions()}
        onGenerateYoutubePackage={() => void onGenerateYoutubePackage()}
        onSelectGeneratedThumbnail={setSelectedGeneratedThumbnailName}
        onPublicationTitleChange={setPublicationTitle}
        onPublicationDescriptionChange={setPublicationDescription}
        onPublicationVisibilityChange={setPublicationVisibility}
        onStartFinalExport={() => void onExport()}
      />
```

And close the `<>` fragment at the very end of the `return` block (where `</main>` currently is):

```tsx
    </>
  );
```

The advanced editor section (`{isAdvancedEditorOpen ? (` block) stays between `<GuidedShell ... />` and `</>` as a sibling.

- [ ] **Step 3: Type-check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
```

Expected: no TS errors. The CSS topbar/app-shell classes no longer being used won't cause TS errors.

- [ ] **Step 4: Run tests**

```bash
npm test 2>&1 | tail -20
```

Expected: all existing tests pass. No new tests needed here — this is a structural wiring task, not a logic change.

- [ ] **Step 5: Smoke test in browser**

```bash
npm run dev
```

Open http://localhost:5173. You should see the dark sidebar shell with 5 steps. Upload a video and confirm the step advances. Check that the advanced editor still appears when `isAdvancedEditorOpen` is true (if you have a way to trigger it — the toggle button no longer exists in the new UI; it's OK to leave that wiring for the CSS cleanup task).

- [ ] **Step 6: Commit**

```bash
git add src/client/App.tsx
git commit -m "feat: wire GuidedShell into App — replace topbar and GuidedSaasFlow"
```

---

## Task 13: CSS cleanup

**Files:**
- Modify: `src/client/styles.css`
- Modify: `src/client/App.tsx` (remove stale `isAdvancedEditorOpen` toggle reference if any)

- [ ] **Step 1: Remove stale CSS rules from styles.css**

Search for these class names and delete their rule blocks entirely — they are replaced by inline styles in the new components:

```
.topbar
.brand-lockup
.brand-mark
.saas-flow
.saas-flow-main
.saas-copy
.saas-action-block
.saas-primary-action
.saas-steps
.saas-step
.saas-step-done
.saas-step-active
.saas-step-waiting
.saas-step-failed
.saas-alert
.saas-review-grid
.saas-preview
.saas-preview-empty
.saas-package-panel
.saas-package-facts
.saas-publication-review
.publication-thumb-stage
.publication-thumb-empty
.publication-thumb-picker
.publication-thumb-option
.publication-thumb-option-selected
.publication-final-copy
.publication-settings-row
.publication-chapters
.publication-actions
.saas-thumbnail-ideas
.saas-thumbnail-idea
.saas-prompt
.saas-assets
.saas-asset
.saas-asset-selected
.saas-asset-video
.saas-publish-disabled
```

Do **not** delete: `.studio`, `.left-rail`, `.rail-section`, `.section-label`, `.upload-form`, `.file-drop`, `.ghost-button`, or any rule used by the advanced editor.

- [ ] **Step 2: Check that .app-shell still applies (it's used as a wrapper if kept)**

The `<main className="app-shell">` no longer exists. If `.app-shell` has grid rules that affect the page, remove the class reference from the CSS too. If other things use `.app-shell`, keep it.

- [ ] **Step 3: Run type-check and tests**

```bash
npm run check 2>&1 | tail -10
```

Expected: passes.

- [ ] **Step 4: Smoke test**

Open http://localhost:5173. Dark shell renders. No layout breakage. Advanced editor still accessible (it renders below the shell as a sibling).

- [ ] **Step 5: Commit**

```bash
git add src/client/styles.css
git commit -m "chore: remove stale saas-flow and topbar CSS rules"
```

---

## Task 14: Add tests for GuidedShell step derivation

**Files:**
- Create: `src/client/GuidedShell.test.tsx`

The `deriveCurrentStep` and `buildSidebarSteps` functions are exported for testing. Export them from `GuidedShell.tsx` first.

- [ ] **Step 1: Export the two pure functions from GuidedShell.tsx**

Add `export` to the function declarations:

```tsx
export function deriveCurrentStep( ... ) { ... }
export function buildSidebarSteps( ... ) { ... }
```

- [ ] **Step 2: Write the test file**

```tsx
import { describe, it, expect } from "vitest";
import { deriveCurrentStep, buildSidebarSteps } from "./GuidedShell";

describe("deriveCurrentStep", () => {
  it("returns 1 when nothing is loaded", () => {
    expect(deriveCurrentStep(null, null, false, false, false, false)).toBe(1);
  });

  it("returns 2 when file is selected but no cut", () => {
    const file = new File([""], "test.mp4");
    expect(deriveCurrentStep(file, null, false, false, false, false)).toBe(2);
  });

  it("returns 3 when cut is done but no captions", () => {
    expect(deriveCurrentStep(null, null, false, true, false, false)).toBe(3);
  });

  it("returns 4 when captions done but no package", () => {
    expect(deriveCurrentStep(null, null, false, true, true, false)).toBe(4);
  });

  it("returns 5 when package is ready", () => {
    expect(deriveCurrentStep(null, null, false, true, true, true)).toBe(5);
  });

  it("returns 2 while uploading even if no cut yet", () => {
    expect(deriveCurrentStep(null, null, true, false, false, false)).toBe(2);
  });
});

describe("buildSidebarSteps", () => {
  it("returns 5 steps with step 1 active when nothing loaded", () => {
    const steps = buildSidebarSteps(null, null, false, false, false, null, false, false, false, false);
    expect(steps).toHaveLength(5);
    expect(steps[0].status).toBe("active");
    expect(steps[1].status).toBe("locked");
    expect(steps[2].status).toBe("locked");
    expect(steps[3].status).toBe("locked");
    expect(steps[4].status).toBe("locked");
  });

  it("marks step 1 done and step 2 active when cut is running", () => {
    const file = new File([""], "video.mp4");
    const steps = buildSidebarSteps(file, null, true, false, true, null, false, false, false, false);
    expect(steps[0].status).toBe("done");
    expect(steps[1].status).toBe("processing");
  });

  it("marks step 2 done and step 3 active when cut done, no captions", () => {
    const steps = buildSidebarSteps(null, null, false, true, false, null, false, false, false, false);
    expect(steps[0].status).toBe("done");
    expect(steps[1].status).toBe("done");
    expect(steps[2].status).toBe("active");
    expect(steps[3].status).toBe("locked");
    expect(steps[4].status).toBe("locked");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm test src/client/GuidedShell.test.tsx 2>&1 | tail -15
```

Expected: 8 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/client/GuidedShell.tsx src/client/GuidedShell.test.tsx
git commit -m "test: add deriveCurrentStep and buildSidebarSteps unit tests"
```

---

## Done

After Task 14, run the full check:

```bash
npm run check
```

Expected: TypeScript clean, all tests green. Open http://localhost:5173 and walk through the full flow: upload → cut → transcription → YouTube package (with thumbnail picker + chapters) → publish step.
