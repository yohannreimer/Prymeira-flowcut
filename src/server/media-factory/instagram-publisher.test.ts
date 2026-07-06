import { describe, expect, it, vi } from "vitest";
import {
  getInstagramCredentialsFromEnv,
  publishInstagramReel
} from "./instagram-publisher";

describe("getInstagramCredentialsFromEnv", () => {
  it("reads Instagram credentials from env", () => {
    expect(getInstagramCredentialsFromEnv({
      INSTAGRAM_IG_USER_ID: " 17841400000000000 ",
      INSTAGRAM_ACCESS_TOKEN: " token ",
      INSTAGRAM_GRAPH_API_VERSION: " v24.0 "
    })).toEqual({
      igUserId: "17841400000000000",
      accessToken: "token",
      graphApiVersion: "v24.0"
    });
  });

  it("returns null when a required value is missing", () => {
    expect(getInstagramCredentialsFromEnv({
      INSTAGRAM_IG_USER_ID: "17841400000000000",
      INSTAGRAM_ACCESS_TOKEN: ""
    })).toBeNull();
  });
});

describe("publishInstagramReel", () => {
  it("creates a Reel container, waits until it is ready, publishes it, and reads the permalink", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "container-123" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status_code: "IN_PROGRESS" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "media-123" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ permalink: "https://www.instagram.com/reel/abc123/" }), { status: 200 }));

    const result = await publishInstagramReel({
      videoUrl: "https://pub-example.r2.dev/instagram/package/rank-01/clip.mp4",
      caption: "Legenda #reels",
      credentials: {
        igUserId: "17841400000000000",
        accessToken: "access-token",
        graphApiVersion: "v24.0"
      },
      pollIntervalMs: 0,
      fetch
    });

    expect(result).toEqual({
      externalId: "media-123",
      containerId: "container-123",
      url: "https://www.instagram.com/reel/abc123/"
    });
    expect(fetch.mock.calls[0][0].toString()).toBe("https://graph.facebook.com/v24.0/17841400000000000/media");
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST" });
    const createBody = fetch.mock.calls[0][1].body as URLSearchParams;
    expect(createBody.get("media_type")).toBe("REELS");
    expect(createBody.get("video_url")).toBe("https://pub-example.r2.dev/instagram/package/rank-01/clip.mp4");
    expect(createBody.get("caption")).toBe("Legenda #reels");
    expect(createBody.get("access_token")).toBe("access-token");
    expect(fetch.mock.calls[1][0].toString()).toBe(
      "https://graph.facebook.com/v24.0/container-123?fields=status_code&access_token=access-token"
    );
    expect(fetch.mock.calls[3][0].toString()).toBe("https://graph.facebook.com/v24.0/17841400000000000/media_publish");
    const publishBody = fetch.mock.calls[3][1].body as URLSearchParams;
    expect(publishBody.get("creation_id")).toBe("container-123");
  });

  it("fails when the container reports an error", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "container-123" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status_code: "ERROR" }), { status: 200 }));

    await expect(
      publishInstagramReel({
        videoUrl: "https://pub-example.r2.dev/clip.mp4",
        caption: "Legenda",
        credentials: {
          igUserId: "17841400000000000",
          accessToken: "access-token",
          graphApiVersion: "v24.0"
        },
        pollIntervalMs: 0,
        fetch
      })
    ).rejects.toThrow("Instagram Reel container failed with status ERROR");
  });

  it("includes Graph API response bodies in errors", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Invalid OAuth access token." } }), { status: 400 })
    );

    await expect(
      publishInstagramReel({
        videoUrl: "https://pub-example.r2.dev/clip.mp4",
        caption: "Legenda",
        credentials: {
          igUserId: "17841400000000000",
          accessToken: "bad-token",
          graphApiVersion: "v24.0"
        },
        fetch
      })
    ).rejects.toThrow("Instagram create container failed with status 400");
  });
});
