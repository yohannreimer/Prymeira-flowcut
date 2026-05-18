# MediaFactory SaaS Guided Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a guided SaaS workflow that takes a creator from upload to cut, AI package review, thumbnail assets, and publish readiness without touching the personal MediaFactory folder.

**Architecture:** Reuse the existing project, caption, YouTube package, and publish-readiness jobs. Add one package-summary API to read generated artifacts, then layer a focused workflow UI on top of the current editor rather than replacing the editor internals.

**Tech Stack:** TypeScript, Express, React, Vite, Vitest, Supertest, existing MediaFactory project workspace layout.

---

## File Structure

- Create `src/server/youtube/youtube-package-summary.ts`: reads `download/youtube-package` files and returns a typed summary with missing-artifact state.
- Create `src/server/youtube/youtube-package-summary.test.ts`: unit tests for complete, partial, and missing package folders.
- Modify `src/server/routes/projects.ts`: add `GET /api/projects/:projectId/youtube-package/summary` and package asset serving.
- Modify `src/server/routes/projects.test.ts`: route tests for summary and safe asset lookup.
- Modify `src/client/api.ts`: add `YoutubePackageSummary` type and `fetchYoutubePackageSummary`.
- Modify `src/client/App.tsx`: add a guided workflow surface, package-summary polling, and a review-first publish area.
- Modify `src/client/styles.css`: style the guided operational SaaS flow.

### Task 1: YouTube Package Summary Reader

**Files:**
- Create: `src/server/youtube/youtube-package-summary.ts`
- Test: `src/server/youtube/youtube-package-summary.test.ts`

- [ ] **Step 1: Write the failing summary reader tests**

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readYoutubePackageSummary } from "./youtube-package-summary";

