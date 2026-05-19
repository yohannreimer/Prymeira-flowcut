# Prymeira Media Multitenancy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current MediaFactory/Flowcut app a Prymeira `media` product with Clerk login, Prymeira Account authorization, and tenant-isolated project/job/media access.

**Architecture:** Add a small Prymeira integration layer that turns a Clerk bearer token into a tenant context via `@prymeira/auth`. Keep existing UI/API routes, but resolve project storage under `<AI_EDITOR_WORKSPACE>/workspaces/<workspace_id>/projects` whenever Prymeira auth is enabled. Carry `workspaceId` into the in-memory job store so job reads and media URLs are scoped to the authorized tenant.

**Tech Stack:** React 19, Vite, Express, Vitest, Supertest, Clerk React, local `@prymeira/auth`, Node filesystem APIs.

---

## File Structure

- Modify `package.json` and `package-lock.json`: add `@clerk/clerk-react` and local `@prymeira/auth`.
- Create `src/server/prymeira/tenant.ts`: parse bearer tokens, call `@prymeira/auth`, map auth failures, build tenant-scoped project roots.
- Create `src/server/prymeira/tenant.test.ts`: unit-test token parsing, root paths, and error mapping.
- Modify `src/server/config.ts` and `src/server/config.test.ts`: expose `prymeiraAccountApiUrl` and `prymeiraProductKey`, defaulting product key to `media`.
- Modify `src/server/jobs/job-store.ts` and `src/server/jobs/job-store.test.ts`: store optional `workspaceId` on jobs and support tenant-safe lookups.
- Modify `src/server/routes/projects.ts` and `src/server/routes/projects.test.ts`: require tenant context when configured and resolve all project files through the tenant project root.
- Modify `src/server/app.ts` and `src/server/app.test.ts`: wire Prymeira auth into project routes and media serving, while keeping old unauthenticated behavior available for tests and local non-SaaS use.
- Modify `src/server/media-factory-saas/access.ts` and tests: use the shared Prymeira tenant/auth layer and product key `media`.
- Modify `src/client/api.ts` and `src/client/api.test.ts`: add a token provider and attach `Authorization` to every API call.
- Modify `src/client/main.tsx` and create `src/client/PrymeiraAuthGate.tsx`: wrap the app in Clerk and configure the API token provider.
- Create or update `src/client/PrymeiraAuthGate.test.tsx`: verify signed-out and signed-in behavior.
- Update docs/env notes in `.env.example` if present, otherwise add `docs/prymeira-media-local-dev.md`.

---

### Task 1: Dependencies And Runtime Config

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/server/config.ts`
- Modify: `src/server/config.test.ts`

- [ ] **Step 1: Install Prymeira and Clerk dependencies**

Run:

```bash
npm install @clerk/clerk-react@^5.49.0 "@prymeira/auth@file:../Prymeira Account/packages/auth"
```

Expected: `package.json` includes `@clerk/clerk-react` and `@prymeira/auth`; `package-lock.json` is updated.

- [ ] **Step 2: Write failing config tests**

Append to `src/server/config.test.ts`:

```ts
it("defaults Prymeira product key to media", () => {
  delete process.env.PRYMEIRA_PRODUCT_KEY;

  expect(getConfig().prymeiraProductKey).toBe("media");
});

it("reads Prymeira Account configuration from env", () => {
  process.env.PRYMEIRA_ACCOUNT_API_URL = "https://account-api.test/";
  process.env.PRYMEIRA_PRODUCT_KEY = "media";

  expect(getConfig()).toMatchObject({
    prymeiraAccountApiUrl: "https://account-api.test",
    prymeiraProductKey: "media"
  });
});
```

- [ ] **Step 3: Run config tests and verify failure**

Run:

```bash
npx vitest run src/server/config.test.ts
```

Expected: FAIL because `prymeiraAccountApiUrl` and `prymeiraProductKey` are not part of `AppConfig`.

- [ ] **Step 4: Implement config fields**

In `src/server/config.ts`, update the type and `getConfig()`:

```ts
export type AppConfig = {
  workspaceRoot: string;
  ffmpegPath: string;
  ffprobePath: string;
  autoEditorPath: string;
  uploadFileSizeLimitBytes: number;
  prymeiraAccountApiUrl: string | null;
  prymeiraProductKey: string;
};

function normalizeOptionalUrl(rawUrl = process.env.PRYMEIRA_ACCOUNT_API_URL) {
  const trimmed = rawUrl?.trim();
  return trimmed ? trimmed.replace(/\/$/, "") : null;
}

