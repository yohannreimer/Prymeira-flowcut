// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditPlanSummary, ProjectJob, VerticalPackageSummary, YoutubePackageSummary } from "../api";
import { Publish } from "./Publish";

const readySummary: YoutubePackageSummary = {
  status: "ready",
  title: "Titulo",
  description: "Descricao",
  chapters: null,
  transcriptAvailable: true,
  thumbnailPrompt: null,
  thumbnailIdeas: [],
  missing: [],
  assets: []
};

const exportJob = {
  id: "job_export",
  projectId: "project_123",
  status: "passed",
  stage: "complete",
  message: "Export is ready",
  outputUrl: "/media/project_123/youtube-edit.mp4",
  warnings: [],
  error: null,
  createdAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:01.000Z"
} satisfies ProjectJob;

const verticalPlan = {
  projectId: "project_123",
  source: {
    durationSec: 45,
    width: 1080,
    height: 1920,
    fps: 30,
    hasAudio: true
  },
  captions: [],
  publishReadiness: { status: "needs_review", checks: [] }
} as unknown as EditPlanSummary;

const verticalSummary: VerticalPackageSummary = {
  projectId: "project_123",
  taskId: "task-123",
  status: "ready",
  clips: [
    {
      id: "clip-1",
      rank: 1,
      title: "Clip 1",
      clipUrl: "/api/projects/project_123/vertical-package/clips/rank-01/clip.mp4"
    }
  ],
  warnings: []
};

afterEach(() => {
  cleanup();
});

describe("Publish", () => {
  it("shows publish errors on the publish step", () => {
    render(
      <Publish
        youtubePackageSummary={readySummary}
        editPlan={null}
        exportJob={exportJob}
        isExporting={false}
        isDownloadingFinalPackage={false}
        isPublishingYoutube={false}
        youtubePublicationUrl={null}
        publicationVisibility="private"
        error="Reconecte sua conta do YouTube."
        onPublicationVisibilityChange={vi.fn()}
        onStartFinalExport={vi.fn()}
        onDownloadFinalPackage={vi.fn()}
        onPublishYoutube={vi.fn()}
        onConnectYoutube={vi.fn()}
      />
    );

    expect(screen.getByText("Reconecte sua conta do YouTube.")).toBeInTheDocument();
  });

  it("shows a YouTube connection action", () => {
    const onConnectYoutube = vi.fn();
    render(
      <Publish
        youtubePackageSummary={readySummary}
        editPlan={null}
        exportJob={exportJob}
        isExporting={false}
        isDownloadingFinalPackage={false}
        isPublishingYoutube={false}
        youtubePublicationUrl={null}
        publicationVisibility="private"
        onPublicationVisibilityChange={vi.fn()}
        onStartFinalExport={vi.fn()}
        onDownloadFinalPackage={vi.fn()}
        onPublishYoutube={vi.fn()}
        onConnectYoutube={onConnectYoutube}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /conectar youtube/i }));

    expect(onConnectYoutube).toHaveBeenCalledTimes(1);
  });

  it("downloads the final package when an export exists", () => {
    const onDownloadFinalPackage = vi.fn();
    render(
      <Publish
        youtubePackageSummary={readySummary}
        editPlan={null}
        exportJob={exportJob}
        isExporting={false}
        isDownloadingFinalPackage={false}
        isPublishingYoutube={false}
        youtubePublicationUrl={null}
        publicationVisibility="private"
        onPublicationVisibilityChange={vi.fn()}
        onStartFinalExport={vi.fn()}
        onDownloadFinalPackage={onDownloadFinalPackage}
        onPublishYoutube={vi.fn()}
        onConnectYoutube={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /pacote final/i }));

    expect(onDownloadFinalPackage).toHaveBeenCalledTimes(1);
  });

  it("publishes vertical SupoClip packages as YouTube Shorts without a final export", () => {
    const onPublishYoutubeShorts = vi.fn();
    render(
      <Publish
        youtubePackageSummary={null}
        verticalPackageSummary={verticalSummary}
        editPlan={verticalPlan}
        exportJob={null}
        isExporting={false}
        isDownloadingFinalPackage={false}
        isPublishingYoutube={false}
        youtubePublicationUrl={null}
        publicationVisibility="private"
        onPublicationVisibilityChange={vi.fn()}
        onStartFinalExport={vi.fn()}
        onDownloadFinalPackage={vi.fn()}
        onPublishYoutube={vi.fn()}
        onPublishYoutubeShorts={onPublishYoutubeShorts}
        onConnectYoutube={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /publicar shorts/i }));

    expect(onPublishYoutubeShorts).toHaveBeenCalledTimes(1);
  });
});
