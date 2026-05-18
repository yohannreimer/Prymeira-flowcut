# Thumbnail Premium V10 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SVG/Sharp thumbnail pipeline with a Remotion React pipeline that renders 6 premium-quality YouTube thumbnails using real web fonts, cinematic image preprocessing, smart frame selection via FFmpeg + GPT-4o Vision, and a film-grain finishing pass.

**Architecture:** GPT-4.1-mini continues to generate `renderText` copy unchanged. The rendering side is fully replaced: FFmpeg extracts 6 candidate frames using the `thumbnail` filter, GPT-4o Vision picks the most expressive face, Sharp preprocesses frames with normalize + golden-hour grading, and Remotion `renderStill()` renders each of the 6 React layout components to PNG. Sharp then composites a film-grain overlay on each output.

**Tech Stack:** Remotion (`@remotion/renderer`, `@remotion/bundler`, `@remotion/google-fonts`), React 19, Sharp 0.34, OpenAI SDK v6, FFmpeg, Vitest.

---

## File Map

### New files

| File | Responsibility |
|---|---|
| `src/remotion/thumbnails/types.ts` | `ThumbnailRenderProps` type shared by all layout components |
| `src/remotion/thumbnails/fonts.ts` | Load Bebas Neue, Inter, Playfair Display via `@remotion/google-fonts` |
| `src/remotion/thumbnails/utils.ts` | `fitFontSize()` helper — scales font size based on line length |
| `src/remotion/thumbnails/FaceImage.tsx` | Reusable image component with `objectFit: cover` and configurable `objectPosition` |
| `src/remotion/thumbnails/layouts/PremiumExecution.tsx` | V9-1: dark diagonal left panel, large headline, face bottom-right |
| `src/remotion/thumbnails/layouts/SplitResult.tsx` | V9-2: left/right split with diagonal yellow divider, face centered |
| `src/remotion/thumbnails/layouts/Editorial.tsx` | V9-3: newspaper layout, serif headline, face right with black border |
| `src/remotion/thumbnails/layouts/StatusWindow.tsx` | V9-4: macOS-style window UI, checklist, face right |
| `src/remotion/thumbnails/layouts/SocialCards.tsx` | V9-5: dark background, phone cards right, yellow arrow |
| `src/remotion/thumbnails/layouts/BreakingNews.tsx` | V9-6: broadcast lower-third, "AO VIVO" badge, face right |
| `src/server/youtube/select-best-frame.ts` | GPT-4o Vision: pick most expressive frame from candidates |
| `src/server/youtube/preprocess-frames.ts` | Sharp pipeline: normalize + golden-hour grade per frame |
| `src/server/youtube/apply-grain.ts` | Sharp film-grain overlay on rendered PNG |

### Modified files

| File | Change |
|---|---|
| `src/remotion/index.tsx` | Register 6 thumbnail `<Composition>` entries with `durationInFrames={1}` |
| `src/server/youtube/v9-thumbnail-renderer.ts` | Full rewrite: `bundle()` + `renderStill()` × 6, replacing SVG/Sharp |
| `src/server/jobs/run-youtube-package-job.ts` | New frame extraction (6 candidates + thumbnail filter + best-frame selection + preprocessing), 6th thumbnail derivation, new deps |

### Test files

| File | What it tests |
|---|---|
| `src/server/youtube/select-best-frame.test.ts` | Happy path + fallback to 0 on error |
| `src/server/youtube/preprocess-frames.test.ts` | Output file exists and is valid JPEG |
| `src/server/youtube/apply-grain.test.ts` | Output file exists and is valid PNG |
| `src/server/jobs/run-youtube-package-job.test.ts` | Updated: 8 processRunner calls (6 candidates + 2 identity clips), new deps mocked |
| `src/server/youtube/v9-thumbnail-renderer.test.ts` | Deleted — SVG renderer is gone; no equivalent unit test needed (renderStill is integration-only) |

---

## Task 1 — Install dependency + shared types + fonts + utils

**Files:**
- Create: `src/remotion/thumbnails/types.ts`
- Create: `src/remotion/thumbnails/fonts.ts`
- Create: `src/remotion/thumbnails/utils.ts`

- [ ] **Step 1: Install @remotion/google-fonts**

```bash
npm install @remotion/google-fonts
```

Expected: package added to `node_modules/@remotion/google-fonts` and `package.json` updated.

- [ ] **Step 2: Create `src/remotion/thumbnails/types.ts`**

```ts
import type { YoutubePackageCopy } from "../../server/youtube/youtube-package-copy";

export type ThumbnailRenderText = YoutubePackageCopy["thumbnailPrompts"][number]["renderText"];

export type ThumbnailRenderProps = {
  renderText: ThumbnailRenderText;
  imageDataUrls: [string, string, string, string];
  channelName?: string;
};
```

- [ ] **Step 3: Create `src/remotion/thumbnails/fonts.ts`**

```ts
import { loadFont as loadBebasNeue } from "@remotion/google-fonts/BebasNeue";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";

export const bebasNeue = loadBebasNeue();
export const inter = loadInter("normal", { weights: ["700", "900"] });
export const playfairDisplay = loadPlayfair("normal", { weights: ["700", "900"] });
```

- [ ] **Step 4: Create `src/remotion/thumbnails/utils.ts`**

```ts
export const INK = "#050505";
export const CREAM = "#fff3df";
export const PAPER = "#f1e5ce";
export const YELLOW = "#ffd20a";
export const RED = "#ff4f43";

/**
 * Returns a font size in px that scales down when lines are long.
 * maxPx is the size used when the longest line has ≤6 characters.
 */
export function fitFontSize(lines: string[], maxPx: number): number {
  const longest = Math.max(...lines.map((l) => l.length), 1);
  const scale = Math.min(1, 7 / longest);
  return Math.round(maxPx * scale);
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run check 2>&1 | head -30
```

Expected: no errors in the new files.

- [ ] **Step 6: Commit**

```bash
git add src/remotion/thumbnails/types.ts src/remotion/thumbnails/fonts.ts src/remotion/thumbnails/utils.ts package.json package-lock.json
git commit -m "feat: add @remotion/google-fonts and thumbnail shared types + utils"
```

---

## Task 2 — FaceImage component

**Files:**
- Create: `src/remotion/thumbnails/FaceImage.tsx`

- [ ] **Step 1: Create `src/remotion/thumbnails/FaceImage.tsx`**

```tsx
import React from "react";

type FaceImageProps = {
  src: string;
  style?: React.CSSProperties;
  borderRadius?: string | number;
  objectPosition?: string;
  border?: string;
  boxShadow?: string;
};

export function FaceImage({
  src,
  style,
  borderRadius = "8%",
  objectPosition = "center top",
  border,
  boxShadow,
}: FaceImageProps) {
  return (
    <div
      style={{
        borderRadius,
        overflow: "hidden",
        border,
        boxShadow,
        flexShrink: 0,
        ...style,
      }}
    >
      <img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition,
          display: "block",
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/remotion/thumbnails/FaceImage.tsx
git commit -m "feat: add FaceImage component for thumbnail layouts"
```

---

## Task 3 — PremiumExecution layout (V9-1)

**Files:**
- Create: `src/remotion/thumbnails/layouts/PremiumExecution.tsx`

- [ ] **Step 1: Create `src/remotion/thumbnails/layouts/PremiumExecution.tsx`**

