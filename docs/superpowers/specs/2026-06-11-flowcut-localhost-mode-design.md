# Flowcut Localhost Mode Design

## Goal

Make Flowcut reliable as a local-only tool: the user can start localhost, upload a video, process it, edit it, and export local files without Clerk, Prymeira Account, R2, or a deployed storage bucket.

The local workflow is the default for day-to-day localhost usage. External publishing features can remain available, but they must not be required for upload, processing, editing, previewing, or export.

## Current Context

The app already has a local multipart upload path through `POST /api/projects`. It also has an optional direct upload path through `POST /api/projects/uploads`, backed by R2 when storage env vars are present.

Auth is optional on the backend when `PRYMEIRA_ACCOUNT_API_URL` is absent, but local `.env` files can accidentally enable Prymeira tenant checks. The frontend already has a localhost auth bypass in Vite development, but the backend can still enforce Prymeira auth if the account URL is configured.

This means the current behavior is close to local-friendly, but not consistent enough: old env values can make localhost ask for auth or try R2.

## Recommended Approach

Add an explicit local mode controlled by `FLOWCUT_LOCAL_MODE=true`, plus a first-class `npm run dev:local` script.

When local mode is enabled:

- the backend does not create Prymeira tenant access, even if `PRYMEIRA_ACCOUNT_API_URL` is set;
- project routes use the plain local workspace root;
- direct upload storage is disabled, even if R2 env vars are present;
- `/api/config` reports `directUploadEnabled: false`;
- the browser uses the existing local auth bypass and mounts the editor without Clerk;
- upload uses the existing multipart local path and stores source files under the configured workspace;
- render, captions, motion, project library, preview media, and export keep using local files.

## Alternatives Considered

1. Rely on missing env vars.
   This is minimal, but fragile. A leftover `PRYMEIRA_ACCOUNT_API_URL` or R2 value changes localhost behavior.

2. Remove Clerk and R2 paths globally.
   This would make local simple, but it would break the SaaS/deploy path and unrelated publishing work.

3. Add explicit local mode.
   This keeps production behavior intact while giving localhost a predictable switch. This is the chosen approach.

## Configuration

Add these local-oriented settings:

```env
FLOWCUT_LOCAL_MODE=true
AI_EDITOR_WORKSPACE=workspace
```

Add a package script:

```json
"dev:local": "FLOWCUT_LOCAL_MODE=true VITE_FLOWCUT_LOCAL_MODE=true PRYMEIRA_ACCOUNT_API_URL= PORT=4327 AI_EDITOR_API_PROXY=http://localhost:4327 concurrently -k \"vite --host 127.0.0.1 --port 5182 --strictPort\" \"tsx watch src/server/index.ts\""
```

The exact script may preserve the repo's existing command style, but it must guarantee:

- API on port `4327`;
- Vite on port `5182`;
- local mode env set for both client and server;
- no required Clerk, Prymeira Account, or R2 env.

## Backend Design

Extend `getConfig()` with a boolean `localMode`.

`createApp()` should use this value to decide defaults:

- if `localMode` is true, do not throw production Prymeira configuration errors;
- if `localMode` is true, do not build `requireTenantAccess` from `PRYMEIRA_ACCOUNT_API_URL`;
- if `localMode` is true, do not create R2 direct upload storage;
- keep explicit `CreateAppOptions` overrides working for tests.

The local workspace remains `config.workspaceRoot`, which defaults to `workspace` relative to the repo unless overridden.

## Frontend Design

Keep `PrymeiraAuthGate` as the central gate, but let runtime config recognize `VITE_FLOWCUT_LOCAL_MODE=true` as an explicit bypass signal in addition to the existing Vite localhost development bypass.

The client upload behavior does not need a new flow. It already checks `/api/config`; when `directUploadEnabled` is false it sends multipart form data to `/api/projects`.

## Error Handling

Local mode should make the basic app path fail only for local processing reasons: missing API server, file too large, invalid video, missing ffmpeg/ffprobe, missing model/key for optional AI features, or rendering errors.

It should not fail with:

- missing Clerk publishable key;
- missing auth token;
- product access denied;
- missing R2 configuration;
- R2 upload errors during initial video upload.

External publishing actions may still fail with clear credential-specific errors when their credentials are absent.

## Testing

Add focused tests for:

- `getConfig()` parses `FLOWCUT_LOCAL_MODE=true`;
- local mode ignores `PRYMEIRA_ACCOUNT_API_URL` for app auth defaults;
- local mode reports `directUploadEnabled: false` even when R2 env vars are present;
- runtime config enables browser auth bypass with `VITE_FLOWCUT_LOCAL_MODE=true`;
- the existing multipart upload path remains available without auth.

Existing tenant, Clerk, and R2 tests should remain valid outside local mode.

## Non-Goals

- Remove Clerk from production builds.
- Remove R2-backed direct upload support.
- Make Instagram publishing work without public media URLs.
- Replace local ffmpeg, OpenAI, or Whisper requirements for processing features that already depend on them.
