// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectJob, YoutubePackageSummary } from "../api";
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
  sourcePath: "/tmp/source.mp4",
  outputPath: "/tmp/youtube-edit.mp4",
  outputUrl: "/media/project_123/youtube-edit.mp4",
  planPath: "/tmp/edit-plan.json",
  warnings: [],
  error: null,
  createdAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:01.000Z"
} satisfies ProjectJob;

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
});
