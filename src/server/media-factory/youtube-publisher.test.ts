import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempDir } from "../../test/fixtures";
import { publishYouTubeVideo, refreshYouTubeAccessToken } from "./youtube-publisher";

describe("refreshYouTubeAccessToken", () => {
  it("exchanges a refresh token for an access token", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "access-123" }), { status: 200 })
    );

    await expect(
      refreshYouTubeAccessToken({
        credentials: {
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token"
        },
        fetch
      })
    ).resolves.toBe("access-123");

    expect(fetch).toHaveBeenCalledWith("https://oauth2.googleapis.com/token", expect.objectContaining({
      method: "POST"
    }));
    const body = fetch.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("refresh-token");
  });

  it("returns a reconnect message when the refresh token was revoked", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        error: "invalid_grant",
        error_description: "Token has been expired or revoked."
      }), { status: 400 })
    );

    await expect(
      refreshYouTubeAccessToken({
        credentials: {
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "revoked-token"
        },
        fetch
      })
    ).rejects.toThrow("Reconecte sua conta do YouTube");
  });
});

describe("publishYouTubeVideo", () => {
  it("uploads a video with title, description, hashtags, private status and thumbnail", async () => {
    await withTempDir("media-factory-youtube-upload-", async (dir) => {
      const videoPath = path.join(dir, "youtube.mp4");
      const thumbnailPath = path.join(dir, "thumbnail.png");
      await fs.writeFile(videoPath, "video-bytes");
      await fs.writeFile(thumbnailPath, "thumbnail-bytes");
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access-123" }), { status: 200 }))
        .mockResolvedValueOnce(new Response(null, {
          status: 200,
          headers: { location: "https://upload.youtube.test/session" }
        }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: "video-123" }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ kind: "youtube#thumbnailSetResponse" }), { status: 200 }));

      const result = await publishYouTubeVideo({
        videoPath,
        thumbnailPath,
        title: "Titulo forte",
        description: "Descricao",
        hashtags: ["#negocios", "#youtube"],
        privacyStatus: "private",
        credentials: {
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token"
        },
        fetch
      });

      expect(result).toEqual({
        externalId: "video-123",
        url: "https://www.youtube.com/watch?v=video-123"
      });
      expect(fetch.mock.calls[1][0].toString()).toBe(
        "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet%2Cstatus&uploadType=resumable"
      );
      expect(JSON.parse(fetch.mock.calls[1][1].body as string)).toMatchObject({
        snippet: {
          title: "Titulo forte",
          description: "Descricao",
          tags: ["negocios", "youtube"],
          categoryId: "22"
        },
        status: {
          privacyStatus: "private",
          selfDeclaredMadeForKids: false
        }
      });
      expect(fetch.mock.calls[2][0]).toBe("https://upload.youtube.test/session");
      expect(fetch.mock.calls[2][1]).toMatchObject({ method: "PUT" });
      expect(fetch.mock.calls[3][0].toString()).toBe(
        "https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=video-123"
      );
      expect(fetch.mock.calls[3][1]).toMatchObject({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer access-123",
          "content-type": "image/png"
        })
      });
    });
  });

  it("sends publishAt when scheduling a private YouTube upload", async () => {
    await withTempDir("media-factory-youtube-scheduled-upload-", async (dir) => {
      const videoPath = path.join(dir, "short.mp4");
      await fs.writeFile(videoPath, "short-bytes");
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access-123" }), { status: 200 }))
        .mockResolvedValueOnce(new Response(null, {
          status: 200,
          headers: { location: "https://upload.youtube.test/scheduled-session" }
        }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: "scheduled-short-123" }), { status: 200 }));

      await publishYouTubeVideo({
        videoPath,
        title: "Short agendado",
        description: "Descricao",
        hashtags: ["#shorts"],
        privacyStatus: "private",
        publishAt: "2026-05-12T15:00:00.000Z",
        credentials: {
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token"
        },
        fetch
      });

      expect(JSON.parse(fetch.mock.calls[1][1].body as string)).toMatchObject({
        status: {
          privacyStatus: "private",
          publishAt: "2026-05-12T15:00:00.000Z",
          selfDeclaredMadeForKids: false
        }
      });
    });
  });

  it("sends the thumbnail content type from the selected file extension", async () => {
    await withTempDir("media-factory-youtube-thumbnail-type-", async (dir) => {
      const videoPath = path.join(dir, "youtube.mp4");
      const thumbnailPath = path.join(dir, "thumbnail.jpg");
      await fs.writeFile(videoPath, "video-bytes");
      await fs.writeFile(thumbnailPath, "thumbnail-bytes");
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access-123" }), { status: 200 }))
        .mockResolvedValueOnce(new Response(null, {
          status: 200,
          headers: { location: "https://upload.youtube.test/session" }
        }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: "video-123" }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ kind: "youtube#thumbnailSetResponse" }), { status: 200 }));

      await publishYouTubeVideo({
        videoPath,
        thumbnailPath,
        title: "Titulo forte",
        description: "Descricao",
        hashtags: [],
        credentials: {
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token"
        },
        fetch
      });

      expect(fetch.mock.calls[3][1].headers).toMatchObject({
        "content-type": "image/jpeg"
      });
    });
  });
});
