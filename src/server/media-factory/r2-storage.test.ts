import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempDir } from "../../test/fixtures";
import {
  buildR2PublicUrl,
  createR2ObjectKey,
  getR2ConfigFromEnv,
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
