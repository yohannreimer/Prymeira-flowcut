import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../../test/fixtures";
import { createInitialManifest, writeManifest } from "./manifest";
import { publishApprovedPackages, dryRunApprovedPackages } from "./publisher";

async function createApprovedHorizontalPackage(rootDir: string) {
  const packageDir = path.join(rootDir, "Saida", "approved", "2026-05-12 - Horizontal - Aula");
  await fs.mkdir(path.join(packageDir, "youtube"), { recursive: true });
  await fs.mkdir(path.join(packageDir, "podcast"), { recursive: true });
  await fs.mkdir(path.join(packageDir, "x"), { recursive: true });
  await fs.writeFile(path.join(packageDir, "youtube/youtube.mp4"), "video");
  await fs.writeFile(path.join(packageDir, "youtube/title.txt"), "Titulo\n");
  await fs.writeFile(path.join(packageDir, "youtube/description.txt"), "Descricao\n");
  await fs.writeFile(path.join(packageDir, "youtube/hashtags.txt"), "#aula\n");
  await fs.writeFile(path.join(packageDir, "youtube/chapters.txt"), "00:00 Inicio\n00:30 Ideia principal\n01:10 Fechamento\n");
  await fs.writeFile(path.join(packageDir, "youtube/thumbnail.png"), "thumbnail");
  await fs.writeFile(path.join(packageDir, "podcast/podcast-audio.mp3"), "audio");
  await fs.writeFile(path.join(packageDir, "podcast/title.txt"), "Podcast\n");
  await fs.writeFile(path.join(packageDir, "podcast/description.txt"), "Descricao podcast\n");
      await fs.writeFile(path.join(packageDir, "x/thread.json"), JSON.stringify({ posts: ["Post 1"] }));

  const manifest = createInitialManifest({
    id: "2026-05-12 - Horizontal - Aula",
    status: "approved",
    source: {
      path: path.join(rootDir, "Processados", "aula.mp4"),
      hash: "abcdef1234567890",
      orientation: "horizontal",
      durationSec: 60,
      width: 1920,
      height: 1080,
      hasAudio: true
    },
    pipeline: "horizontal_youtube_podcast_x",
    now: new Date("2026-05-12T12:00:00.000Z")
  });
  await writeManifest(path.join(packageDir, "manifest.json"), {
    ...manifest,
    outputs: [],
    publishPlan: {
      youtube: { mode: "dry-run", video: "youtube/youtube.mp4" },
      spotify: { mode: "dry-run", audio: "podcast/podcast-audio.mp3" },
      x: { mode: "dry-run", thread: "x/thread.json" }
    }
  });

  return packageDir;
}

async function createApprovedVerticalPackage(rootDir: string, clipCount = 1) {
  const packageDir = path.join(rootDir, "Saida", "approved", "2026-05-12 - Shorts - Corte");
  const clipDirs = Array.from({ length: clipCount }, (_, index) => `shorts/rank-${String(index + 1).padStart(2, "0")}`);
  for (const [index, clipDir] of clipDirs.entries()) {
    await fs.mkdir(path.join(packageDir, clipDir), { recursive: true });
    await fs.writeFile(path.join(packageDir, clipDir, "clip.mp4"), `video-${index + 1}`);
    await fs.writeFile(path.join(packageDir, clipDir, "youtube-shorts-payload.json"), JSON.stringify({
      video: `${clipDir}/clip.mp4`,
      title: `Short ${index + 1}`,
      description: `Descricao short ${index + 1}`,
      hashtags: ["#shorts", "#mediafactory"],
      privacyStatus: "private"
    }));
    await fs.writeFile(path.join(packageDir, clipDir, "instagram-reels-payload.json"), "{}");
    await fs.writeFile(path.join(packageDir, clipDir, "tiktok-payload.json"), "{}");
  }

  const manifest = createInitialManifest({
    id: "2026-05-12 - Shorts - Corte",
    status: "approved",
    source: {
      path: path.join(rootDir, "Processados", "short.mp4"),
      hash: "fedcba9876543210",
      orientation: "vertical",
      durationSec: 30,
      width: 1080,
      height: 1920,
      hasAudio: true
    },
    pipeline: "vertical_short_clips",
    now: new Date("2026-05-12T12:00:00.000Z")
  });
  await writeManifest(path.join(packageDir, "manifest.json"), {
    ...manifest,
    outputs: [],
    publishPlan: {
      youtubeShorts: { mode: "dry-run", clips: clipDirs.map((clipDir) => `${clipDir}/youtube-shorts-payload.json`) },
      instagram: { mode: "dry-run", clips: clipDirs.map((clipDir) => `${clipDir}/instagram-reels-payload.json`) },
      tiktok: { mode: "dry-run", clips: clipDirs.map((clipDir) => `${clipDir}/tiktok-payload.json`) }
    }
  });

  return packageDir;
}