```tsx
import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { ThumbnailRenderProps } from "../types";
import { bebasNeue, inter } from "../fonts";
import { FaceImage } from "../FaceImage";
import { INK, CREAM, PAPER, YELLOW, fitFontSize } from "../utils";

export function PremiumExecution({ renderText, imageDataUrls }: ThumbnailRenderProps) {
  const { width, height } = useVideoConfig();
  const lines = renderText.headline.slice(0, 3);
  const headlineFontSize = fitFontSize(lines, Math.round(width * 0.115));

  return (
    <AbsoluteFill style={{ background: PAPER, fontFamily: inter.fontFamily }}>
      {/* Dark diagonal left panel */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "50%",
          background: INK,
          clipPath: "polygon(0 0, 100% 0, 87% 100%, 0 100%)",
        }}
      />

      {/* Headline — 3 lines */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          top: "8%",
          width: "44%",
          fontFamily: bebasNeue.fontFamily,
          lineHeight: 0.88,
        }}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              fontSize: headlineFontSize,
              color: i === 1 ? YELLOW : CREAM,
              display: "block",
            }}
          >
            {line}
          </div>
        ))}
      </div>

      {/* Subhead */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          top: "63%",
          width: "42%",
          fontFamily: inter.fontFamily,
          fontWeight: 900,
          fontSize: Math.round(width * 0.018),
          color: CREAM,
          lineHeight: 1.25,
        }}
      >
        {renderText.subhead}
      </div>

      {/* Badge pill */}
      <div
        style={{
          position: "absolute",
          right: "3%",
          top: "6%",
          background: INK,
          borderRadius: 999,
          padding: `${Math.round(height * 0.025)}px ${Math.round(width * 0.04)}px`,
          fontFamily: inter.fontFamily,
          fontWeight: 900,
          fontSize: Math.round(width * 0.013),
          color: YELLOW,
          textTransform: "uppercase",
        }}
      >
        {renderText.badge}
      </div>

      {/* Decorative bars */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          bottom: "18%",
          width: "28%",
          height: Math.round(height * 0.028),
          background: YELLOW,
          borderRadius: 999,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "4%",
          bottom: "10%",
          width: "17%",
          height: Math.round(height * 0.016),
          background: CREAM,
          borderRadius: 999,
        }}
      />

      {/* Stamp */}
      <div
        style={{
          position: "absolute",
          right: "5%",
          bottom: "28%",
          background: YELLOW,
          borderRadius: Math.round(width * 0.006),
          padding: `${Math.round(height * 0.022)}px ${Math.round(width * 0.03)}px`,
          fontFamily: inter.fontFamily,
          fontWeight: 900,
          fontSize: Math.round(width * 0.012),
          color: INK,
          transform: "rotate(-2deg)",
          textTransform: "uppercase",
        }}
      >
        {renderText.stamp}
      </div>

      {/* Face */}
      <FaceImage
        src={imageDataUrls[0]}
        style={{
          position: "absolute",
          right: "3%",
          bottom: "5%",
          width: "22%",
          aspectRatio: "1",
        }}
        borderRadius={`${Math.round(width * 0.008)}px`}
        border={`${Math.round(width * 0.004)}px solid ${YELLOW}`}
        boxShadow={`${Math.round(width * 0.006)}px ${Math.round(width * 0.006)}px 0 ${YELLOW}`}
        objectPosition="center top"
      />
    </AbsoluteFill>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/remotion/thumbnails/layouts/PremiumExecution.tsx
git commit -m "feat: add PremiumExecution thumbnail layout (V9-1)"
```

---

## Task 4 — SplitResult layout (V9-2)

**Files:**
- Create: `src/remotion/thumbnails/layouts/SplitResult.tsx`

- [ ] **Step 1: Create `src/remotion/thumbnails/layouts/SplitResult.tsx`**

```tsx
import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { ThumbnailRenderProps } from "../types";
import { bebasNeue, inter } from "../fonts";
import { FaceImage } from "../FaceImage";
import { INK, CREAM, YELLOW, fitFontSize } from "../utils";

export function SplitResult({ renderText, imageDataUrls }: ThumbnailRenderProps) {
  const { width, height } = useVideoConfig();
  const leftFontSize = fitFontSize([renderText.leftLabel], Math.round(width * 0.12));
  const rightFontSize = fitFontSize([renderText.rightLabel], Math.round(width * 0.09));

  return (
    <AbsoluteFill style={{ background: INK, fontFamily: inter.fontFamily }}>
      {/* Left half — darkened reference image */}
      <div style={{ position: "absolute", left: 0, top: 0, width: "52%", height: "100%", overflow: "hidden" }}>
        <img
          src={imageDataUrls[1]}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", opacity: 0.42 }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to right, rgba(60,0,0,0.75), rgba(0,0,0,0.72))",
          }}
        />
      </div>

      {/* Right half — darkened reference image */}
      <div style={{ position: "absolute", right: 0, top: 0, width: "52%", height: "100%", overflow: "hidden" }}>
        <img
          src={imageDataUrls[2]}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", opacity: 0.44 }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to left, rgba(0,0,0,0.35), rgba(0,0,0,0.72))",
          }}
        />
      </div>

      {/* Diagonal yellow divider */}
      <div
        style={{
          position: "absolute",
          left: "46%",
          top: "-5%",
          width: "7%",
          height: "110%",
          background: YELLOW,
          transform: "rotate(5deg)",
          border: `${Math.round(width * 0.002)}px solid ${INK}`,
        }}
      />

      {/* Left label */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          top: "14%",
          width: "38%",
          fontFamily: bebasNeue.fontFamily,
          fontSize: leftFontSize,
          color: CREAM,
          lineHeight: 0.88,
          textShadow: `2px 2px 0 ${INK}`,
        }}
      >
        {renderText.leftLabel}
      </div>

      {/* Right card */}
      <div
        style={{
          position: "absolute",
          right: "4%",
          top: "12%",
          width: "40%",
          background: YELLOW,
          borderRadius: Math.round(width * 0.02),
          padding: `${Math.round(height * 0.05)}px ${Math.round(width * 0.03)}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: bebasNeue.fontFamily,
            fontSize: rightFontSize,
            color: INK,
            textAlign: "center",
            lineHeight: 0.9,
          }}
        >
          {renderText.rightLabel}
        </div>
      </div>

      {/* Face — centered bottom */}
      <FaceImage
        src={imageDataUrls[0]}
        style={{
          position: "absolute",
          left: "38%",
          bottom: "5%",
          width: "23%",
          aspectRatio: "0.85",
        }}
        borderRadius={`${Math.round(width * 0.007)}px`}
        border={`${Math.round(width * 0.003)}px solid ${INK}`}
        boxShadow={`${Math.round(width * 0.006)}px ${Math.round(width * 0.006)}px 0 ${YELLOW}`}
        objectPosition="center top"
      />

      {/* Checkmark */}
      <div
        style={{
          position: "absolute",
          right: "3%",
          bottom: "4%",
          fontFamily: bebasNeue.fontFamily,
          fontSize: Math.round(width * 0.14),
          color: YELLOW,
          textShadow: `3px 3px 0 ${INK}`,
          lineHeight: 1,
        }}
      >
        ✓
      </div>
    </AbsoluteFill>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run check 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/remotion/thumbnails/layouts/SplitResult.tsx
git commit -m "feat: add SplitResult thumbnail layout (V9-2)"
```

---

## Task 5 — Editorial layout (V9-3)

**Files:**
- Create: `src/remotion/thumbnails/layouts/Editorial.tsx`

- [ ] **Step 1: Create `src/remotion/thumbnails/layouts/Editorial.tsx`**

```tsx
import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { ThumbnailRenderProps } from "../types";
import { inter, playfairDisplay } from "../fonts";
import { FaceImage } from "../FaceImage";
import { INK, YELLOW, fitFontSize } from "../utils";

const PARCHMENT = "#f0e3c8";

