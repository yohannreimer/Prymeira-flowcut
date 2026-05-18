import { describe, expect, it } from "vitest";
import { createJobStoragePrefix, createSourceObjectKey, sanitizeObjectKeyPart } from "./storage-keys";

describe("sanitizeObjectKeyPart", () => {
  it("keeps safe characters and replaces unsafe characters", () => {
    expect(sanitizeObjectKeyPart("workspace_123")).toBe("workspace_123");
    expect(sanitizeObjectKeyPart("Video final (maio).mp4")).toBe("Video-final-maio-.mp4");
  });

  it("returns fallback for empty sanitized values", () => {
    expect(sanitizeObjectKeyPart("   ")).toBe("item");
    expect(sanitizeObjectKeyPart("///")).toBe("item");
  });

  it("returns fallback for dot-only traversal segments", () => {
    expect(sanitizeObjectKeyPart(".")).toBe("item");
    expect(sanitizeObjectKeyPart("..")).toBe("item");
    expect(sanitizeObjectKeyPart(".", "source.mp4")).toBe("source.mp4");
  });

  it("neutralizes slash-based traversal-like values", () => {
    expect(sanitizeObjectKeyPart("../x")).toBe("x");
    expect(sanitizeObjectKeyPart("x/..")).toBe("x");
  });
});

describe("storage key helpers", () => {
  it("builds a tenant-safe job prefix", () => {
    expect(createJobStoragePrefix({ workspaceId: "workspace_123", jobId: "job_456" }))
      .toBe("workspaces/workspace_123/jobs/job_456");
  });

  it("builds a source upload key under the workspace and job", () => {
    expect(createSourceObjectKey({
      workspaceId: "workspace_123",
      jobId: "job_456",
      fileName: "Meu video final.mp4"
    })).toBe("workspaces/workspace_123/jobs/job_456/source/Meu-video-final.mp4");
  });
});
