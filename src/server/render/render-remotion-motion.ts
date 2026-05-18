import path from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { RenderMediaProgress } from "@remotion/renderer";
import type { EditPlan } from "../../shared/edit-plan";
import type { ExportSettings } from "../../shared/export-settings";
import { getConfig } from "../config";
import type { ProcessResult } from "../media/process";
import { runProcess, type ProcessOptions } from "../media/process";
import type { MotionRenderPlan } from "../motion/motion-plan";
import type { ProjectWorkspace } from "../workspace";

export type RemotionProcessRunner = (
  command: string,
  args: string[],
  options?: ProcessOptions
) => Promise<ProcessResult>;

export type RenderRemotionMotionInput = {
  sourcePath: string;
  plan: EditPlan;
  motionPlan: MotionRenderPlan;
  workspace: ProjectWorkspace;
  canvasSize?: { width: number; height: number };
  renderQuality?: ExportSettings["quality"];
  onProgress?: (progress: RenderMediaProgress) => void;
};

const REMOTION_RENDER_TIMEOUT_MS = 60 * 60 * 1000;

export async function renderRemotionMotion(
  input: RenderRemotionMotionInput,
  processRunner: RemotionProcessRunner = runProcess
) {
  const rawOutputPath = path.join(input.workspace.renders, "motion-visual-raw.mp4");
  const outputPath = path.join(input.workspace.renders, "motion-render.mp4");
  const entryPoint = path.resolve(process.cwd(), "src/remotion/index.tsx");
  const localVideoServer = await createLocalVideoServer(input.sourcePath);

  try {
    const serveUrl = await bundle({ entryPoint });
    const canvasSize = input.canvasSize ?? { width: input.plan.source.width, height: input.plan.source.height };
    const props = {
      sourceUrl: localVideoServer.url,
      durationSec: getRenderedDurationSec(input.plan),
      width: canvasSize.width,
      height: canvasSize.height,
      fps: input.plan.source.fps,
      events: input.motionPlan.events
    };
    const composition = await selectComposition({
      serveUrl,
      id: "AiMotionVideo",
      inputProps: props
    });

    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: rawOutputPath,
      inputProps: props,
      timeoutInMilliseconds: REMOTION_RENDER_TIMEOUT_MS,
      crf: input.renderQuality === "maxima" ? 18 : 23,
      x264Preset: input.renderQuality === "maxima" ? "slow" : "veryfast",
      onProgress: input.onProgress
    });
  } finally {
    await localVideoServer.close();
  }

  const args = [
    "-y",
    "-i",
    rawOutputPath,
    "-i",
    input.sourcePath,
    "-map",
    "0:v:0",
    "-map",
    "1:a?",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath
  ];
  const result = await processRunner(getConfig().ffmpegPath, args, { timeoutMs: REMOTION_RENDER_TIMEOUT_MS });
  if (result.exitCode !== 0) {
    throw new Error(`Remotion audio mux failed: ${result.stderr || result.stdout}`);
  }

  return outputPath;
}

function getRenderedDurationSec(plan: EditPlan) {
  return plan.segments.at(-1)?.timelineEndSec ?? plan.source.durationSec;
}

async function createLocalVideoServer(sourcePath: string) {
  const sourceStat = await stat(sourcePath);
  const contentType = getVideoContentType(sourcePath);
  const server = createServer((request, response) => {
    if (!request.url?.startsWith("/source-video")) {
      response.writeHead(404).end();
      return;
    }

    const range = request.headers.range;
    if (!range) {
      writeVideoHeaders(response, 200, sourceStat.size, contentType);
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(sourcePath).pipe(response);
      return;
    }

    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!match) {
      response.writeHead(416, { "Content-Range": `bytes */${sourceStat.size}` }).end();
      return;
    }

    const requestedStart = match[1] ? Number.parseInt(match[1], 10) : 0;
    const requestedEnd = match[2] ? Number.parseInt(match[2], 10) : sourceStat.size - 1;
    const start = Math.max(0, Math.min(requestedStart, sourceStat.size - 1));
    const end = Math.max(start, Math.min(requestedEnd, sourceStat.size - 1));
    const chunkSize = end - start + 1;

    response.writeHead(206, {
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Range": `bytes ${start}-${end}/${sourceStat.size}`,
      "Content-Type": contentType
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(sourcePath, { start, end }).pipe(response);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/source-video.mp4`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

function writeVideoHeaders(response: ServerResponse, statusCode: number, size: number, contentType: string) {
  response.writeHead(statusCode, {
    "Accept-Ranges": "bytes",
    "Content-Length": size,
    "Content-Type": contentType
  });
}

function getVideoContentType(sourcePath: string) {
  const extension = path.extname(sourcePath).toLowerCase();
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".webm") return "video/webm";
  return "video/mp4";
}
