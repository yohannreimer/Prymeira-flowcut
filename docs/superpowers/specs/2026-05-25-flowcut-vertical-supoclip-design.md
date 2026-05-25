# Flowcut Vertical SupoClip Pipeline Design

## Context

Flowcut currently handles the guided SaaS workflow around a horizontal editing pipeline: upload, rough cut, captions, YouTube package, export, package download, and YouTube publishing. The repository already contains older MediaFactory vertical-pipeline pieces, including:

- `src/server/media-factory/supoclip-client.ts` for SupoClip health, upload, task creation, polling, clip listing, and clip download.
- `src/server/media-factory/supoclip-auth.ts` for signed backend requests.
- `src/server/media-factory/vertical-pipeline.ts` for ranking SupoClip clips and writing Shorts/Reels/TikTok payload packages.
- publisher support for YouTube Shorts in `src/server/media-factory/publisher.ts`.

The new Flowcut behavior should integrate SupoClip into the current app as a backend-only vertical processing path. There should be no separate visual SupoClip app in the Flowcut UX.

## Goals

When a user uploads a vertical video, Flowcut should automatically route the project through SupoClip, save generated short clips into the project workspace, and present those clips for review before publishing.

The first version must preserve the horizontal workflow unchanged. Publishing vertical clips automatically is intentionally out of scope for the first version; review and selection come first.

## Non-Goals

- Do not create a separate SupoClip frontend.
- Do not auto-publish vertical clips in the initial implementation.
- Do not change the horizontal YouTube export/publish path except where shared abstractions are necessary.
- Do not require users to manually choose horizontal vs. vertical at upload time.

## Orientation Routing

After the uploaded source is available locally, `runProjectJob` continues to call `probeMedia` first.

Routing rule:

- `metadata.height > metadata.width`: vertical SupoClip pipeline.
- Otherwise: existing horizontal rough-cut pipeline.

The job should expose clear stage names for the vertical path:

- `probe`
- `supoclip_upload`
- `supoclip_processing`
- `supoclip_download`
- `vertical_review_ready`

Horizontal jobs keep their current stages and behavior.

## Backend Architecture

Add a Flowcut-specific vertical job runner module that reuses the existing SupoClip client but writes artifacts into the current project workspace shape instead of the older MediaFactory `ready-to-approve` package directory.

Proposed module:

```txt
src/server/jobs/run-vertical-project-job.ts
```

Responsibilities:

- Validate SupoClip config from environment.
- Call SupoClip health/upload/task/poll/list/download via `supoclip-client`.
- Rank/filter clips using the same semantics as the old vertical pipeline where possible.
- Write normalized clip artifacts to the project workspace.
- Write a lightweight `edit-plan.json` compatible enough for existing project listing/orientation logic.
- Update job status and warnings consistently.

Workspace layout:

```txt
project_<id>/
  uploads/source.mp4
  edit-plan.json
  vertical-package.json
  shorts/
    rank-01/
      clip.mp4
      metadata.json
      youtube-shorts-payload.json
    rank-02/
      clip.mp4
      metadata.json
      youtube-shorts-payload.json
```

`vertical-package.json` is the Flowcut summary source for review screens. It should include:

- `projectId`
- `taskId`
- `status`
- `source` metadata
- array of clips with `id`, `rank`, `title`, `startSec`, `endSec`, `durationSec`, `score`, `clipUrl`, and payload paths
- warnings
- timestamps

The `edit-plan.json` should keep `source.width`, `source.height`, duration, and orientation-compatible data so project library and sidebar logic can classify the project as vertical without needing a separate project model.

## Configuration

Add Flowcut runtime config for SupoClip through environment variables. Initial names should mirror the existing client concepts:

