# Flowcut Localhost Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit local-only mode so localhost upload, processing, editing, preview, and export work without Clerk, Prymeira Account, or R2.

**Architecture:** Add `FLOWCUT_LOCAL_MODE` to server config and use it in `createApp()` to disable tenant auth and R2 direct upload defaults. Add `VITE_FLOWCUT_LOCAL_MODE` to browser runtime config so the auth gate bypass is explicit. Add `npm run dev:local` and update docs/env examples for repeatable localhost startup.

**Tech Stack:** TypeScript, React, Vite, Express, Vitest, Supertest, npm scripts.

---

## File Structure

- Modify `src/server/config.ts`: add `localMode` to `AppConfig` and parse `FLOWCUT_LOCAL_MODE`.
- Modify `src/server/config.test.ts`: test local mode parsing and default false behavior.
- Modify `src/server/app.ts`: skip Prymeira tenant access and R2 direct upload defaults when local mode is enabled.
- Modify `src/server/app.test.ts`: verify local mode ignores auth env and disables direct upload.
- Modify `src/client/runtime-config.ts`: recognize `VITE_FLOWCUT_LOCAL_MODE=true` as an auth bypass signal.
- Modify `src/client/runtime-config.test.ts`: test explicit local mode auth bypass.
- Modify `package.json`: add `dev:local`.
- Modify `.env.example`: document local mode env.
- Modify `docs/prymeira-media-local-dev.md`: add a top local-only path and keep Prymeira stack docs as optional.

## Task 1: Server Config Local Mode

**Files:**
- Modify: `src/server/config.ts`
- Test: `src/server/config.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these tests to `src/server/config.test.ts`:

```ts
it("defaults local mode to false", () => {
  delete process.env.FLOWCUT_LOCAL_MODE;

  expect(getConfig().localMode).toBe(false);
});

it("enables local mode from FLOWCUT_LOCAL_MODE", () => {
  process.env.FLOWCUT_LOCAL_MODE = "true";

  expect(getConfig().localMode).toBe(true);
});
```

Update the `afterEach` setup in the same file to preserve and restore `FLOWCUT_LOCAL_MODE`.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run src/server/config.test.ts
```

Expected: FAIL because `localMode` does not exist on `AppConfig`.

- [ ] **Step 3: Implement minimal config support**

In `src/server/config.ts`, add `localMode: boolean` to `AppConfig`, add:

```ts
function parseBooleanFlag(rawValue = process.env.FLOWCUT_LOCAL_MODE) {
  return rawValue?.trim().toLowerCase() === "true";
}
```

Then return:

```ts
localMode: parseBooleanFlag(),
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx vitest run src/server/config.test.ts
```

Expected: PASS.

## Task 2: Backend Local Mode Behavior

**Files:**
- Modify: `src/server/app.ts`
- Test: `src/server/app.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests to `src/server/app.test.ts`:

```ts
it("does not require Prymeira Account in production when local mode is enabled", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PRYMEIRA_ACCOUNT_API_URL", "");
  vi.stubEnv("FLOWCUT_LOCAL_MODE", "true");

  expect(() => createApp({ runJobs: false })).not.toThrow();
});

it("ignores Prymeira tenant auth from env when local mode is enabled", async () => {
  vi.stubEnv("FLOWCUT_LOCAL_MODE", "true");
  vi.stubEnv("PRYMEIRA_ACCOUNT_API_URL", "https://account-api.test");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  await request(createApp({ workspaceRoot: "unused", runJobs: false }))
    .get("/api/config")
    .expect(200)
    .expect({ uploadFileSizeLimitBytes: 5368709120, directUploadEnabled: false });

  expect(fetchMock).not.toHaveBeenCalled();
});