export function getConfig(): AppConfig {
  return {
    workspaceRoot: path.resolve(process.env.AI_EDITOR_WORKSPACE ?? path.resolve(process.cwd(), "workspace")),
    ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
    ffprobePath: process.env.FFPROBE_PATH ?? "ffprobe",
    autoEditorPath: process.env.AUTO_EDITOR_PATH ?? "auto-editor",
    uploadFileSizeLimitBytes: parseUploadFileSizeLimit(),
    prymeiraAccountApiUrl: normalizeOptionalUrl(),
    prymeiraProductKey: process.env.PRYMEIRA_PRODUCT_KEY?.trim() || "media"
  };
}
```

- [ ] **Step 5: Run config tests and commit**

Run:

```bash
npx vitest run src/server/config.test.ts
```

Expected: PASS.

Commit:

```bash
git add package.json package-lock.json src/server/config.ts src/server/config.test.ts
git commit -m "feat: add prymeira media config"
```

---

### Task 2: Prymeira Tenant Access Layer

**Files:**
- Create: `src/server/prymeira/tenant.ts`
- Create: `src/server/prymeira/tenant.test.ts`

- [ ] **Step 1: Write failing tenant tests**

Create `src/server/prymeira/tenant.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  PrymeiraTenantError,
  createPrymeiraTenantAccess,
  getBearerToken,
  getTenantProjectRoot
} from "./tenant";

describe("Prymeira tenant access", () => {
  it("extracts bearer tokens", () => {
    expect(getBearerToken("Bearer clerk-token")).toBe("clerk-token");
    expect(getBearerToken("bearer clerk-token ")).toBe("clerk-token");
    expect(getBearerToken(undefined)).toBeNull();
    expect(getBearerToken("Basic nope")).toBeNull();
  });

  it("creates tenant project roots under workspaces", () => {
    expect(getTenantProjectRoot("/tmp/root", "workspace_123")).toBe(
      path.join("/tmp/root", "workspaces", "workspace_123", "projects")
    );
  });

  it("requires product access with the media product key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      allowed: true,
      product_key: "media",
      workspace_id: "workspace_123",
      workspace_role: "owner",
      product_role: "admin",
      status: "active",
      plan: "pro",
      limits: { max_upload_bytes: 1000 },
      reason: "active_entitlement"
    }), { status: 200 }));
    const requireTenant = createPrymeiraTenantAccess({
      accountApiUrl: "https://account-api.test",
      productKey: "media",
      fetch: fetchMock
    });

    await expect(requireTenant("Bearer clerk-token")).resolves.toMatchObject({
      token: "clerk-token",
      workspaceId: "workspace_123",
      productKey: "media",
      plan: "pro",
      limits: { max_upload_bytes: 1000 }
    });
    expect(fetchMock).toHaveBeenCalledWith("https://account-api.test/access-check?product_key=media", {
      headers: { Authorization: "Bearer clerk-token" }
    });
  });

  it("maps missing tokens to 401", async () => {
    const requireTenant = createPrymeiraTenantAccess({
      accountApiUrl: "https://account-api.test",
      productKey: "media"
    });

    await expect(requireTenant(undefined)).rejects.toMatchObject({
      statusCode: 401,
      code: "missing_auth_token"
    });
  });

  it("maps denied access to 403", async () => {
    const requireTenant = createPrymeiraTenantAccess({
      accountApiUrl: "https://account-api.test",
      productKey: "media",
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        allowed: false,
        product_key: "media",
        status: "locked",
        reason: "no_entitlement"
      }), { status: 200 }))
    });

    await expect(requireTenant("Bearer clerk-token")).rejects.toMatchObject({
      statusCode: 403,
      code: "product_access_denied"
    });
  });

  it("maps account API failures to 502", async () => {
    const requireTenant = createPrymeiraTenantAccess({
      accountApiUrl: "https://account-api.test",
      productKey: "media",
      fetch: vi.fn().mockRejectedValue(new Error("network down"))
    });

    await expect(requireTenant("Bearer clerk-token")).rejects.toBeInstanceOf(PrymeiraTenantError);
    await expect(requireTenant("Bearer clerk-token")).rejects.toMatchObject({
      statusCode: 502,
      code: "account_api_error"
    });
  });
});
```

- [ ] **Step 2: Run tenant tests and verify failure**

Run:

```bash
npx vitest run src/server/prymeira/tenant.test.ts
```

Expected: FAIL because `src/server/prymeira/tenant.ts` does not exist.

- [ ] **Step 3: Implement tenant access**

Create `src/server/prymeira/tenant.ts`:

```ts
import path from "node:path";
import { ProductAccessDeniedError, createPrymeiraAuthClient } from "@prymeira/auth";
import { sanitizeObjectKeyPart } from "../media-factory-saas/storage-keys";

export type PrymeiraTenantContext = {
  token: string;
  workspaceId: string;
  workspaceRole: string | null;
  productKey: string;
  productRole: string | null;
  plan: string | null;
  limits: Record<string, unknown>;
};

export class PrymeiraTenantError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "PrymeiraTenantError";
  }
}

export function getBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token || null;
}

