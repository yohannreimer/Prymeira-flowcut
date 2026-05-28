import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { withTempDir } from "../../test/fixtures";
import {
  buildR2PublicUrl,
  createR2ObjectKey,
  createSignedR2UploadUrl,
  downloadR2ObjectToFile,
  getR2ConfigFromEnv,
  getR2ObjectSize,
  uploadFileToR2
} from "./r2-storage";

describe("getR2ConfigFromEnv", () => {
  it("reads R2 configuration from env", () => {
    expect(getR2ConfigFromEnv({
      R2_ACCESS_KEY_ID: " access-key ",
      R2_SECRET_ACCESS_KEY: " secret-key ",
      R2_ENDPOINT: " https://account.r2.cloudflarestorage.com ",
      R2_BUCKET: " mediafactory-reels-temp ",
      R2_PUBLIC_BASE_URL: " https://pub-example.r2.dev/ "
    })).toEqual({
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      endpoint: "https://account.r2.cloudflarestorage.com",
      bucket: "mediafactory-reels-temp",
      publicBaseUrl: "https://pub-example.r2.dev"
    });
  });

  it("returns null when a required R2 value is missing", () => {
    expect(getR2ConfigFromEnv({
      R2_ACCESS_KEY_ID: "access-key",
      R2_SECRET_ACCESS_KEY: "",
      R2_ENDPOINT: "https://account.r2.cloudflarestorage.com",
      R2_BUCKET: "mediafactory-reels-temp",
      R2_PUBLIC_BASE_URL: "https://pub-example.r2.dev"
    })).toBeNull();
  });
});

describe("buildR2PublicUrl", () => {
  it("builds a public URL with encoded path segments", () => {
    expect(buildR2PublicUrl({
      publicBaseUrl: "https://pub-example.r2.dev",
      objectKey: "instagram/package one/rank-01.mp4"
    })).toBe("https://pub-example.r2.dev/instagram/package%20one/rank-01.mp4");
  });
});

describe("createR2ObjectKey", () => {
  it("creates a stable object key for temporary Instagram reels", () => {
    expect(createR2ObjectKey({
      packageId: "2026-05-12 - Shorts - Corte Legal",
      clipRank: "rank-01",
      fileName: "clip.mp4"
    })).toBe("instagram/2026-05-12-shorts-corte-legal/rank-01/clip.mp4");
  });
});

describe("uploadFileToR2", () => {
  it("uploads a local file and returns the public URL", async () => {
    await withTempDir("media-factory-r2-", async (dir) => {
      const filePath = path.join(dir, "clip.mp4");
      await fs.writeFile(filePath, "video-bytes");
      const send = vi.fn().mockResolvedValue({});

      const result = await uploadFileToR2({
        filePath,
        objectKey: "instagram/package/rank-01.mp4",
        contentType: "video/mp4",
        config: {
          accessKeyId: "access-key",
          secretAccessKey: "secret-key",
          endpoint: "https://account.r2.cloudflarestorage.com",
          bucket: "mediafactory-reels-temp",
          publicBaseUrl: "https://pub-example.r2.dev"
        },
        client: { send }
      });

      expect(result).toEqual({
        objectKey: "instagram/package/rank-01.mp4",
        publicUrl: "https://pub-example.r2.dev/instagram/package/rank-01.mp4"
      });
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0].input).toMatchObject({
        Bucket: "mediafactory-reels-temp",
        Key: "instagram/package/rank-01.mp4",
        Body: expect.any(Uint8Array),
        ContentType: "video/mp4"
      });
    });
  });
});

describe("createSignedR2UploadUrl", () => {
  it("signs a PUT URL for browser uploads", async () => {
    const getSignedUrl = vi.fn().mockResolvedValue("https://storage.test/signed-put");
    const send = vi.fn();

    const url = await createSignedR2UploadUrl({
      objectKey: "workspaces/workspace_123/jobs/job_123/source/video.mp4",
      contentType: "video/mp4",
      sizeBytes: 123,
      config: {
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        endpoint: "https://account.r2.cloudflarestorage.com",
        bucket: "mediafactory-temp",
        publicBaseUrl: "https://pub-example.r2.dev"
      },
      client: { send },
      getSignedUrl
    });

    expect(url).toBe("https://storage.test/signed-put");
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
    expect(getSignedUrl.mock.calls[0][1].input).toMatchObject({
      Bucket: "mediafactory-temp",
      Key: "workspaces/workspace_123/jobs/job_123/source/video.mp4",
      ContentType: "video/mp4"
    });
    expect(getSignedUrl.mock.calls[0][1].input).not.toHaveProperty("ContentLength");
  });
});

describe("getR2ObjectSize", () => {
  it("reads object size with HEAD", async () => {
    const send = vi.fn().mockResolvedValue({ ContentLength: 456 });

    await expect(getR2ObjectSize({
      objectKey: "workspaces/workspace_123/jobs/job_123/source/video.mp4",
      config: {
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        endpoint: "https://account.r2.cloudflarestorage.com",
        bucket: "mediafactory-temp",
        publicBaseUrl: "https://pub-example.r2.dev"
      },
      client: { send }
    })).resolves.toBe(456);

    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: "mediafactory-temp",
      Key: "workspaces/workspace_123/jobs/job_123/source/video.mp4"
    });
  });
});

describe("downloadR2ObjectToFile", () => {
  it("writes an R2 object stream to a local file", async () => {
    await withTempDir("media-factory-r2-download-", async (dir) => {
      const outputPath = path.join(dir, "uploads", "source.mp4");
      const onProgress = vi.fn();
      const send = vi.fn().mockResolvedValue({
        Body: Readable.from([Buffer.from("video-"), Buffer.from("bytes")]),
        ContentLength: 11
      });

      await downloadR2ObjectToFile({
        objectKey: "workspaces/workspace_123/jobs/job_123/source/video.mp4",
        outputPath,
        config: {
          accessKeyId: "access-key",
          secretAccessKey: "secret-key",
          endpoint: "https://account.r2.cloudflarestorage.com",
          bucket: "mediafactory-temp",
          publicBaseUrl: "https://pub-example.r2.dev"
        },
        client: { send },
        onProgress
      });

      await expect(fs.readFile(outputPath, "utf8")).resolves.toBe("video-bytes");
      expect(onProgress).toHaveBeenLastCalledWith({
        transferredBytes: 11,
        totalBytes: 11
      });
    });
  });

  it("supports web streams returned by fetch-based S3 clients", async () => {
    await withTempDir("media-factory-r2-download-web-", async (dir) => {
      const outputPath = path.join(dir, "uploads", "source.mp4");
      const send = vi.fn().mockResolvedValue({
        Body: new Blob(["video-bytes"]).stream()
      });

      await downloadR2ObjectToFile({
        objectKey: "workspaces/workspace_123/jobs/job_123/source/video.mp4",
        outputPath,
        config: {
          accessKeyId: "access-key",
          secretAccessKey: "secret-key",
          endpoint: "https://account.r2.cloudflarestorage.com",
          bucket: "mediafactory-temp",
          publicBaseUrl: "https://pub-example.r2.dev"
        },
        client: { send }
      });

      await expect(fs.readFile(outputPath, "utf8")).resolves.toBe("video-bytes");
    });
  });
});
