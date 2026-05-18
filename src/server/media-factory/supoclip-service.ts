import { execFile as defaultExecFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { MediaFactoryConfig } from "./config";
import { silentProgressReporter, type ProgressReporter } from "./progress";

const execFileAsync = promisify(defaultExecFile);

type ExecFile = (
  file: string,
  args: readonly string[],
  options?: { cwd?: string }
) => Promise<unknown>;

type EnsureSupoClipReadyDeps = {
  execFile?: ExecFile;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  progress?: ProgressReporter;
  maxWaitMs?: number;
  pollIntervalMs?: number;
};

export async function ensureSupoClipReady(
  supoclip: MediaFactoryConfig["supoclip"],
  deps: EnsureSupoClipReadyDeps = {}
): Promise<void> {
  const progress = deps.progress ?? silentProgressReporter;
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const execFile = deps.execFile ?? execFileAsync;
  const sleep = deps.sleep ?? defaultSleep;
  const maxWaitMs = deps.maxWaitMs ?? 180_000;
  const pollIntervalMs = deps.pollIntervalMs ?? 2_000;

  if (await isSupoClipHealthy(supoclip.backendUrl, fetchImpl)) {
    progress.info("SupoClip ja esta rodando");
    return;
  }

  if (!supoclip.autoStart) {
    throw new Error(`SupoClip nao respondeu em ${supoclip.backendUrl}. Inicie o SupoClip e tente novamente.`);
  }

  await assertSupoClipRoot(supoclip.rootDir);
  progress.warn("SupoClip nao respondeu; tentando iniciar automaticamente");

  if (!(await commandSucceeds(execFile, "docker", ["info"]))) {
    progress.info("Docker Desktop nao esta rodando; abrindo Docker");
    await commandSucceeds(execFile, "open", ["-a", "Docker"]);
    await waitForCommand({
      label: "Docker Desktop",
      execFile,
      file: "docker",
      args: ["info"],
      progress,
      sleep,
      maxWaitMs,
      pollIntervalMs
    });
  }

  const composeCommand = await getComposeCommand(execFile);
  progress.info("Subindo containers do SupoClip");
  await execFile(composeCommand.file, composeCommand.args.concat("up", "-d"), { cwd: supoclip.rootDir });

  await waitForSupoClipHealth({
    backendUrl: supoclip.backendUrl,
    fetch: fetchImpl,
    progress,
    sleep,
    maxWaitMs,
    pollIntervalMs
  });
}

async function assertSupoClipRoot(rootDir: string): Promise<void> {
  const composePath = path.join(rootDir, "docker-compose.yml");
  try {
    await access(composePath);
  } catch {
    throw new Error(`Nao encontrei o SupoClip em ${rootDir}. Esperava achar ${composePath}.`);
  }
}

async function getComposeCommand(execFile: ExecFile): Promise<{ file: string; args: string[] }> {
  if (await commandSucceeds(execFile, "docker", ["compose", "version"])) {
    return { file: "docker", args: ["compose"] };
  }
  if (await commandSucceeds(execFile, "docker-compose", ["version"])) {
    return { file: "docker-compose", args: [] };
  }
  throw new Error("Docker Compose nao foi encontrado. Instale/abra o Docker Desktop e tente novamente.");
}

async function waitForCommand(input: {
  label: string;
  execFile: ExecFile;
  file: string;
  args: string[];
  progress: ProgressReporter;
  sleep: (ms: number) => Promise<void>;
  maxWaitMs: number;
  pollIntervalMs: number;
}): Promise<void> {
  const deadline = Date.now() + input.maxWaitMs;
  while (Date.now() <= deadline) {
    if (await commandSucceeds(input.execFile, input.file, input.args)) {
      input.progress.info(`${input.label} pronto`);
      return;
    }
    input.progress.poll(`Aguardando ${input.label}...`);
    await input.sleep(input.pollIntervalMs);
  }

  throw new Error(`${input.label} nao ficou pronto dentro do tempo esperado.`);
}

async function waitForSupoClipHealth(input: {
  backendUrl: string;
  fetch: typeof fetch;
  progress: ProgressReporter;
  sleep: (ms: number) => Promise<void>;
  maxWaitMs: number;
  pollIntervalMs: number;
}): Promise<void> {
  const deadline = Date.now() + input.maxWaitMs;
  while (Date.now() <= deadline) {
    if (await isSupoClipHealthy(input.backendUrl, input.fetch)) {
      input.progress.info("SupoClip pronto");
      return;
    }
    input.progress.poll("Aguardando SupoClip responder...");
    await input.sleep(input.pollIntervalMs);
  }

  throw new Error(`SupoClip nao respondeu em ${input.backendUrl} dentro do tempo esperado.`);
}

async function isSupoClipHealthy(backendUrl: string, fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(new URL("/health", normalizedBaseUrl(backendUrl)), {
      signal: AbortSignal.timeout(2_000)
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { ok?: unknown; status?: unknown };
    return body.ok === true || body.status === "healthy";
  } catch {
    return false;
  }
}

async function commandSucceeds(execFile: ExecFile, file: string, args: string[]): Promise<boolean> {
  try {
    await execFile(file, args);
    return true;
  } catch {
    return false;
  }
}

function normalizedBaseUrl(backendUrl: string): string {
  return backendUrl.endsWith("/") ? backendUrl : `${backendUrl}/`;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
