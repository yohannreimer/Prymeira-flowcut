# Identity Photo Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the video-extracted face reference (ref-01) with a high-quality photo selected from the creator's identity photo library, falling back to the current behavior when no library exists.

**Architecture:** A new `selectIdentityPhoto` function (modeled after `selectBestFrame`) uses GPT-4o Vision to choose the most contextually appropriate photo given the video title. `runYoutubePackageJob` resolves the photo library (per-project override → global → fallback), then passes photo paths + video title into `extractReferenceFrames`, which branches on whether photos are available.

**Tech Stack:** Node.js, TypeScript, OpenAI GPT-4o Vision, Sharp (preprocessing), Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/server/youtube/select-identity-photo.ts` | Create | GPT-4o expression selector — picks the best photo index given a video title |
| `src/server/youtube/select-identity-photo.test.ts` | Create | Unit tests for the selector (injectable deps, no real API calls) |
| `src/server/jobs/run-youtube-package-job.ts` | Modify | Add `resolveIdentityPhotos` helper, wire photo paths into `extractReferenceFrames` |
| `src/server/jobs/run-youtube-package-job.test.ts` | Modify | Add test for identity photo path + assert fallback when no library |

---

## Task 1: `select-identity-photo.ts` — GPT-4o expression selector

**Files:**
- Create: `src/server/youtube/select-identity-photo.ts`
- Create: `src/server/youtube/select-identity-photo.test.ts`

- [ ] **Step 1.1 — Write the failing tests**

Create `src/server/youtube/select-identity-photo.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { selectIdentityPhoto } from "./select-identity-photo";

const stubReadImageFile = vi.fn().mockResolvedValue(Buffer.from("fake-jpeg"));