describe("readYoutubePackageSummary", () => {
  it("returns generated copy and package assets", async () => {
    const root = await makeWorkspace();
    const packageDir = path.join(root, "download", "youtube-package");
    await mkdir(packageDir, { recursive: true });
    await writeFile(path.join(packageDir, "titulo.txt"), "Titulo pronto\n");
    await writeFile(path.join(packageDir, "descricao.txt"), "Descricao pronta\n");
    await writeFile(path.join(packageDir, "transcricao.txt"), "[00:00 - 00:01] Oi\n");
    await writeFile(path.join(packageDir, "prompt-thumbnail.txt"), "VARIACAO 1\n\nPrompt A\n");
    await writeFile(path.join(packageDir, "thumbnail-ref-01.jpg"), "jpg");
    await writeFile(path.join(packageDir, "identity-ref-01.mp4"), "mp4");

    await expect(readYoutubePackageSummary(root, "project_abc")).resolves.toMatchObject({
      status: "ready",
      title: "Titulo pronto",
      description: "Descricao pronta",
      transcriptAvailable: true,
      thumbnailPrompt: "VARIACAO 1\n\nPrompt A",
      missing: [],
      assets: [
        { kind: "thumbnail_reference", name: "thumbnail-ref-01.jpg", url: "/api/projects/project_abc/youtube-package/assets/thumbnail-ref-01.jpg" },
        { kind: "identity_clip", name: "identity-ref-01.mp4", url: "/api/projects/project_abc/youtube-package/assets/identity-ref-01.mp4" }
      ]
    });
  });

  it("reports missing files without throwing", async () => {
    const root = await makeWorkspace();
    await mkdir(path.join(root, "download", "youtube-package"), { recursive: true });

    await expect(readYoutubePackageSummary(root, "project_abc")).resolves.toMatchObject({
      status: "incomplete",
      title: null,
      description: null,
      transcriptAvailable: false,
      thumbnailPrompt: null,
      missing: ["titulo.txt", "descricao.txt", "transcricao.txt", "prompt-thumbnail.txt"],
      assets: []
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/server/youtube/youtube-package-summary.test.ts`

Expected: FAIL because `youtube-package-summary.ts` does not exist.

- [ ] **Step 3: Implement the summary reader**

Create `readYoutubePackageSummary(projectRoot, projectId)` that:

- reads `download/youtube-package`;
- trims text files;
- returns `status: "missing"` when the folder does not exist;
- returns `status: "incomplete"` when one or more required files are absent;
- returns sorted asset URLs for `thumbnail-ref-*.jpg`, `identity-ref-*.mp4`, and common generated thumbnail image names.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/server/youtube/youtube-package-summary.test.ts`

Expected: PASS.

### Task 2: Project Package Summary API

**Files:**
- Modify: `src/server/routes/projects.ts`
- Modify: `src/server/routes/projects.test.ts`

- [ ] **Step 1: Write failing route tests**

Add tests that:

- create a project workspace with `download/youtube-package/titulo.txt`;
- call `GET /api/projects/project_123/youtube-package/summary`;
- expect `{ summary: { status: "incomplete", title: "..." } }`;
- call `GET /api/projects/project_123/youtube-package/assets/thumbnail-ref-01.jpg`;
- expect safe file serving;
- call `GET /api/projects/project_123/youtube-package/assets/../edit-plan.json`;
- expect `404`.

- [ ] **Step 2: Run the route tests to verify failure**

Run: `npm test -- src/server/routes/projects.test.ts --runInBand`

Expected: FAIL because the routes do not exist.

- [ ] **Step 3: Implement the routes**

In `createProjectRouter`, before `/:projectId/publish-readiness`, add:

- `GET /:projectId/youtube-package/summary`;
- `GET /:projectId/youtube-package/assets/:assetName`.

Use the existing `PROJECT_ID_PATTERN`, `createProjectWorkspace`, and new summary reader. Asset serving must only allow basename matches and known extensions/names from the summary.

- [ ] **Step 4: Run the route tests**

Run: `npm test -- src/server/routes/projects.test.ts --runInBand`

Expected: PASS.

### Task 3: Client API Contract

**Files:**
- Modify: `src/client/api.ts`
- Test: `src/client/api.test.ts`

- [ ] **Step 1: Write the failing client API test**

Add a test that stubs `fetch` for `/api/projects/project_abc/youtube-package/summary` and expects `fetchYoutubePackageSummary("project_abc")` to return the `summary` object.

- [ ] **Step 2: Run the client API test to verify failure**

Run: `npm test -- src/client/api.test.ts`

Expected: FAIL because `fetchYoutubePackageSummary` is not exported.

- [ ] **Step 3: Add the API type and function**

Add:

```ts
export type YoutubePackageSummary = {
  status: "missing" | "incomplete" | "ready";
  title: string | null;
  description: string | null;
  transcriptAvailable: boolean;
  thumbnailPrompt: string | null;
  missing: string[];
  assets: Array<{ kind: "thumbnail_reference" | "identity_clip" | "generated_thumbnail"; name: string; url: string }>;
};
```

and `fetchYoutubePackageSummary(projectId)`.

- [ ] **Step 4: Run the client API test**

Run: `npm test -- src/client/api.test.ts`

Expected: PASS.

### Task 4: Guided Workflow UI

**Files:**
- Modify: `src/client/App.tsx`
- Modify: `src/client/styles.css`

- [ ] **Step 1: Add focused workflow state**

Track:

- `youtubePackageSummary`;
- `selectedPackageAsset`;
- whether the advanced editor is open;
- whether the AI package step is currently running.

- [ ] **Step 2: Load package summary when jobs complete**

After project, caption, or YouTube package job completion, fetch the latest plan and package summary. If captions exist and no package exists, show the next action as “Gerar pacote YouTube”.

- [ ] **Step 3: Add the guided first-screen component**

Render a workflow band above the current editor with:

- upload status;
- cut status;
- AI status;
- thumbnail status;
- review status;
- publish status.

The main action should be “Enviar video” when there is no project, “Gerar legendas” after the cut, “Gerar pacote YouTube” after captions, and “Revisar publicacao” when the package is ready.

- [ ] **Step 4: Add the review panel**

Show:

- video preview using existing output URL;
- title;
- description;
- transcript availability;
- thumbnail prompt;
- thumbnail/reference assets as selectable tiles;
- disabled YouTube publish button with text explaining account connection is the next step.

- [ ] **Step 5: Style the workflow**

Use a compact SaaS operational style:

- no landing page;
- no nested cards;
- stable step dimensions;
- icons or small status markers;
- desktop and mobile layouts that do not overlap text.

### Task 5: Verification

**Files:**
- No new files.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm test -- src/server/youtube/youtube-package-summary.test.ts src/server/routes/projects.test.ts src/client/api.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Restart local preview from the SaaS folder**

Restart the API and static proxy from `/Users/yohannreimer/Downloads/Locais/MediaFactory-SaaS` so `http://localhost:5181/` shows the new build.

- [ ] **Step 5: Browser verification**

Open `http://localhost:5181/` in the in-app browser and verify:

- the first screen is the guided workflow, not a marketing page;
- the personal MediaFactory folder was not modified;
- no obvious layout overlap appears on desktop width.
