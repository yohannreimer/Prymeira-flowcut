import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { withTempDir } from "../test/fixtures";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

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