export function Editorial({ renderText, imageDataUrls }: ThumbnailRenderProps) {
  const { width, height } = useVideoConfig();
  const [line1, line2] = renderText.headline;
  const headlineFontSize = fitFontSize(renderText.headline, Math.round(width * 0.095));

  return (
    <AbsoluteFill style={{ background: PARCHMENT, fontFamily: inter.fontFamily }}>
      {/* Dot texture overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.18) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />

      {/* Masthead */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          top: "5%",
          fontFamily: playfairDisplay.fontFamily,
          fontWeight: 900,
          fontSize: Math.round(width * 0.022),
          color: INK,
          letterSpacing: 3,
          textTransform: "uppercase",
        }}
      >
        {renderText.badge}
      </div>

      {/* Date */}
      <div
        style={{
          position: "absolute",
          right: "4%",
          top: "5%",
          fontFamily: inter.fontFamily,
          fontWeight: 700,
          fontSize: Math.round(width * 0.012),
          color: "#444",
        }}
      >
        {renderText.stamp}
      </div>

      {/* Horizontal rule */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          right: "4%",
          top: "16%",
          height: 3,
          background: INK,
        }}
      />

      {/* Headline line 1 */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          top: "20%",
          width: "56%",
          fontFamily: playfairDisplay.fontFamily,
          fontWeight: 900,
          fontSize: headlineFontSize,
          color: INK,
          lineHeight: 0.95,
          letterSpacing: -1,
        }}
      >
        {line1}
      </div>

      {/* Headline line 2 on yellow bar */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          top: "40%",
          width: "56%",
        }}
      >
        <div style={{ background: YELLOW, display: "inline", padding: "0 4px" }}>
          <span
            style={{
              fontFamily: playfairDisplay.fontFamily,
              fontWeight: 900,
              fontSize: headlineFontSize,
              color: INK,
              lineHeight: 0.95,
              letterSpacing: -1,
            }}
          >
            {line2 ?? renderText.subhead.slice(0, 20).toUpperCase()}
          </span>
        </div>
      </div>

      {/* Dek / subhead */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          top: "58%",
          width: "52%",
          fontFamily: inter.fontFamily,
          fontWeight: 700,
          fontSize: Math.round(width * 0.016),
          color: "#222",
          lineHeight: 1.4,
        }}
      >
        {renderText.subhead}
      </div>

      {/* Tags */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          bottom: "8%",
          display: "flex",
          gap: "5%",
          fontFamily: inter.fontFamily,
          fontWeight: 900,
          fontSize: Math.round(width * 0.012),
          color: INK,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {renderText.tags.map((tag, i) => (
          <span key={i}>{tag}</span>
        ))}
      </div>

      {/* Face — right side */}
      <FaceImage
        src={imageDataUrls[0]}
        style={{
          position: "absolute",
          right: "3%",
          top: "14%",
          width: "34%",
          height: "68%",
        }}
        borderRadius="0"
        border={`${Math.round(width * 0.003)}px solid ${INK}`}
        boxShadow={`${Math.round(width * 0.007)}px ${Math.round(width * 0.007)}px 0 ${YELLOW}`}
        objectPosition="center top"
      />

      {/* Caption */}
      <div
        style={{
          position: "absolute",
          right: "3%",
          bottom: "14%",
          width: "34%",
          background: INK,
          padding: `${Math.round(height * 0.022)}px ${Math.round(width * 0.02)}px`,
          textAlign: "center",
          fontFamily: inter.fontFamily,
          fontWeight: 900,
          fontSize: Math.round(width * 0.012),
          color: YELLOW,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {renderText.stamp}
      </div>
    </AbsoluteFill>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run check 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/remotion/thumbnails/layouts/Editorial.tsx
git commit -m "feat: add Editorial thumbnail layout (V9-3)"
```

---

## Task 6 — StatusWindow layout (V9-4)

**Files:**
- Create: `src/remotion/thumbnails/layouts/StatusWindow.tsx`

- [ ] **Step 1: Create `src/remotion/thumbnails/layouts/StatusWindow.tsx`**

```tsx
import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { ThumbnailRenderProps } from "../types";
import { bebasNeue, inter } from "../fonts";
import { FaceImage } from "../FaceImage";
import { INK, CREAM, YELLOW, RED, fitFontSize } from "../utils";

export function StatusWindow({ renderText, imageDataUrls }: ThumbnailRenderProps) {
  const { width, height } = useVideoConfig();
  const mainFontSize = fitFontSize(renderText.headline, Math.round(width * 0.108));
  const dotSize = Math.round(width * 0.018);

  return (
    <AbsoluteFill style={{ background: INK, fontFamily: inter.fontFamily }}>
      {/* Blurred background image */}
      <img
        src={imageDataUrls[1]}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0.5,
          filter: "blur(6px) brightness(0.6)",
        }}
      />

      {/* OS window panel */}
      <div
        style={{
          position: "absolute",
          left: "3%",
          top: "5%",
          width: "54%",
          height: "80%",
          background: "rgba(5,5,5,0.80)",
          border: `1px solid rgba(255,255,255,0.15)`,
          borderRadius: Math.round(width * 0.014),
          overflow: "hidden",
        }}
      >
        {/* Title bar */}
        <div
          style={{
            width: "100%",
            height: "11%",
            background: "#111",
            display: "flex",
            alignItems: "center",
            gap: Math.round(width * 0.012),
            padding: `0 ${Math.round(width * 0.02)}px`,
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: dotSize,
                height: dotSize,
                borderRadius: "50%",
                background: YELLOW,
              }}
            />
          ))}
          <span
            style={{
              fontFamily: inter.fontFamily,
              fontWeight: 800,
              fontSize: Math.round(width * 0.013),
              color: CREAM,
              marginLeft: Math.round(width * 0.01),
            }}
          >
            {renderText.badge} · {renderText.stamp}
          </span>
        </div>
      </div>

      {/* STATUS badge */}
      <div
        style={{
          position: "absolute",
          left: "7%",
          top: "18%",
          background: YELLOW,
          borderRadius: 999,
          padding: `${Math.round(height * 0.02)}px ${Math.round(width * 0.04)}px`,
          fontFamily: inter.fontFamily,
          fontWeight: 900,
          fontSize: Math.round(width * 0.015),
          color: INK,
          textTransform: "uppercase",
          letterSpacing: 1.5,
        }}
      >
        STATUS
      </div>

      {/* Main headline */}
      <div
        style={{
          position: "absolute",
          left: "6%",
          top: "32%",
          width: "45%",
          fontFamily: bebasNeue.fontFamily,
          fontSize: mainFontSize,
          color: CREAM,
          lineHeight: 0.88,
          textShadow: `2px 2px 0 ${INK}`,
        }}
      >
        {renderText.headline.slice(0, 3).join("\n")}
      </div>

      {/* Checklist — bad item */}
      <div
        style={{
          position: "absolute",
          left: "7%",
          top: "63%",
          fontFamily: inter.fontFamily,
          fontWeight: 800,
          fontSize: Math.round(width * 0.018),
          color: RED,
        }}
      >
        ✕ {renderText.checklistBad}
      </div>

      {/* Checklist — good items */}
      {renderText.checklistGood.map((item, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: "7%",
            top: `${73 + i * 10}%`,
            fontFamily: inter.fontFamily,
            fontWeight: 800,
            fontSize: Math.round(width * 0.018),
            color: CREAM,
          }}
        >
          ✓ {item}
        </div>
      ))}

      {/* Progress bar */}
      <div
        style={{
          position: "absolute",
          left: "7%",
          bottom: "13%",
          width: "42%",
          height: Math.round(height * 0.035),
          background: "#252525",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div style={{ width: "82%", height: "100%", background: YELLOW, borderRadius: 999 }} />
      </div>

      {/* Face — right side */}
      <FaceImage
        src={imageDataUrls[0]}
        style={{
          position: "absolute",
          right: "2%",
          top: "5%",
          width: "38%",
          height: "88%",
        }}
        borderRadius={`${Math.round(width * 0.012)}px`}
        border={`1px solid rgba(255,255,255,0.18)`}
        objectPosition="center top"
      />
    </AbsoluteFill>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run check 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/remotion/thumbnails/layouts/StatusWindow.tsx
git commit -m "feat: add StatusWindow thumbnail layout (V9-4)"
```

---

## Task 7 — SocialCards layout (V9-5)

**Files:**
- Create: `src/remotion/thumbnails/layouts/SocialCards.tsx`

- [ ] **Step 1: Create `src/remotion/thumbnails/layouts/SocialCards.tsx`**

```tsx
import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { ThumbnailRenderProps } from "../types";
import { bebasNeue, inter } from "../fonts";
import { FaceImage } from "../FaceImage";
import { INK, CREAM, YELLOW, fitFontSize } from "../utils";

export function SocialCards({ renderText, imageDataUrls }: ThumbnailRenderProps) {
  const { width, height } = useVideoConfig();
  const lines = renderText.headline.slice(0, 3);
  const titleFontSize = fitFontSize(lines, Math.round(width * 0.1));

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #090806 0%, #191207 56%, #050505 100%)",
        fontFamily: inter.fontFamily,
      }}
    >
      {/* Yellow glow background */}
      <div
        style={{
          position: "absolute",
          right: "18%",
          top: "-20%",
          width: "50%",
          aspectRatio: "1",
          background: YELLOW,
          borderRadius: "50%",
          opacity: 0.07,
          filter: "blur(80px)",
        }}
      />

      {/* Badge */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          top: "7%",
          background: YELLOW,
          borderRadius: 999,
          padding: `${Math.round(height * 0.02)}px ${Math.round(width * 0.04)}px`,
          fontFamily: inter.fontFamily,
          fontWeight: 900,
          fontSize: Math.round(width * 0.014),
          color: INK,
          textTransform: "uppercase",
        }}
      >
        {renderText.badge}
      </div>

      {/* Title — 3 lines */}
      <div style={{ position: "absolute", left: "4%", top: "18%" }}>
        {lines.map((line, i) => {
          if (i === 1) {
            return (
              <div
                key={i}
                style={{
                  display: "inline-block",
                  background: YELLOW,
                  padding: `0 ${Math.round(width * 0.015)}px`,
                  margin: `${Math.round(height * 0.015)}px 0`,
                }}
              >
                <span
                  style={{
                    fontFamily: bebasNeue.fontFamily,
                    fontSize: titleFontSize,
                    color: INK,
                    lineHeight: 0.9,
                    display: "block",
                  }}
                >
                  {line}
                </span>
              </div>
            );
          }
          return (
            <div
              key={i}
              style={{
                fontFamily: bebasNeue.fontFamily,
                fontSize: titleFontSize,
                color: CREAM,
                lineHeight: 0.9,
                textShadow: `1px 1px 0 ${INK}`,
              }}
            >
              {line}
            </div>
          );
        })}
      </div>

      {/* Subhead */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          top: "68%",
          fontFamily: inter.fontFamily,
          fontWeight: 900,
          fontSize: Math.round(width * 0.018),
          color: YELLOW,
          letterSpacing: -0.5,
        }}
      >
        {renderText.subhead}
      </div>

      {/* Back phone card (ghost) */}
      <div
        style={{
          position: "absolute",
          right: "20%",
          top: "5%",
          width: "22%",
          aspectRatio: "0.55",
          background: "#d8d0be",
          border: `2px solid ${INK}`,
          borderRadius: "8%",
          transform: "rotate(-7deg)",
          opacity: 0.75,
        }}
      />

      {/* Front phone card with face */}
      <div
        style={{
          position: "absolute",
          right: "4%",
          top: "2%",
          width: "22%",
          aspectRatio: "0.55",
          background: "#fff",
          border: `2px solid ${INK}`,
          borderRadius: "8%",
          transform: "rotate(5deg)",
          overflow: "hidden",
        }}
      >
        <FaceImage
          src={imageDataUrls[0]}
          style={{
            position: "absolute",
            left: "8%",
            top: "10%",
            width: "84%",
            height: "70%",
            borderRadius: "5%",
          }}
          objectPosition="center top"
        />
      </div>

      {/* Arrow */}
      <svg
        style={{ position: "absolute", left: "40%", top: "72%", width: "32%", height: "15%" }}
        viewBox="0 0 200 60"
        fill="none"
      >
        <path
          d="M10 50 C60 20 120 30 180 10"
          stroke={YELLOW}
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M155 2 L182 10 L168 32"
          stroke={YELLOW}
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </AbsoluteFill>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run check 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/remotion/thumbnails/layouts/SocialCards.tsx
git commit -m "feat: add SocialCards thumbnail layout (V9-5)"
```

---

## Task 8 — BreakingNews layout (V9-6)

**Files:**
- Create: `src/remotion/thumbnails/layouts/BreakingNews.tsx`

- [ ] **Step 1: Create `src/remotion/thumbnails/layouts/BreakingNews.tsx`**

```tsx
import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { ThumbnailRenderProps } from "../types";
import { bebasNeue, inter } from "../fonts";
import { FaceImage } from "../FaceImage";
import { INK, CREAM, YELLOW, RED, fitFontSize } from "../utils";

