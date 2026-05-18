import { describe, expect, it, vi } from "vitest";
import { publishXThread, refreshXAccessToken } from "./x-publisher";

describe("refreshXAccessToken", () => {
  it("exchanges a refresh token for a fresh X access token", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        access_token: "fresh-access",
        refresh_token: "fresh-refresh",
        expires_in: 7200,
        token_type: "bearer"
      }), { status: 200 })
    );

    await expect(
      refreshXAccessToken({
        credentials: {
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token"
        },
        fetch
      })
    ).resolves.toMatchObject({
      accessToken: "fresh-access",
      refreshToken: "fresh-refresh"
    });

    expect(fetch).toHaveBeenCalledWith("https://api.x.com/2/oauth2/token", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        authorization: expect.stringContaining("Basic ")
      })
    }));
    const body = fetch.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("refresh-token");
  });
});

describe("publishXThread", () => {
  it("publishes a thread by replying each post to the previous post", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "fresh-access",
        refresh_token: "fresh-refresh"
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "post-1", text: "Post 1" } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "post-2", text: "Post 2" } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "post-3", text: "Post 3" } }), { status: 201 }));

    const result = await publishXThread({
      posts: ["Post 1", "Post 2", "Post 3"],
      credentials: {
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token"
      },
      fetch
    });

    expect(result).toEqual({
      externalIds: ["post-1", "post-2", "post-3"],
      url: "https://x.com/i/web/status/post-1"
    });
    expect(fetch.mock.calls[1][0]).toBe("https://api.x.com/2/tweets");
    expect(JSON.parse(fetch.mock.calls[1][1].body as string)).toEqual({ text: "Post 1" });
    expect(JSON.parse(fetch.mock.calls[2][1].body as string)).toEqual({
      text: "Post 2",
      reply: { in_reply_to_tweet_id: "post-1" }
    });
    expect(JSON.parse(fetch.mock.calls[3][1].body as string)).toEqual({
      text: "Post 3",
      reply: { in_reply_to_tweet_id: "post-2" }
    });
  });
});