describe("dryRunApprovedPackages", () => {
  it("validates approved packages and writes a dry-run report", async () => {
    await withTempDir("media-factory-publisher-", async (rootDir) => {
      await createApprovedHorizontalPackage(rootDir);
      await createApprovedVerticalPackage(rootDir);

      const result = await dryRunApprovedPackages({
        rootDir,
        now: new Date("2026-05-12T13:00:00.000Z")
      });

      expect(result.summary).toEqual({ packages: 2, ready: 2, blocked: 0 });
      expect(result.packages.map((pkg) => pkg.id)).toEqual([
        "2026-05-12 - Horizontal - Aula",
        "2026-05-12 - Shorts - Corte"
      ]);
      expect(result.packages[0].items.map((item) => item.platform)).toEqual(["youtube", "spotify", "x"]);
      expect(result.packages[1].items.map((item) => item.platform)).toEqual(["youtubeShorts", "instagram", "tiktok"]);

      const reportPath = path.join(rootDir, "Logs", "ultimo-dry-run-publicacao.json");
      await expect(fs.readFile(reportPath, "utf8")).resolves.toContain('"blocked": 0');
    });
  });

  it("blocks packages with missing required files", async () => {
    await withTempDir("media-factory-publisher-missing-", async (rootDir) => {
      await createApprovedHorizontalPackage(rootDir);
      await fs.rm(path.join(rootDir, "Saida", "approved", "2026-05-12 - Horizontal - Aula", "youtube/youtube.mp4"));

      const result = await dryRunApprovedPackages({
        rootDir,
        now: new Date("2026-05-12T13:00:00.000Z")
      });

      expect(result.summary).toEqual({ packages: 1, ready: 0, blocked: 1 });
      expect(result.packages[0].status).toBe("blocked");
      expect(result.packages[0].items[0]).toMatchObject({
        platform: "youtube",
        status: "blocked",
        missing: ["youtube/youtube.mp4"]
      });
    });
  });
});

