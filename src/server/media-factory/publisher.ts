import fs from "node:fs/promises";
import path from "node:path";
import type { MediaFactoryConfig } from "./config";
import { createMediaFactoryFolders } from "./files";
import { mediaFactoryManifestSchema, updateManifest, writeManifest, type MediaFactoryManifest } from "./manifest";
import { silentProgressReporter, type ProgressReporter } from "./progress";
import {
  getYouTubeCredentialsFromEnv,
  publishYouTubeVideo as defaultPublishYouTubeVideo,
  type YouTubeOAuthCredentials,
  type YouTubePublishResult
} from "./youtube-publisher";
import {
  getXPublishCredentialsFromEnv,
  publishXThread as defaultPublishXThread,
  type XPublishCredentials,
  type XThreadPublishResult
} from "./x-publisher";

export { getYouTubeCredentialsFromEnv };

export type DryRunPublishItem = {
  platform: string;
  mode: "dry-run";
  status: "ready" | "blocked";
  files: string[];
  missing: string[];
};

export type DryRunPublishPackage = {
  id: string;
  packageDir: string;
  pipeline: MediaFactoryManifest["pipeline"];
  status: "ready" | "blocked";
  items: DryRunPublishItem[];
};

export type DryRunPublishReport = {
  generatedAt: string;
  summary: {
    packages: number;
    ready: number;
    blocked: number;
  };
  packages: DryRunPublishPackage[];
};

type PublisherMode = MediaFactoryConfig["publishers"][keyof MediaFactoryConfig["publishers"]];

export type PublishItem = {
  platform: string;
  mode: Exclude<PublisherMode, "disabled">;
  status: "ready" | "blocked" | "published";
  files: string[];
  missing: string[];
  externalId?: string;
  url?: string;
};

export type PublishPackage = {
  id: string;
  packageDir: string;
  pipeline: MediaFactoryManifest["pipeline"];
  status: "ready" | "blocked";
  items: PublishItem[];
};

export type PublishReport = {
  generatedAt: string;
  summary: {
    packages: number;
    ready: number;
    blocked: number;
    livePublished: number;
  };
  packages: PublishPackage[];
};

type PublishApprovedPackagesDeps = {
  publishYouTubeVideo?: typeof defaultPublishYouTubeVideo;
  publishXThread?: typeof defaultPublishXThread;
};

const selectedThumbnailDir = "youtube/thumb-selected";
const ambiguousSelectedThumbnailMessage = "youtube/thumb-selected: deixe exatamente 1 imagem";
const thumbnailImageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const youtubeShortsLedgerRelativePath = path.join("Logs", "youtube-shorts-ledger.json");
const youtubeShortsTimeZone = "America/Sao_Paulo";
const youtubeShortsDailySlotHours = [12, 19] as const;
const xThreadLedgerRelativePath = path.join("Logs", "x-thread-ledger.json");

type YouTubeShortsLedgerEntry = {
  clipKey: string;
  packageId: string;
  clipPath: string;
  videoPath: string;
  scheduledAt: string;
  externalId: string;
  url: string;
  status: "scheduled" | "published";
  createdAt: string;
  title: string;
};

type YouTubeShortsLedger = {
  version: 1;
  entries: YouTubeShortsLedgerEntry[];
};

type YouTubeShortsPayload = {
  video?: unknown;
  title?: unknown;
  description?: unknown;
  hashtags?: unknown;
  privacyStatus?: unknown;
};

type XThreadLedgerEntry = {
  threadKey: string;
  packageId: string;
  threadPath: string;
  externalIds: string[];
  url: string;
  createdAt: string;
  postCount: number;
};

type XThreadLedger = {
  version: 1;
  entries: XThreadLedgerEntry[];
};

export async function dryRunApprovedPackages({
  rootDir,
  now = new Date(),
  progress = silentProgressReporter
}: {
  rootDir: string;
  now?: Date;
  progress?: ProgressReporter;
}): Promise<DryRunPublishReport> {
  const folders = await createMediaFactoryFolders({
    inputDir: path.join(rootDir, "Entrada"),
    outputDir: path.join(rootDir, "Saida")
  });
  const packageDirs = await listApprovedPackageDirs(folders.approvedDir);
  const packages = await Promise.all(packageDirs.map((packageDir) => dryRunPackage(packageDir)));
  const report = {
    generatedAt: now.toISOString(),
    summary: {
      packages: packages.length,
      ready: packages.filter((pkg) => pkg.status === "ready").length,
      blocked: packages.filter((pkg) => pkg.status === "blocked").length
    },
    packages
  };

  await fs.mkdir(path.join(rootDir, "Logs"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "Logs", "ultimo-dry-run-publicacao.json"), `${JSON.stringify(report, null, 2)}\n`);
  progress.info(`Dry-run publicacao: ${report.summary.ready} pronto(s), ${report.summary.blocked} bloqueado(s)`);

  return report;
}