export function getTenantProjectRoot(workspaceRoot: string, workspaceId: string): string {
  return path.join(
    workspaceRoot,
    "workspaces",
    sanitizeObjectKeyPart(workspaceId, "workspace"),
    "projects"
  );
}

export function createPrymeiraTenantAccess({
  accountApiUrl,
  productKey,
  fetch: fetchImpl
}: {
  accountApiUrl: string;
  productKey: string;
  fetch?: typeof fetch;
}) {
  const client = createPrymeiraAuthClient({
    accountApiUrl,
    fetch: fetchImpl
  });

  return async function requireTenantAccess(authorization: string | undefined): Promise<PrymeiraTenantContext> {
    const token = getBearerToken(authorization);
    if (!token) {
      throw new PrymeiraTenantError(401, "missing_auth_token", "Missing Clerk bearer token.");
    }

    try {
      const decision = await client.requireProductAccess(productKey, token);
      if (!decision.workspace_id) {
        throw new PrymeiraTenantError(
          403,
          "missing_workspace",
          "Media access requires an active Prymeira workspace."
        );
      }

      return {
        token,
        workspaceId: decision.workspace_id,
        workspaceRole: decision.workspace_role ?? null,
        productKey: decision.product_key,
        productRole: decision.product_role ?? null,
        plan: decision.plan ?? null,
        limits: decision.limits ?? {},
        decision
      } as PrymeiraTenantContext & { decision: typeof decision };
    } catch (error) {
      if (error instanceof PrymeiraTenantError) throw error;
      if (error instanceof ProductAccessDeniedError) {
        throw new PrymeiraTenantError(
          403,
          "product_access_denied",
          `Access denied for ${productKey}: ${error.decision.reason}.`
        );
      }
      throw new PrymeiraTenantError(502, "account_api_error", "Prymeira Account API request failed.");
    }
  };
}
```

- [ ] **Step 4: Run tenant tests and commit**

Run:

```bash
npx vitest run src/server/prymeira/tenant.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/server/prymeira/tenant.ts src/server/prymeira/tenant.test.ts
git commit -m "feat: add prymeira tenant access"
```

---

### Task 3: Tenant-Aware Job Store

**Files:**
- Modify: `src/server/jobs/job-store.ts`
- Modify: `src/server/jobs/job-store.test.ts`

- [ ] **Step 1: Write failing job isolation test**

Add to `src/server/jobs/job-store.test.ts`:

```ts
it("stores workspace IDs and hides jobs from other workspaces", () => {
  const jobs = createJobStore();
  const created = jobs.create({
    projectId: "project_123",
    sourcePath: "/tmp/source.mp4",
    workspaceId: "workspace_123"
  });

  expect(created.workspaceId).toBe("workspace_123");
  expect(jobs.getForWorkspace(created.id, "workspace_123")).toMatchObject({ id: created.id });
  expect(jobs.getForWorkspace(created.id, "workspace_other")).toBeNull();
});
```

- [ ] **Step 2: Run job store tests and verify failure**

Run:

```bash
npx vitest run src/server/jobs/job-store.test.ts
```

Expected: FAIL because `workspaceId` and `getForWorkspace` do not exist.

- [ ] **Step 3: Implement workspace-aware jobs**

Update `ProjectJob`, `create`, and store API in `src/server/jobs/job-store.ts`:

```ts
export type ProjectJob = {
  id: string;
  projectId: string;
  workspaceId: string | null;
  status: JobStatus;
  stage: string;
  message: string;
  sourcePath: string;
  outputPath: string | null;
  planPath: string | null;
  warnings: string[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

type CreateJobInput = Pick<ProjectJob, "projectId" | "sourcePath"> & {
  workspaceId?: string | null;
};

create(input: CreateJobInput) {
  const now = new Date().toISOString();
  const job: ProjectJob = {
    id: `job_${crypto.randomUUID()}`,
    projectId: input.projectId,
    workspaceId: input.workspaceId ?? null,
    status: "queued",
    stage: "queued",
    message: "Waiting to start",
    sourcePath: input.sourcePath,
    outputPath: null,
    planPath: null,
    warnings: [],
    error: null,
    createdAt: now,
    updatedAt: now
  };
  jobs.set(job.id, job);
  return cloneJob(job);
},
getForWorkspace(id: string, workspaceId: string) {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.workspaceId && job.workspaceId !== workspaceId) return null;
  return cloneJob(job);
},
```

- [ ] **Step 4: Run job store tests and commit**

Run:

```bash
npx vitest run src/server/jobs/job-store.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/server/jobs/job-store.ts src/server/jobs/job-store.test.ts
git commit -m "feat: scope jobs by workspace"
```

---

### Task 4: Project Routes Resolve Tenant Workspace Roots

**Files:**
- Modify: `src/server/routes/projects.ts`
- Modify: `src/server/routes/projects.test.ts`

- [ ] **Step 1: Write failing project route tests**

Add these helpers near the top of `src/server/routes/projects.test.ts`:

```ts
function tenantAccess(workspaceId = "workspace_123") {
  return vi.fn().mockResolvedValue({
    token: "clerk-token",
    workspaceId,
    workspaceRole: "owner",
    productKey: "media",
    productRole: "admin",
    plan: "pro",
    limits: {}
  });
}
```

Add tests inside `describe("project routes", () => { ... })`:

```ts
it("lists projects from the authorized tenant workspace", async () => {
  await withTempDir("ai-editor-tenant-list-", async (dir) => {
    const tenantRoot = path.join(dir, "workspaces", "workspace_123", "projects");
    await mkdir(path.join(tenantRoot, "project_123", "renders"), { recursive: true });
    await writeFile(path.join(tenantRoot, "project_123", "renders", "rough-cut.mp4"), "rendered");
    await writeFile(path.join(tenantRoot, "project_123", "edit-plan.json"), JSON.stringify({
      id: "plan_project_123",
      projectId: "project_123",
      version: 1,
      source: { path: "/tmp/source.mp4", durationSec: 10, width: 1080, height: 1920, fps: 30, hasAudio: true },
      segments: [],
      removed: [],
      sections: [],
      captions: [],
      captionSettings: { enabled: false },
      overlays: [],
      color: { presetId: "neutral", label: "Neutral" },
      audio: { music: null, voiceTargetLufs: -16 },
      qa: { status: "passed", warnings: [] },
      createdAt: "2026-05-05T00:00:00.000Z"
    }));

    const requireTenantAccess = tenantAccess();
    const app = createApp({
      workspaceRoot: dir,
      jobs: createJobStore(),
      runJobs: false,
      requireTenantAccess
    });

    const response = await request(app)
      .get("/api/projects")
      .set("Authorization", "Bearer clerk-token")
      .expect(200);

    expect(requireTenantAccess).toHaveBeenCalledWith("Bearer clerk-token");
    expect(response.body.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "project_123" })
    ]));
  });
});

