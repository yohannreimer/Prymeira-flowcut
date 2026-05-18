# Guided Flow Redesign — Design Spec

**Date:** 2026-05-18
**Replaces:** `2026-05-18-mediafactory-saas-guided-flow-design.md` (pre-brainstorm draft)

---

## Goal

Redesign the MediaFactory SaaS guided flow from MVP-looking to a professional product. The app currently shows raw state labels ("job status: idle"), zeros before data loads ("Duração: 0s"), and a flat progress bar navigation that makes users go back and forth between steps. The result looks and feels like a prototype.

After this redesign, the guided flow will have a persistent sidebar pipeline, skeleton loading states, polished step-by-step content panels, and a clean component architecture replacing the current 3,300-line `App.tsx` monolith.

---

## Design Decisions

### Visual Direction

- **Dark theme throughout:** background `#0a0a09`, sidebar `#111110`, main area `#161614`.
- **Gold accent:** `#fcc009` for active states, CTAs, highlights.
- **No emojis anywhere.** All icons use [Lucide React](https://lucide.dev/) (`lucide-react` package, SVG-based).
- **Design tokens** already defined in `styles.css` (`--ink`, `--gold`, `--paper`, etc.) are preserved and extended.

### Layout Shell

A persistent two-column layout replaces the current flat page:

- **Sidebar (220px, fixed):** Shows all 5 pipeline steps with status badges. Never hides. Gives the user spatial awareness of where they are at all times.
- **Main area (flex 1):** Header with step title + contextual status badge. Body with step-specific content. The main area scrolls independently.

#### Step status states

| State | Badge style | Label color | When |
|---|---|---|---|
| `done` | Green circle with check icon | Muted grey | Step completed |
| `active` | Gold circle with number | Gold | Current step |
| `processing` | Blue circle with loader icon, pulsing | Blue | Job running in background |
| `locked` | Dark circle with number | Very dark grey | Not yet reachable |

#### Sidebar footer

A single CTA button always visible at the bottom of the sidebar. Disabled while processing or locked. Label changes per step: `"Gerar corte IA →"`, `"Gerar transcrição →"`, `"Ir para publicar →"`, etc.

---

## Step Content Panels

### Step 1 — Video Upload

**State: waiting**

- Large drag-and-drop zone with upload icon (Lucide `film`) and "Selecionar arquivo" CTA button.
- Format hint: `MP4, MOV · até 5GB`.
- Below the zone: list of 2–3 recent files (icon + filename), clickable to reuse.
- Status badge: `Aguardando`.

### Step 2 — AI Cut (`AiCut.tsx`)

**State: processing**

- Status badge: `● Processando` (blue).
- Progress bar with percentage and current operation label (e.g. "Detectando silêncios — 47%").
- Animated waveform bar visualization (random-height bars in blue, shimmer animation).
- Skeleton shimmer lines below — never shows zeros.

**State: done**

- Status badge: `✓ Pronto` (green).
- Video result card: dark thumbnail area with play button overlay, metadata row (Duração / Segmentos / Cortado).
- Segment list below the card: each kept segment shown as a row with green dot + timestamp range + proportional bar. Cut (removed) segments shown in dark grey.

### Step 3 — Transcription (`Transcription.tsx`)

This step behaves differently based on detected video orientation. Orientation is detected on upload from the video's pixel dimensions (width > height = horizontal). No user input required.

**Horizontal video (YouTube):**

- Status badge: `Transcrito` (green).
- Orientation tag: monitor icon + "Horizontal · YouTube".
- Explanatory line: *"Transcrição gerada. Usada para criar título, descrição e tags — não aparece no vídeo."*
- Scrollable list of transcript segments: timestamp + text line, clickable to edit.
- Footer: segment count + `SRT + VTT gerados` + "Editar texto" link.
- **No style picker, no burn-in options.** The transcript feeds the YouTube package only.

**Vertical video (Reels / Shorts) — future:**

- Orientation tag: smartphone icon + "Vertical · Reels / Shorts".
- Style picker: `Padrão` / `Palavra por palavra` / `Minimalista`.
- Live preview pill showing the selected style rendered over a dark background.
- Caption style options (position, font, color, border) become relevant here.
- The caption is rendered into the exported video.

### Step 4 — YouTube Package (`YouTubePackage.tsx`)

Two-pane layout within the main area:

**Left pane — Metadata (52% width):**

- **Title** — editable text field, AI-generated.
- **Description** — editable multiline field, AI-generated.
- **Chapters** — list auto-generated from the transcript. Each row: timestamp (gold, monospace) + chapter title + drag handle (Lucide `grip-vertical`). Chapters are reorderable via drag. When published, chapters are appended to the description in standard YouTube format (`00:00 Intro`, `01:22 ...`).
- **Tags** — tag chips with an `+ adicionar` button.

**Right pane — Thumbnail picker:**

- Grid of 4 thumbnails (2×2), one per available Remotion layout (Premium Execution, Breaking News, Editorial, Split Result).
- Click a thumbnail to select it: gold border + checkmark badge appears.
- Hover reveals an expand icon (Lucide `maximize-2`) in the bottom-right corner of each thumbnail.
- Clicking the expand icon opens a lightbox: thumbnail shown at ~720px wide, "Usar esta thumbnail" primary button + "Fechar" secondary button.
- Only one thumbnail can be selected at a time.

### Step 5 — Publish (`Publish.tsx`)

- Connected channel row: avatar (gold circle with initial) + channel handle.
- Pre-publish checklist: each item shows a check icon (green) or warning icon (gold). Items adapt to project type:
  - Vídeo pronto (1080p) ✓
  - Transcrição gerada ✓ (horizontal) / Legendas incorporadas ✓ (vertical)
  - Título e descrição ✓
  - Thumbnail selecionada ✓
  - Publicação: Imediatamente ⚠ (configurable)
- Secondary actions: `Agendar` + `Salvar rascunho` (side by side, smaller buttons).
- Primary CTA: `Publicar no YouTube →` (full-width, gold).

---

## Component Architecture

### Before

- `App.tsx` — 3,300 lines. All state, all UI, all logic in one file.
- `styles.css` — 1,300 lines. Monolithic global styles.

### After

```
src/
  App.tsx                          # ~150 lines — thin shell, mounts AppShell
  hooks/
    useProjectState.ts             # ~200 lines — all state + actions
  components/
    AppShell.tsx                   # ~80 lines — sidebar + main layout split
    Sidebar.tsx                    # ~100 lines — step list with status badges
    StatusBadge.tsx                # ~30 lines — processing/ready/waiting pill
    SkeletonLoader.tsx             # ~25 lines — shimmer bar component
    ThumbnailPicker.tsx            # ~120 lines — grid + lightbox
  steps/
    VideoUpload.tsx                # ~120 lines
    AiCut.tsx                      # ~180 lines
    Transcription.tsx              # ~160 lines — branches on video orientation
    YouTubePackage.tsx             # ~220 lines — uses ThumbnailPicker + chapters
    Publish.tsx                    # ~130 lines
  styles.css                       # ~300 lines — tokens + global resets only
```

### State architecture

`useProjectState.ts` is the single source of truth. It owns:

- `currentStep` (1–5)
- `videoPath`, `videoOrientation` (`horizontal` | `vertical`)
- `jobStatus`, `jobProgress`
- `segments`, `segmentCount`, `durationRemoved`
- `transcript` (array of `{ start, end, text }`)
- `ytPackage` (`{ title, description, chapters, tags, selectedThumbnailIndex }`)
- `publishState`

It exposes action callbacks: `uploadVideo`, `startAiCut`, `generateTranscript`, `generateYtPackage`, `selectThumbnail`, `updateChapters`, `publish`.

`App.tsx` calls the hook and passes state + actions down via props. No component fetches data directly. No component calls the server directly.

### CSS approach

Global `styles.css` keeps only:
- CSS custom properties (design tokens)
- CSS reset
- Typography base

Each component owns its styles via inline `style` props or a colocated CSS module (following whichever pattern is already established in the codebase).

---

## Lucide Icons

Install: `npm install lucide-react`

Key icons used across the new UI:

| Context | Icon name |
|---|---|
| Upload zone | `film` |
| Recent files | `video` |
| Play button | `play` |
| Processing | `loader` |
| Done | `check`, `check-circle` |
| Warning | `alert-triangle` |
| Step locked | number rendered as text |
| Chapters drag handle | `grip-vertical` |
| Expand thumbnail | `maximize-2` |
| Close lightbox | `x` |
| Publish | `upload` |
| Schedule | `calendar` |
| Draft | `file-text` |
| Metadata fields | `type`, `align-left`, `list`, `tag`, `image` |
| Orientation | `monitor` (horizontal), `smartphone` (vertical) |

---

## Migration Strategy

**Principle:** The app stays functional after every phase. No long-broken branches.

### Phase 1 — Extract state (Days 1–3) · Risk: zero

Move all `useState`, `useEffect`, and fetch logic from `App.tsx` into `hooks/useProjectState.ts`. `App.tsx` consumes the hook and renders the same HTML as before. Zero visual change. Commit: `refactor: extract useProjectState hook`.

### Phase 2 — New shell (Days 4–7) · Risk: low

Create `AppShell.tsx` and `Sidebar.tsx` with the new dark visual. Replace the old layout in `App.tsx` with the new shell — the step content panels remain the old ones for now. Add `StatusBadge` and `SkeletonLoader`. Replace zeros and "idle" labels. The app already looks like the redesign by end of day 4. Commits: `feat: new AppShell + Sidebar`, `feat: skeleton states + status badges`.

### Phase 3 — Extract steps (Days 8–11) · Risk: medium, mitigated

One step per day, in order of complexity: VideoUpload → AiCut → Transcription → YouTubePackage → Publish. Extract JSX to `steps/` file, wire props/callbacks, test the full flow, commit. Each commit is independently revertible. `YouTubePackage.tsx` gets a full day due to chapters + thumbnail picker.

### Phase 4 — CSS cleanup and polish (Days 12–14) · Risk: low

Remove styles that migrated to component scope from `styles.css`. Final visual pass: spacing, transitions, resize behavior. Full end-to-end flow test: upload → cut → transcription → YT package → publish checklist.

---

## Non-Goals

- Editor advanced view (timeline, waveform scrubbing, audio mixing) — separate project.
- Vertical video caption editor — architecture is in place (`Transcription.tsx` branches), implementation is a future step.
- Billing, pricing, multi-tenant routing.
- Auto-publish without user confirmation.
- Modifying the local MediaFactory at `/Users/yohannreimer/Downloads/Locais/MediaFactory`.

---

## Testing

- `useProjectState.ts`: unit tests for each action (state transitions, error paths).
- `Transcription.tsx`: snapshot or behavior test for horizontal vs. vertical branch.
- `ThumbnailPicker.tsx`: selection and lightbox open/close.
- `YouTubePackage.tsx`: chapter reorder produces correct description output.
- Full flow: Playwright or manual test — upload a real video, complete all 5 steps, verify no regressions on existing job endpoints.