export function BreakingNews({ renderText, imageDataUrls, channelName }: ThumbnailRenderProps) {
  const { width, height } = useVideoConfig();
  const [line1, line2] = renderText.headline;
  const headlineFontSize = fitFontSize(renderText.headline, Math.round(width * 0.1));

  return (
    <AbsoluteFill style={{ background: INK, fontFamily: inter.fontFamily }}>
      {/* Background image — darkened */}
      <img
        src={imageDataUrls[1]}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0.35,
          filter: "brightness(0.6)",
        }}
      />

      {/* Dark gradient overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to right, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0.2) 100%)",
        }}
      />

      {/* Face — right side */}
      <FaceImage
        src={imageDataUrls[0]}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: "42%",
          height: `${Math.round(height * 0.72)}px`,
        }}
        borderRadius="0"
        objectPosition="center top"
      />

      {/* Headline */}
      <div style={{ position: "absolute", left: "4%", top: "10%", width: "52%" }}>
        <div
          style={{
            fontFamily: bebasNeue.fontFamily,
            fontSize: headlineFontSize,
            color: CREAM,
            lineHeight: 0.9,
          }}
        >
          {line1}
        </div>
        {line2 ? (
          <div
            style={{
              fontFamily: bebasNeue.fontFamily,
              fontSize: headlineFontSize,
              color: YELLOW,
              lineHeight: 0.9,
              marginTop: Math.round(height * 0.01),
            }}
          >
            {line2}
          </div>
        ) : null}
      </div>

      {/* Yellow separator stripe */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "28%",
          height: Math.round(height * 0.014),
          background: YELLOW,
        }}
      />

      {/* Lower third */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "28%",
          background: "rgba(5,5,5,0.92)",
          display: "flex",
          alignItems: "center",
          padding: `0 ${Math.round(width * 0.04)}px`,
          gap: Math.round(width * 0.04),
        }}
      >
        <div>
          <div
            style={{
              fontFamily: bebasNeue.fontFamily,
              fontSize: Math.round(width * 0.038),
              color: CREAM,
              lineHeight: 1,
            }}
          >
            {channelName ?? renderText.stamp}
          </div>
          <div
            style={{
              fontFamily: inter.fontFamily,
              fontWeight: 700,
              fontSize: Math.round(width * 0.014),
              color: YELLOW,
              textTransform: "uppercase",
              letterSpacing: 1,
              marginTop: Math.round(height * 0.008),
            }}
          >
            {renderText.subhead.slice(0, 40)}
          </div>
        </div>

        {/* AO VIVO badge */}
        <div style={{ marginLeft: "auto" }}>
          <div
            style={{
              background: RED,
              color: "#fff",
              fontFamily: inter.fontFamily,
              fontWeight: 900,
              fontSize: Math.round(width * 0.014),
              padding: `${Math.round(height * 0.015)}px ${Math.round(width * 0.025)}px`,
              borderRadius: Math.round(width * 0.004),
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            ● AO VIVO
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run check 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/remotion/thumbnails/layouts/BreakingNews.tsx
git commit -m "feat: add BreakingNews thumbnail layout (V9-6)"
```

---

## Task 9 — Register compositions in Remotion root

**Files:**
- Modify: `src/remotion/index.tsx`

- [ ] **Step 1: Read the current file**

Read `src/remotion/index.tsx` to see the current `RemotionRoot`.

- [ ] **Step 2: Replace `src/remotion/index.tsx`**

```tsx
import React from "react";
import { Composition, registerRoot } from "remotion";
import { AiMotionVideo } from "./AiMotionVideo";
import { DEFAULT_AI_MOTION_PROPS, type AiMotionVideoProps } from "./motion-types";
import type { ThumbnailRenderProps } from "./thumbnails/types";
import { PremiumExecution } from "./thumbnails/layouts/PremiumExecution";
import { SplitResult } from "./thumbnails/layouts/SplitResult";
import { Editorial } from "./thumbnails/layouts/Editorial";
import { StatusWindow } from "./thumbnails/layouts/StatusWindow";
import { SocialCards } from "./thumbnails/layouts/SocialCards";
import { BreakingNews } from "./thumbnails/layouts/BreakingNews";

const THUMBNAIL_WIDTH = 1280;
const THUMBNAIL_HEIGHT = 720;

const DEFAULT_THUMBNAIL_PROPS: ThumbnailRenderProps = {
  renderText: {
    headline: ["THUMBNAIL", "PREMIUM", "V10"],
    subhead: "preview de desenvolvimento local",
    badge: "CANAL",
    stamp: "18 mai 2026",
    leftLabel: "ANTES",
    rightLabel: "DEPOIS",
    checklistBad: "trava inicial",
    checklistGood: ["continuei mesmo assim", "canal criado"],
    tags: ["PROCESSO REAL", "SEM FILTRO", "BASTIDOR"],
  },
  imageDataUrls: ["", "", "", ""] as [string, string, string, string],
};

function RemotionRoot() {
  return (
    <>
      <Composition
        id="AiMotionVideo"
        component={AiMotionVideo}
        durationInFrames={Math.ceil(DEFAULT_AI_MOTION_PROPS.durationSec * DEFAULT_AI_MOTION_PROPS.fps)}
        fps={DEFAULT_AI_MOTION_PROPS.fps}
        width={DEFAULT_AI_MOTION_PROPS.width}
        height={DEFAULT_AI_MOTION_PROPS.height}
        defaultProps={DEFAULT_AI_MOTION_PROPS}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(1, Math.ceil(props.durationSec * props.fps)),
          fps: props.fps,
          width: props.width,
          height: props.height,
        })}
      />
      <Composition
        id="thumbnail-premium-execution"
        component={PremiumExecution}
        durationInFrames={1}
        fps={30}
        width={THUMBNAIL_WIDTH}
        height={THUMBNAIL_HEIGHT}
        defaultProps={DEFAULT_THUMBNAIL_PROPS}
      />
      <Composition
        id="thumbnail-split-result"
        component={SplitResult}
        durationInFrames={1}
        fps={30}
        width={THUMBNAIL_WIDTH}
        height={THUMBNAIL_HEIGHT}
        defaultProps={DEFAULT_THUMBNAIL_PROPS}
      />
      <Composition
        id="thumbnail-editorial"
        component={Editorial}
        durationInFrames={1}
        fps={30}
        width={THUMBNAIL_WIDTH}
        height={THUMBNAIL_HEIGHT}
        defaultProps={DEFAULT_THUMBNAIL_PROPS}
      />
      <Composition
        id="thumbnail-status-window"
        component={StatusWindow}
        durationInFrames={1}
        fps={30}
        width={THUMBNAIL_WIDTH}
        height={THUMBNAIL_HEIGHT}
        defaultProps={DEFAULT_THUMBNAIL_PROPS}
      />
      <Composition
        id="thumbnail-social-cards"
        component={SocialCards}
        durationInFrames={1}
        fps={30}
        width={THUMBNAIL_WIDTH}
        height={THUMBNAIL_HEIGHT}
        defaultProps={DEFAULT_THUMBNAIL_PROPS}
      />
      <Composition
        id="thumbnail-breaking-news"
        component={BreakingNews}
        durationInFrames={1}
        fps={30}
        width={THUMBNAIL_WIDTH}
        height={THUMBNAIL_HEIGHT}
        defaultProps={DEFAULT_THUMBNAIL_PROPS}
      />
    </>
  );
}