it("creates uploaded projects under the authorized tenant workspace", async () => {
  await withTempDir("ai-editor-tenant-upload-", async (dir) => {
    const app = createApp({
      workspaceRoot: dir,
      jobs: createJobStore(),
      runJobs: false,
      requireTenantAccess: tenantAccess()
    });

    const response = await request(app)
      .post("/api/projects")
      .set("Authorization", "Bearer clerk-token")
      .field("cutPreset", "normal")
      .attach("video", Buffer.from("video"), { filename: "source.mp4", contentType: "video/mp4" })
      .expect(201);

    const projectId = response.body.projectId as string;
    await expect(stat(path.join(
      dir,
      "workspaces",
      "workspace_123",
      "projects",
      projectId,
      "uploads",
      "source.mp4"
    ))).resolves.toBeTruthy();
  });
});

it("returns 401 when tenant auth is configured and the token is missing", async () => {
  const requireTenantAccess = vi.fn().mockRejectedValue({
    statusCode: 401,
    code: "missing_auth_token",
    message: "Missing Clerk bearer token."
  });

  await request(createApp({
    workspaceRoot: "unused",
    jobs: createJobStore(),
    runJobs: false,
    requireTenantAccess
  }))
    .get("/api/projects")
    .expect(401)
    .expect({
      error: {
        code: "missing_auth_token",
        message: "Missing Clerk bearer token."
      }
    });
});
```

- [ ] **Step 2: Run project route tests and verify failure**

Run:

```bash
npx vitest run src/server/routes/projects.test.ts --testNamePattern "tenant|token"
```

Expected: FAIL because `createApp` and `createProjectRouter` do not accept tenant access.

- [ ] **Step 3: Add tenant resolver to project routes**

In `src/server/routes/projects.ts`, import tenant helpers:

```ts
import {
  PrymeiraTenantError,
  getTenantProjectRoot,
  type PrymeiraTenantContext
} from "../prymeira/tenant";
```

Extend `ProjectRouteOptions`:

```ts
  requireTenantAccess?: (authorization: string | undefined) => Promise<PrymeiraTenantContext>;
```

Add local helpers inside `createProjectRouter`:

```ts
  async function resolveRouteContext(req: express.Request) {
    if (!options.requireTenantAccess) {
      return {
        workspaceRoot: options.workspaceRoot,
        tenant: null as PrymeiraTenantContext | null
      };
    }

    const tenant = await options.requireTenantAccess(req.get("authorization"));
    return {
      workspaceRoot: getTenantProjectRoot(options.workspaceRoot, tenant.workspaceId),
      tenant
    };
  }

  function handleTenantError(error: unknown, res: express.Response, next: express.NextFunction) {
    if (error instanceof PrymeiraTenantError || (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      "code" in error &&
      "message" in error
    )) {
      const known = error as { statusCode: number; code: string; message: string };
      res.status(known.statusCode).json({ error: { code: known.code, message: known.message } });
      return;
    }
    next(error);
  }
