import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { config as loadDotenv, parse as parseDotenv } from "dotenv";
import { probeMedia as defaultProbeMedia, type MediaProbe } from "../media/probe";
import { approveReadyPackages as defaultApproveReadyPackages } from "./approval";
import { loadMediaFactoryConfigFromFile, resolveMediaFactoryConfig, type MediaFactoryConfig } from "./config";
import {
  archiveSourceFile,
  createMediaFactoryFolders,
  discoverSourceFiles,
  getFileSha256 as defaultGetFileSha256,
  isStableFile as defaultIsStableFile
} from "./files";
import {
  dryRunApprovedPackages as defaultDryRunApprovedPackages,
  getYouTubeCredentialsFromEnv,
  publishApprovedPackages as defaultPublishApprovedPackages
} from "./publisher";
import {
  processHorizontalPackage as defaultProcessHorizontalPackage,
  type ProcessHorizontalPackageInput
} from "./horizontal-pipeline";
import { createProgressReporter, silentProgressReporter, type ProgressReporter } from "./progress";
import { routeMedia } from "./router";
import { ensureSupoClipReady as defaultEnsureSupoClipReady } from "./supoclip-service";
import {
  processVerticalPackage as defaultProcessVerticalPackage,
  type ProcessVerticalPackageInput
} from "./vertical-pipeline";
import {
  formatXTokenEnvSnippet,
  getXOAuthCredentialsFromEnv,
  runXOAuthLocalAuthorization
} from "./x-oauth";
import {
  createR2ObjectKey,
  deleteR2Object,
  getR2ConfigFromEnv,
  uploadFileToR2
} from "./r2-storage";

type BackgroundMusicConfig = MediaFactoryConfig["backgroundMusic"];

type RunMediaFactoryOnceDeps = {
  processHorizontalPackage?: (input: ProcessHorizontalPackageInput) => Promise<unknown>;
  processVerticalPackage?: (input: ProcessVerticalPackageInput) => Promise<unknown>;
  progress?: ProgressReporter;
  probeMedia?: (filePath: string) => Promise<MediaProbe>;
  getFileSha256?: (filePath: string) => Promise<string>;
  isStableFile?: (filePath: string) => Promise<boolean>;
  ensureSupoClipReady?: (supoclip: MediaFactoryConfig["supoclip"]) => Promise<void>;
};

export type RunMediaFactoryOnceInput = {
  rootDir: string;
  backgroundMusic?: Partial<BackgroundMusicConfig> & {
    selection?: "random";
  };
  deps?: RunMediaFactoryOnceDeps;
};

export type MediaFactorySkippedFile = {
  sourcePath: string;
  reason: "file is still changing" | "supoclip is disabled for vertical files";
};

export type RunMediaFactoryOnceResult = {
  processed: number;
  skipped: MediaFactorySkippedFile[];
};