registerRoot(RemotionRoot);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run check 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/remotion/index.tsx
git commit -m "feat: register 6 thumbnail compositions in Remotion root"
```

---

## Task 10 — Rewrite v9-thumbnail-renderer.ts with renderStill()

**Files:**
- Modify: `src/server/youtube/v9-thumbnail-renderer.ts`
- Delete test: `src/server/youtube/v9-thumbnail-renderer.test.ts` (SVG API is gone)

- [ ] **Step 1: Delete the old SVG test**

```bash
rm src/server/youtube/v9-thumbnail-renderer.test.ts
```

- [ ] **Step 2: Rewrite `src/server/youtube/v9-thumbnail-renderer.ts`**

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import type { ThumbnailRenderProps } from "../../remotion/thumbnails/types";
import type { YoutubePackageCopy } from "./youtube-package-copy";
import { applyGrain } from "./apply-grain";

const COMPOSITION_IDS = [
  "thumbnail-premium-execution",
  "thumbnail-split-result",
  "thumbnail-editorial",
  "thumbnail-status-window",
  "thumbnail-social-cards",
  "thumbnail-breaking-news",
] as const;

type CompositionId = (typeof COMPOSITION_IDS)[number];

const GRAIN_INTENSITIES: Record<CompositionId, number> = {
  "thumbnail-editorial": 0.12,
  "thumbnail-premium-execution": 0.10,
  "thumbnail-breaking-news": 0.10,
  "thumbnail-split-result": 0.08,
  "thumbnail-status-window": 0.08,
  "thumbnail-social-cards": 0.08,
};

export async function renderV9ThumbnailImages(
  packageDir: string,
  copy: YoutubePackageCopy
): Promise<void> {
  const entryPoint = path.resolve(process.cwd(), "src/remotion/index.tsx");
  const serveUrl = await bundle({ entryPoint });

  const imageDataUrls = (await Promise.all(
    [1, 2, 3, 4].map((i) =>
      readImageAsDataUrl(packageDir, i).catch(() => "")
    )
  )) as [string, string, string, string];

  const thumbnailPrompts = copy.thumbnailPrompts.slice(0, 5);

  await Promise.all(
    thumbnailPrompts.map(async (prompt, index) => {
      const compositionId = COMPOSITION_IDS[index];
      if (!compositionId) return;

      const props: ThumbnailRenderProps = {
        renderText: prompt.renderText,
        imageDataUrls,
      };

      const composition = await selectComposition({
        serveUrl,
        id: compositionId,
        inputProps: props,
      });

      const outputPath = path.join(
        packageDir,
        `thumbnail-generated-${String(index + 1).padStart(2, "0")}.png`
      );

      await renderStill({
        composition,
        serveUrl,
        output: outputPath,
        inputProps: props,
        imageFormat: "png",
      });

      await applyGrain(outputPath, outputPath, GRAIN_INTENSITIES[compositionId]);
    })
  );

  // Render 6th layout (BreakingNews) using copy derived in the job
  const breakingNewsPrompt = copy.thumbnailPrompts[5];
  if (breakingNewsPrompt) {
    const props: ThumbnailRenderProps = {
      renderText: breakingNewsPrompt.renderText,
      imageDataUrls,
    };
    const composition = await selectComposition({
      serveUrl,
      id: "thumbnail-breaking-news",
      inputProps: props,
    });
    const outputPath = path.join(packageDir, "thumbnail-generated-06.png");
    await renderStill({ composition, serveUrl, output: outputPath, inputProps: props, imageFormat: "png" });
    await applyGrain(outputPath, outputPath, GRAIN_INTENSITIES["thumbnail-breaking-news"]);
  }
}

async function readImageAsDataUrl(packageDir: string, index: number): Promise<string> {
  const filePath = path.join(
    packageDir,
    `thumbnail-ref-${String(index).padStart(2, "0")}.jpg`
  );
  const buffer = await readFile(filePath);
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run check 2>&1 | head -20
```

