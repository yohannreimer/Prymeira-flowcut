# Identity Photo Library — Design Spec
**Date:** 2026-05-18  
**Status:** Approved

## Problem

The current thumbnail pipeline extracts the creator's face from the video being processed. For screen recordings with a PiP webcam, this produces a low-quality face crop — small, compressed, limited resolution. Even for face-to-camera videos, the selected frame may not have the ideal expression.

The creator has a set of high-quality professional photos (DSLR-level, studio lighting, varied expressions) that are far superior to anything extracted from video. The pipeline should use these instead.

## Goal

Replace the video-extracted face reference (ref-01) with a contextually selected photo from a pre-built identity photo library. The library is global (used across all videos) with an optional per-project override. Quality impact: DSLR photo vs. PiP webcam crop.

## Design

### 1. Photo Library Storage

Two locations, resolved in priority order:

1. **Per-project override** (optional): `{workspace.root}/identity-photos/`  
   Use when a specific video needs specific photos.
2. **Global library** (default): `{project-root}/identity-photos/`  
   The creator's permanent photo set, used for all videos unless overridden.

If neither folder exists or is empty, the pipeline falls back to the current video frame extraction behavior — no breaking changes.

Supported formats: JPEG, PNG. File names are passed to GPT-4o as context, so descriptive names help: `expressao-surpresa.jpg`, `pensativo.jpg`, `apontando.jpg`, etc.

### 2. Expression Selector — `select-identity-photo.ts`

New file, modeled after the existing `select-best-frame.ts`.

**Inputs:**
- `photoPaths: string[]` — array of absolute paths to identity photos
- `videoTitle: string` — the AI-generated title for the video
- `apiKey?: string` — optional OpenAI key (falls back to env)
- `deps` — injectable `chatCompletionsCreate` and `readImageFile` for testing

**Logic:**
1. Read all photos as base64
2. Send to GPT-4o with prompt: `"Este vídeo se chama '[title]'. Qual dessas [N] fotos tem a expressão mais adequada para a thumbnail desse tema? Retorna JSON: {\"index\": N}"`
3. Parse response, validate index is in range
4. Return selected index

**Fallback:** Returns `0` silently on any error (no API key, parse failure, network error).

### 3. Pipeline Integration — `run-youtube-package-job.ts`

Changes to `extractReferenceFrames`:

1. After copy is generated (title is available), resolve the identity photo library path:
   - Check `workspace.root/identity-photos/` first
   - Then check `project-root/identity-photos/`
2. If photos found:
   - Call `selectIdentityPhoto(photoPaths, copy.title)` to pick the best expression
   - Copy/read selected photo → run through `preprocessFrame` → save as ref-01
   - Skip face crop entirely (no PiP detection needed)
3. If no photos found:
   - Continue with current behavior (extract frames → crop face → ref-01)

ref-02, ref-03, ref-04 (background frames) are unaffected — still extracted from the video.

**New dep added to `RunYoutubePackageJobDeps`:**
```ts
selectIdentityPhoto?: typeof selectIdentityPhoto;
```

### 4. What Does Not Change

- Remotion layouts and compositions — untouched
- ref-02/03/04 background frame extraction — untouched
- `v9-thumbnail-renderer.ts` — untouched
- `crop-face-region.ts` — still used as fallback when no library exists
- All existing tests remain valid

### 5. Phase 2 (Out of Scope for This Spec)

- Upload endpoint + UI gallery for managing the identity photo library
- Auto-tagging photos by detected expression/mood on upload

## Testing

- Unit test for `select-identity-photo.ts` with injectable `readImageFile` and `chatCompletionsCreate` deps (same pattern as `select-best-frame.test.ts`)
- Integration test in `run-youtube-package-job.test.ts`: add a mock `selectIdentityPhoto` dep, assert ref-01 comes from the library when photos are present, assert fallback when library is absent

## File Summary

| File | Change |
|------|--------|
| `src/server/youtube/select-identity-photo.ts` | New — GPT-4o expression selector |
| `src/server/youtube/select-identity-photo.test.ts` | New — unit tests |
| `src/server/jobs/run-youtube-package-job.ts` | Updated — photo library detection + selector integration |
| `src/server/jobs/run-youtube-package-job.test.ts` | Updated — test with and without photo library |
