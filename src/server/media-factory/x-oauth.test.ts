import { describe, expect, it, vi } from "vitest";
import {
  buildXAuthorizationUrl,
  createXCodeChallenge,
  exchangeXAuthorizationCode,
  formatXTokenEnvSnippet,
  getXOAuthCredentialsFromEnv
} from "./x-oauth";

describe("buildXAuthorizationUrl", () => {
  it("builds the OAuth authorization URL with write and offline scopes", () => {
    const url = buildXAuthorizationUrl({
      clientId: "client-id",
      redirectUri: "http://127.0.0.1:8787/x/oauth/callback",
      codeChallenge: "challenge-123",
      state: "state-123"
    });

    expect(url.origin).toBe("https://twitter.com");
    expect(url.pathname).toBe("/i/oauth2/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:8787/x/oauth/callback");
    expect(url.searchParams.get("scope")).toBe("tweet.read tweet.write users.read offline.access");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-123");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("createXCodeChallenge", () => {
  it("creates a base64url SHA-256 challenge from the verifier", () => {
    expect(createXCodeChallenge("verifier")).toBe("iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ");
  });
});

describe("exchangeXAuthorizationCode", () => {
  it("exchanges an authorization code for access and refresh tokens", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 7200,
        token_type: "bearer"
      }), { status: 200 })
    );

    const tokens = await exchangeXAuthorizationCode({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://127.0.0.1:8787/x/oauth/callback",
      code: "code-123",
      codeVerifier: "verifier-123",
      fetch
    });

    expect(tokens).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 7200,
      tokenType: "bearer"
    });
    expect(fetch).toHaveBeenCalledWith("https://api.x.com/2/oauth2/token", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "content-type": "application/x-www-form-urlencoded",
        authorization: expect.stringContaining("Basic ")
      })
    }));
    const body = fetch.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("code-123");
    expect(body.get("redirect_uri")).toBe("http://127.0.0.1:8787/x/oauth/callback");
    expect(body.get("code_verifier")).toBe("verifier-123");
  });
});

describe("getXOAuthCredentialsFromEnv", () => {
  it("reads X OAuth credentials from env", () => {
    expect(getXOAuthCredentialsFromEnv({
      X_CLIENT_ID: " client-id ",
      X_CLIENT_SECRET: " client-secret "
    })).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret"
    });
  });

  it("returns null when credentials are missing", () => {
    expect(getXOAuthCredentialsFromEnv({ X_CLIENT_ID: "", X_CLIENT_SECRET: "" })).toBeNull();
  });
});

describe("formatXTokenEnvSnippet", () => {
  it("formats tokens as env lines", () => {
    expect(formatXTokenEnvSnippet({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 7200,
      tokenType: "bearer"
    })).toContain("X_REFRESH_TOKEN=refresh-token");
  });
});
