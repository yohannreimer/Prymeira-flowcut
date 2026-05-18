import fs from "node:fs/promises";

export type YouTubeOAuthCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

export type YouTubePublishResult = {
  externalId: string;
  url: string;
};

type FetchLike = typeof fetch;

export async function refreshYouTubeAccessToken({
  credentials,
  fetch: fetchImpl = fetch
}: {
  credentials: YouTubeOAuthCredentials;
  fetch?: FetchLike;
}): Promise<string> {
  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: credentials.refreshToken,
    grant_type: "refresh_token"
  });
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  await assertOk(response, "YouTube OAuth refresh");

  const payload = (await response.json()) as { access_token?: unknown };
  if (typeof payload.access_token !== "string" || !payload.access_token.trim()) {
    throw new Error("YouTube OAuth refresh did not return an access token");
  }
  return payload.access_token;
}

export async function publishYouTubeVideo({
  videoPath,
  thumbnailPath,
  title,
  description,
  hashtags,
  privacyStatus = "private",
  publishAt,
  credentials,
  fetch: fetchImpl = fetch
}: {
  videoPath: string;
  thumbnailPath?: string | null;
  title: string;
  description: string;
  hashtags: string[];
  privacyStatus?: "private" | "unlisted" | "public";
  publishAt?: string | null;
  credentials: YouTubeOAuthCredentials;
  fetch?: FetchLike;
}): Promise<YouTubePublishResult> {
  const accessToken = await refreshYouTubeAccessToken({ credentials, fetch: fetchImpl });
  const videoBytes = await fs.readFile(videoPath);
  const initResponse = await fetchImpl(
    new URL("https://www.googleapis.com/upload/youtube/v3/videos?part=snippet%2Cstatus&uploadType=resumable"),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-length": String(videoBytes.byteLength),
        "x-upload-content-type": "video/mp4"
      },
      body: JSON.stringify({
        snippet: {
          title,
          description,
          tags: hashtags.map((hashtag) => hashtag.replace(/^#/, "")).filter(Boolean),
          categoryId: "22"
        },
        status: {
          privacyStatus,
          ...(publishAt ? { publishAt } : {}),
          selfDeclaredMadeForKids: false
        }
      })
    }
  );
  await assertOk(initResponse, "YouTube resumable upload init");

  const uploadUrl = initResponse.headers.get("location");
  if (!uploadUrl) {
    throw new Error("YouTube resumable upload did not return a session URL");
  }

  const uploadResponse = await fetchImpl(uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": "video/mp4",
      "content-length": String(videoBytes.byteLength)
    },
    body: new Blob([videoBytes])
  });
  await assertOk(uploadResponse, "YouTube video upload");

  const uploaded = (await uploadResponse.json()) as { id?: unknown };
  if (typeof uploaded.id !== "string" || !uploaded.id.trim()) {
    throw new Error("YouTube video upload did not return a video id");
  }

  if (thumbnailPath) {
    await setYouTubeThumbnail({
      videoId: uploaded.id,
      thumbnailPath,
      accessToken,
      fetch: fetchImpl
    });
  }

  return {
    externalId: uploaded.id,
    url: `https://www.youtube.com/watch?v=${uploaded.id}`
  };
}

async function setYouTubeThumbnail({
  videoId,
  thumbnailPath,
  accessToken,
  fetch: fetchImpl
}: {
  videoId: string;
  thumbnailPath: string;
  accessToken: string;
  fetch: FetchLike;
}): Promise<void> {
  const thumbnailBytes = await fs.readFile(thumbnailPath);
  const response = await fetchImpl(
    new URL(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "image/png",
        "content-length": String(thumbnailBytes.byteLength)
      },
      body: new Blob([thumbnailBytes])
    }
  );
  await assertOk(response, "YouTube thumbnail upload");
}

async function assertOk(response: Response, label: string): Promise<void> {
  if (response.ok) return;

  const body = await response.text().catch(() => "");
  throw new Error(`${label} failed with status ${response.status}${body ? `: ${body}` : ""}`);
}