```

For each route that currently uses `options.workspaceRoot`, call `const context = await resolveRouteContext(req);` and replace file operations with `context.workspaceRoot`. Examples:

```ts
router.get("/", async (req, res, next) => {
  try {
    const context = await resolveRouteContext(req);
    const projects = await listProjectLibrary(context.workspaceRoot);
    res.json({ projects });
  } catch (error) {
    handleTenantError(error, res, next);
  }
});
```

```ts
const context = await resolveRouteContext(req);
const workspace = await createProjectWorkspace(context.workspaceRoot, projectId);
const job = options.jobs.create({
  projectId,
  sourcePath,
  workspaceId: context.tenant?.workspaceId ?? null
});
res.status(201).json({ projectId, job: serializeJob(job, context.workspaceRoot) });
```

Update all route handlers in this file so `serializeJob` receives the tenant route root when tenant auth is active.

- [ ] **Step 4: Run focused project route tests**

Run:

```bash
npx vitest run src/server/routes/projects.test.ts --testNamePattern "tenant|token"
```

Expected: PASS.

- [ ] **Step 5: Run all project route tests and commit**

Run:

```bash
npx vitest run src/server/routes/projects.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/server/routes/projects.ts src/server/routes/projects.test.ts
git commit -m "feat: isolate project routes by prymeira workspace"
```

---

### Task 5: App Wiring And Tenant-Safe Media Routes

**Files:**
- Modify: `src/server/app.ts`
- Modify: `src/server/app.test.ts`
- Modify: `src/server/index.ts`

- [ ] **Step 1: Write failing app tests**

Add to `src/server/app.test.ts`:

```ts
it("serves rendered media from the authorized tenant workspace", async () => {
  await withTempDir("ai-editor-app-tenant-media-", async (dir) => {
    await mkdir(path.join(dir, "workspaces", "workspace_123", "projects", "project_123", "renders"), { recursive: true });
    await writeFile(
      path.join(dir, "workspaces", "workspace_123", "projects", "project_123", "renders", "draft.mp4"),
      "tenant media"
    );

    const app = createApp({
      workspaceRoot: dir,
      runJobs: false,
      requireTenantAccess: vi.fn().mockResolvedValue({
        token: "clerk-token",
        workspaceId: "workspace_123",
        workspaceRole: "owner",
        productKey: "media",
        productRole: "admin",
        plan: "pro",
        limits: {}
      })
    });

    const response = await request(app)
      .get("/media/project_123/draft.mp4")
      .set("Authorization", "Bearer clerk-token")
      .expect(200);

    expect(Buffer.from(response.body).toString("utf8")).toBe("tenant media");
  });
});

it("does not serve tenant media without a token when auth is configured", async () => {
  const app = createApp({
    workspaceRoot: "unused",
    runJobs: false,
    requireTenantAccess: vi.fn().mockRejectedValue({
      statusCode: 401,
      code: "missing_auth_token",
      message: "Missing Clerk bearer token."
    })
  });

  await request(app)
    .get("/media/project_123/draft.mp4")
    .expect(401)
    .expect({
      error: {
        code: "missing_auth_token",
        message: "Missing Clerk bearer token."
      }
    });
});
```

- [ ] **Step 2: Run app tests and verify failure**

Run:

```bash
npx vitest run src/server/app.test.ts --testNamePattern "tenant media|without a token"
```

Expected: FAIL because media serving still reads from the global workspace root.

- [ ] **Step 3: Wire tenant access into app**

In `src/server/app.ts`, import tenant helpers:

```ts
import {
  PrymeiraTenantError,
  createPrymeiraTenantAccess,
  getTenantProjectRoot,
  type PrymeiraTenantContext
} from "./prymeira/tenant";
```

Extend `CreateAppOptions`:

```ts
  requireTenantAccess?: (authorization: string | undefined) => Promise<PrymeiraTenantContext>;
```

After `const app = express();`, define:

```ts
  const requireTenantAccess = options.requireTenantAccess
    ?? (config.prymeiraAccountApiUrl
      ? createPrymeiraTenantAccess({
          accountApiUrl: config.prymeiraAccountApiUrl,
          productKey: config.prymeiraProductKey
        })
      : undefined);

  async function resolveRequestWorkspaceRoot(req: express.Request) {
    if (!requireTenantAccess) return workspaceRoot;
    const tenant = await requireTenantAccess(req.get("authorization"));
    return getTenantProjectRoot(workspaceRoot, tenant.workspaceId);
  }

  function handleAccessError(error: unknown, res: express.Response, next: express.NextFunction) {
    if (error instanceof PrymeiraTenantError || (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      "code" in error &&
      "message" in error
    )) {
      const known = error as { statusCode: number; code: string; message: string };
      res.status(known.statusCode).json({ error: { code: known.code, message: known.message } });
      return;
    }
    next(error);
  }
