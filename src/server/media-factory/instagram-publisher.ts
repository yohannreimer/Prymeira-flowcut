type FetchLike = typeof fetch;

export type InstagramPublishCredentials = {
  igUserId: string;
  accessToken: string;
  graphApiVersion: string;
};

export type InstagramReelPublishResult = {
  externalId: string;
  containerId: string;
  url?: string;
};

const defaultGraphApiVersion = "v24.0";
const defaultPollAttempts = 24;
const defaultPollIntervalMs = 5000;

export function getInstagramCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): InstagramPublishCredentials | null {
  const igUserId = env.INSTAGRAM_IG_USER_ID?.trim();
  const accessToken = env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const graphApiVersion = env.INSTAGRAM_GRAPH_API_VERSION?.trim() || defaultGraphApiVersion;

  if (!igUserId || !accessToken) {
    return null;
  }

  return { igUserId, accessToken, graphApiVersion };
}

export async function publishInstagramReel({
  videoUrl,
  caption,
  credentials,
  fetch: fetchImpl = fetch,
  pollAttempts = defaultPollAttempts,
  pollIntervalMs = defaultPollIntervalMs
}: {
  videoUrl: string;
  caption: string;
  credentials: InstagramPublishCredentials;
  fetch?: FetchLike;
  pollAttempts?: number;
  pollIntervalMs?: number;
}): Promise<InstagramReelPublishResult> {
  const containerId = await createReelContainer({
    videoUrl,
    caption,
    credentials,
    fetch: fetchImpl
  });

  await waitForContainer({
    containerId,
    credentials,
    fetch: fetchImpl,
    pollAttempts,
    pollIntervalMs
  });

  const externalId = await publishContainer({
    containerId,
    credentials,
    fetch: fetchImpl
  });
  const url = await readPermalink({
    mediaId: externalId,
    credentials,
    fetch: fetchImpl
  });

  return {
    externalId,
    containerId,
    ...(url ? { url } : {})
  };
}

async function createReelContainer({
  videoUrl,
  caption,
  credentials,
  fetch
}: {
  videoUrl: string;
  caption: string;
  credentials: InstagramPublishCredentials;
  fetch: FetchLike;
}): Promise<string> {
  const body = new URLSearchParams({
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    access_token: credentials.accessToken
  });
  const response = await fetch(graphUrl(credentials, `/${credentials.igUserId}/media`), {
    method: "POST",
    body
  });
  await assertOk(response, "Instagram create container");

  const payload = (await response.json()) as { id?: unknown };
  if (typeof payload.id !== "string" || !payload.id.trim()) {
    throw new Error("Instagram create container did not return a container id");
  }
  return payload.id;
}

async function waitForContainer({
  containerId,
  credentials,
  fetch,
  pollAttempts,
  pollIntervalMs
}: {
  containerId: string;
  credentials: InstagramPublishCredentials;
  fetch: FetchLike;
  pollAttempts: number;
  pollIntervalMs: number;
}): Promise<void> {
  for (let attempt = 1; attempt <= pollAttempts; attempt += 1) {
    const url = graphUrl(credentials, `/${containerId}`);
    url.searchParams.set("fields", "status_code");
    url.searchParams.set("access_token", credentials.accessToken);
    const response = await fetch(url);
    await assertOk(response, "Instagram container status");
    const payload = (await response.json()) as { status_code?: unknown };
    const status = typeof payload.status_code === "string" ? payload.status_code : "";

    if (status === "FINISHED") {
      return;
    }
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`Instagram Reel container failed with status ${status}`);
    }
    if (attempt < pollAttempts && pollIntervalMs > 0) {
      await sleep(pollIntervalMs);
    }
  }

  throw new Error(`Instagram Reel container was not ready after ${pollAttempts} status check(s)`);
}

async function publishContainer({
  containerId,
  credentials,
  fetch
}: {
  containerId: string;
  credentials: InstagramPublishCredentials;
  fetch: FetchLike;
}): Promise<string> {
  const body = new URLSearchParams({
    creation_id: containerId,
    access_token: credentials.accessToken
  });
  const response = await fetch(graphUrl(credentials, `/${credentials.igUserId}/media_publish`), {
    method: "POST",
    body
  });
  await assertOk(response, "Instagram media_publish");

  const payload = (await response.json()) as { id?: unknown };
  if (typeof payload.id !== "string" || !payload.id.trim()) {
    throw new Error("Instagram media_publish did not return a media id");
  }
  return payload.id;
}

async function readPermalink({
  mediaId,
  credentials,
  fetch
}: {
  mediaId: string;
  credentials: InstagramPublishCredentials;
  fetch: FetchLike;
}): Promise<string | undefined> {
  const url = graphUrl(credentials, `/${mediaId}`);
  url.searchParams.set("fields", "permalink");
  url.searchParams.set("access_token", credentials.accessToken);
  const response = await fetch(url);
  await assertOk(response, "Instagram permalink");
  const payload = (await response.json()) as { permalink?: unknown };
  return typeof payload.permalink === "string" && payload.permalink.trim() ? payload.permalink : undefined;
}

function graphUrl(credentials: InstagramPublishCredentials, path: string): URL {
  return new URL(`https://graph.facebook.com/${credentials.graphApiVersion}${path}`);
}

async function assertOk(response: Response, label: string): Promise<void> {
  if (response.ok) return;

  const body = await response.text().catch(() => "");
  throw new Error(`${label} failed with status ${response.status}${body ? `: ${body}` : ""}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