export async function publishApprovedPackages({
  rootDir,
  publishers,
  youtubeCredentials = getYouTubeCredentialsFromEnv(),
  xCredentials = getXPublishCredentialsFromEnv(),
  deps = {},
  now = new Date(),
  progress = silentProgressReporter
}: {
  rootDir: string;
  publishers: MediaFactoryConfig["publishers"];
  youtubeCredentials?: YouTubeOAuthCredentials | null;
  xCredentials?: XPublishCredentials | null;
  deps?: PublishApprovedPackagesDeps;
  now?: Date;
  progress?: ProgressReporter;
}): Promise<PublishReport> {
  const folders = await createMediaFactoryFolders({
    inputDir: path.join(rootDir, "Entrada"),
    outputDir: path.join(rootDir, "Saida")
  });
  const publishYouTubeVideo = deps.publishYouTubeVideo ?? defaultPublishYouTubeVideo;
  const publishXThread = deps.publishXThread ?? defaultPublishXThread;
  const packageDirs = await listApprovedPackageDirs(folders.approvedDir);
  const packages: PublishPackage[] = [];

  for (const packageDir of packageDirs) {
    progress.info(`Conferindo pacote: ${path.basename(packageDir)}`);
    packages.push(
      await publishPackage({
        packageDir,
        rootDir,
        publishers,
        youtubeCredentials,
        xCredentials,
        publishYouTubeVideo,
        publishXThread,
        progress,
        now
      })
    );
  }

  const report = {
    generatedAt: now.toISOString(),
    summary: {
      packages: packages.length,
      ready: packages.filter((pkg) => pkg.status === "ready").length,
      blocked: packages.filter((pkg) => pkg.status === "blocked").length,
      livePublished: packages.flatMap((pkg) => pkg.items).filter((item) => item.status === "published").length
    },
    packages
  };

  await fs.mkdir(path.join(rootDir, "Logs"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "Logs", "ultimo-publicacao.json"), `${JSON.stringify(report, null, 2)}\n`);
  progress.info(
    `Publicacao: ${report.summary.ready} pronto(s), ${report.summary.blocked} bloqueado(s), ${report.summary.livePublished} publicado(s)`
  );

  return report;
}

async function dryRunPackage(packageDir: string): Promise<DryRunPublishPackage> {
  const manifest = await readManifest(path.join(packageDir, "manifest.json"));
  if (manifest.status !== "approved") {
    return {
      id: manifest.id,
      packageDir,
      pipeline: manifest.pipeline,
      status: "blocked",
      items: [
        {
          platform: "manifest",
          mode: "dry-run",
          status: "blocked",
          files: [],
          missing: [`status:${manifest.status}`]
        }
      ]
    };
  }

  const items = await Promise.all(createPublishItems(manifest).map((item) => validatePublishItem(packageDir, item)));
  const status = items.some((item) => item.status === "blocked") ? "blocked" : "ready";

  return {
    id: manifest.id,
    packageDir,
    pipeline: manifest.pipeline,
    status,
    items
  };
}