```

In the `/media/:projectId/:filename` route, replace direct `workspaceRoot` usage with an async root resolution:

```ts
  app.get("/media/:projectId/:filename", async (req, res, next) => {
    try {
      const requestWorkspaceRoot = await resolveRequestWorkspaceRoot(req);
      const { projectId, filename } = req.params;
      if (!PROJECT_ID_PATTERN.test(projectId) || filename !== path.basename(filename)) {
        res.status(404).json({ error: "Media not found" });
        return;
      }

      if (filename === "source") {
        const uploadsRoot = path.resolve(requestWorkspaceRoot, projectId, "uploads");
        void readdir(uploadsRoot)
          .then((files) => {
            const sourceName = files.find((file) => file.startsWith("source."));
            if (!sourceName) {
              res.status(404).json({ error: "Media not found" });
              return;
            }
            setMediaNoCacheHeaders(res);
            res.sendFile(path.resolve(uploadsRoot, sourceName));
          })
          .catch(() => {
            if (!res.headersSent) res.status(404).json({ error: "Media not found" });
          });
        return;
      }

      const rendersRoot = path.resolve(requestWorkspaceRoot, projectId, "renders");
      const mediaPath = path.resolve(rendersRoot, filename);
      const relativeToRenders = path.relative(rendersRoot, mediaPath);
      if (relativeToRenders.startsWith("..") || path.isAbsolute(relativeToRenders)) {
        res.status(404).json({ error: "Media not found" });
        return;
      }

      setMediaNoCacheHeaders(res);
      res.sendFile(mediaPath, (error) => {
        if (error && !res.headersSent) {
          res.status(404).json({ error: "Media not found" });
        }
      });
    } catch (error) {
      handleAccessError(error, res, next);
    }
  });
```

Pass `requireTenantAccess` into `createProjectRouter`.

- [ ] **Step 4: Update server startup logging**

In `src/server/index.ts`, change the listen log to:

```ts
console.log(`Media API listening on http://localhost:${port}`);
```

- [ ] **Step 5: Run app tests and commit**

Run:

```bash
npx vitest run src/server/app.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/server/app.ts src/server/app.test.ts src/server/index.ts
git commit -m "feat: wire prymeira tenant auth into app"
```

---

### Task 6: SaaS Upload Access Uses Product `media`

**Files:**
- Modify: `src/server/media-factory-saas/access.ts`
- Modify: `src/server/media-factory-saas/access.test.ts`
- Modify: `src/server/routes/media-factory-saas.test.ts`
- Modify: `src/server/app.test.ts`

- [ ] **Step 1: Update failing product-key expectations**

In `src/server/media-factory-saas/access.test.ts`, change successful Account API fixtures from:

```ts
product_key: "mediafactory"
```

to:

```ts
product_key: "media"
```

Add this assertion to the successful access test:

```ts
expect(fetchMock).toHaveBeenCalledWith("https://account-api.test/access-check?product_key=media", {
  headers: { Authorization: "Bearer clerk-token-123" }
});
```

Make the same fixture change in `src/server/routes/media-factory-saas.test.ts` and `src/server/app.test.ts`.

- [ ] **Step 2: Run SaaS access tests and verify failure**

Run:

```bash
npx vitest run src/server/media-factory-saas/access.test.ts src/server/routes/media-factory-saas.test.ts src/server/app.test.ts --testNamePattern "MediaFactory|SaaS|access"
```

Expected: FAIL where code still expects `mediafactory`.

- [ ] **Step 3: Refactor access constant**

In `src/server/media-factory-saas/access.ts`, change:

```ts
export const MEDIA_FACTORY_PRODUCT_KEY = "mediafactory";
```

to:

```ts
export const MEDIA_FACTORY_PRODUCT_KEY = "media";
```

Keep the existing error class and response shape so clients keep receiving `missing_auth_token`, `product_access_denied`, and `account_api_error`.

- [ ] **Step 4: Run SaaS tests and commit**

Run:

```bash
npx vitest run src/server/media-factory-saas/access.test.ts src/server/routes/media-factory-saas.test.ts src/server/app.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/server/media-factory-saas/access.ts src/server/media-factory-saas/access.test.ts src/server/routes/media-factory-saas.test.ts src/server/app.test.ts
git commit -m "feat: align media saas access with prymeira product"
```

---

### Task 7: Frontend API Auth Token Injection

**Files:**
- Modify: `src/client/api.ts`
- Modify: `src/client/api.test.ts`

- [ ] **Step 1: Write failing API token tests**

Add imports in `src/client/api.test.ts`:

```ts
  configureApiAuth,