it("disables default R2 direct upload storage in local mode", async () => {
  vi.stubEnv("FLOWCUT_LOCAL_MODE", "true");
  vi.stubEnv("R2_ACCESS_KEY_ID", "access-key");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret-key");
  vi.stubEnv("R2_ENDPOINT", "https://account.r2.cloudflarestorage.com");
  vi.stubEnv("R2_BUCKET", "mediafactory-temp");
  vi.stubEnv("R2_PUBLIC_BASE_URL", "https://pub-example.r2.dev");

  await request(createApp({ workspaceRoot: "unused", runJobs: false }))
    .get("/api/config")
    .expect(200)
    .expect({ uploadFileSizeLimitBytes: 5368709120, directUploadEnabled: false });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run src/server/app.test.ts
```

Expected: FAIL because local mode does not yet change `createApp()` defaults.

- [ ] **Step 3: Implement backend behavior**

In `src/server/app.ts`, derive local defaults:

```ts
const localMode = config.localMode;
```

Change the production Prymeira guard so it only throws when `!localMode`.

Change `directUploadStorage` default to:

```ts
const directUploadStorage = options.directUploadStorage ?? (localMode ? null : createR2ProjectDirectUploadStorage()) ?? undefined;
```

Change `requireTenantAccess` default to:

```ts
const requireTenantAccess = options.requireTenantAccess ?? (!localMode && config.prymeiraAccountApiUrl
  ? createPrymeiraTenantAccess({
    accountApiUrl: config.prymeiraAccountApiUrl,
    productKey: config.prymeiraProductKey
  })
  : undefined);
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx vitest run src/server/app.test.ts
```

Expected: PASS.

## Task 3: Frontend Runtime Local Mode

**Files:**
- Modify: `src/client/runtime-config.ts`
- Test: `src/client/runtime-config.test.ts`

- [ ] **Step 1: Write failing test**

Add this assertion to the auth bypass test in `src/client/runtime-config.test.ts`:

```ts
expect(isLocalAuthBypassEnabled({
  viteEnv: { VITE_FLOWCUT_LOCAL_MODE: "true" },
  hostname: "flowcut.prymeiradigital.com.br"
})).toBe(true);
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run src/client/runtime-config.test.ts
```

Expected: FAIL because the runtime config ignores `VITE_FLOWCUT_LOCAL_MODE`.

- [ ] **Step 3: Implement frontend runtime flag**

In `src/client/runtime-config.ts`, update `isLocalAuthBypassEnabled()`:

```ts
const explicitLocalMode = input.viteEnv?.VITE_FLOWCUT_LOCAL_MODE === "true";
if (explicitLocalMode) return true;
```

Keep the existing Vite dev localhost bypass after that.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx vitest run src/client/runtime-config.test.ts
```

Expected: PASS.

## Task 4: Local Startup Script and Docs

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `docs/prymeira-media-local-dev.md`

- [ ] **Step 1: Add script**

Add to `package.json` scripts:

```json
"dev:local": "FLOWCUT_LOCAL_MODE=true VITE_FLOWCUT_LOCAL_MODE=true PRYMEIRA_ACCOUNT_API_URL= PORT=4327 AI_EDITOR_API_PROXY=http://localhost:4327 concurrently -k \"vite --host 127.0.0.1 --port 5182 --strictPort\" \"tsx watch src/server/index.ts\""
```

- [ ] **Step 2: Add env documentation**

Add near the top of `.env.example`:

```env
FLOWCUT_LOCAL_MODE=true
VITE_FLOWCUT_LOCAL_MODE=true
```

- [ ] **Step 3: Update local docs**

Add a new first section to `docs/prymeira-media-local-dev.md`:

```md
## Local-only Flowcut

Use this when you want localhost without Clerk, Prymeira Account, or R2:

```bash
npm install
npm run dev:local
```

Open `http://127.0.0.1:5182`. The API runs on `http://localhost:4327`, uploaded videos stay under `workspace/`, and `/api/config` reports `directUploadEnabled: false` so the browser uses local multipart upload.
```

Keep the existing Prymeira Account and Hub instructions below this as the SaaS/auth path.

- [ ] **Step 4: Validate package JSON**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"
```

Expected: `package.json ok`.

## Task 5: Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npx vitest run src/server/config.test.ts src/server/app.test.ts src/client/runtime-config.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Smoke local API config**

Run `npm run dev:local`, wait for the server to print the API URL, then request:

```bash
curl http://localhost:4327/api/config
```

Expected response includes:

```json
{"uploadFileSizeLimitBytes":5368709120,"directUploadEnabled":false}
```

Stop the dev server after the check.

## Self-Review

- Spec coverage: Tasks cover explicit local mode, backend auth bypass, direct upload disablement, frontend Clerk bypass, local script, env example, docs, and verification.
- Placeholder scan: No TBD, TODO, or ambiguous implementation steps remain.
- Type consistency: `localMode`, `FLOWCUT_LOCAL_MODE`, and `VITE_FLOWCUT_LOCAL_MODE` are used consistently across tasks.