async function publishPackage({
  packageDir,
  rootDir,
  publishers,
  youtubeCredentials,
  xCredentials,
  publishYouTubeVideo,
  publishXThread,
  progress,
  now
}: {
  packageDir: string;
  rootDir: string;
  publishers: MediaFactoryConfig["publishers"];
  youtubeCredentials: YouTubeOAuthCredentials | null;
  xCredentials: XPublishCredentials | null;
  publishYouTubeVideo: typeof defaultPublishYouTubeVideo;
  publishXThread: typeof defaultPublishXThread;
  progress: ProgressReporter;
  now: Date;
}): Promise<PublishPackage> {
  const manifestPath = path.join(packageDir, "manifest.json");
  const manifest = await readManifest(manifestPath);
  if (manifest.status !== "approved") {
    return {
      id: manifest.id,
      packageDir,
      pipeline: manifest.pipeline,
      status: "blocked",
      items: [
        {
          platform: "manifest",
          mode: "dry-run",
          status: "blocked",
          files: [],
          missing: [`status:${manifest.status}`]
        }
      ]
    };
  }

  const items = (
    await Promise.all(
      createPublishItems(manifest)
        .map((item) => applyPublisherMode(item, publishers))
        .filter((item): item is PublishItem => item !== null)
        .map((item) => validatePublishItem(packageDir, item))
    )
  ) as PublishItem[];

  for (const item of items) {
    if (item.mode !== "live" || item.status === "blocked") {
      continue;
    }

    if (item.platform === "x") {
      if (!xCredentials) {
        item.status = "blocked";
        item.missing = ["X_CLIENT_ID", "X_CLIENT_SECRET", "X_REFRESH_TOKEN"];
        progress.warn("X live bloqueado: credenciais OAuth ausentes");
        continue;
      }

      const result = await publishXThreadFromPackage({
        rootDir,
        packageDir,
        manifest,
        credentials: xCredentials,
        publishXThread,
        progress,
        now
      });
      if (!result) {
        progress.info("X live: thread ja estava no ledger; pulando");
        continue;
      }

      item.status = "published";
      item.externalId = result.externalIds.join(",");
      item.url = result.url;
      progress.info(`X publicado: ${result.url}`);

      const freshManifest = await readManifest(manifestPath);
      await writeManifest(
        manifestPath,
        updateManifest({ manifest: freshManifest, now }, {
          publishResults: upsertPublishResult(freshManifest, {
            platform: "x",
            mode: "live",
            status: "passed",
            externalId: item.externalId,
            url: item.url,
            retryCount: 0
          })
        })
      );
      continue;
    }

    if (!youtubeCredentials) {
      item.status = "blocked";
      item.missing = ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"];
      progress.warn("YouTube live bloqueado: credenciais OAuth ausentes");
      continue;
    }

    if (item.platform === "youtubeShorts") {
      const results = await publishYouTubeShortsFromPackage({
        rootDir,
        packageDir,
        manifest,
        credentials: youtubeCredentials,
        publishYouTubeVideo,
        progress,
        now
      });
      if (results.length === 0) {
        progress.info("YouTube Shorts: nenhum short novo para publicar");
        continue;
      }

      item.status = "published";
      item.externalId = results.map((result) => result.externalId).join(",");
      item.url = results[results.length - 1]?.url;

      const freshManifest = await readManifest(manifestPath);
      await writeManifest(
        manifestPath,
        updateManifest({ manifest: freshManifest, now }, {
          publishResults: upsertPublishResult(freshManifest, {
            platform: "youtubeShorts",
            mode: "live",
            status: "passed",
            externalId: item.externalId,
            url: item.url,
            retryCount: 0
          })
        })
      );
      continue;
    }

    if (item.platform !== "youtube") {
      continue;
    }

    const selectedThumbnail = await findSelectedYouTubeThumbnail(packageDir);
    if (selectedThumbnail.status === "ambiguous") {
      item.status = "blocked";
      item.missing = [ambiguousSelectedThumbnailMessage];
      progress.warn(`YouTube live bloqueado: ${ambiguousSelectedThumbnailMessage}`);
      continue;
    }
    if (selectedThumbnail.status === "ready") {
      await fs.copyFile(selectedThumbnail.absolutePath, path.join(packageDir, "youtube/thumbnail.png"));
      progress.info(`YouTube live: thumbnail selecionada automaticamente: ${selectedThumbnail.relativePath}`);
    }

    const thumbnailPath = path.join(packageDir, "youtube/thumbnail.png");
    if (await fileExists(thumbnailPath)) {
      progress.info("YouTube live: thumbnail encontrada; sera enviada automaticamente apos o video...");
    }
    progress.info("YouTube live: autenticando e iniciando upload...");
    progress.info("YouTube live: enviando video, isso pode demorar alguns minutos...");
    const result = await publishYouTubeFromPackage({
      packageDir,
      manifest,
      credentials: youtubeCredentials,
      publishYouTubeVideo
    });
    item.status = "published";
    item.externalId = result.externalId;
    item.url = result.url;
    progress.info(`YouTube publicado: ${result.url}`);

    const freshManifest = await readManifest(manifestPath);
    await writeManifest(
      manifestPath,
      updateManifest({ manifest: freshManifest, now }, {
        publishResults: upsertPublishResult(freshManifest, {
          platform: "youtube",
          mode: "live",
          status: "passed",
          externalId: result.externalId,
          url: result.url,
          retryCount: 0
        })
      })
    );
  }

  const status = items.some((item) => item.status === "blocked") ? "blocked" : "ready";
  return {
    id: manifest.id,
    packageDir,
    pipeline: manifest.pipeline,
    status,
    items
  };
}

