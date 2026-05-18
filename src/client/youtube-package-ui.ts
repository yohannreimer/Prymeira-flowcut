import type { YoutubePackageSummary } from "./api";

export function getGeneratedThumbnailAssets(summary: YoutubePackageSummary | null) {
  return summary?.assets.filter((asset) => asset.kind === "generated_thumbnail") ?? [];
}

export function getInitialSelectedThumbnailName(summary: YoutubePackageSummary | null, currentName: string | null) {
  const generated = getGeneratedThumbnailAssets(summary);
  if (currentName && generated.some((asset) => asset.name === currentName)) return currentName;
  return generated[0]?.name ?? null;
}

export function composeYoutubeDescription(description: string, chapters: string | null) {
  const trimmedDescription = description.trim();
  const trimmedChapters = chapters?.trim();
  if (!trimmedChapters) return trimmedDescription;
  return `${trimmedDescription}\n\nCapítulos:\n${trimmedChapters}`;
}
