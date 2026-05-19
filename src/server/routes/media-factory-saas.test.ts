import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createMediaFactorySaasRouter } from "./media-factory-saas";
import { InMemoryUploadSessionRepository } from "../media-factory-saas/upload-sessions";

function createTestApp() {
  const app = express();
  const repo = new InMemoryUploadSessionRepository();
  const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
    allowed: true,
    product_key: "media",
    workspace_id: "workspace_123",
    product_role: "admin",
    status: "active",
    plan: "pro",
    source: "manual",
    seats_limit: 1,
    limits: { max_upload_bytes: 1000 },
    reason: "active_entitlement"
  }), { status: 200 }));
  const createSignedUploadUrl = vi.fn().mockResolvedValue("https://storage.test/signed-upload-url");
  const getUploadedObjectSize = vi.fn().mockResolvedValue(500);

  app.use(express.json());
  app.use("/api/mediafactory", createMediaFactorySaasRouter({
    accountApiUrl: "https://account-api.test",
    repo,
    fetch: fetchMock,
    storage: {
      createSignedUploadUrl,
      getUploadedObjectSize
    }
  }));

  return { app, createSignedUploadUrl, getUploadedObjectSize };
}

describe("createMediaFactorySaasRouter", () => {
  it("creates an upload session with a signed upload URL", async () => {
    const { app, createSignedUploadUrl } = createTestApp();

    const response = await request(app)
      .post("/api/mediafactory/uploads")
      .set("Authorization", "Bearer clerk-token-123")
      .send({
        fileName: "video.mp4",
        contentType: "video/mp4",
        sizeBytes: 500
      })
      .expect(201);

    expect(response.body.upload).toMatchObject({
      id: expect.stringMatching(/^upload_/),
      jobId: expect.stringMatching(/^job_/),
      status: "pending",
      storageKey: expect.stringContaining("workspaces/workspace_123/jobs/")
    });
    expect(response.body.uploadUrl).toBe("https://storage.test/signed-upload-url");
    expect(createSignedUploadUrl).toHaveBeenCalledWith(expect.objectContaining({
      storageKey: expect.stringContaining("workspaces/workspace_123/jobs/"),
      contentType: "video/mp4",
      sizeBytes: 500
    }));
  });

  it("requires auth for upload creation", async () => {
    const { app } = createTestApp();

    await request(app)
      .post("/api/mediafactory/uploads")
      .send({
        fileName: "video.mp4",
        contentType: "video/mp4",
        sizeBytes: 500
      })
      .expect(401);
  });

  it("completes an uploaded object and returns the job id", async () => {
    const { app } = createTestApp();

    const created = await request(app)
      .post("/api/mediafactory/uploads")
      .set("Authorization", "Bearer clerk-token-123")
      .send({
        fileName: "video.mp4",
        contentType: "video/mp4",
        sizeBytes: 500
      })
      .expect(201);

    const uploadId = created.body.upload.id as string;
    const response = await request(app)
      .post(`/api/mediafactory/uploads/${encodeURIComponent(uploadId)}/complete`)
      .set("Authorization", "Bearer clerk-token-123")
      .send({})
      .expect(200);

    expect(response.body.upload).toMatchObject({
      id: uploadId,
      status: "uploaded"
    });
    expect(response.body.job).toMatchObject({
      id: created.body.upload.jobId,
      status: "queued"
    });
  });
});