async function readManifest(manifestPath: string): Promise<MediaFactoryManifest> {
  const raw = await fs.readFile(manifestPath, "utf8");
  return mediaFactoryManifestSchema.parse(JSON.parse(raw));
}

function createPublishItems(manifest: MediaFactoryManifest): DryRunPublishItem[] {
  if (manifest.pipeline === "horizontal_youtube_podcast_x") {
    return [
      createItem("youtube", compactStrings([
        getNestedString(manifest.publishPlan, ["youtube", "video"]),
        "youtube/title.txt",
        "youtube/description.txt",
        "youtube/hashtags.txt",
        "youtube/thumbnail.png"
      ])),
      createItem("spotify", compactStrings([
        getNestedString(manifest.publishPlan, ["spotify", "audio"]),
        "podcast/title.txt",
        "podcast/description.txt"
      ])),
      createItem("x", compactStrings([getNestedString(manifest.publishPlan, ["x", "thread"])]))
    ];
  }

  return [
    createItem("youtubeShorts", getNestedStringArray(manifest.publishPlan, ["youtubeShorts", "clips"])),
    createItem("instagram", getNestedStringArray(manifest.publishPlan, ["instagram", "clips"])),
    createItem("tiktok", getNestedStringArray(manifest.publishPlan, ["tiktok", "clips"]))
  ];
}

function createItem(platform: string, files: string[]): DryRunPublishItem {
  return {
    platform,
    mode: "dry-run",
    status: "ready",
    files,
    missing: []
  };
}

function applyPublisherMode(
  item: DryRunPublishItem,
  publishers: MediaFactoryConfig["publishers"]
): PublishItem | null {
  const mode = getPublisherMode(item.platform, publishers);
  if (mode === "disabled") {
    return null;
  }

  return {
    ...item,
    mode
  };
}

function getPublisherMode(platform: string, publishers: MediaFactoryConfig["publishers"]): PublisherMode {
  switch (platform) {
    case "youtube":
    case "youtubeShorts":
      return publishers.youtube;
    case "instagram":
      return publishers.instagram;
    case "tiktok":
      return publishers.tiktok;
    case "x":
      return publishers.x;
    case "spotify":
      return publishers.spotify;
    default:
      return "dry-run";
  }
}

async function validatePublishItem<T extends DryRunPublishItem | PublishItem>(packageDir: string, item: T): Promise<T> {
  const missing = (
    await Promise.all(
      item.files.map(async (file) => ({
        file,
        exists: await fileExists(path.join(packageDir, file))
      }))
    )
  )
    .filter(({ exists }) => !exists)
    .map(({ file }) => file);

  if (item.platform === "youtube") {
    const selectedThumbnail = await findSelectedYouTubeThumbnail(packageDir);
    if (selectedThumbnail.status === "ambiguous") {
      const missingWithoutThumbnail = missing.filter((file) => file !== "youtube/thumbnail.png");
      return {
        ...item,
        missing: [...missingWithoutThumbnail, ambiguousSelectedThumbnailMessage],
        status: "blocked"
      };
    }

    if (selectedThumbnail.status === "ready") {
      const missingWithoutThumbnail = missing.filter((file) => file !== "youtube/thumbnail.png");
      return {
        ...item,
        missing: missingWithoutThumbnail,
        status: missingWithoutThumbnail.length > 0 ? "blocked" : "ready"
      };
    }
  }

  return {
    ...item,
    missing,
    status: missing.length > 0 ? "blocked" : "ready"
  };
}

