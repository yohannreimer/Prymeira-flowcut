import { readFile } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { describe, expect, it, vi, afterEach } from "vitest";
import { createApp } from "../app";
import { withTempDir } from "../../test/fixtures";

afterEach(() => {
  vi.unstubAllEnvs();
});

function tenantAccess(workspaceId = "workspace_123") {
  return vi.fn().mockResolvedValue({
    token: "clerk-token",
    workspaceId,
    workspaceRole: "owner",
    productKey: "media",
    productRole: "admin",
    plan: "pro",
    limits: {}
  });
}

describe("YouTube OAuth routes", () => {
  it("starts local OAuth with offline consent and stores callback credentials", async () => {
    await withTempDir("flowcut-youtube-oauth-local-", async (dir) => {
      vi.stubEnv("YOUTUBE_CLIENT_ID", "client-id");
      vi.stubEnv("YOUTUBE_CLIENT_SECRET", "client-secret");
      const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        refresh_token: "refresh-local",
        access_token: "access-local",
        expires_in: 3600,
        token_type: "Bearer"
      }), { status: 200 }));
      const app = createApp({ workspaceRoot: dir, runJobs: false, fetch });

      const started = await request(app)
        .post("/api/youtube/oauth/start")
        .set("Origin", "http://127.0.0.1:5180")
        .send({ returnTo: "/?projectId=project_123" });

      expect(started.status).toBe(200);
      const authorizationUrl = new URL(started.body.authorizationUrl);
      expect(authorizationUrl.origin + authorizationUrl.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
      expect(authorizationUrl.searchParams.get("access_type")).toBe("offline");
      expect(authorizationUrl.searchParams.get("prompt")).toBe("consent");
      expect(authorizationUrl.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/youtube.upload");

      const callback = await request(app)
        .get("/api/youtube/oauth/callback")
        .query({ code: "google-code", state: authorizationUrl.searchParams.get("state") });

      expect(callback.status).toBe(302);
      expect(callback.headers.location).toBe("/?projectId=project_123&youtube=connected");
      const stored = JSON.parse(await readFile(path.join(dir, ".integrations", "youtube-oauth.json"), "utf8"));
      expect(stored.refreshToken).toBe("refresh-local");
      const body = fetch.mock.calls[0][1].body as URLSearchParams;
      expect(body.get("redirect_uri")).toBe("http://127.0.0.1:5180/api/youtube/oauth/callback");
    });
  });

  it("stores production OAuth credentials for the authorized workspace", async () => {
    await withTempDir("flowcut-youtube-oauth-tenant-", async (dir) => {
      vi.stubEnv("YOUTUBE_CLIENT_ID", "client-id");
      vi.stubEnv("YOUTUBE_CLIENT_SECRET", "client-secret");
      const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        refresh_token: "refresh-workspace",
        access_token: "access-workspace"
      }), { status: 200 }));
      const app = createApp({
        workspaceRoot: dir,
        runJobs: false,
        requireTenantAccess: tenantAccess("workspace_abc"),
        fetch
      });

      const started = await request(app)
        .post("/api/youtube/oauth/start")
        .set("Authorization", "Bearer clerk-token")
        .set("Origin", "https://flowcut.prymeiradigital.com.br")
        .send({ returnTo: "/?projectId=project_123" });

      const authorizationUrl = new URL(started.body.authorizationUrl);
      await request(app)
        .get("/api/youtube/oauth/callback")
        .query({ code: "google-code", state: authorizationUrl.searchParams.get("state") })
        .expect(302);

      const stored = JSON.parse(await readFile(
        path.join(dir, "workspaces", "workspace_abc", "integrations", "youtube-oauth.json"),
        "utf8"
      ));
      expect(stored.refreshToken).toBe("refresh-workspace");
    });
  });

  it("uses the configured public app URL for production redirect URIs", async () => {
    await withTempDir("flowcut-youtube-oauth-public-url-", async (dir) => {
      vi.stubEnv("YOUTUBE_CLIENT_ID", "client-id");
      vi.stubEnv("YOUTUBE_CLIENT_SECRET", "client-secret");
      const app = createApp({
        workspaceRoot: dir,
        runJobs: false,
        publicAppUrl: "https://flowcut.prymeiradigital.com.br",
        allowedOrigins: ["https://flowcut.prymeiradigital.com.br"],
        requireTenantAccess: tenantAccess("workspace_abc")
      });

      const started = await request(app)
        .post("/api/youtube/oauth/start")
        .set("Authorization", "Bearer clerk-token")
        .set("Host", "evil.example")
        .send({ returnTo: "/projects" })
        .expect(200);

      const authorizationUrl = new URL(started.body.authorizationUrl);

      expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
        "https://flowcut.prymeiradigital.com.br/api/youtube/oauth/callback"
      );
    });
  });
});