```txt
SUPOCLIP_ENABLED=true
SUPOCLIP_BACKEND_URL=http://localhost:8000
SUPOCLIP_USER_ID=media-factory
SUPOCLIP_AUTH_SECRET=<optional shared secret>
SUPOCLIP_CAPTION_TEMPLATE=default
SUPOCLIP_PROCESSING_MODE=fast
SUPOCLIP_OUTPUT_FORMAT=vertical
SUPOCLIP_ADD_SUBTITLES=true
SUPOCLIP_CUT_LONG_PAUSES=true
SUPOCLIP_MAX_CLIPS=5
SUPOCLIP_MIN_CLIP_DURATION_SEC=12
```

If a vertical upload arrives while SupoClip is disabled or misconfigured, the job should fail with a user-facing message explaining that vertical processing is not configured.

## API Surface

Add project routes for reading and downloading vertical artifacts:

```txt
GET /api/projects/:projectId/vertical-package/summary
GET /api/projects/:projectId/vertical-package/clips/:rank/clip.mp4
GET /api/projects/:projectId/vertical-package/clips/:rank/download
PATCH /api/projects/:projectId/vertical-package/selection
```

The summary endpoint returns the normalized `vertical-package.json`. Clip serving must validate rank/filename and prevent path traversal.

The selection endpoint persists approved clip ids in `vertical-selection.json` so review choices survive refreshes and OAuth round trips.

The existing `/api/projects/:projectId/plan` can continue serving `edit-plan.json` for common source metadata and orientation.

## Frontend UX

The guided shell should branch by project orientation once `editPlan.source` is available.

Horizontal behavior stays as-is.

Vertical behavior:

1. Upload.
2. Processing state says SupoClip is generating vertical cuts.
3. Review screen shows short clip cards.
4. Publish screen is present but does not auto-publish in the initial version.

The review screen should show:

- video preview for each clip
- rank
- title
- duration
- score when available
- warning state when metadata is incomplete
- download button for individual clips
- selected/approved state persisted to `vertical-selection.json`

Publishing is not wired in the first implementation, but persisting selection now keeps the review workflow stable across refreshes and prepares the next publishing step.

## Error Handling

Expected failures:

- SupoClip disabled or missing backend URL.
- SupoClip health check fails.
- Upload/task/poll/download endpoint returns non-2xx.
- Task finishes with `failed` or `error`.
- SupoClip returns no clips.
- All clips are filtered out as invalid/too short.

Each failure should set the project job to `failed`, preserve any partial diagnostic metadata that is useful, and show a clear message in the guided flow.

Warnings:

- Clip below minimum duration discarded.
- Clip timestamps invalid.
- Score missing; original order used.

## Retention And Storage

The direct-upload R2 object is already deleted after the backend downloads it into the workspace. Vertical clips will live in the local project workspace and follow the existing project retention cleanup controlled by `AI_EDITOR_PROJECT_RETENTION_MINUTES`.

No additional R2 storage is required for the first version unless clip serving later needs public URLs.

## Testing Plan

Backend tests:

- Horizontal upload still calls the current rough-cut pipeline.
- Vertical upload calls the vertical SupoClip runner.
- Vertical runner writes `vertical-package.json` and ranked clip files.
- Summary endpoint returns clip metadata.
- Clip routes serve only valid clip files and reject traversal.
- Selection endpoint persists approved clips and rejects unknown clip ids.
- SupoClip disabled/misconfigured produces a clear failed job.

Frontend tests:

- Guided shell shows horizontal steps for horizontal projects.
- Guided shell shows vertical processing/review copy for vertical projects.
- Vertical review renders clip cards from summary data.
- Download button uses the clip download endpoint.

Regression tests:

- Existing YouTube OAuth and final package download behavior remain unchanged.
- Existing project retention tests still pass for tenant project roots.

## Implementation Order

1. Add SupoClip Flowcut config parser and tests.
2. Add vertical package writer/reader helpers and tests.
3. Add `runVerticalProjectJob` with SupoClip client dependency injection.
4. Route `runProjectJob` by orientation after probe.
5. Add vertical package API endpoints.
6. Add client API helpers and vertical review component.
7. Branch the guided shell for vertical projects.
8. Run focused tests, full TypeScript check, and manual localhost verification with a vertical sample.