export async function runMediaFactoryOnce(input: RunMediaFactoryOnceInput): Promise<RunMediaFactoryOnceResult> {
  const configPath = path.join(input.rootDir, "config.json");
  const loadedConfig = await loadMediaFactoryConfigFromFile(configPath, { rootDir: input.rootDir });
  const config = input.backgroundMusic
    ? resolveMediaFactoryConfig({
        ...loadedConfig,
        backgroundMusic: {
          ...loadedConfig.backgroundMusic,
          ...input.backgroundMusic
        }
      })
    : loadedConfig;
  const progress = input.deps?.progress ?? silentProgressReporter;
  progress.info("Config carregada");
  const folders = await createMediaFactoryFolders({ inputDir: config.inputDir, outputDir: config.outputDir });

  const processHorizontalPackage = input.deps?.processHorizontalPackage ?? defaultProcessHorizontalPackage;
  const processVerticalPackage = input.deps?.processVerticalPackage ?? defaultProcessVerticalPackage;
  const probeMedia = input.deps?.probeMedia ?? defaultProbeMedia;
  const getFileSha256 = input.deps?.getFileSha256 ?? defaultGetFileSha256;
  const isStableFile = input.deps?.isStableFile ?? defaultIsStableFile;
  const ensureSupoClipReady = input.deps?.ensureSupoClipReady ?? ((supoclip) =>
    defaultEnsureSupoClipReady(supoclip, { progress }));
  const sourceFiles = [...await discoverSourceFiles(config.inputDir)].sort((left, right) => left.localeCompare(right));
  progress.info(`Arquivos encontrados: ${sourceFiles.length}`);
  const skipped: MediaFactorySkippedFile[] = [];
  let processed = 0;

  for (const sourcePath of sourceFiles) {
    progress.info(`Processando: ${sourcePath}`);
    if (!(await isStableFile(sourcePath))) {
      skipped.push({ sourcePath, reason: "file is still changing" });
      progress.warn(`Ignorado: ${sourcePath} (file is still changing)`);
      continue;
    }

    const metadata = await probeMedia(sourcePath);
    const route = routeMedia(metadata);
    progress.info(`Rota: ${route.pipeline}`);

    if (route.pipeline === "vertical_short_clips") {
      if (!config.supoclip.enabled) {
        skipped.push({
          sourcePath,
          reason: "supoclip is disabled for vertical files"
        });
        progress.warn(`Ignorado: ${sourcePath} (supoclip is disabled for vertical files)`);
        continue;
      }

      if (config.supoclip.autoStart) {
        await ensureSupoClipReady(config.supoclip);
      }

      const sourceHash = await getFileSha256(sourcePath);
      const authSecret = await getSupoClipAuthSecret(config.supoclip.rootDir);
      try {
        await processVerticalPackage({
          sourcePath,
          sourceHash,
          metadata,
          inputDir: config.inputDir,
          outputDir: config.outputDir,
          supoclip: config.supoclip,
          ai: config.ai,
          authSecret,
          deps: {
            progress
          }
        });
      } catch (error) {
        await archiveFailedSource({ sourcePath, sourceHash, failedSourcesDir: folders.failedSourcesDir, progress });
        throw error;
      }
      processed += 1;
      await archiveProcessedSource({ sourcePath, sourceHash, processedSourcesDir: folders.processedSourcesDir, progress });
      continue;
    }

    const sourceHash = await getFileSha256(sourcePath);
    try {
      await processHorizontalPackage({
        sourcePath,
        sourceHash,
        metadata,
        inputDir: config.inputDir,
        outputDir: config.outputDir,
        backgroundMusic: config.backgroundMusic,
        ai: config.ai,
        deps: {
          progress
        }
      });
    } catch (error) {
      await archiveFailedSource({ sourcePath, sourceHash, failedSourcesDir: folders.failedSourcesDir, progress });
      throw error;
    }
    processed += 1;
    await archiveProcessedSource({ sourcePath, sourceHash, processedSourcesDir: folders.processedSourcesDir, progress });
  }

  progress.info(`Concluido: ${processed} processado(s), ${skipped.length} ignorado(s)`);
  return { processed, skipped };
}

async function main() {
  loadDotenv({ path: ".env.local", quiet: true });
  loadDotenv({ path: ".env", quiet: true });

  const rootDir = process.argv[2] ?? process.env.MEDIA_FACTORY_ROOT;
  if (!rootDir) {
    throw new Error("Media Factory root directory must be provided as argv[2] or MEDIA_FACTORY_ROOT");
  }

  const command = process.argv[3] ?? "run";
  const progress = createProgressReporter();
  const result = command === "approve"
    ? await defaultApproveReadyPackages({
        rootDir,
        packageIds: process.argv.slice(4).filter((value) => value !== "all" && value !== "--all"),
        progress
      })
    : command === "x-auth"
      ? await runXAuthCommand({ progress })
    : command === "r2-test"
      ? await runR2TestCommand({ rootDir, progress })
    : command === "publish"
      ? await runPublishCommand({ rootDir, progress })
    : await runMediaFactoryOnce({
        rootDir,
        backgroundMusic: getBackgroundMusicFromEnv(),
        deps: {
          progress
        }
      });
  console.log(JSON.stringify(result));
}

