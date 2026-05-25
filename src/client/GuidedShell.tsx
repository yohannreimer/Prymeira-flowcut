import { useState, useEffect, useRef } from "react";
import type { EditPlanSummary, ProjectJob, UploadConfig, YoutubePackageSummary } from "./api";
import { formatBytes } from "./api";
import { touchProjectActivity } from "./api";
import type { ProjectLibraryItem } from "../shared/project-library";
import { AppShell } from "./components/AppShell";
import { Sidebar } from "./components/Sidebar";
import type { SidebarStep } from "./components/Sidebar";
import { VideoUpload } from "./steps/VideoUpload";
import { AiCut } from "./steps/AiCut";
import { Transcription } from "./steps/Transcription";
import { YouTubePackage } from "./steps/YouTubePackage";
import { Publish } from "./steps/Publish";

function isActiveJob(job: ProjectJob | null): boolean {
  return job !== null && ["queued", "running"].includes(job.status);
}

const PROJECT_ACTIVITY_HEARTBEAT_MS = 60 * 1000;

export function deriveCurrentStep(
  file: File | null,
  job: ProjectJob | null,
  isUploading: boolean,
  hasCut: boolean,
  hasCaptions: boolean,
  hasPackage: boolean
): 1 | 2 | 3 | 4 | 5 {
  if (!job && !isUploading) return 1;
  if (!hasCut) return 2;
  if (!hasCaptions) return 3;
  if (!hasPackage) return 4;
  return 5;
}

export function buildSidebarSteps(
  file: File | null,
  job: ProjectJob | null,
  isUploading: boolean,
  hasCut: boolean,
  isCutRunning: boolean,
  editPlan: EditPlanSummary | null,
  hasCaptions: boolean,
  isCaptionJobRunning: boolean,
  hasPackage: boolean,
  isPackageRunning: boolean
): SidebarStep[] {
  const hasSomething = Boolean(job || isUploading);
  const captionCount = editPlan?.captions.length ?? 0;

  return [
    {
      number: 1,
      label: "Vídeo",
      sub: job?.projectId
        ? `${job.projectId.slice(0, 18)}…`
        : isUploading ? "Enviando…"
        : "Aguardando upload",
      status: hasSomething ? "done" : "active"
    },
    {
      number: 2,
      label: "Corte IA",
      sub: isCutRunning || isUploading ? "Analisando…"
        : hasCut ? "Pronto"
        : "Aguardando",
      status: !hasSomething ? "locked"
        : isCutRunning || isUploading ? "processing"
        : hasCut ? "done"
        : "active"
    },
    {
      number: 3,
      label: "Transcrição",
      sub: isCaptionJobRunning ? "Transcrevendo…"
        : hasCaptions ? `${captionCount} segmentos`
        : "Aguardando",
      status: !hasCut ? "locked"
        : isCaptionJobRunning ? "processing"
        : hasCaptions ? "done"
        : "active"
    },
    {
      number: 4,
      label: "Pacote YT",
      sub: isPackageRunning ? "Gerando…"
        : hasPackage ? "Pronto"
        : "Aguardando",
      status: !hasCaptions ? "locked"
        : isPackageRunning ? "processing"
        : hasPackage ? "done"
        : "active"
    },
    {
      number: 5,
      label: "Publicar",
      sub: hasPackage ? "Pronto para publicar" : "Aguardando",
      status: !hasPackage ? "locked" : "active"
    }
  ];
}

export type GuidedShellProps = {
  file: File | null;
  job: ProjectJob | null;
  editPlan: EditPlanSummary | null;
  youtubePackageSummary: YoutubePackageSummary | null;
  selectedGeneratedThumbnailName: string | null;
  isExporting: boolean;
  isPublishingYoutube: boolean;
  youtubePublicationUrl: string | null;
  exportJob: ProjectJob | null;
  isUploading: boolean;
  isCaptioning: boolean;
  captionJob: ProjectJob | null;
  isGeneratingYoutubePackage: boolean;
  youtubePackageJob: ProjectJob | null;
  uploadConfig: UploadConfig | null;
  isApiReady: boolean;
  isFileTooLarge: boolean;
  error: string | null;
  projects: ProjectLibraryItem[];
  publicationTitle: string;
  publicationDescription: string;
  publicationVisibility: "private" | "unlisted" | "public";
  onFileSelected: (file: File | null) => void;
  onStartUpload: () => void;
  onGenerateCaptions: () => void;
  onGenerateYoutubePackage: () => void;
  onSelectGeneratedThumbnail: (name: string) => void;
  onPublicationTitleChange: (title: string) => void;
  onPublicationDescriptionChange: (desc: string) => void;
  onPublicationVisibilityChange: (v: "private" | "unlisted" | "public") => void;
  onStartFinalExport: () => void;
  onPublishYoutube: () => void;
  onConnectYoutube: () => void;
};