async function publishYouTubeFromPackage({
  packageDir,
  manifest,
  credentials,
  publishYouTubeVideo
}: {
  packageDir: string;
  manifest: MediaFactoryManifest;
  credentials: YouTubeOAuthCredentials;
  publishYouTubeVideo: typeof defaultPublishYouTubeVideo;
}): Promise<YouTubePublishResult> {
  const videoPath = path.join(packageDir, getNestedString(manifest.publishPlan, ["youtube", "video"]) ?? "youtube/youtube.mp4");
  const [title, description, chapters, hashtags] = await Promise.all([
    readTextFile(path.join(packageDir, "youtube/title.txt")),
    readTextFile(path.join(packageDir, "youtube/description.txt")),
    readOptionalTextFile(path.join(packageDir, "youtube/chapters.txt")),
    readHashtags(path.join(packageDir, "youtube/hashtags.txt"))
  ]);

  return publishYouTubeVideo({
    videoPath,
    thumbnailPath: await readOptionalPackagePath(packageDir, "youtube/thumbnail.png"),
    title,
    description: appendYouTubeChapters(description, chapters),
    hashtags,
    privacyStatus: await readYouTubePrivacyStatus(path.join(packageDir, "youtube/payload.json")),
    credentials
  });
}

async function publishYouTubeShortsFromPackage({
  rootDir,
  packageDir,
  manifest,
  credentials,
  publishYouTubeVideo,
  progress,
  now
}: {
  rootDir: string;
  packageDir: string;
  manifest: MediaFactoryManifest;
  credentials: YouTubeOAuthCredentials;
  publishYouTubeVideo: typeof defaultPublishYouTubeVideo;
  progress: ProgressReporter;
  now: Date;
}): Promise<YouTubePublishResult[]> {
  let ledger = await readYouTubeShortsLedger(rootDir);
  const results: YouTubePublishResult[] = [];

  for (const clipPath of getNestedStringArray(manifest.publishPlan, ["youtubeShorts", "clips"])) {
    const clipKey = getYouTubeShortClipKey(manifest.id, clipPath);
    if (ledger.entries.some((entry) => entry.clipKey === clipKey)) {
      progress.info(`YouTube Shorts: ${getShortRankLabel(clipPath)} ja estava no ledger; pulando`);
      continue;
    }

    const payload = await readYouTubeShortsPayload(path.join(packageDir, clipPath));
    const scheduledAt = nextYouTubeShortsSlot({ ledger, now });
    progress.info(`YouTube Shorts: enviando ${getShortRankLabel(clipPath)} para agendar...`);
    const result = await publishYouTubeVideo({
      videoPath: path.join(packageDir, payload.video),
      title: payload.title,
      description: payload.description,
      hashtags: payload.hashtags,
      privacyStatus: "private",
      publishAt: scheduledAt,
      credentials
    });

    ledger = {
      version: 1,
      entries: [
        ...ledger.entries,
        {
          clipKey,
          packageId: manifest.id,
          clipPath,
          videoPath: payload.video,
          scheduledAt,
          externalId: result.externalId,
          url: result.url,
          status: "scheduled",
          createdAt: now.toISOString(),
          title: payload.title
        }
      ]
    };
    await writeYouTubeShortsLedger(rootDir, ledger);
    progress.info(`YouTube Shorts: ${getShortRankLabel(clipPath)} agendado para ${formatSaoPauloSlotForLog(scheduledAt)}`);
    results.push(result);
  }

  return results;
}

async function publishXThreadFromPackage({
  rootDir,
  packageDir,
  manifest,
  credentials,
  publishXThread,
  progress,
  now
}: {
  rootDir: string;
  packageDir: string;
  manifest: MediaFactoryManifest;
  credentials: XPublishCredentials;
  publishXThread: typeof defaultPublishXThread;
  progress: ProgressReporter;
  now: Date;
}): Promise<XThreadPublishResult | null> {
  const threadPath = getNestedString(manifest.publishPlan, ["x", "thread"]) ?? "x/thread.json";
  const threadKey = `${manifest.id}::${threadPath}`;
  const ledger = await readXThreadLedger(rootDir);
  if (ledger.entries.some((entry) => entry.threadKey === threadKey)) {
    return null;
  }

  const posts = await readXThreadPosts(path.join(packageDir, threadPath));
  progress.info(`X live: publicando thread com ${posts.length} post(s)...`);
  const result = await publishXThread({ posts, credentials });
  await writeXThreadLedger(rootDir, {
    version: 1,
    entries: [
      ...ledger.entries,
      {
        threadKey,
        packageId: manifest.id,
        threadPath,
        externalIds: result.externalIds,
        url: result.url,
        createdAt: now.toISOString(),
        postCount: posts.length
      }
    ]
  });

  return result;
}