```

Add tests:

```ts
it("attaches the configured Clerk bearer token to JSON requests", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ projects: [] }), {
    headers: { "content-type": "application/json" }
  }));
  vi.stubGlobal("fetch", fetchMock);
  configureApiAuth(() => "clerk-token-123");

  await listProjects();

  expect(fetchMock).toHaveBeenCalledWith("/api/projects", {
    headers: { Authorization: "Bearer clerk-token-123" }
  });
});

it("preserves caller headers while attaching auth", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    job: {
      id: "job_123",
      projectId: "project_123",
      status: "queued",
      stage: "motion_queued",
      message: "AI motion accepted",
      sourcePath: "/tmp/source.mov",
      outputPath: null,
      outputUrl: null,
      planPath: null,
      warnings: [],
      error: null
    }
  }), {
    headers: { "content-type": "application/json" }
  }));
  vi.stubGlobal("fetch", fetchMock);
  configureApiAuth(async () => "clerk-token-123");

  await generateAIMotion("project_123");

  expect(fetchMock).toHaveBeenCalledWith("/api/projects/project_123/motion", expect.objectContaining({
    headers: {
      "content-type": "application/json",
      Authorization: "Bearer clerk-token-123"
    }
  }));
});
```

Update `afterEach`:

```ts
afterEach(() => {
  vi.unstubAllGlobals();
  configureApiAuth(null);
});
```

- [ ] **Step 2: Run API tests and verify failure**

Run:

```bash
npx vitest run src/client/api.test.ts --testNamePattern "bearer token|preserves caller headers"
```

Expected: FAIL because `configureApiAuth` does not exist.

- [ ] **Step 3: Implement token provider**

In `src/client/api.ts`, add near the top:

```ts
type ApiAuthTokenProvider = (() => Promise<string | null> | string | null) | null;

let authTokenProvider: ApiAuthTokenProvider = null;

export function configureApiAuth(provider: ApiAuthTokenProvider): void {
  authTokenProvider = provider;
}
```

Replace `request` with:

```ts
async function request(input: RequestInfo | URL, init: RequestInit = {}) {
  try {
    const token = authTokenProvider ? await authTokenProvider() : null;
    const headers = new Headers(init.headers);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return await fetch(input, {
      ...init,
      ...(headers.size > 0 ? { headers: Object.fromEntries(headers.entries()) } : {})
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new Error(
      "Nao consegui conectar na API local em localhost:4317. Confere se o servidor ainda esta rodando e tenta de novo."
    );
  }
}
```

- [ ] **Step 4: Run API tests and commit**

Run:

```bash
npx vitest run src/client/api.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/client/api.ts src/client/api.test.ts
git commit -m "feat: attach clerk token to api requests"
```

---

### Task 8: Clerk Gate Around The App

**Files:**
- Create: `src/client/PrymeiraAuthGate.tsx`
- Create: `src/client/PrymeiraAuthGate.test.tsx`
- Modify: `src/client/main.tsx`

- [ ] **Step 1: Create failing auth gate tests**

Create `src/client/PrymeiraAuthGate.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrymeiraAuthGate } from "./PrymeiraAuthGate";
import { configureApiAuth } from "./api";

vi.mock("@clerk/clerk-react", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ClerkLoading: () => <div>Carregando acesso...</div>,
  SignedIn: ({ children }: { children: ReactNode }) => <div data-testid="signed-in">{children}</div>,
  SignedOut: ({ children }: { children: ReactNode }) => <div data-testid="signed-out">{children}</div>,
  SignIn: () => <div>Entrar na Prymeira</div>,
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("clerk-token-123") })
}));

afterEach(() => {
  configureApiAuth(null);
});

