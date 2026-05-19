import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { withTempDir } from "../test/fixtures";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("createApp", () => {
  it("returns health status", async () => {
    await request(createApp())
      .get("/api/health")
      .expect(200)
      .expect({ ok: true });
  });

  it("exposes the upload size limit to the client", async () => {
    await request(createApp({
      workspaceRoot: "unused",
      runJobs: false,
      uploadFileSizeLimitBytes: 1234
    }))
      .get("/api/config")
      .expect(200)
      .expect({ uploadFileSizeLimitBytes: 1234 });
  });

  it("serves rendered media files from the configured workspace root", async () => {
    await withTempDir("ai-editor-app-", async (dir) => {
      await mkdir(path.join(dir, "project_123", "renders"), { recursive: true });
      await writeFile(path.join(dir, "project_123", "renders", "draft.mp4"), "rendered media");

      const response = await request(createApp({ workspaceRoot: dir }))
        .get("/media/project_123/draft.mp4")
        .expect(200);

      expect(Buffer.from(response.body).toString("utf8")).toBe("rendered media");
      expect(response.headers["cache-control"]).toContain("no-store");
    });
  });

  it("serves rendered tenant media from the authorized tenant workspace", async () => {
    await withTempDir("ai-editor-app-tenant-media-", async (dir) => {
      await mkdir(path.join(dir, "workspaces", "workspace_123", "projects", "project_123", "renders"), { recursive: true });
      await writeFile(
        path.join(dir, "workspaces", "workspace_123", "projects", "project_123", "renders", "draft.mp4"),
        "tenant media"
      );
      const requireTenantAccess = vi.fn().mockResolvedValue({
        token: "clerk-token",
        workspaceId: "workspace_123",
        workspaceRole: "owner",
        productKey: "media",
        productRole: "admin",
        plan: "pro",
        limits: {}
      });

      const response = await request(createApp({ workspaceRoot: dir, runJobs: false, requireTenantAccess }))
        .get("/media/project_123/draft.mp4")
        .set("Authorization", "Bearer clerk-token")
        .expect(200);

      expect(Buffer.from(response.body).toString("utf8")).toBe("tenant media");
      expect(requireTenantAccess).toHaveBeenCalledWith("Bearer clerk-token");
    });
  });

  it("does not serve tenant media without a token when auth is configured", async () => {
    await withTempDir("ai-editor-app-tenant-media-missing-token-", async (dir) => {
      const requireTenantAccess = vi.fn().mockRejectedValue({
        statusCode: 401,
        code: "missing_auth_token",
        message: "Missing Clerk bearer token."
      });

      const response = await request(createApp({ workspaceRoot: dir, runJobs: false, requireTenantAccess }))
        .get("/media/project_123/draft.mp4");

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: {
          code: "missing_auth_token",
          message: "Missing Clerk bearer token."
        }
      });
      expect(requireTenantAccess).toHaveBeenCalledWith(undefined);
    });
  });

  it("wires Prymeira tenant access from env for project routes", async () => {
    await withTempDir("ai-editor-app-prymeira-env-", async (dir) => {
      vi.stubEnv("PRYMEIRA_ACCOUNT_API_URL", "https://account-api.test");
      vi.stubEnv("PRYMEIRA_PRODUCT_KEY", "media");
      await mkdir(path.join(dir, "workspaces", "workspace_123", "projects", "project_123"), { recursive: true });
      const fetchMock = vi.fn(async () =>
        new Response(JSON.stringify({
          allowed: true,
          workspace_id: "workspace_123",
          workspace_role: "owner",
          product_key: "media",
          product_role: "admin",
          status: "active",
          plan: "pro",
          limits: {},
          reason: "active_entitlement"
        }))
      );
      vi.stubGlobal("fetch", fetchMock);

      await request(createApp({ workspaceRoot: dir, runJobs: false }))
        .get("/api/projects")
        .set("Authorization", "Bearer clerk-token")
        .expect(200);

      expect(fetchMock).toHaveBeenCalledWith("https://account-api.test/access-check?product_key=media", {
        headers: { Authorization: "Bearer clerk-token" }
      });
    });
  });

  it("does not expose uploads or plans through media routes", async () => {
    await withTempDir("ai-editor-app-", async (dir) => {
      await mkdir(path.join(dir, "project_123", "uploads"), { recursive: true });
      await writeFile(path.join(dir, "project_123", "uploads", "source.mp4"), "private source");
      await writeFile(path.join(dir, "project_123", "edit-plan.json"), "{}");
      const app = createApp({ workspaceRoot: dir });

      await request(app).get("/media/project_123/uploads/source.mp4").expect(404);
      await request(app).get("/media/project_123/edit-plan.json").expect(404);
    });
  });

  it("rejects encoded traversal in media filenames", async () => {
    await withTempDir("ai-editor-app-", async (dir) => {
      await mkdir(path.join(dir, "project_123", "renders"), { recursive: true });
      await mkdir(path.join(dir, "project_123", "uploads"), { recursive: true });
      await writeFile(path.join(dir, "project_123", "uploads", "source.mp4"), "private source");

      await request(createApp({ workspaceRoot: dir }))
        .get("/media/project_123/%2e%2e%2fuploads%2fsource.mp4")
        .expect((response) => {
          expect([400, 404]).toContain(response.status);
        });
    });
  });

  it("does not expose MediaFactory SaaS routes unless configured", async () => {
    const app = createApp({ runJobs: false });

    await request(app)
      .post("/api/mediafactory/uploads")
      .send({
        fileName: "video.mp4",
        contentType: "video/mp4",
        sizeBytes: 500
      })
      .expect(404);
  });

  it("exposes MediaFactory SaaS routes when configured", async () => {
    const app = createApp({
      runJobs: false,
      mediaFactorySaas: {
        enabled: true,
        accountApiUrl: "https://account-api.test",
        fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
          allowed: true,
          product_key: "mediafactory",
          workspace_id: "workspace_123",
          product_role: "admin",
          status: "active",
          plan: "pro",
          source: "manual",
          seats_limit: 1,
          limits: { max_upload_bytes: 1000 },
          reason: "active_entitlement"
        }), { status: 200 })),
        storage: {
          createSignedUploadUrl: vi.fn().mockResolvedValue("https://storage.test/signed-upload-url"),
          getUploadedObjectSize: vi.fn().mockResolvedValue(500)
        }
      }
    });

    await request(app)
      .post("/api/mediafactory/uploads")
      .set("Authorization", "Bearer clerk-token-123")
      .send({
        fileName: "video.mp4",
        contentType: "video/mp4",
        sizeBytes: 500
      })
      .expect(201);
  });
});