- [ ] **Step 4: Run tests to confirm remaining tests still pass**

```bash
npm test 2>&1 | tail -20
```

Expected: existing `run-youtube-package-job` tests pass (they mock `renderV9ThumbnailImages`). The deleted SVG test is gone.

- [ ] **Step 5: Commit**

```bash
git add src/server/youtube/v9-thumbnail-renderer.ts
git rm src/server/youtube/v9-thumbnail-renderer.test.ts
git commit -m "feat: rewrite v9-thumbnail-renderer to use Remotion renderStill()"
```

---

## Task 11 — apply-grain.ts

**Files:**
- Create: `src/server/youtube/apply-grain.ts`
- Create: `src/server/youtube/apply-grain.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/youtube/apply-grain.test.ts`:

```ts
import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { withTempDir } from "../../test/fixtures";
import { applyGrain } from "./apply-grain";

describe("applyGrain", () => {
  it("writes a PNG file to the output path", async () => {
    await withTempDir("grain-test-", async (dir) => {
      const inputPath = path.join(dir, "input.png");
      const outputPath = path.join(dir, "output.png");

      // Create a minimal valid 4x4 PNG
      await sharp({
        create: { width: 4, height: 4, channels: 3, background: { r: 128, g: 100, b: 80 } },
      })
        .png()
        .toFile(inputPath);

      await applyGrain(inputPath, outputPath);

      await expect(access(outputPath)).resolves.toBeUndefined();
      const meta = await sharp(outputPath).metadata();
      expect(meta.format).toBe("png");
      expect(meta.width).toBe(4);
      expect(meta.height).toBe(4);
    });
  });

  it("does not throw when intensity is low", async () => {
    await withTempDir("grain-low-", async (dir) => {
      const inputPath = path.join(dir, "input.png");
      await sharp({
        create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 180, b: 160 } },
      })
        .png()
        .toFile(inputPath);

      await expect(applyGrain(inputPath, inputPath, 0.06)).resolves.toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test src/server/youtube/apply-grain.test.ts 2>&1 | tail -15
```

Expected: FAIL — `applyGrain` not defined.

- [ ] **Step 3: Create `src/server/youtube/apply-grain.ts`**

```ts
import sharp from "sharp";

/**
 * Composites a film-grain noise layer over a PNG thumbnail.
 * intensity maps to Gaussian sigma: 0.08 → sigma≈6, 0.10 → sigma≈8, 0.12 → sigma≈10.
 * Fails silently — on error, leaves the file unchanged if input === output.
 */
export async function applyGrain(
  inputPath: string,
  outputPath: string,
  intensity: number = 0.08
): Promise<void> {
  try {
    const { width = 1280, height = 720 } = await sharp(inputPath).metadata();
    const sigma = Math.round(intensity * 75);

    const noiseBuffer = await sharp({
      create: {
        width,
        height,
        channels: 3,
        noise: { type: "gaussian", mean: 128, sigma },
      },
    })
      .toFormat("png")
      .toBuffer();

    await sharp(inputPath)
      .composite([{ input: noiseBuffer, blend: "soft-light" }])
      .png()
      .toFile(outputPath);
  } catch {
    if (inputPath !== outputPath) {
      await sharp(inputPath).png().toFile(outputPath);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test src/server/youtube/apply-grain.test.ts 2>&1 | tail -15
```

Expected: PASS — 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/server/youtube/apply-grain.ts src/server/youtube/apply-grain.test.ts
git commit -m "feat: add apply-grain Sharp pipeline for film texture on thumbnails"
```

---

## Task 12 — preprocess-frames.ts

**Files:**
- Create: `src/server/youtube/preprocess-frames.ts`
- Create: `src/server/youtube/preprocess-frames.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/youtube/preprocess-frames.test.ts`:

```ts
import { access } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { withTempDir } from "../../test/fixtures";
import { preprocessFrame } from "./preprocess-frames";