async function readXThreadPosts(filePath: string): Promise<string[]> {
  const payload = JSON.parse(await fs.readFile(filePath, "utf8")) as { posts?: unknown };
  const posts = Array.isArray(payload.posts)
    ? payload.posts.filter((post): post is string => typeof post === "string" && post.trim().length > 0).map((post) => post.trim())
    : [];

  if (posts.length === 0) {
    throw new Error(`Thread do X invalida: ${filePath}`);
  }

  return posts;
}

async function readXThreadLedger(rootDir: string): Promise<XThreadLedger> {
  try {
    const raw = await fs.readFile(path.join(rootDir, xThreadLedgerRelativePath), "utf8");
    const parsed = JSON.parse(raw) as Partial<XThreadLedger>;
    return {
      version: 1,
      entries: Array.isArray(parsed.entries) ? parsed.entries.filter(isXThreadLedgerEntry) : []
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { version: 1, entries: [] };
    }
    throw error;
  }
}

async function writeXThreadLedger(rootDir: string, ledger: XThreadLedger): Promise<void> {
  const ledgerPath = path.join(rootDir, xThreadLedgerRelativePath);
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  await fs.writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
}

function isXThreadLedgerEntry(value: unknown): value is XThreadLedgerEntry {
  return typeof value === "object"
    && value !== null
    && typeof (value as XThreadLedgerEntry).threadKey === "string"
    && Array.isArray((value as XThreadLedgerEntry).externalIds);
}

async function readYouTubeShortsPayload(filePath: string): Promise<{
  video: string;
  title: string;
  description: string;
  hashtags: string[];
}> {
  const payload = JSON.parse(await fs.readFile(filePath, "utf8")) as YouTubeShortsPayload;
  const video = typeof payload.video === "string" && payload.video.trim() ? payload.video.trim() : null;
  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : null;
  const description = typeof payload.description === "string" && payload.description.trim() ? payload.description.trim() : null;
  const hashtags = Array.isArray(payload.hashtags)
    ? payload.hashtags.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];

  if (!video || !title || !description) {
    throw new Error(`Payload de YouTube Shorts invalido: ${filePath}`);
  }

  return { video, title, description, hashtags };
}

async function readYouTubeShortsLedger(rootDir: string): Promise<YouTubeShortsLedger> {
  try {
    const raw = await fs.readFile(path.join(rootDir, youtubeShortsLedgerRelativePath), "utf8");
    const parsed = JSON.parse(raw) as Partial<YouTubeShortsLedger>;
    return {
      version: 1,
      entries: Array.isArray(parsed.entries) ? parsed.entries.filter(isYouTubeShortsLedgerEntry) : []
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { version: 1, entries: [] };
    }
    throw error;
  }
}

async function writeYouTubeShortsLedger(rootDir: string, ledger: YouTubeShortsLedger): Promise<void> {
  const ledgerPath = path.join(rootDir, youtubeShortsLedgerRelativePath);
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  await fs.writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
}

function isYouTubeShortsLedgerEntry(value: unknown): value is YouTubeShortsLedgerEntry {
  return typeof value === "object"
    && value !== null
    && typeof (value as YouTubeShortsLedgerEntry).clipKey === "string"
    && typeof (value as YouTubeShortsLedgerEntry).scheduledAt === "string";
}

function getYouTubeShortClipKey(packageId: string, clipPath: string): string {
  return `${packageId}::${clipPath}`;
}

function nextYouTubeShortsSlot({ ledger, now }: { ledger: YouTubeShortsLedger; now: Date }): string {
  const usedSlots = new Set(ledger.entries.map((entry) => getSaoPauloSlotKey(new Date(entry.scheduledAt))));
  const startDateKey = getSaoPauloDateParts(now).dateKey;

  for (let dayOffset = 0; dayOffset < 365; dayOffset += 1) {
    const dateKey = addDaysToDateKey(startDateKey, dayOffset);
    for (const hour of youtubeShortsDailySlotHours) {
      const slotIso = saoPauloSlotToUtcIso(dateKey, hour);
      if (new Date(slotIso).getTime() <= now.getTime()) {
        continue;
      }

      const slotKey = `${dateKey}T${String(hour).padStart(2, "0")}:00`;
      if (!usedSlots.has(slotKey)) {
        return slotIso;
      }
    }
  }

  throw new Error("Nao foi possivel encontrar slot livre para YouTube Shorts nos proximos 365 dias");
}