describe("selectIdentityPhoto", () => {
  it("returns the index from a successful GPT-4o Vision response", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"index": 2}' } }],
    });
    const result = await selectIdentityPhoto(
      ["pensativo.jpg", "surpreso.jpg", "apontando.jpg"],
      "Como eu automatizo meu YouTube",
      "test-key",
      { chatCompletionsCreate: mockCreate, readImageFile: stubReadImageFile }
    );
    expect(result).toBe(2);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("includes the video title in the prompt", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"index": 0}' } }],
    });
    await selectIdentityPhoto(
      ["a.jpg", "b.jpg"],
      "Meu título de teste",
      "test-key",
      { chatCompletionsCreate: mockCreate, readImageFile: stubReadImageFile }
    );
    const calledMessages = mockCreate.mock.calls[0][0].messages;
    const textContent = calledMessages[0].content.find(
      (c: { type: string }) => c.type === "text"
    );
    expect(textContent.text).toContain("Meu título de teste");
  });

  it("returns 0 when the response index is out of range", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"index": 99}' } }],
    });
    const result = await selectIdentityPhoto(
      ["a.jpg", "b.jpg"],
      "Título qualquer",
      "test-key",
      { chatCompletionsCreate: mockCreate, readImageFile: stubReadImageFile }
    );
    expect(result).toBe(0);
  });

  it("returns 0 when the OpenAI call throws", async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error("network error"));
    const result = await selectIdentityPhoto(
      ["a.jpg", "b.jpg"],
      "Título qualquer",
      "test-key",
      { chatCompletionsCreate: mockCreate, readImageFile: stubReadImageFile }
    );
    expect(result).toBe(0);
  });

  it("returns 0 when no API key is provided and no client override", async () => {
    const result = await selectIdentityPhoto(["a.jpg"], "Título qualquer", undefined);
    expect(result).toBe(0);
  });

  it("returns 0 when photoPaths is empty", async () => {
    const mockCreate = vi.fn();
    const result = await selectIdentityPhoto([], "Título qualquer", "test-key", {
      chatCompletionsCreate: mockCreate,
    });
    expect(result).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 1.2 — Run tests to verify they fail**

```bash
npx vitest run src/server/youtube/select-identity-photo.test.ts
```

Expected: FAIL with `Cannot find module './select-identity-photo'`

- [ ] **Step 1.3 — Write the implementation**

Create `src/server/youtube/select-identity-photo.ts`:

```typescript
import { readFile } from "node:fs/promises";
import OpenAI from "openai";

type SelectIdentityPhotoResponse = {
  choices: Array<{ message: { content: string | null } }>;
};

type SelectIdentityPhotoDeps = {
  chatCompletionsCreate?: (params: Record<string, unknown>) => Promise<SelectIdentityPhotoResponse>;
  readImageFile?: (filePath: string) => Promise<Buffer>;
};

/**
 * Given a list of identity photo paths and the video title, uses GPT-4o Vision
 * to select the photo whose expression best fits the video theme.
 * Returns the index of the selected photo. Returns 0 silently on any error.
 */
export async function selectIdentityPhoto(
  photoPaths: string[],
  videoTitle: string,
  apiKey?: string,
  deps: SelectIdentityPhotoDeps = {}
): Promise<number> {
  const key = apiKey ?? process.env.OPENAI_API_KEY;
  if (!key && !deps.chatCompletionsCreate) return 0;
  if (photoPaths.length === 0) return 0;

  try {
    const readFn = deps.readImageFile ?? readFile;
    const imageContents = await Promise.all(
      photoPaths.map(async (p) => {
        const buffer = await readFn(p);
        const base64 = buffer.toString("base64");
        return {
          type: "image_url" as const,
          image_url: { url: `data:image/jpeg;base64,${base64}`, detail: "low" as const },
        };
      })
    );

    const callCreate: (params: Record<string, unknown>) => Promise<SelectIdentityPhotoResponse> =
      deps.chatCompletionsCreate ??
      (async (params) => {
        const client = new OpenAI({ apiKey: key });
        const result = await client.chat.completions.create(
          params as unknown as Parameters<typeof client.chat.completions.create>[0]
        );
        return result as SelectIdentityPhotoResponse;
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
              text: `Este vídeo se chama "${videoTitle}". Qual dessas ${photoPaths.length} fotos (numeradas de 0 a ${photoPaths.length - 1}) tem a expressão mais adequada para a thumbnail desse tema? Retorna apenas JSON: {"index": N}`,
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
    return index >= 0 && index < photoPaths.length ? index : 0;
  } catch {
    return 0;
  }
}
```

- [ ] **Step 1.4 — Run tests to verify they pass**

```bash
npx vitest run src/server/youtube/select-identity-photo.test.ts
```

Expected: all 6 tests PASS

- [ ] **Step 1.5 — Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 1.6 — Commit**

```bash
git add src/server/youtube/select-identity-photo.ts src/server/youtube/select-identity-photo.test.ts
git commit -m "feat(youtube): add selectIdentityPhoto — GPT-4o expression selector for identity photo library"
```

---

## Task 2: Wire identity photo library into the job

**Files:**
- Modify: `src/server/jobs/run-youtube-package-job.ts`

- [ ] **Step 2.1 — Add the import and dep type**

At the top of `src/server/jobs/run-youtube-package-job.ts`, add the import alongside the existing ones:

```typescript
import { selectIdentityPhoto } from "../youtube/select-identity-photo";
```

In the `RunYoutubePackageJobDeps` type, add the new dep:

```typescript
export type RunYoutubePackageJobDeps = {
  generateYoutubePackageCopy?: typeof generateYoutubePackageCopy;
  renderV9ThumbnailImages?: typeof renderV9ThumbnailImages;
  selectBestFrame?: typeof selectBestFrame;
  preprocessFrame?: typeof preprocessFrame;
  cropFaceRegion?: typeof cropFaceRegion;
  selectIdentityPhoto?: typeof selectIdentityPhoto;
};
```

- [ ] **Step 2.2 — Add `resolveIdentityPhotos` helper**

Add this function at the bottom of the file, before the existing `clamp` helper:

```typescript
/**
 * Resolves the identity photo library for a video.
 * Checks per-project override first, then global workspace library.
 * Returns sorted absolute paths of JPEG/PNG files, or [] if none found.
 */
async function resolveIdentityPhotos(
  workspaceRoot: string,
  projectRoot: string
): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const SUPPORTED = new Set([".jpg", ".jpeg", ".png"]);
  const candidates = [
    path.join(projectRoot, "identity-photos"),
    path.join(workspaceRoot, "identity-photos"),
  ];
  for (const dir of candidates) {
    try {
      const entries = await readdir(dir);
      const photos = entries
        .filter((f) => SUPPORTED.has(path.extname(f).toLowerCase()))
        .map((f) => path.join(dir, f))
        .sort();
      if (photos.length > 0) return photos;
    } catch {
      // directory doesn't exist — try next
    }
  }
  return [];
}
```

- [ ] **Step 2.3 — Resolve photos in `runYoutubePackageJob` and pass to frame extraction**

In `runYoutubePackageJob`, the section after `writeCopyFiles` currently reads:

```typescript
const sourcePath = await pickFrameSource(input.workspace, plan.source.path);
input.jobs.update(input.jobId, {
  status: "running",
  stage: "youtube_package_frames",
  message: "Extracting thumbnail reference frames and identity clips",
  outputPath: packageDir,
  planPath: input.workspace.planPath
});
await extractReferenceFrames(plan, sourcePath, packageDir, processRunner, {
  selectBestFrame: deps.selectBestFrame,
  preprocessFrame: deps.preprocessFrame,
  cropFaceRegion: deps.cropFaceRegion,
});
```

Replace it with:

```typescript
const sourcePath = await pickFrameSource(input.workspace, plan.source.path);
const identityPhotoPaths = await resolveIdentityPhotos(
  getConfig().workspaceRoot,
  input.workspace.root
);
input.jobs.update(input.jobId, {
  status: "running",
  stage: "youtube_package_frames",
  message: "Extracting thumbnail reference frames and identity clips",
  outputPath: packageDir,
  planPath: input.workspace.planPath
});
await extractReferenceFrames(plan, sourcePath, packageDir, processRunner, {
  selectBestFrame: deps.selectBestFrame,
  preprocessFrame: deps.preprocessFrame,
  cropFaceRegion: deps.cropFaceRegion,
  selectIdentityPhoto: deps.selectIdentityPhoto,
}, identityPhotoPaths, copy.title);
```

- [ ] **Step 2.4 — Update `extractReferenceFrames` signature and body**

Update the function signature to accept the two new parameters:

```typescript
async function extractReferenceFrames(
  plan: EditPlan,
  sourcePath: string,
  packageDir: string,
  processRunner: YoutubePackageProcessRunner,
  deps: Pick<RunYoutubePackageJobDeps, "selectBestFrame" | "preprocessFrame" | "cropFaceRegion" | "selectIdentityPhoto">,
  identityPhotoPaths: string[],
  videoTitle: string
)
```

Then in the loop body, replace the `if (refIndex === 0)` branch:

```typescript
  if (refIndex === 0) {
    if (identityPhotoPaths.length > 0) {
      // Identity photo library available: select best expression, skip face crop
      const selectIdentityPhotoFn = deps.selectIdentityPhoto ?? selectIdentityPhoto;
      const selectedIdx = await selectIdentityPhotoFn(identityPhotoPaths, videoTitle);
      const identityPhoto = identityPhotoPaths[selectedIdx] ?? identityPhotoPaths[0]!;
      await preprocessFn(identityPhoto, outputPath);
    } else {
      // No library: extract face from video frame (original behavior)
      const preprocessedPath = outputPath + ".pre.jpg";
      await preprocessFn(candidate, preprocessedPath);
      await cropFaceFn(preprocessedPath, outputPath);
      await unlink(preprocessedPath).catch(() => undefined);
    }
  } else {
    // ref-02/03/04 = background references: preprocess only, keep full frame
    await preprocessFn(candidate, outputPath);
  }
```

- [ ] **Step 2.5 — Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 2.6 — Commit**

```bash
git add src/server/jobs/run-youtube-package-job.ts
git commit -m "feat(jobs): wire identity photo library into youtube package job"
```

---

## Task 3: Update integration tests

**Files:**
- Modify: `src/server/jobs/run-youtube-package-job.test.ts`

- [ ] **Step 3.1 — Add the identity-photo-library test case**

In `run-youtube-package-job.test.ts`, add this new `it` block inside the existing `describe("runYoutubePackageJob")`:

```typescript
it("uses identity photo library for ref-01 when photos are present", async () => {
  await withTempDir("ai-editor-youtube-package-identity-", async (dir) => {
    const workspace = await createProjectWorkspace(dir, "project_1");
    const sourcePath = path.join(workspace.uploads, "source.mp4");
    const roughCutPath = path.join(workspace.renders, "rough-cut.mp4");

    // Create a global identity-photos folder one level up from workspace.root
    // (workspaceRoot is the parent of workspace.root in tests; we use workspace.root directly
    //  to simulate the per-project override path)
    const identityPhotosDir = path.join(workspace.root, "identity-photos");
    await mkdir(identityPhotosDir, { recursive: true });
    await writeFile(path.join(identityPhotosDir, "expressivo.jpg"), "fake-photo");

    await mkdir(workspace.renders, { recursive: true });
    await writeFile(sourcePath, "source");
    await writeFile(roughCutPath, "rough");
    await writeCaptionedPlan(workspace.planPath, sourcePath);

    const jobs = createJobStore();
    const job = jobs.create({ projectId: workspace.projectId, sourcePath });
    const processRunner = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    const renderV9ThumbnailImages = vi.fn(async (packageDir: string) => {
      await Promise.all([1, 2, 3, 4, 5, 6].map((index) =>
        writeFile(path.join(packageDir, `thumbnail-generated-${String(index).padStart(2, "0")}.png`), "png")
      ));
    });

    const generateYoutubePackageCopy = vi.fn().mockResolvedValue({
      title: "Esse Fluxo De YouTube Economiza Horas",
      description: "Uma descricao pronta.",
      chapters: [{ time: "00:00", title: "Intro" }],
      thumbnailPrompts: [
        { conceptId: "fiz_mesmo_assim", title: "Fiz Mesmo Assim", renderText: { headline: ["FIZ"], subhead: "sub", badge: "CANAL", stamp: "18 mai", leftLabel: "ANTES", rightLabel: "DEPOIS", checklistBad: "nao gravei", checklistGood: ["gravei"], tags: ["BASTIDOR"] }, prompt: "prompt" },
        { conceptId: "conflito_resultado", title: "Conflito", renderText: { headline: ["CONFLITO"], subhead: "sub", badge: "CANAL", stamp: "18 mai", leftLabel: "ANTES", rightLabel: "DEPOIS", checklistBad: "nao gravei", checklistGood: ["gravei"], tags: ["BASTIDOR"] }, prompt: "prompt" },
        { conceptId: "manchete_editorial", title: "Manchete", renderText: { headline: ["MANCHETE"], subhead: "sub", badge: "CANAL", stamp: "18 mai", leftLabel: "ANTES", rightLabel: "DEPOIS", checklistBad: "nao gravei", checklistGood: ["gravei"], tags: ["BASTIDOR"] }, prompt: "prompt" },
        { conceptId: "sistema_status", title: "Sistema", renderText: { headline: ["SISTEMA"], subhead: "sub", badge: "CANAL", stamp: "18 mai", leftLabel: "ANTES", rightLabel: "DEPOIS", checklistBad: "nao gravei", checklistGood: ["gravei"], tags: ["BASTIDOR"] }, prompt: "prompt" },
        { conceptId: "rede_social_negocio", title: "Rede", renderText: { headline: ["REDE"], subhead: "sub", badge: "CANAL", stamp: "18 mai", leftLabel: "ANTES", rightLabel: "DEPOIS", checklistBad: "nao gravei", checklistGood: ["gravei"], tags: ["BASTIDOR"] }, prompt: "prompt" },
      ]
    });

    const selectBestFrame = vi.fn().mockResolvedValue(0);
    const preprocessFrame = vi.fn(async (_input: string, output: string) => {
      await writeFile(output, "jpeg");
    });
    // selectIdentityPhoto returns index 0 → picks expressivo.jpg
    const selectIdentityPhoto = vi.fn().mockResolvedValue(0);
    // cropFaceRegion should NOT be called when identity photos are present
    const cropFaceRegion = vi.fn();

    await runYoutubePackageJob(
      { jobId: job.id, workspace, jobs },
      processRunner,
      { generateYoutubePackageCopy, renderV9ThumbnailImages, selectBestFrame, preprocessFrame, selectIdentityPhoto, cropFaceRegion }
    );

    // selectIdentityPhoto was called with the photo path and the video title
    expect(selectIdentityPhoto).toHaveBeenCalledWith(
      [path.join(identityPhotosDir, "expressivo.jpg")],
      "Esse Fluxo De YouTube Economiza Horas"
    );
    // cropFaceRegion was NOT called — identity photo bypasses face crop
    expect(cropFaceRegion).not.toHaveBeenCalled();
    // Job completed successfully
    expect(jobs.get(job.id)).toMatchObject({ status: "passed", stage: "complete" });
  });
});
```

Also add `mkdir` to the imports at the top of the test file (it's already imported — check it's there):

The existing import line is:
```typescript
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
```

`mkdir` is already imported — no change needed.

- [ ] **Step 3.2 — Run all job tests to verify they pass**

```bash
npx vitest run src/server/jobs/run-youtube-package-job.test.ts
```

Expected: all tests PASS (existing 4 + new 1 = 5 total)

- [ ] **Step 3.3 — Run full test suite**

```bash
npx vitest run
```

Expected: all tests PASS, no regressions

- [ ] **Step 3.4 — Commit**

```bash
git add src/server/jobs/run-youtube-package-job.test.ts
git commit -m "test(jobs): add identity photo library integration test"
```

---

## Task 4: Add identity-photos to .gitignore

The identity photo folder contains the creator's personal photos — it should not be committed to git.

- [ ] **Step 4.1 — Add to .gitignore**

Open `.gitignore` and add:

```
# Creator identity photo library
identity-photos/
```

- [ ] **Step 4.2 — Commit**

```bash
git add .gitignore
git commit -m "chore: ignore identity-photos directories"
```

---

## Self-Review

**Spec coverage check:**
- ✅ §1 Photo library storage: `resolveIdentityPhotos` checks per-project then global, falls back to `[]`
- ✅ §2 Expression selector: `selectIdentityPhoto.ts` with injectable deps, GPT-4o Vision, fallback to 0
- ✅ §3 Pipeline integration: `extractReferenceFrames` branches on `identityPhotoPaths.length`
- ✅ §4 What does not change: ref-02/03/04, Remotion, v9-thumbnail-renderer, crop-face-region all untouched
- ✅ §5 Phase 2: explicitly out of scope, not planned
- ✅ Testing: unit tests for selector + integration test in job tests

**Type consistency check:**
- `selectIdentityPhoto(photoPaths, videoTitle, apiKey?, deps?)` — consistent across Task 1 (implementation), Task 2 (dep type), Task 3 (mock call)
- `resolveIdentityPhotos(workspaceRoot, projectRoot)` — defined in Task 2.2, called in Task 2.3
- `deps.selectIdentityPhoto` — added to `RunYoutubePackageJobDeps` in Task 2.1, used in Task 2.4

**Placeholder scan:** No TBDs, all code blocks complete.