describe("publishApprovedPackages", () => {
  it("publishes approved horizontal YouTube packages in live mode and records the result", async () => {
    await withTempDir("media-factory-publisher-live-youtube-", async (rootDir) => {
      await createApprovedHorizontalPackage(rootDir);
      const progressLines: string[] = [];
      const uploadedInputs: Array<{ description: string; thumbnailPath?: string | null }> = [];
      const publishYouTubeVideo = async (input: { description: string; thumbnailPath?: string | null }) => {
        uploadedInputs.push(input);
        return {
          externalId: "video-123",
          url: "https://www.youtube.com/watch?v=video-123"
        };
      };

      const result = await publishApprovedPackages({
        rootDir,
        publishers: {
          youtube: "live",
          instagram: "dry-run",
          tiktok: "dry-run",
          x: "dry-run",
          spotify: "dry-run"
        },
        youtubeCredentials: {
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token"
        },
        deps: { publishYouTubeVideo },
        now: new Date("2026-05-12T13:00:00.000Z"),
        progress: {
          info: (message) => progressLines.push(message),
          warn: (message) => progressLines.push(message),
          poll: (message) => progressLines.push(message)
        }
      });

      expect(result.summary).toEqual({ packages: 1, ready: 1, blocked: 0, livePublished: 1 });
      expect(progressLines).toEqual(expect.arrayContaining([
        "Conferindo pacote: 2026-05-12 - Horizontal - Aula",
        "YouTube live: thumbnail encontrada; sera enviada automaticamente apos o video...",
        "YouTube live: autenticando e iniciando upload...",
        "YouTube live: enviando video, isso pode demorar alguns minutos..."
      ]));
      expect(result.packages[0].items[0]).toMatchObject({
        platform: "youtube",
        mode: "live",
        status: "published",
        externalId: "video-123"
      });
      const manifest = JSON.parse(
        await fs.readFile(path.join(rootDir, "Saida", "approved", "2026-05-12 - Horizontal - Aula", "manifest.json"), "utf8")
      );
      expect(manifest.publishResults).toEqual([
        {
          platform: "youtube",
          mode: "live",
          status: "passed",
          externalId: "video-123",
          url: "https://www.youtube.com/watch?v=video-123",
          retryCount: 0
        }
      ]);
      expect(uploadedInputs[0].description).toContain("Descricao");
      expect(uploadedInputs[0].description).toContain("00:00 Inicio");
      expect(uploadedInputs[0].description).toContain("00:30 Ideia principal");
      expect(uploadedInputs[0].thumbnailPath).toContain(path.join("youtube", "thumbnail.png"));
      expect(progressLines).toContain("YouTube publicado: https://www.youtube.com/watch?v=video-123");
    });
  });

  it("uses the only thumbnail left in thumb-selected before publishing YouTube live", async () => {
    await withTempDir("media-factory-publisher-live-youtube-selected-thumb-", async (rootDir) => {
      const packageDir = await createApprovedHorizontalPackage(rootDir);
      await fs.rm(path.join(packageDir, "youtube/thumbnail.png"));
      await fs.mkdir(path.join(packageDir, "youtube/thumb-selected"), { recursive: true });
      await fs.writeFile(path.join(packageDir, "youtube/thumb-selected/escolhida.png"), "selected-thumbnail");
      const progressLines: string[] = [];
      const uploadedInputs: Array<{ thumbnailPath?: string | null }> = [];
      const publishYouTubeVideo = async (input: { thumbnailPath?: string | null }) => {
        uploadedInputs.push(input);
        return {
          externalId: "video-123",
          url: "https://www.youtube.com/watch?v=video-123"
        };
      };

      const result = await publishApprovedPackages({
        rootDir,
        publishers: {
          youtube: "live",
          instagram: "dry-run",
          tiktok: "dry-run",
          x: "dry-run",
          spotify: "dry-run"
        },
        youtubeCredentials: {
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token"
        },
        deps: { publishYouTubeVideo },
        now: new Date("2026-05-12T13:00:00.000Z"),
        progress: {
          info: (message) => progressLines.push(message),
          warn: (message) => progressLines.push(message),
          poll: (message) => progressLines.push(message)
        }
      });

      expect(result.summary).toEqual({ packages: 1, ready: 1, blocked: 0, livePublished: 1 });
      expect(progressLines).toContain(
        "YouTube live: thumbnail selecionada automaticamente: youtube/thumb-selected/escolhida.png"
      );
      expect(uploadedInputs[0].thumbnailPath).toContain(path.join("youtube", "thumbnail.png"));
      await expect(fs.readFile(path.join(packageDir, "youtube/thumbnail.png"), "utf8")).resolves.toBe("selected-thumbnail");
    });
  });

  it("blocks YouTube publishing when thumb-selected has more than one thumbnail", async () => {
    await withTempDir("media-factory-publisher-live-youtube-many-selected-thumbs-", async (rootDir) => {
      const packageDir = await createApprovedHorizontalPackage(rootDir);
      await fs.mkdir(path.join(packageDir, "youtube/thumb-selected"), { recursive: true });
      await fs.writeFile(path.join(packageDir, "youtube/thumb-selected/a.png"), "a");
      await fs.writeFile(path.join(packageDir, "youtube/thumb-selected/b.jpg"), "b");

      const result = await publishApprovedPackages({
        rootDir,
        publishers: {
          youtube: "live",
          instagram: "dry-run",
          tiktok: "dry-run",
          x: "dry-run",
          spotify: "dry-run"
        },
        youtubeCredentials: {
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token"
        },
        deps: {
          publishYouTubeVideo: async () => {
            throw new Error("should not publish with ambiguous thumbnail selection");
          }
        },
        now: new Date("2026-05-12T13:00:00.000Z")
      });

      expect(result.summary).toEqual({ packages: 1, ready: 0, blocked: 1, livePublished: 0 });
      expect(result.packages[0].items[0]).toMatchObject({
        platform: "youtube",
        status: "blocked",
        missing: ["youtube/thumb-selected: deixe exatamente 1 imagem"]
      });
    });
  });

  it("blocks live YouTube publishing when OAuth credentials are missing", async () => {
    await withTempDir("media-factory-publisher-live-youtube-missing-", async (rootDir) => {
      await createApprovedHorizontalPackage(rootDir);

      const result = await publishApprovedPackages({
        rootDir,
        publishers: {
          youtube: "live",
          instagram: "dry-run",
          tiktok: "dry-run",
          x: "dry-run",
          spotify: "dry-run"
        },
        youtubeCredentials: null,
        now: new Date("2026-05-12T13:00:00.000Z")
      });

      expect(result.summary).toEqual({ packages: 1, ready: 0, blocked: 1, livePublished: 0 });
      expect(result.packages[0].items[0]).toMatchObject({
        platform: "youtube",
        mode: "live",
        status: "blocked",
        missing: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"]
      });
    });
  });

  it("publishes approved X thread packages in live mode and records the local ledger", async () => {
    await withTempDir("media-factory-publisher-live-x-", async (rootDir) => {
      await createApprovedHorizontalPackage(rootDir);
      const progressLines: string[] = [];
      const publishedThreads: string[][] = [];
      const publishXThread = async (input: { posts: string[] }) => {
        publishedThreads.push(input.posts);
        return {
          externalIds: ["post-1"],
          url: "https://x.com/i/web/status/post-1"
        };
      };

      const result = await publishApprovedPackages({
        rootDir,
        publishers: {
          youtube: "dry-run",
          instagram: "dry-run",
          tiktok: "dry-run",
          x: "live",
          spotify: "dry-run"
        },
        xCredentials: {
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token"
        },
        deps: { publishXThread },
        now: new Date("2026-05-12T13:00:00.000Z"),
        progress: {
          info: (message) => progressLines.push(message),
          warn: (message) => progressLines.push(message),
          poll: (message) => progressLines.push(message)
        }
      });

      expect(result.summary).toEqual({ packages: 1, ready: 1, blocked: 0, livePublished: 1 });
      expect(publishedThreads).toEqual([["Post 1"]]);
      expect(progressLines).toContain("X live: publicando thread com 1 post(s)...");
      expect(progressLines).toContain("X publicado: https://x.com/i/web/status/post-1");

      const ledger = JSON.parse(await fs.readFile(path.join(rootDir, "Logs", "x-thread-ledger.json"), "utf8"));
      expect(ledger.entries).toEqual([
        expect.objectContaining({
          threadKey: "2026-05-12 - Horizontal - Aula::x/thread.json",
          packageId: "2026-05-12 - Horizontal - Aula",
          threadPath: "x/thread.json",
          externalIds: ["post-1"],
          url: "https://x.com/i/web/status/post-1"
        })
      ]);
    });
  });

  it("skips X threads that already exist in the local ledger", async () => {
    await withTempDir("media-factory-publisher-live-x-ledger-skip-", async (rootDir) => {
      await createApprovedHorizontalPackage(rootDir);
      await fs.mkdir(path.join(rootDir, "Logs"), { recursive: true });
      await fs.writeFile(path.join(rootDir, "Logs", "x-thread-ledger.json"), `${JSON.stringify({
        version: 1,
        entries: [
          {
            threadKey: "2026-05-12 - Horizontal - Aula::x/thread.json",
            packageId: "2026-05-12 - Horizontal - Aula",
            threadPath: "x/thread.json",
            externalIds: ["post-1"],
            url: "https://x.com/i/web/status/post-1",
            createdAt: "2026-05-12T13:00:00.000Z",
            postCount: 1
          }
        ]
      }, null, 2)}\n`);
      const publishXThread = async () => {
        throw new Error("should not repost an X thread already present in ledger");
      };

      const result = await publishApprovedPackages({
        rootDir,
        publishers: {
          youtube: "dry-run",
          instagram: "dry-run",
          tiktok: "dry-run",
          x: "live",
          spotify: "dry-run"
        },
        xCredentials: {
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token"
        },
        deps: { publishXThread },
        now: new Date("2026-05-12T13:00:00.000Z")
      });

      expect(result.summary).toEqual({ packages: 1, ready: 1, blocked: 0, livePublished: 0 });
    });
  });

  it("schedules approved YouTube Shorts in a two-per-day queue and writes the local ledger", async () => {
    await withTempDir("media-factory-publisher-youtube-shorts-schedule-", async (rootDir) => {
      await createApprovedVerticalPackage(rootDir, 3);
      const progressLines: string[] = [];
      const uploadedInputs: Array<{ title: string; videoPath: string; publishAt?: string | null }> = [];
      const publishYouTubeVideo = async (input: { title: string; videoPath: string; publishAt?: string | null }) => {
        uploadedInputs.push(input);
        const id = `short-${uploadedInputs.length}`;
        return {
          externalId: id,
          url: `https://www.youtube.com/watch?v=${id}`
        };
      };

      const result = await publishApprovedPackages({
        rootDir,
        publishers: {
          youtube: "live",
          instagram: "dry-run",
          tiktok: "dry-run",
          x: "dry-run",
          spotify: "dry-run"
        },
        youtubeCredentials: {
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token"
        },
        deps: { publishYouTubeVideo },
        now: new Date("2026-05-12T13:00:00.000Z"),
        progress: {
          info: (message) => progressLines.push(message),
          warn: (message) => progressLines.push(message),
          poll: (message) => progressLines.push(message)
        }
      });

      expect(result.summary).toEqual({ packages: 1, ready: 1, blocked: 0, livePublished: 1 });
      expect(uploadedInputs.map((input) => input.title)).toEqual(["Short 1", "Short 2", "Short 3"]);
      expect(uploadedInputs.map((input) => input.publishAt)).toEqual([
        "2026-05-12T15:00:00.000Z",
        "2026-05-12T22:00:00.000Z",
        "2026-05-13T15:00:00.000Z"
      ]);
      expect(uploadedInputs[0].videoPath).toContain(path.join("shorts", "rank-01", "clip.mp4"));
      expect(progressLines).toContain(
        "YouTube Shorts: rank-01 agendado para 2026-05-12 12:00 (America/Sao_Paulo)"
      );

      const ledger = JSON.parse(await fs.readFile(path.join(rootDir, "Logs", "youtube-shorts-ledger.json"), "utf8"));
      expect(ledger.entries).toHaveLength(3);
      expect(ledger.entries.map((entry: { clipPath: string; scheduledAt: string }) => ({
        clipPath: entry.clipPath,
        scheduledAt: entry.scheduledAt
      }))).toEqual([
        { clipPath: "shorts/rank-01/youtube-shorts-payload.json", scheduledAt: "2026-05-12T15:00:00.000Z" },
        { clipPath: "shorts/rank-02/youtube-shorts-payload.json", scheduledAt: "2026-05-12T22:00:00.000Z" },
        { clipPath: "shorts/rank-03/youtube-shorts-payload.json", scheduledAt: "2026-05-13T15:00:00.000Z" }
      ]);
    });
  });

  it("skips YouTube Shorts that already exist in the local ledger", async () => {
    await withTempDir("media-factory-publisher-youtube-shorts-ledger-skip-", async (rootDir) => {
      await createApprovedVerticalPackage(rootDir, 2);
      await fs.mkdir(path.join(rootDir, "Logs"), { recursive: true });
      await fs.writeFile(path.join(rootDir, "Logs", "youtube-shorts-ledger.json"), `${JSON.stringify({
        version: 1,
        entries: [
          {
            clipKey: "2026-05-12 - Shorts - Corte::shorts/rank-01/youtube-shorts-payload.json",
            packageId: "2026-05-12 - Shorts - Corte",
            clipPath: "shorts/rank-01/youtube-shorts-payload.json",
            videoPath: "shorts/rank-01/clip.mp4",
            scheduledAt: "2026-05-12T15:00:00.000Z",
            externalId: "already-scheduled",
            url: "https://www.youtube.com/watch?v=already-scheduled",
            status: "scheduled",
            createdAt: "2026-05-12T13:00:00.000Z",
            title: "Short 1"
          }
        ]
      }, null, 2)}\n`);
      const uploadedInputs: Array<{ title: string; publishAt?: string | null }> = [];
      const publishYouTubeVideo = async (input: { title: string; publishAt?: string | null }) => {
        uploadedInputs.push(input);
        return {
          externalId: "short-2",
          url: "https://www.youtube.com/watch?v=short-2"
        };
      };

      const result = await publishApprovedPackages({
        rootDir,
        publishers: {
          youtube: "live",
          instagram: "dry-run",
          tiktok: "dry-run",
          x: "dry-run",
          spotify: "dry-run"
        },
        youtubeCredentials: {
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token"
        },
        deps: { publishYouTubeVideo },
        now: new Date("2026-05-12T13:00:00.000Z")
      });

      expect(result.summary).toEqual({ packages: 1, ready: 1, blocked: 0, livePublished: 1 });
      expect(uploadedInputs).toHaveLength(1);
      expect(uploadedInputs[0]).toMatchObject({
        title: "Short 2",
        publishAt: "2026-05-12T22:00:00.000Z"
      });

      const ledger = JSON.parse(await fs.readFile(path.join(rootDir, "Logs", "youtube-shorts-ledger.json"), "utf8"));
      expect(ledger.entries).toHaveLength(2);
      expect(ledger.entries.map((entry: { title: string }) => entry.title)).toEqual(["Short 1", "Short 2"]);
    });
  });
});