function getSaoPauloSlotKey(date: Date): string {
  const parts = getSaoPauloDateParts(date);
  return `${parts.dateKey}T${String(parts.hour).padStart(2, "0")}:00`;
}

function getSaoPauloDateParts(date: Date): { dateKey: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: youtubeShortsTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour"))
  };
}

function saoPauloSlotToUtcIso(dateKey: string, hour: number): string {
  return new Date(`${dateKey}T${String(hour).padStart(2, "0")}:00:00-03:00`).toISOString();
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatSaoPauloSlotForLog(isoString: string): string {
  const parts = getSaoPauloDateParts(new Date(isoString));
  return `${parts.dateKey} ${String(parts.hour).padStart(2, "0")}:00 (${youtubeShortsTimeZone})`;
}

function getShortRankLabel(clipPath: string): string {
  return clipPath.split("/").find((part) => /^rank-\d+$/i.test(part)) ?? path.basename(path.dirname(clipPath));
}

async function readOptionalPackagePath(packageDir: string, relativePath: string): Promise<string | null> {
  const absolutePath = path.join(packageDir, relativePath);
  return await fileExists(absolutePath) ? absolutePath : null;
}

async function findSelectedYouTubeThumbnail(packageDir: string): Promise<
  | { status: "none" }
  | { status: "ready"; absolutePath: string; relativePath: string }
  | { status: "ambiguous" }
> {
  const absoluteDir = path.join(packageDir, selectedThumbnailDir);
  let entries;
  try {
    entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { status: "none" };
    }
    throw error;
  }

  const images = entries
    .filter((entry) => entry.isFile() && thumbnailImageExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  if (images.length === 0) {
    return { status: "none" };
  }

  if (images.length > 1) {
    return { status: "ambiguous" };
  }

  return {
    status: "ready",
    absolutePath: path.join(absoluteDir, images[0]),
    relativePath: path.join(selectedThumbnailDir, images[0])
  };
}

function upsertPublishResult(
  manifest: MediaFactoryManifest,
  result: MediaFactoryManifest["publishResults"][number]
): MediaFactoryManifest["publishResults"] {
  return [
    ...manifest.publishResults.filter(
      (existing) => !(existing.platform === result.platform && existing.mode === result.mode)
    ),
    result
  ];
}

async function readTextFile(filePath: string): Promise<string> {
  return (await fs.readFile(filePath, "utf8")).trim();
}

async function readOptionalTextFile(filePath: string): Promise<string | null> {
  try {
    const value = await readTextFile(filePath);
    return value || null;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function appendYouTubeChapters(description: string, chapters: string | null): string {
  if (!chapters) {
    return description;
  }

  return `${description.trim()}\n\nCapitulos:\n${chapters.trim()}`;
}

async function readHashtags(filePath: string): Promise<string[]> {
  return (await readTextFile(filePath))
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

async function readYouTubePrivacyStatus(filePath: string): Promise<"private" | "unlisted" | "public"> {
  try {
    const payload = JSON.parse(await fs.readFile(filePath, "utf8")) as { privacyStatus?: unknown };
    return payload.privacyStatus === "public" || payload.privacyStatus === "unlisted" || payload.privacyStatus === "private"
      ? payload.privacyStatus
      : "private";
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "private";
    }
    throw error;
  }
}

function getNestedString(value: unknown, pathSegments: string[]): string | null {
  let current = value;
  for (const segment of pathSegments) {
    if (typeof current !== "object" || current === null || !(segment in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === "string" && current.trim() ? current : null;
}

function getNestedStringArray(value: unknown, pathSegments: string[]): string[] {
  let current = value;
  for (const segment of pathSegments) {
    if (typeof current !== "object" || current === null || !(segment in current)) {
      return [];
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return Array.isArray(current) ? current.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function compactStrings(values: Array<string | null>): string[] {
  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

async function listApprovedPackageDirs(approvedDir: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(approvedDir, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(approvedDir, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