export function GuidedShell({
  file, job, editPlan, youtubePackageSummary,
  selectedGeneratedThumbnailName, isExporting, isPublishingYoutube, youtubePublicationUrl, exportJob,
  isUploading, isCaptioning, captionJob,
  isGeneratingYoutubePackage, youtubePackageJob,
  uploadConfig, isApiReady, isFileTooLarge, error, projects,
  publicationTitle, publicationDescription, publicationVisibility,
  onFileSelected, onStartUpload, onGenerateCaptions,
  onGenerateYoutubePackage, onSelectGeneratedThumbnail,
  onPublicationTitleChange, onPublicationDescriptionChange,
  onPublicationVisibilityChange, onStartFinalExport, onPublishYoutube, onConnectYoutube
}: GuidedShellProps) {
  const hasCut = Boolean(job?.outputUrl);
  const hasCaptions = Boolean(editPlan?.captions.length);
  const hasPackage = youtubePackageSummary?.status === "ready";
  const isCutRunning = isActiveJob(job);
  const isCaptionJobRunning = isActiveJob(captionJob);
  const isPackageRunning = isActiveJob(youtubePackageJob);
  const hasExport = Boolean(exportJob?.outputUrl);
  const activeProjectId = job?.projectId
    ?? captionJob?.projectId
    ?? youtubePackageJob?.projectId
    ?? exportJob?.projectId
    ?? editPlan?.projectId
    ?? null;
  const videoOrientation: "horizontal" | "vertical" =
    editPlan && editPlan.source.width >= editPlan.source.height ? "horizontal" : "vertical";

  // viewStep: manual navigation state.
  // Auto-advances only when pipeline starts processing (not when a step completes).
  // User can click any non-locked sidebar step to navigate freely.
  const [viewStep, setViewStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const initialSyncDone = useRef(false);

  // On first load: if existing project data is present, jump to derived step
  useEffect(() => {
    if (!initialSyncDone.current && (job || hasCut || hasCaptions || hasPackage)) {
      initialSyncDone.current = true;
      setViewStep(deriveCurrentStep(file, job, isUploading, hasCut, hasCaptions, hasPackage));
    }
  }, [job, hasCut, hasCaptions, hasPackage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance when pipeline starts processing (not on completion)
  useEffect(() => {
    if (isUploading || isCutRunning) { setViewStep(2); return; }
    if (isCaptionJobRunning) { setViewStep(3); return; }
    if (isPackageRunning) { setViewStep(4); }
  }, [isUploading, isCutRunning, isCaptionJobRunning, isPackageRunning]);

  useEffect(() => {
    if (!activeProjectId) return;

    const markActive = () => {
      void touchProjectActivity(activeProjectId).catch(() => undefined);
    };
    markActive();
    const interval = window.setInterval(markActive, PROJECT_ACTIVITY_HEARTBEAT_MS);
    return () => window.clearInterval(interval);
  }, [activeProjectId]);

  const currentStep = viewStep;

  const sidebarSteps = buildSidebarSteps(
    file, job, isUploading,
    hasCut, isCutRunning, editPlan,
    hasCaptions, isCaptionJobRunning,
    hasPackage, isPackageRunning
  );

  // Footer CTA: triggers actions on steps 1 and 5; steps 2–4 use in-content CTAs
  const footerConfig: Record<number, { label: string; disabled: boolean; action: () => void }> = {
    1: { label: isApiReady ? "Enviar vídeo" : "API indisponível", disabled: !file || isUploading || !isApiReady, action: onStartUpload },
    2: {
      label: (isCutRunning || isUploading) ? "Processando…" : hasCut ? "Corte pronto" : "Aguardando corte",
      disabled: true,
      action: () => {}
    },
    3: {
      label: isCaptionJobRunning ? "Transcrevendo…" : hasCaptions ? "Transcrição pronta" : "Gerar transcrição →",
      disabled: isCaptionJobRunning || hasCaptions || !hasCut,
      action: onGenerateCaptions
    },
    4: {
      label: isPackageRunning ? "Gerando…" : hasPackage ? "Pacote pronto" : "Gerar pacote YT →",
      disabled: isPackageRunning || hasPackage || !hasCaptions,
      action: onGenerateYoutubePackage
    },
    5: {
      label: isPublishingYoutube ? "Publicando…" : hasExport ? "Publicar no YouTube →" : "Gerar export final →",
      disabled: isExporting || isPublishingYoutube || !hasPackage,
      action: hasExport ? onPublishYoutube : onStartFinalExport
    }
  };
  const footer = footerConfig[currentStep];

  // Header for main area
  const stepTitles: Record<number, { title: string; desc: string }> = {
    1: { title: "Envie seu vídeo", desc: `MP4, MOV · até ${uploadConfig?.uploadFileSizeLimitBytes ? formatBytes(uploadConfig.uploadFileSizeLimitBytes) : "5GB"}` },
    2: { title: isCutRunning ? "Gerando corte IA" : hasCut ? "Corte gerado" : "Corte com IA", desc: isCutRunning ? "Detectando silêncios · ~2 min" : hasCut ? `${editPlan?.segments.length ?? 0} segmentos mantidos` : "Aguardando upload" },
    3: { title: hasCaptions ? "Transcrição gerada" : "Transcrição", desc: hasCaptions ? `${editPlan?.captions.length ?? 0} segmentos · SRT + VTT` : "Aguardando corte" },
    4: { title: hasPackage ? "Pacote pronto" : "Pacote YouTube", desc: hasPackage ? "Revise antes de publicar" : "Aguardando transcrição" },
    5: { title: "Publicar", desc: "Revise e gere o export final" }
  };
  const header = stepTitles[currentStep];

  return (
    <AppShell
      sidebar={
        <Sidebar
          projectName={job?.projectId ?? null}
          steps={sidebarSteps}
          footerLabel={footer.label}
          footerDisabled={footer.disabled}
          onFooterClick={footer.action}
          viewingStep={currentStep}
          onStepClick={(n) => setViewStep(n as 1 | 2 | 3 | 4 | 5)}
        />
      }
      header={
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#e8e4de", letterSpacing: "-0.3px" }}>
              {header.title}
            </div>
            <div style={{ fontSize: 12, color: "#484845", marginTop: 3 }}>
              {header.desc}
            </div>
          </div>
        </div>
      }
    >
      {currentStep === 1 && (
        <VideoUpload
          fileLimitBytes={uploadConfig?.uploadFileSizeLimitBytes}
          isApiReady={isApiReady}
          isFileTooLarge={isFileTooLarge}
          error={error}
          projects={projects}
          file={file}
          isUploading={isUploading}
          onFileSelected={onFileSelected}
          onStartUpload={onStartUpload}
        />
      )}
      {currentStep === 2 && (
        <AiCut job={job} editPlan={editPlan} isUploading={isUploading} onNext={() => setViewStep(3)} />
      )}
      {currentStep === 3 && (
        <Transcription
          editPlan={editPlan}
          captionJob={captionJob}
          isCaptioning={isCaptioning}
          videoOrientation={videoOrientation}
          onGenerateCaptions={onGenerateCaptions}
          onNext={() => setViewStep(4)}
        />
      )}
      {currentStep === 4 && (
        <YouTubePackage
          youtubePackageSummary={youtubePackageSummary}
          youtubePackageJob={youtubePackageJob}
          isGeneratingYoutubePackage={isGeneratingYoutubePackage}
          selectedGeneratedThumbnailName={selectedGeneratedThumbnailName}
          onSelectGeneratedThumbnail={onSelectGeneratedThumbnail}
          onGenerateYoutubePackage={onGenerateYoutubePackage}
          publicationTitle={publicationTitle}
          publicationDescription={publicationDescription}
          onPublicationTitleChange={onPublicationTitleChange}
          onPublicationDescriptionChange={onPublicationDescriptionChange}
          onNext={() => setViewStep(5)}
        />
      )}
      {currentStep === 5 && (
        <Publish
          youtubePackageSummary={youtubePackageSummary}
          editPlan={editPlan}
          exportJob={exportJob}
          isExporting={isExporting}
          isPublishingYoutube={isPublishingYoutube}
          youtubePublicationUrl={youtubePublicationUrl}
          publicationVisibility={publicationVisibility}
          error={error}
          onPublicationVisibilityChange={onPublicationVisibilityChange}
          onStartFinalExport={onStartFinalExport}
          onPublishYoutube={onPublishYoutube}
          onConnectYoutube={onConnectYoutube}
        />
      )}
    </AppShell>
  );
}
