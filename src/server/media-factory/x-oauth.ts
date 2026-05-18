import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";

const xOAuthScopes = ["tweet.read", "tweet.write", "users.read", "offline.access"] as const;

type FetchLike = typeof fetch;

export type XOAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

export type XOAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  tokenType?: string;
};

export const defaultXOAuthRedirectUri = "http://127.0.0.1:8787/x/oauth/callback";

export function getXOAuthCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): XOAuthCredentials | null {
  const clientId = env.X_CLIENT_ID?.trim();
  const clientSecret = env.X_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

export function formatXTokenEnvSnippet(tokens: XOAuthTokens): string {
  return [
    `X_ACCESS_TOKEN=${tokens.accessToken}`,
    `X_REFRESH_TOKEN=${tokens.refreshToken}`
  ].join("\n");
}

export async function runXOAuthLocalAuthorization({
  credentials,
  redirectUri = defaultXOAuthRedirectUri,
  fetch: fetchImpl = fetch,
  onAuthorizationUrl
}: {
  credentials: XOAuthCredentials;
  redirectUri?: string;
  fetch?: FetchLike;
  onAuthorizationUrl?: (url: URL) => void;
}): Promise<XOAuthTokens> {
  const codeVerifier = createXCodeVerifier();
  const codeChallenge = createXCodeChallenge(codeVerifier);
  const state = createXOAuthState();
  const authorizationUrl = buildXAuthorizationUrl({
    clientId: credentials.clientId,
    redirectUri,
    codeChallenge,
    state
  });
  const callbackUrl = new URL(redirectUri);

  const { server, callbackPromise } = await startXOAuthCallbackServer({
    callbackPath: callbackUrl.pathname,
    port: Number(callbackUrl.port),
    expectedState: state
  });

  try {
    onAuthorizationUrl?.(authorizationUrl);
    const code = await callbackPromise;
    return await exchangeXAuthorizationCode({
      ...credentials,
      redirectUri,
      code,
      codeVerifier,
      fetch: fetchImpl
    });
  } finally {
    await closeServer(server);
  }
}

async function startXOAuthCallbackServer({
  callbackPath,
  port,
  expectedState
}: {
  callbackPath: string;
  port: number;
  expectedState: string;
}): Promise<{ server: Server; callbackPromise: Promise<string> }> {
  let resolveCallback: (code: string) => void;
  let rejectCallback: (error: Error) => void;
  const callbackPromise = new Promise<string>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    if (requestUrl.pathname !== callbackPath) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const error = requestUrl.searchParams.get("error");
    if (error) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("Autorizacao do X negada. Pode fechar esta aba.");
      rejectCallback(new Error(`X OAuth callback returned error: ${error}`));
      return;
    }

    const state = requestUrl.searchParams.get("state");
    const code = requestUrl.searchParams.get("code");
    if (state !== expectedState || !code) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("Callback invalido. Volte ao terminal e tente de novo.");
      rejectCallback(new Error("X OAuth callback returned invalid state or missing code"));
      return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<h1>MediaFactory conectado ao X</h1><p>Pode fechar esta aba e voltar ao terminal.</p>");
    resolveCallback(code);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return { server, callbackPromise };
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export function buildXAuthorizationUrl({
  clientId,
  redirectUri,
  codeChallenge,
  state
}: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): URL {
  const url = new URL("https://twitter.com/i/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", xOAuthScopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

export function createXCodeVerifier(): string {
  return randomBytes(64).toString("base64url");
}

export function createXCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

export function createXOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export async function exchangeXAuthorizationCode({
  clientId,
  clientSecret,
  redirectUri,
  code,
  codeVerifier,
  fetch: fetchImpl = fetch
}: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
  fetch?: FetchLike;
}): Promise<XOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });
  const response = await fetchImpl("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
    },
    body
  });
  await assertOk(response, "X OAuth token exchange");

  const payload = (await response.json()) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    token_type?: unknown;
  };
  if (typeof payload.access_token !== "string" || !payload.access_token.trim()) {
    throw new Error("X OAuth token exchange did not return an access token");
  }
  if (typeof payload.refresh_token !== "string" || !payload.refresh_token.trim()) {
    throw new Error("X OAuth token exchange did not return a refresh token");
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    ...(typeof payload.expires_in === "number" ? { expiresIn: payload.expires_in } : {}),
    ...(typeof payload.token_type === "string" ? { tokenType: payload.token_type } : {})
  };
}

async function assertOk(response: Response, label: string): Promise<void> {
  if (response.ok) return;

  const body = await response.text().catch(() => "");
  throw new Error(`${label} failed with status ${response.status}${body ? `: ${body}` : ""}`);
}
