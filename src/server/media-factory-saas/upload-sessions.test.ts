import { describe, expect, it } from "vitest";
import {
  InMemoryUploadSessionRepository,
  UploadSessionError,
  createUploadSession,
  completeUploadSession
} from "./upload-sessions";

describe("upload sessions", () => {
  it("creates a pending upload session with a tenant-safe storage key", async () => {
    const repo = new InMemoryUploadSessionRepository();

    const session = await createUploadSession({
      repo,
      workspaceId: "workspace_123",
      uploaderCustomerId: "customer_123",
      fileName: "Meu video.mp4",
      contentType: "video/mp4",
      sizeBytes: 500,
      limits: { max_upload_bytes: 1000 }
    });

    expect(session).toMatchObject({
      workspaceId: "workspace_123",
      uploaderCustomerId: "customer_123",
      status: "pending",
      fileName: "Meu video.mp4",
      storageKey: expect.stringContaining("workspaces/workspace_123/jobs/")
    });
  });

  it("rejects uploads larger than max_upload_bytes", async () => {
    const repo = new InMemoryUploadSessionRepository();

    await expect(createUploadSession({
      repo,
      workspaceId: "workspace_123",
      uploaderCustomerId: "customer_123",
      fileName: "large.mp4",
      contentType: "video/mp4",
      sizeBytes: 2000,
      limits: { max_upload_bytes: 1000 }
    })).rejects.toMatchObject({
      statusCode: 413,
      code: "upload_too_large"
    });
  });

  it("rejects invalid upload sizes", async () => {
    const repo = new InMemoryUploadSessionRepository();

    await expect(createUploadSession({
      repo,
      workspaceId: "workspace_123",
      uploaderCustomerId: "customer_123",
      fileName: "zero.mp4",
      contentType: "video/mp4",
      sizeBytes: 0,
      limits: {}
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "invalid_upload_size"
    });

    await expect(createUploadSession({
      repo,
      workspaceId: "workspace_123",
      uploaderCustomerId: "customer_123",
      fileName: "fractional.mp4",
      contentType: "video/mp4",
      sizeBytes: 1.5,
      limits: {}
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "invalid_upload_size"
    });
  });

  it("rejects non-video content types", async () => {
    const repo = new InMemoryUploadSessionRepository();

    await expect(createUploadSession({
      repo,
      workspaceId: "workspace_123",
      uploaderCustomerId: "customer_123",
      fileName: "notes.txt",
      contentType: "text/plain",
      sizeBytes: 500,
      limits: {}
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "invalid_content_type"
    });
  });

  it("completes a pending upload for the same workspace", async () => {
    const repo = new InMemoryUploadSessionRepository();
    const session = await createUploadSession({
      repo,
      workspaceId: "workspace_123",
      uploaderCustomerId: "customer_123",
      fileName: "video.mp4",
      contentType: "video/mp4",
      sizeBytes: 500,
      limits: {}
    });

    await expect(completeUploadSession({
      repo,
      workspaceId: "workspace_123",
      uploadId: session.id,
      observedSizeBytes: 500
    })).resolves.toMatchObject({
      id: session.id,
      status: "uploaded"
    });
  });

  it("blocks completion from a different workspace", async () => {
    const repo = new InMemoryUploadSessionRepository();
    const session = await createUploadSession({
      repo,
      workspaceId: "workspace_123",
      uploaderCustomerId: "customer_123",
      fileName: "video.mp4",
      contentType: "video/mp4",
      sizeBytes: 500,
      limits: {}
    });

    await expect(completeUploadSession({
      repo,
      workspaceId: "workspace_other",
      uploadId: session.id,
      observedSizeBytes: 500
    })).rejects.toMatchObject({
      statusCode: 404,
      code: "upload_not_found"
    });
  });

  it("rejects completion for unknown upload ids", async () => {
    const repo = new InMemoryUploadSessionRepository();

    await expect(completeUploadSession({
      repo,
      workspaceId: "workspace_123",
      uploadId: "upload_missing",
      observedSizeBytes: 500
    })).rejects.toMatchObject({
      statusCode: 404,
      code: "upload_not_found"
    });
  });

  it("rejects completion when observed size is invalid or mismatched", async () => {
    const repo = new InMemoryUploadSessionRepository();
    const session = await createUploadSession({
      repo,
      workspaceId: "workspace_123",
      uploaderCustomerId: "customer_123",
      fileName: "video.mp4",
      contentType: "video/mp4",
      sizeBytes: 500,
      limits: {}
    });

    await expect(completeUploadSession({
      repo,
      workspaceId: "workspace_123",
      uploadId: session.id,
      observedSizeBytes: 0
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "invalid_upload_size"
    });

    await expect(completeUploadSession({
      repo,
      workspaceId: "workspace_123",
      uploadId: session.id,
      observedSizeBytes: 499
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "upload_size_mismatch"
    });
  });

  it("rejects double completion", async () => {
    const repo = new InMemoryUploadSessionRepository();
    const session = await createUploadSession({
      repo,
      workspaceId: "workspace_123",
      uploaderCustomerId: "customer_123",
      fileName: "video.mp4",
      contentType: "video/mp4",
      sizeBytes: 500,
      limits: {}
    });
    await completeUploadSession({
      repo,
      workspaceId: "workspace_123",
      uploadId: session.id,
      observedSizeBytes: 500
    });

    await expect(completeUploadSession({
      repo,
      workspaceId: "workspace_123",
      uploadId: session.id,
      observedSizeBytes: 500
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "upload_already_completed"
    });
  });
});
