import { describe, expect, it } from "vitest";
import type { YoutubePackageSummary } from "./api";
import { composeYoutubeDescription, getGeneratedThumbnailAssets, getInitialSelectedThumbnailName } from "./youtube-package-ui";

const summary: YoutubePackageSummary = {
  status: "ready",
  title: "Titulo",
  description: "Descricao",
  chapters: "00:00 Inicio\n00:30 Ideia principal",
  transcriptAvailable: true,
  thumbnailPrompt: "Prompt",
  thumbnailIdeas: [],
  missing: [],
  assets: [
    { kind: "thumbnail_reference", name: "thumbnail-ref-01.jpg", url: "/ref.jpg" },
    { kind: "generated_thumbnail", name: "thumbnail-generated-01.png", url: "/thumb-01.png" },
    { kind: "identity_clip", name: "identity-ref-01.mp4", url: "/clip.mp4" },
    { kind: "generated_thumbnail", name: "thumbnail-generated-02.png", url: "/thumb-02.png" }
  ]
};

describe("youtube package review helpers", () => {
  it("shows only generated thumbnails as selectable publication options", () => {
    expect(getGeneratedThumbnailAssets(summary).map((asset) => asset.name)).toEqual([
      "thumbnail-generated-01.png",
      "thumbnail-generated-02.png"
    ]);
  });

  it("keeps a selected thumbnail when it is still available, otherwise picks the first generated option", () => {
    expect(getInitialSelectedThumbnailName(summary, "thumbnail-generated-02.png")).toBe("thumbnail-generated-02.png");
    expect(getInitialSelectedThumbnailName(summary, "thumbnail-ref-01.jpg")).toBe("thumbnail-generated-01.png");
    expect(getInitialSelectedThumbnailName({ ...summary, assets: [] }, null)).toBeNull();
  });

  it("appends chapters to the final YouTube description", () => {
    expect(composeYoutubeDescription("Descricao", "00:00 Inicio\n00:30 Ideia principal")).toBe(
      "Descricao\n\nCapítulos:\n00:00 Inicio\n00:30 Ideia principal"
    );
    expect(composeYoutubeDescription("Descricao", null)).toBe("Descricao");
  });
});
