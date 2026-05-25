import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import express from "express";
import { z } from "zod";
import type { PrymeiraTenantContext } from "../prymeira/tenant";
import { getYouTubeClientConfigFromEnv, writeStoredYouTubeOAuthCredentials } from "../youtube/oauth-credentials";
import { sanitizeObjectKeyPart } from "../media-factory-saas/storage-keys";

const YOUTUBE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const YOUTUBE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";

const startOAuthSchema = z.object({
  returnTo: z.string().optional()
}).default({});

type FetchLike = typeof fetch;

type StoredOAuthState = {
  workspaceId: string | null;
  redirectUri: string;
  returnTo: string;
  createdAt: string;
};

export function createYouTubeOAuthRouter(options: {
  workspaceRoot: string;
  requireTenantAccess?: (authorization: string | undefined) => Promise<PrymeiraTenantContext>;
  fetch?: FetchLike;
}) {
  const router = express.Router();
  const fetchImpl = options.fetch ?? fetch;

  router.post("/start", async (req, res, next) => {
    try {
      const clientConfig = getYouTubeClientConfigFromEnv();
      if (!clientConfig) {
        res.status(400).json({ error: "Configure YOUTUBE_CLIENT_ID e YOUTUBE_CLIENT_SECRET antes de conectar o YouTube." });
        return;
      }

      const tenant = options.requireTenantAccess
        ? await options.requireTenantAccess(resolveAuthorization(req))
        : null;
      const bodyResult = startOAuthSchema.safeParse(req.body ?? {});
      if (!bodyResult.success) {
        res.status(400).json({ error: "Invalid YouTube OAuth payload" });
        return;
      }

      const state = randomBytes(32).toString("base64url");
      const redirectUri = `${resolveRequestOrigin(req)}/api/youtube/oauth/callback`;
      const returnTo = normalizeReturnTo(bodyResult.data.returnTo);
      await writeOAuthState(options.workspaceRoot, state, {
        workspaceId: tenant?.workspaceId ?? null,
        redirectUri,
        returnTo,
        createdAt: new Date().toISOString()
      });

      const authorizationUrl = new URL(YOUTUBE_AUTH_URL);
      authorizationUrl.search = new URLSearchParams({
        response_type: "code",
        client_id: clientConfig.clientId,
        redirect_uri: redirectUri,
        scope: YOUTUBE_UPLOAD_SCOPE,
        state,
        access_type: "offline",
        prompt: "consent"
      }).toString();

      res.json({ authorizationUrl: authorizationUrl.toString() });
    } catch (error) {
      next(error);
    }
  });

  router.get("/callback", async (req, res, next) => {
    try {
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      if (!code || !state) {
        res.status(400).send("YouTube OAuth callback is missing code or state.");
        return;
      }

      const storedState = await readOAuthState(options.workspaceRoot, state);
      if (!storedState) {
        res.status(400).send("YouTube OAuth state expired or invalid.");
        return;
      }

      const clientConfig = getYouTubeClientConfigFromEnv();
      if (!clientConfig) {
        res.status(400).send("YouTube OAuth client is not configured.");
        return;
      }

      const tokenPayload = await exchangeAuthorizationCode({
        code,
        redirectUri: storedState.redirectUri,
        clientId: clientConfig.clientId,
        clientSecret: clientConfig.clientSecret,
        fetch: fetchImpl
      });
      await writeStoredYouTubeOAuthCredentials({
        workspaceRoot: options.workspaceRoot,
        workspaceId: storedState.workspaceId,
        refreshToken: tokenPayload.refreshToken
      });
      await deleteOAuthState(options.workspaceRoot, state);

      res.redirect(appendQueryFlag(storedState.returnTo, "youtube", "connected"));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function exchangeAuthorizationCode({
  code,
  redirectUri,
  clientId,
  clientSecret,
  fetch: fetchImpl
}: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  fetch: FetchLike;
}): Promise<{ refreshToken: string }> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  });
  const response = await fetchImpl(YOUTUBE_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  const payload = (await response.json().catch(() => ({}))) as {
    refresh_token?: unknown;
    error?: unknown;
    error_description?: unknown;
  };
  if (!response.ok) {
    const detail = typeof payload.error_description === "string" ? payload.error_description : payload.error;
    throw new Error(`Falha ao conectar YouTube${detail ? `: ${String(detail)}` : ""}`);
  }
  if (typeof payload.refresh_token !== "string" || !payload.refresh_token.trim()) {
    throw new Error("O Google não retornou refresh token. Tente conectar novamente aceitando o consentimento offline.");
  }
  return { refreshToken: payload.refresh_token.trim() };
}

async function writeOAuthState(workspaceRoot: string, state: string, value: StoredOAuthState): Promise<void> {
  const statePath = getOAuthStatePath(workspaceRoot, state);
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readOAuthState(workspaceRoot: string, state: string): Promise<StoredOAuthState | null> {
  try {
    const raw = await readFile(getOAuthStatePath(workspaceRoot, state), "utf8");
    const parsed = JSON.parse(raw) as StoredOAuthState;
    if (!parsed.redirectUri || !parsed.returnTo) return null;
    return parsed;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function deleteOAuthState(workspaceRoot: string, state: string): Promise<void> {
  await rm(getOAuthStatePath(workspaceRoot, state), { force: true }).catch(() => undefined);
}

function getOAuthStatePath(workspaceRoot: string, state: string): string {
  return path.join(workspaceRoot, ".oauth", "youtube", `${sanitizeObjectKeyPart(state, "state")}.json`);
}

function resolveRequestOrigin(req: express.Request): string {
  const origin = req.get("origin")?.trim();
  if (origin) return origin.replace(/\/+$/, "");
  const host = req.get("host") ?? "localhost:4317";
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return `${forwardedProto || req.protocol}://${host}`;
}

function normalizeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function appendQueryFlag(returnTo: string, key: string, value: string): string {
  const url = new URL(returnTo, "http://flowcut.local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}

function resolveAuthorization(req: express.Request): string | undefined {
  const authorization = req.get("authorization");
  if (authorization) return authorization;
  const sessionCookie = parseCookieValue(req.get("cookie"), "__session");
  return sessionCookie ? `Bearer ${sessionCookie}` : undefined;
}

function parseCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = part.split("=");
    if (rawName?.trim() !== name) continue;
    const rawValue = rawValueParts.join("=").trim();
    if (!rawValue) return undefined;
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return undefined;
}