describe("preprocessFrame", () => {
  it("writes a valid JPEG to the output path", async () => {
    await withTempDir("preprocess-test-", async (dir) => {
      const inputPath = path.join(dir, "input.jpg");
      const outputPath = path.join(dir, "output.jpg");

      await sharp({
        create: { width: 8, height: 8, channels: 3, background: { r: 80, g: 70, b: 60 } },
      })
        .jpeg()
        .toFile(inputPath);

      await preprocessFrame(inputPath, outputPath);

      await expect(access(outputPath)).resolves.toBeUndefined();
      const meta = await sharp(outputPath).metadata();
      expect(meta.format).toBe("jpeg");
      expect(meta.width).toBe(8);
      expect(meta.height).toBe(8);
    });
  });

  it("falls back to copying the original when processing fails", async () => {
    await withTempDir("preprocess-fallback-", async (dir) => {
      const inputPath = path.join(dir, "input.jpg");
      const outputPath = path.join(dir, "output.jpg");

      // Write a valid JPEG as input
      await sharp({
        create: { width: 4, height: 4, channels: 3, background: { r: 100, g: 100, b: 100 } },
      })
        .jpeg()
        .toFile(inputPath);

      // preprocessFrame should not throw even if it hits an internal error
      await expect(preprocessFrame(inputPath, outputPath)).resolves.toBeUndefined();
      await expect(access(outputPath)).resolves.toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test src/server/youtube/preprocess-frames.test.ts 2>&1 | tail -15
```

Expected: FAIL — `preprocessFrame` not defined.

- [ ] **Step 3: Create `src/server/youtube/preprocess-frames.ts`**

```ts
import sharp from "sharp";

/**
 * Preprocesses a reference frame:
 * 1. Auto white/black point (normalize)
 * 2. Subtle colour pop (saturation + brightness)
 * 3. Light sharpening
 * 4. Golden-hour grade: warm highlights, slightly cooled shadows
 *
 * Falls back to writing the original file on any error.
 */
export async function preprocessFrame(inputPath: string, outputPath: string): Promise<void> {
  try {
    await sharp(inputPath)
      .normalize()
      .modulate({ saturation: 1.15, brightness: 1.03 })
      .sharpen({ sigma: 1.0, m1: 0.5, m2: 2.0 })
      // Golden-hour grade: per-channel linear(multiplier, offset)
      // R: warm push +5%, G: neutral, B: cool -3% → subtle amber tone
      .linear([1.05, 1.01, 0.97], [5, 1, -2])
      .jpeg({ quality: 95 })
      .toFile(outputPath);
  } catch {
    await sharp(inputPath).jpeg({ quality: 95 }).toFile(outputPath);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test src/server/youtube/preprocess-frames.test.ts 2>&1 | tail -15
```

Expected: PASS — 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/server/youtube/preprocess-frames.ts src/server/youtube/preprocess-frames.test.ts
git commit -m "feat: add preprocessFrame with normalize + golden-hour grading"
```

---

## Task 13 — select-best-frame.ts

**Files:**
- Create: `src/server/youtube/select-best-frame.ts`
- Create: `src/server/youtube/select-best-frame.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/youtube/select-best-frame.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { selectBestFrame } from "./select-best-frame";

describe("selectBestFrame", () => {
  it("returns the index from a successful GPT-4o Vision response", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"index": 3}' } }],
    });
    const result = await selectBestFrame(
      ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg", "f.jpg"],
      "test-key",
      { chatCompletionsCreate: mockCreate }
    );
    expect(result).toBe(3);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("returns 0 when the response index is out of range", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"index": 99}' } }],
    });
    const result = await selectBestFrame(["a.jpg", "b.jpg"], "test-key", {
      chatCompletionsCreate: mockCreate,
    });
    expect(result).toBe(0);
  });

  it("returns 0 when the OpenAI call throws", async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error("network error"));
    const result = await selectBestFrame(["a.jpg", "b.jpg"], "test-key", {
      chatCompletionsCreate: mockCreate,
    });
    expect(result).toBe(0);
  });

  it("returns 0 when no API key is provided and no client override", async () => {
    const result = await selectBestFrame(["a.jpg"], undefined);
    expect(result).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test src/server/youtube/select-best-frame.test.ts 2>&1 | tail -15
```

Expected: FAIL — `selectBestFrame` not defined.

- [ ] **Step 3: Create `src/server/youtube/select-best-frame.ts`**

```ts
import { readFile } from "node:fs/promises";
import OpenAI from "openai";

type SelectBestFrameDeps = {
  chatCompletionsCreate?: (params: Record<string, unknown>) => Promise<{
    choices: Array<{ message: { content: string | null } }>;
  }>;
};

/**
 * Sends candidate frame images to GPT-4o Vision and returns the index
 * of the frame with the most engaging facial expression.
 * Returns 0 silently on any error.
 */
export async function selectBestFrame(
  candidatePaths: string[],
  apiKey?: string,
  deps: SelectBestFrameDeps = {}
): Promise<number> {
  const key = apiKey ?? process.env.OPENAI_API_KEY;
  if (!key && !deps.chatCompletionsCreate) return 0;
  if (candidatePaths.length === 0) return 0;

  try {
    const imageContents = await Promise.all(
      candidatePaths.map(async (p) => {
        const buffer = await readFile(p);
        const base64 = buffer.toString("base64");
        return {
          type: "image_url" as const,
          image_url: { url: `data:image/jpeg;base64,${base64}`, detail: "low" as const },
        };
      })
    );

    const callCreate =
      deps.chatCompletionsCreate ??
      ((params: Record<string, unknown>) => {
        const client = new OpenAI({ apiKey: key });
        return client.chat.completions.create(params as Parameters<typeof client.chat.completions.create>[0]);
      });

    const response = await callCreate({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            ...imageContents,
            {
              type: "text",
              text: `These are ${candidatePaths.length} video frames numbered 0 to ${candidatePaths.length - 1}. Pick the one with the most engaging facial expression for a YouTube thumbnail: eyes open, looking toward camera, expressive or energetic. Return only JSON: {"index": N}`,
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 20,
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { index?: unknown };
    const index = typeof parsed.index === "number" ? Math.round(parsed.index) : 0;
    return index >= 0 && index < candidatePaths.length ? index : 0;
  } catch {
    return 0;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test src/server/youtube/select-best-frame.test.ts 2>&1 | tail -15
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/server/youtube/select-best-frame.ts src/server/youtube/select-best-frame.test.ts
git commit -m "feat: add selectBestFrame via GPT-4o Vision for expressive frame selection"
```

---

## Task 14 — Update run-youtube-package-job.ts (smart frames + preprocessing + 6th layout)

**Files:**
- Modify: `src/server/jobs/run-youtube-package-job.ts`
- Modify: `src/server/jobs/run-youtube-package-job.test.ts`

- [ ] **Step 1: Read the current job file**

Read `src/server/jobs/run-youtube-package-job.ts` in full (already read earlier in the session — refer to the copy above at lines 1–275).

- [ ] **Step 2: Update the type definitions and imports at the top of `run-youtube-package-job.ts`**

Replace the import block and type definitions (lines 1–32) with:

```ts
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Caption, EditPlan } from "../../shared/edit-plan";
import { editPlanSchema } from "../../shared/edit-plan";
import { getConfig } from "../config";
import { runProcess } from "../media/process";
import type { ProcessOptions, ProcessResult } from "../media/process";
import type { ProjectWorkspace } from "../workspace";
import { renderV9ThumbnailImages } from "../youtube/v9-thumbnail-renderer";
import { generateYoutubePackageCopy } from "../youtube/youtube-package-copy";
import type { YoutubePackageCopy } from "../youtube/youtube-package-copy";
import { selectBestFrame } from "../youtube/select-best-frame";
import { preprocessFrame } from "../youtube/preprocess-frames";
import type { JobStore } from "./job-store";

export type YoutubePackageProcessRunner = (
  command: string,
  args: string[],
  options?: ProcessOptions
) => Promise<ProcessResult>;

export type RunYoutubePackageJobInput = {
  jobId: string;
  workspace: ProjectWorkspace;
  jobs: JobStore;
};

export type RunYoutubePackageJobDeps = {
  generateYoutubePackageCopy?: typeof generateYoutubePackageCopy;
  renderV9ThumbnailImages?: typeof renderV9ThumbnailImages;
  selectBestFrame?: typeof selectBestFrame;
  preprocessFrame?: typeof preprocessFrame;
};

const CANDIDATE_COUNT = 6;
const FRAME_TIMEOUT_MS = 5 * 60 * 1000;
const IDENTITY_CLIP_DURATION_SEC = 4;
```

- [ ] **Step 3: Replace `extractReferenceFrames` and `selectFrameTimes` with the new implementation**

Remove the old `selectFrameTimes` export and `extractReferenceFrames` function and replace with:

```ts
export function selectCandidateFrameTimes(plan: EditPlan): number[] {
  const durationSec = plan.segments.at(-1)?.timelineEndSec ?? plan.source.durationSec;
  const safeDuration = Math.max(1, durationSec);
  return [0.05, 0.20, 0.38, 0.55, 0.72, 0.88].map((pct) =>
    Number(
      Math.min(
        Math.max(0.5, safeDuration * pct),
        Math.max(0.5, safeDuration - 0.5)
      ).toFixed(3)
    )
  );
}

async function extractReferenceFrames(
  plan: EditPlan,
  sourcePath: string,
  packageDir: string,
  processRunner: YoutubePackageProcessRunner,
  deps: Pick<RunYoutubePackageJobDeps, "selectBestFrame" | "preprocessFrame">
) {
  const times = selectCandidateFrameTimes(plan);
  const segmentDuration = Number(
    Math.min(
      6,
      Math.max(1, (plan.segments.at(-1)?.timelineEndSec ?? plan.source.durationSec) / CANDIDATE_COUNT)
    ).toFixed(3)
  );

  const candidatePaths: string[] = [];

  for (const [index, timeSec] of times.entries()) {
    const candidatePath = path.join(
      packageDir,
      `thumbnail-candidate-${String(index + 1).padStart(2, "0")}.jpg`
    );

    // Try FFmpeg thumbnail filter first
    const filterResult = await processRunner(
      getConfig().ffmpegPath,
      [
        "-y", "-ss", String(timeSec), "-t", String(segmentDuration),
        "-i", sourcePath,
        "-vf", "thumbnail=60",
        "-frames:v", "1", "-q:v", "2",
        candidatePath,
      ],
      { timeoutMs: FRAME_TIMEOUT_MS }
    );

    if (filterResult.exitCode !== 0) {
      // Fallback: single frame at timestamp
      const fallback = await processRunner(
        getConfig().ffmpegPath,
        ["-y", "-ss", String(timeSec), "-i", sourcePath,
         "-frames:v", "1", "-q:v", "2", "-vf", "scale=1280:-2",
         candidatePath],
        { timeoutMs: FRAME_TIMEOUT_MS }
      );
      if (fallback.exitCode !== 0) {
        throw new Error(
          fallback.stderr || fallback.stdout || `FFmpeg failed extracting candidate ${index + 1}`
        );
      }
    }

    candidatePaths.push(candidatePath);
  }

  const bestFrameFn = deps.selectBestFrame ?? selectBestFrame;
  const bestIdx = await bestFrameFn(candidatePaths);

  // Assemble 4 ref frames: best face + 3 spread candidates
  const refCandidateIndices = [bestIdx, 1, 3, 5].map((i) =>
    Math.min(i, candidatePaths.length - 1)
  );

  const preprocessFn = deps.preprocessFrame ?? preprocessFrame;

  for (const [refIndex, candidateIndex] of refCandidateIndices.entries()) {
    const outputPath = path.join(
      packageDir,
      `thumbnail-ref-${String(refIndex + 1).padStart(2, "0")}.jpg`
    );
    await preprocessFn(candidatePaths[candidateIndex]!, outputPath);
  }
}
```

- [ ] **Step 4: Update `runYoutubePackageJob` to pass new deps to `extractReferenceFrames` and derive the 6th prompt**

Find the call to `extractReferenceFrames` inside `runYoutubePackageJob` and update it, and also add the 6th prompt derivation before calling `thumbnailRenderer`:

```ts
// Replace the extractReferenceFrames call:
await extractReferenceFrames(plan, sourcePath, packageDir, processRunner, {
  selectBestFrame: deps.selectBestFrame,
  preprocessFrame: deps.preprocessFrame,
});

// Add the 6th prompt derivation (place this just before thumbnailRenderer call):
const copyWith6th = deriveBreakingNewsCopy(copy);

// Replace the thumbnailRenderer call:
await thumbnailRenderer(packageDir, copyWith6th);
```

Then add the `deriveBreakingNewsCopy` function at the bottom of the file:

```ts
function deriveBreakingNewsCopy(copy: YoutubePackageCopy): YoutubePackageCopy {
  const base = copy.thumbnailPrompts[0];
  if (!base) return copy;
  return {
    ...copy,
    thumbnailPrompts: [
      ...copy.thumbnailPrompts,
      {
        conceptId: "fiz_mesmo_assim",
        title: "Breaking News",
        renderText: {
          ...base.renderText,
          badge: "AO VIVO",
        },
        prompt: base.prompt,
      },
    ],
  };
}
```

- [ ] **Step 5: Update the export — rename `selectFrameTimes` to `selectCandidateFrameTimes` in the file**

The old `selectFrameTimes` export is removed. The new export is `selectCandidateFrameTimes`.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npm run check 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 7: Update the test file `src/server/jobs/run-youtube-package-job.test.ts`**

Replace the import line and update the test assertions:

```ts
// Change import:
import { runYoutubePackageJob, selectCandidateFrameTimes, selectIdentityClipRanges } from "./run-youtube-package-job";
```

Update the mock for `renderV9ThumbnailImages` to create 6 thumbnails:

```ts
const renderV9ThumbnailImages = vi.fn(async (packageDir: string) => {
  await Promise.all([1, 2, 3, 4, 5, 6].map((index) => (
    writeFile(path.join(packageDir, `thumbnail-generated-${String(index).padStart(2, "0")}.png`), "png")
  )));
});
```

Add mocks for `selectBestFrame` and `preprocessFrame` in the deps:

```ts
const selectBestFrame = vi.fn().mockResolvedValue(0);
const preprocessFrame = vi.fn(async (_input: string, output: string) => {
  await writeFile(output, "jpeg");
});

await runYoutubePackageJob(
  { jobId: job.id, workspace, jobs },
  processRunner,
  { generateYoutubePackageCopy, renderV9ThumbnailImages, selectBestFrame, preprocessFrame }
);
```

Update the `processRunner` call count assertion (6 candidates + 2 identity clips = 8):

```ts
expect(processRunner).toHaveBeenCalledTimes(8);
```

Update the first frame assertion to include the thumbnail filter args:

```ts
expect(processRunner.mock.calls[0][1]).toEqual(
  expect.arrayContaining(["-vf", "thumbnail=60", "-frames:v", "1"])
);
```

Update the `selectFrameTimes` test to use `selectCandidateFrameTimes`:

```ts
it("selects six candidate frame times across the edited duration", async () => {
  const plan = {
    source: { durationSec: 50 },
    segments: [{ timelineEndSec: 25 }],
  } as Parameters<typeof selectCandidateFrameTimes>[0];

  const times = selectCandidateFrameTimes(plan);
  expect(times).toHaveLength(6);
  expect(times[0]).toBeCloseTo(1.25, 0); // 0.05 * 25
  expect(times[5]).toBeCloseTo(22, 0);   // 0.88 * 25
});
```

- [ ] **Step 8: Run all tests**

```bash
npm test 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/server/jobs/run-youtube-package-job.ts src/server/jobs/run-youtube-package-job.test.ts
git commit -m "feat: smart frame selection with FFmpeg thumbnail filter, GPT-4o Vision, preprocessing, and 6th BreakingNews layout"
```

---

## Task 15 — Final check + full test run

- [ ] **Step 1: Run the full test suite**

```bash
npm test 2>&1
```

Expected: all tests pass. Note down any failures.

- [ ] **Step 2: TypeScript full check**

```bash
npm run check 2>&1
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Verify new files are all present**

```bash
find src/remotion/thumbnails src/server/youtube/select-best-frame.ts src/server/youtube/preprocess-frames.ts src/server/youtube/apply-grain.ts -type f | sort
```

Expected output includes:
```
src/remotion/thumbnails/FaceImage.tsx
src/remotion/thumbnails/fonts.ts
src/remotion/thumbnails/layouts/BreakingNews.tsx
src/remotion/thumbnails/layouts/Editorial.tsx
src/remotion/thumbnails/layouts/PremiumExecution.tsx
src/remotion/thumbnails/layouts/SocialCards.tsx
src/remotion/thumbnails/layouts/SplitResult.tsx
src/remotion/thumbnails/layouts/StatusWindow.tsx
src/remotion/thumbnails/types.ts
src/remotion/thumbnails/utils.ts
src/server/youtube/apply-grain.ts
src/server/youtube/preprocess-frames.ts
src/server/youtube/select-best-frame.ts
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: thumbnail premium v10 — all tasks complete"
```
