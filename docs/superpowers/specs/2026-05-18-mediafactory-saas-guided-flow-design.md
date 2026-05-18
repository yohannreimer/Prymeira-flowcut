# MediaFactory SaaS Guided Flow Design

Date: 2026-05-18

## Goal

Turn the existing MediaFactory web app into a SaaS product that feels like the original local folder workflow:

1. Upload a source video.
2. Generate the first horizontal cut.
3. Transcribe it with AI.
4. Generate title, description, captions, and thumbnail ideas.
5. Let the user review the result.
6. Publish to YouTube later through the user's connected account, with optional auto-publish.

The existing personal folder at `/Users/yohannreimer/Downloads/Locais/MediaFactory` must stay untouched. All work happens in `/Users/yohannreimer/Downloads/Locais/MediaFactory-SaaS`.

## Current State

The SaaS copy already has several building blocks:

- project upload and rough-cut rendering;
- Whisper caption/transcription jobs;
- YouTube package generation with title, description, transcript, thumbnail prompt, and reference assets;
- publish readiness checks;
- a multi-tenant/auth foundation mounted under `/api/mediafactory`;
- the older local MediaFactory engine, which already knows how to build ready-to-approve packages and perform live YouTube publish checks.

The gap is product flow. The current UI still feels like an editor with many controls instead of a single guided SaaS workflow.

## Recommended Approach

Build the first SaaS version as a guided review workflow, not as immediate fully automatic publishing.

The main screen becomes a pipeline:

- `Upload`
- `Corte`
- `IA`
- `Thumbnail`
- `Revisao`
- `Publicacao`

The default behavior is review-first. Auto-publish can exist as a visible option later, but the first production-safe path should require user confirmation before publishing.

## Product Behavior

After the user uploads a video:

1. The app creates a project and starts the rough-cut job.
2. When the cut finishes, the app can offer one primary action: continue with AI.
3. The AI step runs captions/transcription and then generates the YouTube package.
4. The review screen shows:
   - final video preview;
   - generated title;
   - generated description;
   - transcript/captions status;
   - thumbnail prompt and available thumbnail/reference assets;
   - publish readiness.
5. The publish area shows YouTube as the first destination.

The UI should keep advanced editing controls available behind an advanced/details affordance, but the main experience should stay focused on getting from video upload to publish-ready package.

## Backend Changes

Add a small project package summary API for the SaaS UI:

- read the generated YouTube package files for a project;
- return title, description, transcript availability, thumbnail prompt, and available image/reference assets;
- expose enough state for the frontend to know whether the package is ready, incomplete, or failed.

Keep the current job endpoints intact. The first implementation can orchestrate existing jobs from the frontend instead of replacing the processing engine.

Live YouTube publishing is a second step. The existing publisher code should be reused, but only after the guided review flow and package summary are working.

## Frontend Changes

Add a guided SaaS surface on top of the current app:

- pipeline status bar;
- upload-first empty state;
- current job progress;
- generated package review panel;
- thumbnail idea/asset selection area;
- publish readiness and a disabled YouTube publish action until OAuth/live publish is wired.

The design should feel like an operational tool for creators: focused, direct, and confidence-building. Avoid marketing-page layout. The first viewport should be the product workflow.

## Error Handling

Each pipeline step should surface a specific recovery path:

- upload failure: allow selecting the file again;
- cut failure: show job error and retry action;
- AI failure: allow rerunning captions or package generation;
- package missing files: show which artifact is missing;
- publish not connected: show connect/review state instead of pretending the action is available.

## Testing

Cover the package summary API with server tests.

Cover the frontend package summary parsing or workflow model with focused unit tests if the orchestration logic is extracted from `App.tsx`.

Before considering the implementation complete:

- run the relevant targeted tests;
- run the full test suite if changes touch shared server routes or client API types;
- build the app;
- open the local browser preview and verify the guided flow renders without breaking the existing app.

## Non-Goals For This Step

- Do not modify `/Users/yohannreimer/Downloads/Locais/MediaFactory`.
- Do not require live YouTube publishing to be fully connected in this first UI pass.
- Do not rebuild the whole editor.
- Do not introduce billing, pricing, or hub routing. The hub only needs to point to this app later.
