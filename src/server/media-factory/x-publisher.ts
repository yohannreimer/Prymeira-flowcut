import type { XOAuthCredentials, XOAuthTokens } from "./x-oauth";

type FetchLike = typeof fetch;

export type XPublishCredentials = XOAuthCredentials & {
  refreshToken: string;
};

export type XThreadPublishResult = {
  externalIds: string[];
  url: string;
};

export function getXPublishCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): XPublishCredentials | null {
  const clientId = env.X_CLIENT_ID?.trim();
  const clientSecret = env.X_CLIENT_SECRET?.trim();
  const refreshToken = env.X_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  return { clientId, clientSecret, refreshToken };
}

export async function refreshXAccessToken({
  credentials,
  fetch: fetchImpl = fetch
}: {
  credentials: XPublishCredentials;
  fetch?: FetchLike;
}): Promise<XOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: credentials.refreshToken
  });
  const response = await fetchImpl("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`
    },
    body
  });
  await assertOk(response, "X OAuth refresh");

  const payload = (await response.json()) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    token_type?: unknown;
  };
  if (typeof payload.access_token !== "string" || !payload.access_token.trim()) {
    throw new Error("X OAuth refresh did not return an access token");
  }

  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" && payload.refresh_token.trim()
      ? payload.refresh_token
      : credentials.refreshToken,
    ...(typeof payload.expires_in === "number" ? { expiresIn: payload.expires_in } : {}),
    ...(typeof payload.token_type === "string" ? { tokenType: payload.token_type } : {})
  };
}

export async function publishXThread({
  posts,
  credentials,
  fetch: fetchImpl = fetch
}: {
  posts: string[];
  credentials: XPublishCredentials;
  fetch?: FetchLike;
}): Promise<XThreadPublishResult> {
  const cleanPosts = posts.map((post) => post.trim()).filter(Boolean);
  if (cleanPosts.length === 0) {
    throw new Error("X thread must include at least one post");
  }

  const tokens = await refreshXAccessToken({ credentials, fetch: fetchImpl });
  const externalIds: string[] = [];

  for (const [index, text] of cleanPosts.entries()) {
    const previousPostId = externalIds[index - 1];
    const response = await fetchImpl("https://api.x.com/2/tweets", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokens.accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        text,
        ...(previousPostId ? { reply: { in_reply_to_tweet_id: previousPostId } } : {})
      })
    });
    await assertOk(response, `X post ${index + 1}`);

    const payload = (await response.json()) as { data?: { id?: unknown } };
    if (typeof payload.data?.id !== "string" || !payload.data.id.trim()) {
      throw new Error(`X post ${index + 1} did not return a post id`);
    }
    externalIds.push(payload.data.id);
  }

  return {
    externalIds,
    url: `https://x.com/i/web/status/${externalIds[0]}`
  };
}

async function assertOk(response: Response, label: string): Promise<void> {
  if (response.ok) return;

  const body = await response.text().catch(() => "");
  throw new Error(`${label} failed with status ${response.status}${body ? `: ${body}` : ""}`);
}
