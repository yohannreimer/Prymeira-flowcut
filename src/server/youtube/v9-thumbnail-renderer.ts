import { readFile } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import type { ThumbnailRenderProps } from "../../remotion/thumbnails/types";
import type { YoutubePackageCopy } from "./youtube-package-copy";
import { applyGrain } from "./apply-grain";

const COMPOSITION_IDS = [
  "thumbnail-premium-execution",
  "thumbnail-split-result",
  "thumbnail-editorial",
  "thumbnail-status-window",
  "thumbnail-social-cards",
  "thumbnail-breaking-news",
] as const;

type CompositionId = (typeof COMPOSITION_IDS)[number];

const GRAIN_INTENSITIES: Record<CompositionId, number> = {
  "thumbnail-editorial": 0.12,
  "thumbnail-premium-execution": 0.10,
  "thumbnail-breaking-news": 0.10,
  "thumbnail-split-result": 0.08,
  "thumbnail-status-window": 0.08,
  "thumbnail-social-cards": 0.08,
};

export async function renderV9ThumbnailImages(
  packageDir: string,
  copy: YoutubePackageCopy
): Promise<void> {
  const entryPoint = path.resolve(process.cwd(), "src/remotion/index.tsx");
  const serveUrl = await bundle({ entryPoint });

  const imageDataUrls = (await Promise.all(
    [1, 2, 3, 4].map((i) =>
      readImageAsDataUrl(packageDir, i).catch(() => "")
    )
  )) as [string, string, string, string];

  const thumbnailPrompts = copy.thumbnailPrompts.slice(0, 5);

  await Promise.all(
    thumbnailPrompts.map(async (prompt, index) => {
      const compositionId = COMPOSITION_IDS[index];
      if (!compositionId) return;

      const props: ThumbnailRenderProps = {
        renderText: prompt.renderText,
        imageDataUrls,
      };

      const composition = await selectComposition({
        serveUrl,
        id: compositionId,
        inputProps: props,
      });

      const outputPath = path.join(
        packageDir,
        `thumbnail-generated-${String(index + 1).padStart(2, "0")}.png`
      );

      await renderStill({
        composition,
        serveUrl,
        output: outputPath,
        inputProps: props,
        imageFormat: "png",
      });

      await applyGrain(outputPath, outputPath, GRAIN_INTENSITIES[compositionId]);
    })
  );

  // Render 6th layout (BreakingNews) using copy derived in the job
  const breakingNewsPrompt = copy.thumbnailPrompts[5];
  if (breakingNewsPrompt) {
    const props: ThumbnailRenderProps = {
      renderText: breakingNewsPrompt.renderText,
      imageDataUrls,
    };
    const composition = await selectComposition({
      serveUrl,
      id: "thumbnail-breaking-news",
      inputProps: props,
    });
    const outputPath = path.join(packageDir, "thumbnail-generated-06.png");
    await renderStill({ composition, serveUrl, output: outputPath, inputProps: props, imageFormat: "png" });
    await applyGrain(outputPath, outputPath, GRAIN_INTENSITIES["thumbnail-breaking-news"]);
  }
}

async function readImageAsDataUrl(packageDir: string, index: number): Promise<string> {
  const filePath = path.join(
    packageDir,
    `thumbnail-ref-${String(index).padStart(2, "0")}.jpg`
  );
  const buffer = await readFile(filePath);
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}