describe("PrymeiraAuthGate", () => {
  it("renders a config error when Clerk publishable key is missing", () => {
    render(<PrymeiraAuthGate publishableKey={undefined}><div>Editor</div></PrymeiraAuthGate>);

    expect(screen.getByText("Configuração Clerk ausente.")).toBeInTheDocument();
  });

  it("renders Clerk sign-in and the signed-in app shell when configured", () => {
    render(<PrymeiraAuthGate publishableKey="pk_test_123"><div>Editor</div></PrymeiraAuthGate>);

    expect(screen.getByText("Entrar na Prymeira")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Install test DOM dependency if missing**

Run:

```bash
npm install -D @testing-library/react@^16.0.0 @testing-library/jest-dom@^6.0.0 jsdom@^25.0.0
```

Expected: test dependencies are available for the auth gate test.

- [ ] **Step 3: Run auth gate test and verify failure**

Run:

```bash
npx vitest run src/client/PrymeiraAuthGate.test.tsx
```

Expected: FAIL because `PrymeiraAuthGate.tsx` does not exist.

- [ ] **Step 4: Implement auth gate**

Create `src/client/PrymeiraAuthGate.tsx`:

```tsx
import { useEffect, type ReactNode } from "react";
import {
  ClerkLoading,
  ClerkProvider,
  SignIn,
  SignedIn,
  SignedOut,
  useAuth
} from "@clerk/clerk-react";
import { configureApiAuth } from "./api";

function ApiAuthBridge({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    configureApiAuth(() => getToken());
    return () => configureApiAuth(null);
  }, [getToken]);

  return <>{children}</>;
}

export function PrymeiraAuthGate({
  publishableKey,
  children
}: {
  publishableKey: string | undefined;
  children: ReactNode;
}) {
  if (!publishableKey) {
    return (
      <main className="auth-gate">
        <h1>Configuração Clerk ausente.</h1>
        <p>Defina VITE_CLERK_PUBLISHABLE_KEY para entrar no produto Media.</p>
      </main>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkLoading>
        <main className="auth-gate">Carregando acesso...</main>
      </ClerkLoading>
      <SignedOut>
        <main className="auth-gate">
          <SignIn routing="hash" />
        </main>
      </SignedOut>
      <SignedIn>
        <ApiAuthBridge>{children}</ApiAuthBridge>
      </SignedIn>
    </ClerkProvider>
  );
}
```

- [ ] **Step 5: Wire main render**

Update `src/client/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PrymeiraAuthGate } from "./PrymeiraAuthGate";
import "./styles.css";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

createRoot(document.getElementById("root")!).render(
  <PrymeiraAuthGate publishableKey={clerkPublishableKey}>
    <App />
  </PrymeiraAuthGate>
);
```

- [ ] **Step 6: Run auth gate tests and commit**

Run:

```bash
npx vitest run src/client/PrymeiraAuthGate.test.tsx src/client/api.test.ts
```

Expected: PASS.

Commit:

```bash
git add package.json package-lock.json src/client/PrymeiraAuthGate.tsx src/client/PrymeiraAuthGate.test.tsx src/client/main.tsx
git commit -m "feat: require clerk sign in for media app"
```

---

### Task 9: Local Hub Integration Notes

**Files:**
- Create: `docs/prymeira-media-local-dev.md`

- [ ] **Step 1: Add local development document**

Create `docs/prymeira-media-local-dev.md`:

````md
# Prymeira Media Local Development

Run Prymeira Account first:

```bash
cd "../Prymeira Account"
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
```

Run the Hub in a second terminal:

```bash
cd "../Prymeira Account"
VITE_PRODUCT_MEDIA_URL=http://localhost:5173 pnpm dev:hub
```

Run Media in this repository:

```bash
npm install
PRYMEIRA_ACCOUNT_API_URL=http://localhost:3001 \
PRYMEIRA_PRODUCT_KEY=media \
VITE_CLERK_PUBLISHABLE_KEY=pk_test_replace_me \
npm run dev
```

The Account API CORS list must include:

```text
http://localhost:5173
```

Grant a local user access with:

```bash
cd "../Prymeira Account"
pnpm --filter @prymeira/account-api exec tsx src/scripts/grant-product-access.ts --product-key=media --clerk-user-id=user_replace_me --apply
```

Projects created by the Media app are stored under:

```text
workspace/workspaces/<workspace_id>/projects/<project_id>
```
````

- [ ] **Step 2: Commit docs**

Run:

```bash
git add docs/prymeira-media-local-dev.md
git commit -m "docs: add prymeira media local setup"
```

---

### Task 10: Full Verification

**Files:**
- Verify only

- [ ] **Step 1: Run targeted test suite**

Run:

```bash
npx vitest run src/server/prymeira/tenant.test.ts src/server/jobs/job-store.test.ts src/server/app.test.ts src/server/routes/projects.test.ts src/server/media-factory-saas/access.test.ts src/server/routes/media-factory-saas.test.ts src/client/api.test.ts src/client/PrymeiraAuthGate.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck and all tests**

Run:

```bash
npm run check
```

Expected: `tsc --noEmit` exits 0 and Vitest exits 0.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: Vite and server build exit 0.

- [ ] **Step 4: Review final diff**

Run:

```bash
git status --short
git diff --stat HEAD
```

Expected: only intentional implementation files are modified, with no accidental edits to unrelated files.

---

## Self-Review

Spec coverage:

- Clerk authentication is covered in Task 8.
- `@prymeira/auth` server authorization is covered in Task 2 and wired in Task 5.
- Product key `media` is covered in Tasks 1 and 6.
- Hub URL integration is covered in Task 9.
- Workspace-isolated projects are covered in Task 4.
- Tenant-safe media serving is covered in Task 5.
- Job isolation is covered in Task 3.
- API token propagation is covered in Task 7.
- Verification is covered in Task 10.

Type consistency:

- Tenant context uses `workspaceId`, `workspaceRole`, `productKey`, `productRole`, `plan`, and `limits` consistently.
- Job store uses `workspaceId: string | null` consistently.
- Product key defaults to `media` consistently.