async function runR2TestCommand({ rootDir, progress }: { rootDir: string; progress: ProgressReporter }) {
  const config = getR2ConfigFromEnv();
  if (!config) {
    throw new Error("R2 nao configurado. Defina R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET e R2_PUBLIC_BASE_URL.");
  }

  const tempPath = path.join(rootDir, "Logs", "r2-test.txt");
  await mkdir(path.dirname(tempPath), { recursive: true });
  await writeFile(tempPath, `MediaFactory R2 test ${new Date().toISOString()}\n`);
  const objectKey = createR2ObjectKey({
    packageId: "mediafactory-r2-test",
    clipRank: "check",
    fileName: "r2-test.txt"
  });

  progress.info(`R2: subindo teste para ${objectKey}`);
  const uploaded = await uploadFileToR2({
    filePath: tempPath,
    objectKey,
    contentType: "text/plain; charset=utf-8",
    config
  });
  progress.info(`R2: URL publica ${uploaded.publicUrl}`);
  progress.info("R2: apagando arquivo de teste do bucket");
  await deleteR2Object({ objectKey, config });
  await rm(tempPath, { force: true });

  return {
    status: "ok",
    publicUrl: uploaded.publicUrl,
    deleted: true
  };
}

async function runXAuthCommand({ progress }: { progress: ProgressReporter }) {
  const credentials = getXOAuthCredentialsFromEnv();
  if (!credentials) {
    throw new Error("X_CLIENT_ID e X_CLIENT_SECRET nao configurados. Cole os dois no .env.local e rode x-auth de novo.");
  }

  progress.info("X OAuth: servidor local iniciado em http://127.0.0.1:8787/x/oauth/callback");
  const tokens = await runXOAuthLocalAuthorization({
    credentials,
    onAuthorizationUrl: (url) => {
      progress.info("X OAuth: abra este link no navegador e autorize o MediaFactory:");
      console.log(url.toString());
    }
  });
  progress.info("X OAuth concluido. Cole estas linhas no .env.local:");
  console.log(formatXTokenEnvSnippet(tokens));
  return {
    provider: "x",
    status: "authorized",
    env: ["X_ACCESS_TOKEN", "X_REFRESH_TOKEN"]
  };
}

async function runPublishCommand({ rootDir, progress }: { rootDir: string; progress: ProgressReporter }) {
  const config = await loadMediaFactoryConfigFromFile(path.join(rootDir, "config.json"), { rootDir });
  const hasLivePublisher = Object.values(config.publishers).some((mode) => mode === "live");

  if (!hasLivePublisher) {
    return defaultDryRunApprovedPackages({
      rootDir,
      progress
    });
  }

  return defaultPublishApprovedPackages({
    rootDir,
    publishers: config.publishers,
    youtubeCredentials: getYouTubeCredentialsFromEnv(),
    progress
  });
}

export function getBackgroundMusicFromEnv(): RunMediaFactoryOnceInput["backgroundMusic"] | undefined {
  const musicDir = process.env.MEDIA_FACTORY_MUSIC_DIR;
  const volume = process.env.MEDIA_FACTORY_MUSIC_VOLUME;
  if (!musicDir && !volume) {
    return undefined;
  }

  return {
    ...(musicDir ? { enabled: true, musicDir, selection: "random" as const } : {}),
    ...(volume ? { volume: Number(volume) } : {})
  };
}

async function getSupoClipAuthSecret(supoclipRootDir: string): Promise<string | undefined> {
  const envSecret = process.env.BACKEND_AUTH_SECRET?.trim();
  if (envSecret) return envSecret;

  try {
    const parsed = parseDotenv(await readFile(path.join(supoclipRootDir, ".env")));
    const fileSecret = parsed.BACKEND_AUTH_SECRET?.trim();
    return fileSecret || undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function archiveProcessedSource({
  sourcePath,
  sourceHash,
  processedSourcesDir,
  progress
}: {
  sourcePath: string;
  sourceHash: string;
  processedSourcesDir: string;
  progress: ProgressReporter;
}): Promise<void> {
  const archivedPath = await archiveSourceFile({
    sourcePath,
    archiveDir: processedSourcesDir,
    sourceHash
  });
  progress.info(`Movido para Processados: ${archivedPath}`);
}

async function archiveFailedSource({
  sourcePath,
  sourceHash,
  failedSourcesDir,
  progress
}: {
  sourcePath: string;
  sourceHash: string;
  failedSourcesDir: string;
  progress: ProgressReporter;
}): Promise<void> {
  const archivedPath = await archiveSourceFile({
    sourcePath,
    archiveDir: failedSourcesDir,
    sourceHash
  });
  progress.warn(`Movido para Falhou: ${archivedPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
