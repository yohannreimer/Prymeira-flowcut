import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  CAPTION_DISPLAY_MODE_OPTIONS,
  CAPTION_FONT_OPTIONS,
  DEFAULT_CAPTION_SETTINGS,
  getCaptionFontFamily,
  type CaptionSettings
} from "../shared/caption-settings";
import { CAPTION_STYLES, DEFAULT_CAPTION_STYLE_ID, type CaptionStyleId } from "../shared/caption-styles";
import { COLOR_PRESETS, DEFAULT_COLOR_ADJUSTMENTS, type ColorAdjustments, type ColorPresetId } from "../shared/color-presets";
import { CUT_PRESETS, type CutPresetId } from "../shared/cut-presets";
import type { Caption, CaptionWord, PublishReadiness, TimelineSection, TimelineSectionType } from "../shared/edit-plan";
import type { ManualCut } from "../shared/manual-edits";
import { getSectionAtTime, getSectionLabel, mergeSectionCaptionSettings } from "../shared/sections";
import { VIDEO_FILE_INPUT_ACCEPT } from "../shared/video-formats";
import {
  fetchEditPlan,
  fetchJob,
  fetchPublishReadiness,
  fetchYoutubePackageSummary,
  fetchUploadConfig,
  deleteProject,
  formatBytes,
  generateAIMotion,
  generateCaptions,
  generateYoutubePackage,
  listProjects,
  publishYoutubeVideo,
  rerenderProject,
  exportProject,
  type EditPlanSummary,
  type ProjectJob,
  type UploadConfig,
  type YoutubePackageSummary,
  updateCaption,
  updateCaptionSettings,
  updateSection,
  uploadMusic,
  uploadVideo
} from "./api";
import type { ProjectLibraryItem } from "../shared/project-library";
import { getNextSelectedSectionId, getSelectedSection, replaceSection } from "./section-model";
import { compareManualDurations, dragCutEdge, getZoomWindow, timeToWindowPercent } from "./timeline-model";
import { composeYoutubeDescription, getGeneratedThumbnailAssets, getInitialSelectedThumbnailName } from "./youtube-package-ui";
import { GuidedShell } from "./GuidedShell";

type TimelineSnapshot = {
  cuts: ManualCut[];
  activeCutIds: string[];
};

type ExportAspect = "original" | "vertical" | "horizontal";
type ExportResolution = "original" | "1080p" | "4k";
type ExportQuality = "fast" | "max";
type ExportSdrMode = "preserve" | "convert_to_sdr";
type ExportRenderMode = "fast_cuts" | "full";
type WorkspaceTab = "review" | "projects" | "cut" | "captions" | "audio" | "motion" | "color" | "export";
type SectionPatch = Omit<Partial<TimelineSection>, "id">;

const WORKSPACE_TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "review", label: "Revisão" },
  { id: "projects", label: "Projetos" },
  { id: "cut", label: "Corte" },
  { id: "captions", label: "Legendas" },
  { id: "audio", label: "Áudio" },
  { id: "motion", label: "Motion" },
  { id: "color", label: "Cor" },
  { id: "export", label: "Exportar" }
];

const SECTION_TYPE_OPTIONS: TimelineSectionType[] = ["hook", "talking_head", "screen", "hybrid", "problem", "chapter"];
const SECTION_INSPECTOR_TABS: WorkspaceTab[] = ["review", "cut", "captions", "audio", "motion", "color"];

export function App() {
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ProjectJob | null>(null);
  const [editPlan, setEditPlan] = useState<EditPlanSummary | null>(null);
  const [knownCuts, setKnownCuts] = useState<ManualCut[]>([]);
  const [activeCutIds, setActiveCutIds] = useState<string[]>([]);
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStartedAt, setUploadStartedAt] = useState<number | null>(null);
  const [isRerendering, setIsRerendering] = useState(false);
  const [isCaptioning, setIsCaptioning] = useState(false);
  const [uploadConfig, setUploadConfig] = useState<UploadConfig | null>(null);
  const [cutPresetId, setCutPresetId] = useState<CutPresetId>("normal");
  const [colorPresetId, setColorPresetId] = useState<ColorPresetId>("neutral");
  const [captionStyleId, setCaptionStyleId] = useState<CaptionStyleId>(DEFAULT_CAPTION_STYLE_ID);
  const [captionSettings, setCaptionSettings] = useState<CaptionSettings>(DEFAULT_CAPTION_SETTINGS);
  const [musicPath, setMusicPath] = useState<string | null>(null);
  const [previewCutId, setPreviewCutId] = useState<string | null>(null);
  const [videoTimeSec, setVideoTimeSec] = useState(0);
  const [selectedCaptionId, setSelectedCaptionId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [sectionFilter, setSectionFilter] = useState<TimelineSectionType | "all">("all");
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>("projects");
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [timelinePast, setTimelinePast] = useState<TimelineSnapshot[]>([]);
  const [timelineFuture, setTimelineFuture] = useState<TimelineSnapshot[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [colorAdjustments, setColorAdjustments] = useState<ColorAdjustments>(DEFAULT_COLOR_ADJUSTMENTS);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [exportRenderMode, setExportRenderMode] = useState<ExportRenderMode>("fast_cuts");
  const [exportAspect, setExportAspect] = useState<ExportAspect>("original");
  const [exportResolution, setExportResolution] = useState<ExportResolution>("original");
  const [exportQuality, setExportQuality] = useState<ExportQuality>("fast");
  const [exportSdrMode, setExportSdrMode] = useState<ExportSdrMode>("preserve");
  const [exportName, setExportName] = useState("youtube-edit");
  const [audioCleanup, setAudioCleanup] = useState(false);
  const [audioDucking, setAudioDucking] = useState(false);
  const [projects, setProjects] = useState<ProjectLibraryItem[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloadingExport, setIsDownloadingExport] = useState(false);
  const [isPlanningMotion, setIsPlanningMotion] = useState(false);
  const [isGeneratingYoutubePackage, setIsGeneratingYoutubePackage] = useState(false);
  const [isPublishingYoutube, setIsPublishingYoutube] = useState(false);
  const [youtubePublicationUrl, setYoutubePublicationUrl] = useState<string | null>(null);
  const [exportJob, setExportJob] = useState<ProjectJob | null>(null);
  const [captionJob, setCaptionJob] = useState<ProjectJob | null>(null);
  const [youtubePackageJob, setYoutubePackageJob] = useState<ProjectJob | null>(null);
  const [youtubePackageSummary, setYoutubePackageSummary] = useState<YoutubePackageSummary | null>(null);
  const [selectedPackageAssetName, setSelectedPackageAssetName] = useState<string | null>(null);
  const [selectedGeneratedThumbnailName, setSelectedGeneratedThumbnailName] = useState<string | null>(null);
  const [isPublicationReviewOpen, setIsPublicationReviewOpen] = useState(false);
  const [publicationTitle, setPublicationTitle] = useState("");
  const [publicationDescription, setPublicationDescription] = useState("");
  const [publicationVisibility, setPublicationVisibility] = useState<"private" | "unlisted" | "public">("private");
  const [isAdvancedEditorOpen, setIsAdvancedEditorOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const compareBeforeRef = useRef<HTMLVideoElement | null>(null);
  const compareAfterRef = useRef<HTMLVideoElement | null>(null);
  const sectionSaveVersions = useRef(new Map<string, number>());
  const activeProjectIdRef = useRef<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    activeProjectIdRef.current = job?.projectId ?? null;
  }, [job?.projectId]);

  useEffect(() => {
    if (!isUploading && !isActiveJob(job) && !isActiveJob(exportJob) && !isActiveJob(captionJob) && !isActiveJob(youtubePackageJob)) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [captionJob, exportJob, isUploading, job, youtubePackageJob]);

  useEffect(() => {
    let isStale = false;
    fetchUploadConfig()
      .then((config) => {
        if (!isStale) setUploadConfig(config);
      })
      .catch((err) => {
        if (!isStale) setError(err instanceof Error ? err.message : "Falha ao carregar configuração local");
      });
    return () => {
      isStale = true;
    };
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, []);

  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get("jobId");
    const projectId = new URLSearchParams(window.location.search).get("projectId");
    if (!jobId && !projectId) return;
    let isStale = false;
    const restore = jobId
      ? fetchJob(jobId)
      : fetchEditPlan(projectId as string).then((plan) => {
        const now = new Date().toISOString();
        return {
          id: `restored_${plan.projectId}`,
          projectId: plan.projectId,
          status: "passed" as const,
          stage: "complete",
          message: "Rough cut draft passed basic QA",
          sourcePath: "",
          outputPath: "",
          outputUrl: `/media/${encodeURIComponent(plan.projectId)}/rough-cut.mp4`,
          planPath: "",
          warnings: [],
          error: null,
          createdAt: now,
          updatedAt: now
        };
      });
    restore
      .then((restoredJob) => {
        if (!isStale) {
          setJob(restoredJob);
          setActiveWorkspaceTab("review");
        }
      })
      .catch((err) => {
        if (!isStale) setError(err instanceof Error ? err.message : "Falha ao reabrir projeto local");
      });
    return () => {
      isStale = true;
    };
  }, []);

  useEffect(() => {
    if (!job || ["passed", "warning", "failed"].includes(job.status)) return;
    let isStale = false;
    const controller = new AbortController();
    const jobId = job.id;
    const timer = window.setInterval(async () => {
      try {
        const nextJob = await fetchJob(jobId, { signal: controller.signal });
        if (isStale) return;
        setJob((currentJob) => currentJob?.id === jobId ? nextJob : currentJob);
      } catch (err) {
        if (isStale || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Falha ao atualizar o processamento");
      }
    }, 1500);
    return () => {
      isStale = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [job]);

  useEffect(() => {
    if (!exportJob || ["passed", "warning", "failed"].includes(exportJob.status)) {
      return;
    }
    let isStale = false;
    const controller = new AbortController();
    const timer = window.setInterval(async () => {
      try {
        const nextJob = await fetchJob(exportJob.id, { signal: controller.signal });
        if (!isStale) setExportJob(nextJob);
      } catch (err) {
        if (isStale || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Falha ao atualizar exportação");
      }
    }, 1000);
    return () => {
      isStale = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [exportJob]);

  useEffect(() => {
    if (!captionJob || ["passed", "warning", "failed"].includes(captionJob.status)) {
      return;
    }
    let isStale = false;
    const controller = new AbortController();
    const timer = window.setInterval(async () => {
      try {
        const nextJob = await fetchJob(captionJob.id, { signal: controller.signal });
        if (!isStale) setCaptionJob(nextJob);
      } catch (err) {
        if (isStale || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Falha ao atualizar legendas");
      }
    }, 1000);
    return () => {
      isStale = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [captionJob]);

  useEffect(() => {
    if (!captionJob || !["passed", "warning", "failed"].includes(captionJob.status)) return;
    setIsCaptioning(false);
    if (captionJob.status === "failed") {
      setError(captionJob.error ?? "Falha ao gerar legendas com Whisper");
      return;
    }
    let isStale = false;
    const controller = new AbortController();
    fetchEditPlan(captionJob.projectId, { signal: controller.signal })
      .then((plan) => {
        if (isStale) return;
        setEditPlan(plan);
        setCaptionSettings(plan.captionSettings);
        setCaptionStyleId(plan.captionSettings.styleId ?? (plan.captions[0]?.styleId as CaptionStyleId | undefined) ?? DEFAULT_CAPTION_STYLE_ID);
      })
      .catch((err) => {
        if (isStale || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar legendas geradas");
      });
    return () => {
      isStale = true;
      controller.abort();
    };
  }, [captionJob]);

  useEffect(() => {
    if (!youtubePackageJob || ["passed", "warning", "failed"].includes(youtubePackageJob.status)) {
      return;
    }
    let isStale = false;
    const controller = new AbortController();
    const timer = window.setInterval(async () => {
      try {
        const nextJob = await fetchJob(youtubePackageJob.id, { signal: controller.signal });
        if (!isStale) setYoutubePackageJob(nextJob);
      } catch (err) {
        if (isStale || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Falha ao atualizar pacote YouTube");
      }
    }, 1000);
    return () => {
      isStale = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [youtubePackageJob]);

  useEffect(() => {
    const projectId = job?.projectId;
    if (!projectId) {
      setYoutubePackageSummary(null);
      setSelectedPackageAssetName(null);
      return;
    }
    if (!editPlan?.captions.length && !youtubePackageJob) return;
    void refreshYoutubePackageSummary(projectId);
  }, [editPlan?.captions.length, job?.projectId, youtubePackageJob?.status, youtubePackageJob?.updatedAt]);

  useEffect(() => {
    if (!job || !["passed", "warning"].includes(job.status)) return;
    setIsCaptioning(false);
    setIsPlanningMotion(false);
    let isStale = false;
    const controller = new AbortController();
    fetchEditPlan(job.projectId, { signal: controller.signal })
      .then((plan) => {
        if (!isStale) {
          setEditPlan(plan);
          setKnownCuts((currentCuts) => mergeCuts(currentCuts, plan.removed));
          setActiveCutIds((currentIds) => currentIds.length > 0 ? currentIds : plan.removed.map((cut) => cut.id));
          setSelectedSectionId((currentId) =>
            currentId && plan.sections.some((section) => section.id === currentId) ? currentId : null
          );
          setColorPresetId((plan.color.presetId as ColorPresetId) || "neutral");
          setColorAdjustments(plan.color.adjustments ?? DEFAULT_COLOR_ADJUSTMENTS);
          setCaptionSettings(plan.captionSettings);
          setCaptionStyleId(plan.captionSettings.styleId ?? (plan.captions[0]?.styleId as CaptionStyleId | undefined) ?? DEFAULT_CAPTION_STYLE_ID);
          setMusicPath(plan.audio.music?.path ?? null);
          setFlipHorizontal(plan.video.flipHorizontal);
        }
      })
      .catch((err) => {
        if (isStale || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar o plano de edição");
      });
    return () => {
      isStale = true;
      controller.abort();
    };
  }, [job]);

  useEffect(() => {
    if (!job || !editPlan || activeWorkspaceTab !== "export") return;
    void refreshPublishReadiness();
  }, [activeWorkspaceTab, editPlan?.projectId, job?.projectId]);

  function resetForSelectedFile(nextFile: File | null) {
    setError(null);
    setJob(null);
    setEditPlan(null);
    setKnownCuts([]);
    setActiveCutIds([]);
    setSelectedCutId(null);
    setPreviewCutId(null);
    setSelectedSectionId(null);
    setSectionFilter("all");
    setMusicPath(null);
    setColorPresetId("neutral");
    setColorAdjustments(DEFAULT_COLOR_ADJUSTMENTS);
    setAudioCleanup(false);
    setAudioDucking(false);
    setExportJob(null);
    setCaptionJob(null);
    setYoutubePackageJob(null);
    setYoutubePackageSummary(null);
    setSelectedPackageAssetName(null);
    setSelectedGeneratedThumbnailName(null);
    setIsPublicationReviewOpen(false);
    setPublicationTitle("");
    setPublicationDescription("");
    setPublicationVisibility("private");
    setIsPublishingYoutube(false);
    setYoutubePublicationUrl(null);
    setIsGeneratingYoutubePackage(false);
    setCaptionSettings(DEFAULT_CAPTION_SETTINGS);
    setCaptionStyleId(DEFAULT_CAPTION_STYLE_ID);
    setActiveWorkspaceTab("review");
    setFile(nextFile);
  }

  async function startUpload() {
    if (!file) return;
    setError(null);
    setIsUploading(true);
    setUploadStartedAt(Date.now());
    try {
      const result = await uploadVideo(file, {
        uploadFileSizeLimitBytes: uploadConfig?.uploadFileSizeLimitBytes,
        cutPresetId
      });
      setJob(result.job);
      setActiveWorkspaceTab("review");
      void refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setIsUploading(false);
      setUploadStartedAt(null);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    await startUpload();
  }

  async function onManualRerender(options: {
    applyColor?: boolean;
    flipHorizontal?: boolean;
    musicPath?: string | null;
    audioCleanup?: boolean;
    audioDucking?: boolean;
  } = {}) {
    if (!job) return;
    setError(null);
    setIsRerendering(true);
    try {
      const colorPayload = options.applyColor ? { colorPresetId, colorAdjustments } : {};
      const selectedCut = selectedCutId ? knownCuts.find((cut) => cut.id === selectedCutId) ?? null : null;
      const nextJob = await rerenderProject(job.projectId, {
        activeCuts: knownCuts.filter((cut) => activeCutIds.includes(cut.id)),
        ...colorPayload,
        flipHorizontal: options.flipHorizontal ?? flipHorizontal,
        musicPath: options.musicPath !== undefined ? options.musicPath : musicPath,
        audioCleanup: options.audioCleanup ?? audioCleanup,
        audioDucking: options.audioDucking ?? audioDucking,
        preview: {
          enabled: true,
          durationSec: 20,
          ...(selectedCut
            ? { focusSourceSec: selectedCut.startSec }
            : { focusTimelineSec: videoTimeSec })
        }
      });
      setJob(nextJob);
      void refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao renderizar a edição manual");
    } finally {
      setIsRerendering(false);
    }
  }

  async function onMusicSelected(file: File | null) {
    if (!file || !job) return;
    setError(null);
    try {
      const result = await uploadMusic(job.projectId, file);
      setMusicPath(result.musicPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar a música");
    }
  }

  function onAudioCleanupToggle(value: boolean) {
    setAudioCleanup(value);
  }

  function onAudioDuckingToggle(value: boolean) {
    setAudioDucking(value);
  }

  function onFlipHorizontalToggle(value: boolean) {
    setFlipHorizontal(value);
  }

  function onApplyAudioPreview() {
    void onManualRerender({ musicPath, audioCleanup, audioDucking });
  }

  async function onGenerateCaptions() {
    if (!job) return;
    setError(null);
    setIsCaptioning(true);
    try {
      const nextJob = await generateCaptions(job.projectId, { captionStyleId: captionSettings.styleId });
      setCaptionJob(nextJob);
      setActiveWorkspaceTab("captions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar legendas com Whisper");
      setIsCaptioning(false);
    }
  }

  async function refreshProjects() {
    setIsLoadingProjects(true);
    try {
      setProjects(await listProjects());
    } catch {
      // A biblioteca nao bloqueia a edicao atual.
    } finally {
      setIsLoadingProjects(false);
    }
  }

  async function refreshPublishReadiness() {
    const projectId = job?.projectId;
    if (!projectId) return;
    try {
      const publishReadiness = await fetchPublishReadiness(projectId);
      if (activeProjectIdRef.current && activeProjectIdRef.current !== projectId) return;
      setEditPlan((plan) => plan?.projectId === projectId ? { ...plan, publishReadiness } : plan);
    } catch (err) {
      const detail = err instanceof Error ? `: ${err.message}` : "";
      setError(`Falha ao atualizar checklist de publicação${detail}`);
    }
  }

  async function refreshYoutubePackageSummary(projectId = job?.projectId) {
    if (!projectId) return;
    try {
      const summary = await fetchYoutubePackageSummary(projectId);
      if (activeProjectIdRef.current && activeProjectIdRef.current !== projectId) return;
      setYoutubePackageSummary(summary);
      setSelectedPackageAssetName((currentName) => {
        if (currentName && summary.assets.some((asset) => asset.name === currentName)) return currentName;
        return summary.assets[0]?.name ?? null;
      });
      setSelectedGeneratedThumbnailName((currentName) => getInitialSelectedThumbnailName(summary, currentName));
      setPublicationTitle((currentTitle) => currentTitle.trim() ? currentTitle : summary.title ?? "");
      setPublicationDescription((currentDescription) => (
        currentDescription.trim() ? currentDescription : composeYoutubeDescription(summary.description ?? "", summary.chapters)
      ));
    } catch (err) {
      const detail = err instanceof Error ? `: ${err.message}` : "";
      setError(`Falha ao carregar pacote YouTube${detail}`);
    }
  }

  async function onDeleteProject(project: ProjectLibraryItem) {
    const confirmed = window.confirm(`Apagar o projeto "${project.name}"? Essa ação remove os arquivos locais desse projeto.`);
    if (!confirmed) return;
    setError(null);
    try {
      await deleteProject(project.id);
      if (job?.projectId === project.id) {
        setJob(null);
        setEditPlan(null);
        setKnownCuts([]);
        setActiveCutIds([]);
        setSelectedCutId(null);
        setSelectedCaptionId(null);
        setSelectedSectionId(null);
        setPreviewCutId(null);
        setExportJob(null);
        setCaptionJob(null);
        setYoutubePackageJob(null);
        setYoutubePackageSummary(null);
        setSelectedPackageAssetName(null);
        setSelectedGeneratedThumbnailName(null);
        setIsPublicationReviewOpen(false);
        setPublicationTitle("");
        setPublicationDescription("");
        setPublicationVisibility("private");
        setIsPublishingYoutube(false);
        setYoutubePublicationUrl(null);
        setIsExporting(false);
        setIsGeneratingYoutubePackage(false);
      }
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao apagar projeto");
    }
  }

  async function openProject(project: ProjectLibraryItem) {
    setError(null);
    try {
      const plan = await fetchEditPlan(project.id);
      const now = new Date().toISOString();
      setFile(null);
      setEditPlan(plan);
      setKnownCuts(plan.removed);
      setActiveCutIds(plan.removed.map((cut) => cut.id));
      setSelectedCutId(null);
      setSelectedCaptionId(null);
      setSelectedSectionId(null);
      setSectionFilter("all");
      setPreviewCutId(null);
      setExportJob(null);
      setCaptionJob(null);
      setYoutubePackageJob(null);
      setYoutubePackageSummary(null);
      setSelectedPackageAssetName(null);
      setSelectedGeneratedThumbnailName(null);
      setIsPublicationReviewOpen(false);
      setPublicationTitle("");
      setPublicationDescription("");
      setPublicationVisibility("private");
      setIsPublishingYoutube(false);
      setYoutubePublicationUrl(null);
      setIsExporting(false);
      setIsGeneratingYoutubePackage(false);
      setCaptionSettings(plan.captionSettings);
      setColorPresetId((plan.color.presetId as ColorPresetId) || "neutral");
      setColorAdjustments(plan.color.adjustments ?? DEFAULT_COLOR_ADJUSTMENTS);
      setMusicPath(plan.audio.music?.path ?? null);
      setFlipHorizontal(plan.video.flipHorizontal);
      setJob({
        id: `restored_${plan.projectId}`,
        projectId: plan.projectId,
        status: "passed",
        stage: "complete",
        message: "Rough cut draft passed basic QA",
        sourcePath: "",
        outputPath: "",
        outputUrl: project.outputUrl ?? `/media/${encodeURIComponent(plan.projectId)}/rough-cut.mp4`,
        planPath: "",
        warnings: [],
        error: null,
        createdAt: now,
        updatedAt: now
      });
      void refreshYoutubePackageSummary(project.id);
      setActiveWorkspaceTab("review");
      window.history.replaceState(null, "", `?projectId=${encodeURIComponent(project.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao abrir projeto");
    }
  }

  async function onExport() {
    if (!job) return;
    setError(null);
    setIsExporting(true);
    setYoutubePublicationUrl(null);
    try {
      let exportCaptionSettings: CaptionSettings | undefined;
      if (exportRenderMode === "full" && selectedCaption) {
        const nextPlan = await updateCaption(job.projectId, selectedCaption.id, { text: selectedCaption.text, styleId: captionStyleId });
        setEditPlan(nextPlan);
      }
      if (exportRenderMode === "full" && editPlan?.captions.length) {
        const nextPlan = await updateCaptionSettings(job.projectId, captionSettings);
        exportCaptionSettings = nextPlan.captionSettings;
        setEditPlan(nextPlan);
        setCaptionSettings(nextPlan.captionSettings);
        setCaptionStyleId(nextPlan.captionSettings.styleId);
      }
      const nextJob = await exportProject(job.projectId, {
        renderMode: exportRenderMode,
        format: exportAspect,
        resolution: exportResolution,
        quality: exportQuality === "fast" ? "rapida" : "maxima",
        fileName: exportName.endsWith(".mp4") ? exportName : `${exportName}.mp4`,
        audioCleanup,
        audioDucking,
        sdrMode: exportSdrMode,
        captionSettings: exportCaptionSettings
      });
      setExportJob(nextJob);
      void refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao iniciar exportacao");
    } finally {
      setIsExporting(false);
    }
  }

  async function onDownloadExport() {
    if (!exportJob?.outputUrl) return;
    setError(null);
    setIsDownloadingExport(true);
    try {
      await downloadMediaFile(exportJob.outputUrl, normalizeMp4FileName(exportName));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao baixar o MP4 final");
    } finally {
      setIsDownloadingExport(false);
    }
  }

  async function onPublishYoutube() {
    if (!job) return;
    if (!exportJob?.outputUrl) {
      setError("Gere o export final antes de publicar no YouTube.");
      return;
    }
    const title = publicationTitle.trim() || youtubePackageSummary?.title?.trim();
    if (!title) {
      setError("Preencha o título antes de publicar no YouTube.");
      return;
    }
    setError(null);
    setIsPublishingYoutube(true);
    try {
      const publication = await publishYoutubeVideo(job.projectId, {
        title,
        description: publicationDescription,
        privacyStatus: publicationVisibility,
        thumbnailName: selectedGeneratedThumbnailName
      });
      setYoutubePublicationUrl(publication.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao publicar no YouTube");
    } finally {
      setIsPublishingYoutube(false);
    }
  }

  async function onGenerateYoutubePackage() {
    if (!job) return;
    if (!editPlan?.captions.length) {
      setError("Gere as legendas primeiro para a IA ler a transcrição do vídeo.");
      setActiveWorkspaceTab("captions");
      return;
    }
    setError(null);
    setIsGeneratingYoutubePackage(true);
    setYoutubePackageSummary(null);
    setSelectedPackageAssetName(null);
    setSelectedGeneratedThumbnailName(null);
    setIsPublicationReviewOpen(false);
    setYoutubePublicationUrl(null);
    try {
      const nextJob = await generateYoutubePackage(job.projectId);
      setYoutubePackageJob(nextJob);
      setActiveWorkspaceTab("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar pacote YouTube");
    } finally {
      setIsGeneratingYoutubePackage(false);
    }
  }

  async function onGenerateAIMotion() {
    if (!job) return;
    setError(null);
    setIsPlanningMotion(true);
    try {
      const nextJob = await generateAIMotion(job.projectId);
      setJob(nextJob);
      setActiveWorkspaceTab("motion");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar motion com IA");
      setIsPlanningMotion(false);
    }
  }

  function toggleCut(cutId: string) {
    recordTimelineHistory();
    setActiveCutIds((currentIds) =>
      currentIds.includes(cutId) ? currentIds.filter((id) => id !== cutId) : [...currentIds, cutId]
    );
  }

  function nudgeCut(cutId: string, edge: "startSec" | "endSec", delta: number) {
    recordTimelineHistory();
    setKnownCuts((cuts) => cuts.map((cut) => {
      if (cut.id !== cutId) return cut;
      const nextValue = edge === "startSec"
        ? Math.min(cut.endSec - 0.1, Math.max(0, cut.startSec + delta))
        : Math.max(cut.startSec + 0.1, Math.min(editPlan?.source.durationSec ?? Number.POSITIVE_INFINITY, cut.endSec + delta));
      const next = { ...cut, [edge]: Number(nextValue.toFixed(3)) };
      return next.endSec > next.startSec ? next : cut;
    }));
  }

  function setCutEdge(cutId: string, edge: "startSec" | "endSec", value: number) {
    setKnownCuts((cuts) => cuts.map((cut) => {
      if (cut.id !== cutId) return cut;
      return dragCutEdge(cut, edge === "startSec" ? "start" : "end", value, {
        videoDurationSec: editPlan?.source.durationSec ?? cut.endSec,
        minDurationSec: 0.1
      });
    }));
  }

  function recordTimelineHistory() {
    setTimelinePast((past) => [...past.slice(-19), { cuts: knownCuts, activeCutIds }]);
    setTimelineFuture([]);
  }

  function undoTimeline() {
    const previous = timelinePast.at(-1);
    if (!previous) return;
    setTimelineFuture((future) => [{ cuts: knownCuts, activeCutIds }, ...future.slice(0, 19)]);
    setTimelinePast((past) => past.slice(0, -1));
    setKnownCuts(previous.cuts);
    setActiveCutIds(previous.activeCutIds);
  }

  function redoTimeline() {
    const next = timelineFuture[0];
    if (!next) return;
    setTimelinePast((past) => [...past.slice(-19), { cuts: knownCuts, activeCutIds }]);
    setTimelineFuture((future) => future.slice(1));
    setKnownCuts(next.cuts);
    setActiveCutIds(next.activeCutIds);
  }

  function restoreAllCuts() {
    if (activeCutIds.length === 0) return;
    recordTimelineHistory();
    setActiveCutIds([]);
    setSelectedCutId(null);
    setPreviewCutId(null);
  }

  function updateCaptionText(captionId: string, text: string) {
    setEditPlan((plan) => {
      if (!plan) return plan;
      return {
        ...plan,
        captions: plan.captions.map((caption) => caption.id === captionId ? { ...caption, text } : caption)
      };
    });
  }

  async function saveCaption(caption: Caption) {
    if (!job) return;
    try {
      const nextPlan = await updateCaption(job.projectId, caption.id, { text: caption.text, styleId: captionStyleId });
      setEditPlan(nextPlan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar a legenda");
    }
  }

  function setCaptionSetting<K extends keyof CaptionSettings>(key: K, value: CaptionSettings[K]) {
    setCaptionSettings((settings) => ({ ...settings, [key]: value }));
  }

  async function saveCaptionSettings(nextSettings: CaptionSettings = captionSettings) {
    if (!job) return;
    try {
      const nextPlan = await updateCaptionSettings(job.projectId, nextSettings);
      setEditPlan(nextPlan);
      setCaptionSettings(nextPlan.captionSettings);
      setCaptionStyleId(nextPlan.captionSettings.styleId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar configurações de legenda");
    }
  }

  async function saveSectionPatch(section: TimelineSection, patch: SectionPatch) {
    if (!job) return;
    const optimisticSection = mergeSectionPatchLocal(section, patch);
    const saveVersion = (sectionSaveVersions.current.get(section.id) ?? 0) + 1;
    sectionSaveVersions.current.set(section.id, saveVersion);
    setError(null);
    if (patch.type && sectionFilter !== "all") {
      setSectionFilter(patch.type);
    }
    setEditPlan((plan) => plan ? { ...plan, sections: replaceSection(plan.sections, optimisticSection) } : plan);
    try {
      const nextPlan = await updateSection(job.projectId, section.id, patch);
      if (sectionSaveVersions.current.get(section.id) !== saveVersion) return;
      const savedSection = nextPlan.sections.find((nextSection) => nextSection.id === section.id);
      setEditPlan((plan) => {
        if (!plan) return nextPlan;
        return {
          ...plan,
          publishReadiness: nextPlan.publishReadiness,
          sections: savedSection ? replaceSection(plan.sections, savedSection) : plan.sections
        };
      });
      setSelectedSectionId((currentId) =>
        currentId && nextPlan.sections.some((nextSection) => nextSection.id === currentId) ? currentId : null
      );
    } catch (err) {
      if (sectionSaveVersions.current.get(section.id) !== saveVersion) return;
      setEditPlan((plan) => plan ? { ...plan, sections: replaceSection(plan.sections, section) } : plan);
      setError(err instanceof Error ? err.message : "Falha ao salvar a seção");
    }
  }

  function updateCaptionSettingsLocal<K extends keyof CaptionSettings>(key: K, value: CaptionSettings[K]) {
    const nextSettings = { ...captionSettings, [key]: value };
    setCaptionSettings(nextSettings);
    if (key === "styleId") setCaptionStyleId(value as CaptionStyleId);
  }

  function seekTo(seconds: number) {
    const nextTime = Math.max(0, seconds);
    if (videoRef.current) {
      videoRef.current.currentTime = nextTime;
      setVideoTimeSec(videoRef.current.currentTime);
    }
    if (compareBeforeRef.current) compareBeforeRef.current.currentTime = nextTime;
    if (compareAfterRef.current) compareAfterRef.current.currentTime = nextTime;
  }

  function selectSection(section: TimelineSection) {
    setSelectedSectionId((currentId) => getNextSelectedSectionId(currentId, section));
    if (selectedSectionId !== section.id) {
      seekTo(section.startSec);
    }
  }

  const fileLimitBytes = uploadConfig?.uploadFileSizeLimitBytes;
  const isFileTooLarge = file && fileLimitBytes !== undefined && file.size > fileLimitBytes;
  const selectedCut = selectedCutId ? knownCuts.find((cut) => cut.id === selectedCutId) ?? null : null;
  const activeCaption = editPlan ? getActiveCaption(editPlan.captions, videoTimeSec) : null;
  const selectedCaption = editPlan && selectedCaptionId ? editPlan.captions.find((caption) => caption.id === selectedCaptionId) ?? null : activeCaption;
  const selectedSection = editPlan ? getSelectedSection(editPlan.sections, selectedSectionId) : null;
  const renderedDuration = editPlan ? getManualRenderedDuration(editPlan, knownCuts, activeCutIds) : null;
  const beforeDuration = editPlan?.source.durationSec ?? 0;
  const durationComparison = editPlan ? compareManualDurations(editPlan.source.durationSec, knownCuts, editPlan.removed.map((cut) => cut.id), activeCutIds) : null;
  const savedSeconds = durationComparison?.removedAfterSec ?? Math.max(0, beforeDuration - (renderedDuration ?? beforeDuration));
  const mediaCacheToken = job ? `${job.id}-${job.updatedAt}` : "";
  const previewVideoUrl = appendMediaCacheBust(job?.outputUrl ?? null, mediaCacheToken);
  const isShortEditPreview = Boolean(!compareMode && previewVideoUrl?.includes("preview-sample.mp4"));
  const currentProject = job ? projects.find((project) => project.id === job.projectId) ?? null : null;
  const hasEditorSurface = Boolean(editPlan || job?.outputUrl);
  const visibleWorkspaceTabs = getVisibleWorkspaceTabs(hasEditorSurface);
  const showProjectProcessing = Boolean(job && (!hasEditorSurface || isActiveJob(job) || job.status === "failed"));

  function onSectionFilterChange(filter: TimelineSectionType | "all") {
    setSectionFilter(filter);
    if (!editPlan) return;
    const selectedStillVisible = filter === "all"
      ? editPlan.sections.some((section) => section.id === selectedSectionId)
      : editPlan.sections.some((section) => section.id === selectedSectionId && section.type === filter);
    if (!selectedStillVisible) {
      setSelectedSectionId(null);
    }
  }

  function openReviewTarget(tab: WorkspaceTab, sectionId?: string) {
    if (sectionId && editPlan) {
      const section = editPlan.sections.find((item) => item.id === sectionId);
      if (section) {
        setSelectedSectionId(section.id);
        setSectionFilter(section.type);
        seekTo(section.startSec);
      }
    }
    setActiveWorkspaceTab(tab);
  }

  return (
    <>
      <GuidedShell
        file={file}
        job={job}
        editPlan={editPlan}
        youtubePackageSummary={youtubePackageSummary}
        selectedGeneratedThumbnailName={selectedGeneratedThumbnailName}
        isExporting={isExporting}
        isPublishingYoutube={isPublishingYoutube}
        youtubePublicationUrl={youtubePublicationUrl}
        exportJob={exportJob}
        isUploading={isUploading}
        isCaptioning={isCaptioning}
        captionJob={captionJob}
        isGeneratingYoutubePackage={isGeneratingYoutubePackage}
        youtubePackageJob={youtubePackageJob}
        uploadConfig={uploadConfig}
        isFileTooLarge={Boolean(isFileTooLarge)}
        error={error}
        projects={projects}
        publicationTitle={publicationTitle}
        publicationDescription={publicationDescription}
        publicationVisibility={publicationVisibility}
        onFileSelected={resetForSelectedFile}
        onStartUpload={() => void startUpload()}
        onGenerateCaptions={() => void onGenerateCaptions()}
        onGenerateYoutubePackage={() => void onGenerateYoutubePackage()}
        onSelectGeneratedThumbnail={setSelectedGeneratedThumbnailName}
        onPublicationTitleChange={setPublicationTitle}
        onPublicationDescriptionChange={setPublicationDescription}
        onPublicationVisibilityChange={setPublicationVisibility}
        onStartFinalExport={() => void onExport()}
        onPublishYoutube={() => void onPublishYoutube()}
      />

      {isAdvancedEditorOpen ? (
      <section className="studio">
        <aside className="left-rail">
          <div className="rail-section">
            <p className="section-label">Arquivo</p>
            <form className="upload-form" onSubmit={onSubmit}>
              <label className="file-drop">
                <span>{file ? file.name : "Escolher arquivo de vídeo"}</span>
                <small>MOV, MP4 e gravações de tela</small>
                <input
	                  type="file"
	                  accept={VIDEO_FILE_INPUT_ACCEPT}
	                  onChange={(event) => resetForSelectedFile(event.currentTarget.files?.[0] ?? null)}
	                />
              </label>
              <div className="draft-setup">
                <p className="section-label">Antes do rascunho</p>
                <div className="preset-grid compact-presets" role="radiogroup" aria-label="Preset de corte inicial">
                  {CUT_PRESETS.map((preset) => (
                    <label className={`preset-option ${cutPresetId === preset.id ? "preset-option-active" : ""}`} key={preset.id}>
                      <input
                        type="radio"
                        name="initial-cut-preset"
                        value={preset.id}
                        checked={cutPresetId === preset.id}
                        onChange={() => setCutPresetId(preset.id)}
                      />
                      <span>{preset.label}</span>
                      <small>{preset.description}</small>
                    </label>
                  ))}
                </div>
              </div>
              <button type="submit" disabled={!file || isUploading || Boolean(isFileTooLarge)}>
                {isUploading ? "Enviando..." : "Gerar rascunho"}
              </button>
            </form>
          </div>
          <div className="rail-section">
            <p className="section-label">Projeto atual</p>
            {currentProject ? (
              <button type="button" className="project-card project-card-active" onClick={() => setActiveWorkspaceTab("projects")}>
                <span>{currentProject.name}</span>
                <small>
                  {formatSeconds(currentProject.durationSec ?? editPlan?.source.durationSec ?? 0)} · {translateProjectStatus(currentProject.status)}
                </small>
              </button>
            ) : job ? (
              <button type="button" className="project-card project-card-active" onClick={() => setActiveWorkspaceTab("projects")}>
                <span>{job.projectId}</span>
                <small>{editPlan ? `${formatSeconds(editPlan.source.durationSec)} · ` : ""}{translateJobState(job)}</small>
              </button>
            ) : (
              <button type="button" className="project-card" onClick={() => setActiveWorkspaceTab("projects")}>
                <span>Abrir projetos</span>
                <small>{projects.length ? `${projects.length} projetos salvos` : "Histórico local"}</small>
              </button>
            )}
          </div>
          {file ? (
            <p className="file-meta">
              {formatBytes(file.size)}
              {fileLimitBytes !== undefined ? ` / limite ${formatBytes(fileLimitBytes)}` : ""}
            </p>
          ) : null}
          {isFileTooLarge ? (
            <p className="error">
              Esse arquivo passa do limite local de upload. Para testar agora, use um MP4 menor ou aumente
              AI_EDITOR_UPLOAD_LIMIT_BYTES.
            </p>
          ) : null}
          {error ? <p className="error">{error}</p> : null}
        </aside>

        <section className="stage">
          {isUploading && file ? (
            <ProcessingPanel
              mode="upload"
              fileName={file.name}
              fileSizeBytes={file.size}
              startedAtMs={uploadStartedAt ?? nowMs}
              nowMs={nowMs}
            />
          ) : job ? (
            <div className="job-header">
              <div>
                <p className="eyebrow">Renderização</p>
                <h2>{translateJobMessage(job.message)}</h2>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <p className="eyebrow">Pronto</p>
              <h2>Envie um vídeo para começar a editar.</h2>
            </div>
          )}

          {job?.warnings.length ? (
            <ul className="warnings">
              {job.warnings.map((warning) => (
                <li key={warning}>{translateWarning(warning)}</li>
              ))}
            </ul>
          ) : null}

          {job?.error && !showProjectProcessing ? <p className="error">{job.error}</p> : null}

          {showProjectProcessing && job ? (
            <ProcessingPanel
              mode="job"
              job={job}
              fileName={file?.name ?? currentProject?.sourceFileName ?? currentProject?.name ?? job.projectId}
              fileSizeBytes={file?.size ?? null}
              startedAtMs={Date.parse(job.createdAt)}
              nowMs={nowMs}
            />
          ) : null}

          {visibleWorkspaceTabs.length ? (
            <nav className="workspace-tabs" aria-label="Áreas do editor" role="tablist">
              {visibleWorkspaceTabs.map((tab) => (
                <button
                  type="button"
                  className={activeWorkspaceTab === tab.id ? "workspace-tab-active" : ""}
                  key={tab.id}
                  id={`workspace-tab-${tab.id}`}
                  role="tab"
                  aria-selected={activeWorkspaceTab === tab.id}
                  aria-controls="workspace-panel"
                  onClick={() => {
                    setActiveWorkspaceTab(tab.id);
                    if (tab.id !== "cut") setSelectedCutId(null);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          ) : null}

          {job?.outputUrl ? (
            <>
              <div className="player-toolbar">
                <div>
                  <p className="section-label">Revisão</p>
                  <h3>{compareMode ? "Original antes dos cortes" : isShortEditPreview ? "Prévia rápida da edição" : "Rascunho editado"}</h3>
                </div>
                <div className="toolbar-actions">
                  <button type="button" onClick={() => setActiveWorkspaceTab("export")}>Exportar</button>
                  {editPlan ? (
                    <button type="button" className="ghost-button" onClick={() => setCompareMode((value) => !value)}>
                      {compareMode ? "Ver depois" : "Antes/depois"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setActiveWorkspaceTab("captions");
                      if (!editPlan?.captions.length) void onGenerateCaptions();
                    }}
                    disabled={isCaptioning}
                  >
                    {isCaptioning ? "Gerando legendas..." : editPlan?.captions.length ? "Editar legendas" : "Gerar legendas"}
                  </button>
                </div>
              </div>
              <div className="player-frame">
                {compareMode && editPlan ? (
                  <div className="compare-player">
                    <div className="compare-pane">
                      <span>Antes</span>
                      <video
                        ref={compareBeforeRef}
                        key={`${job.id}-${job.updatedAt}-compare-before`}
                        src={appendMediaCacheBust(editPlan.sourceUrl, mediaCacheToken) ?? editPlan.sourceUrl}
                        muted
                        playsInline
                      />
                    </div>
                    <div className="compare-pane">
                      <span>Depois</span>
                      <video
                        ref={(element) => {
                          videoRef.current = element;
                          compareAfterRef.current = element;
                        }}
                        key={`${job.id}-${job.updatedAt}-compare-after`}
                        src={previewVideoUrl ?? job.outputUrl}
                        controls
                        playsInline
                        onTimeUpdate={(event) => {
                          const time = event.currentTarget.currentTime;
                          setVideoTimeSec(time);
                          if (compareBeforeRef.current && Math.abs(compareBeforeRef.current.currentTime - time) > 0.18) {
                            compareBeforeRef.current.currentTime = time;
                          }
                        }}
                        onPlay={() => void compareBeforeRef.current?.play().catch(() => undefined)}
                        onPause={() => compareBeforeRef.current?.pause()}
                        onSeeked={(event) => seekTo(event.currentTarget.currentTime)}
                        onLoadedMetadata={(event) => setVideoTimeSec(event.currentTarget.currentTime)}
                      />
                    </div>
                  </div>
                ) : (
                  <div
                    className="player-video-shell"
                    style={{
                      aspectRatio: editPlan ? `${editPlan.source.width} / ${editPlan.source.height}` : "16 / 9",
                      "--video-aspect": editPlan ? String(editPlan.source.width / editPlan.source.height) : "1.777"
                    } as CSSProperties}
                  >
                    <video
                      ref={videoRef}
                      key={`${job.id}-${job.updatedAt}-after`}
                      src={previewVideoUrl ?? job.outputUrl}
                      controls
                      onTimeUpdate={(event) => setVideoTimeSec(event.currentTarget.currentTime)}
                      onSeeked={(event) => setVideoTimeSec(event.currentTarget.currentTime)}
                      onLoadedMetadata={(event) => setVideoTimeSec(event.currentTarget.currentTime)}
                    />
                    {editPlan?.captions.length && !isShortEditPreview ? (
                      <CaptionPreviewLayer
                        captions={editPlan.captions}
                        sections={editPlan.sections}
                        currentTimeSec={videoTimeSec}
                        settings={captionSettings}
                        selectedCaptionId={selectedCaption?.id ?? null}
                        onSelectCaption={(caption) => {
                          setSelectedCutId(null);
                          setActiveWorkspaceTab("captions");
                          setSelectedCaptionId(caption.id);
                          seekTo(caption.startSec);
                        }}
                      />
                    ) : null}
                  </div>
                )}
              </div>
              {editPlan && activeWorkspaceTab === "review" ? (
                <ReviewCockpit
                  plan={editPlan}
                  selectedSection={selectedSection}
                  selectedSectionId={selectedSectionId}
                  sectionFilter={sectionFilter}
                  onSectionFilterChange={onSectionFilterChange}
                  onSelectSection={selectSection}
                  onOpenTarget={openReviewTarget}
                />
              ) : null}
              {editPlan && activeWorkspaceTab === "cut" ? (
                <div className="timeline-panel">
                  <div className="timeline-toolbar">
                    <div>
                      <p className="section-label">Timeline</p>
                      <strong>{timelineZoom.toFixed(1)}x zoom</strong>
                    </div>
                    <div className="timeline-actions">
                      <button type="button" className="ghost-button" onClick={undoTimeline} disabled={timelinePast.length === 0}>Desfazer</button>
                      <button type="button" className="ghost-button" onClick={redoTimeline} disabled={timelineFuture.length === 0}>Refazer</button>
                      <button type="button" className="ghost-button" onClick={restoreAllCuts} disabled={activeCutIds.length === 0}>Restaurar tudo</button>
                    </div>
                  </div>
                  <RangeField label="Zoom" value={timelineZoom} min={1} max={6} step={0.5} suffix="x" onChange={setTimelineZoom} onCommit={setTimelineZoom} />
                  <Timeline
                    plan={editPlan}
                    cuts={knownCuts}
                    activeCutIds={activeCutIds}
                    selectedCutId={selectedCutId}
                    zoom={timelineZoom}
                    onSelect={(cutId) => {
                      setSelectedCutId(cutId);
                      setPreviewCutId(cutId);
                      setActiveWorkspaceTab("cut");
                    }}
                  />
                </div>
              ) : null}
            </>
          ) : null}

          {editPlan && activeWorkspaceTab === "cut" ? (
            <div className="edit-plan">
              <div className="plan-stats">
                <span>{activeCutIds.length} cortes ativos</span>
                <span>{renderedDuration ? formatSeconds(renderedDuration) : "0.0s"} final</span>
                <span>{formatSeconds(editPlan.source.durationSec)} original</span>
                <span>{formatSeconds(savedSeconds)} removidos</span>
              </div>
              {knownCuts.length > 0 ? (
                <div className="cut-list">
                  {knownCuts.map((cut) => (
                    <div className={`cut-item ${selectedCutId === cut.id ? "cut-item-selected" : ""}`} key={cut.id}>
                      <label className="cut-toggle">
                        <input
                          type="checkbox"
                          checked={activeCutIds.includes(cut.id)}
                          onChange={() => toggleCut(cut.id)}
                        />
                        <strong>{formatSeconds(cut.startSec)} até {formatSeconds(cut.endSec)}</strong>
                      </label>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          setSelectedCutId(cut.id);
                          setActiveWorkspaceTab("cut");
                        }}
                      >
                        Ajustar
                      </button>
                      <span>{activeCutIds.includes(cut.id) ? "Cortar" : "Restaurado"}</span>
                    </div>
                  ))}
                  <button type="button" onClick={() => onManualRerender()} disabled={isRerendering || !job?.outputUrl}>
                    {isRerendering ? "Gerando prévia..." : "Gerar prévia de 20s"}
                  </button>
                </div>
              ) : (
                <p className="file-meta">Nenhum corte removível foi detectado com esse preset.</p>
              )}
              {durationComparison ? (
                <p className="file-meta">
                  Antes: {formatSeconds(durationComparison.beforeDurationSec)} · depois: {formatSeconds(durationComparison.afterDurationSec)} · delta {formatSignedSeconds(durationComparison.deltaSec)}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <aside
          className="inspector"
          id="workspace-panel"
          role="tabpanel"
          aria-labelledby={`workspace-tab-${activeWorkspaceTab}`}
        >
          <div>
            <p className="eyebrow">Inspetor</p>
            <h3>{getWorkspaceTabLabel(activeWorkspaceTab)}</h3>
          </div>
          {SECTION_INSPECTOR_TABS.includes(activeWorkspaceTab) && selectedSection ? (
            <SectionInspector
              section={selectedSection}
              onClear={() => setSelectedSectionId(null)}
              onSave={(section, patch) => void saveSectionPatch(section, patch)}
            />
          ) : null}
          {activeWorkspaceTab === "review" ? (
            <ReviewInspectorPanel
              plan={editPlan}
              selectedSection={selectedSection}
              onOpenTarget={openReviewTarget}
              onSeek={(seconds) => seekTo(seconds)}
            />
          ) : activeWorkspaceTab === "projects" ? (
            <ProjectLibraryPanel
              projects={projects}
              activeProjectId={job?.projectId ?? null}
              isLoading={isLoadingProjects}
              onRefresh={() => void refreshProjects()}
              onOpen={(project) => void openProject(project)}
              onDelete={(project) => void onDeleteProject(project)}
            />
          ) : activeWorkspaceTab === "cut" ? (
            <CutWorkspacePanel
              selectedCut={selectedCut}
              activeCutIds={activeCutIds}
              editPlan={editPlan}
              cutPresetId={cutPresetId}
              previewCutId={previewCutId}
              onCutPresetChange={setCutPresetId}
              onPreview={(cutId) => setPreviewCutId(cutId)}
              onToggle={(cutId) => toggleCut(cutId)}
              onNudge={(cutId, edge, delta) => nudgeCut(cutId, edge, delta)}
              onBeginAdjust={recordTimelineHistory}
              onSetEdge={(cutId, edge, value) => setCutEdge(cutId, edge, value)}
            />
          ) : activeWorkspaceTab === "captions" ? (
            editPlan?.captions.length ? (
              <CaptionSettingsPanel
                settings={captionSettings}
                caption={selectedCaption}
                currentTimeSec={videoTimeSec}
                captionCount={editPlan.captions.length}
                wordCount={countCaptionWords(editPlan)}
                onChangeSetting={updateCaptionSettingsLocal}
                onCommitSettings={(settings) => void saveCaptionSettings(settings)}
                onChangeText={(text) => selectedCaption ? updateCaptionText(selectedCaption.id, text) : undefined}
                onCommitText={() => selectedCaption ? void saveCaption(selectedCaption) : undefined}
                onSeek={() => selectedCaption ? seekTo(selectedCaption.startSec) : undefined}
              />
            ) : (
              <ActionPanel
                title="Legendas ainda não geradas"
                description="Gere uma transcrição com Whisper para abrir os controles finos de estilo, fonte, cor e texto."
                actionLabel={isCaptioning ? "Gerando..." : "Gerar legendas"}
                disabled={!job || isCaptioning}
                onAction={onGenerateCaptions}
              />
            )
          ) : activeWorkspaceTab === "audio" ? (
            <AudioSettingsPanel
              musicPath={musicPath}
              audioCleanup={audioCleanup}
              audioDucking={audioDucking}
              isRerendering={isRerendering}
              onMusicSelected={onMusicSelected}
              onAudioCleanupChange={onAudioCleanupToggle}
              onAudioDuckingChange={onAudioDuckingToggle}
              onApplyPreview={onApplyAudioPreview}
            />
          ) : activeWorkspaceTab === "motion" ? (
            <MotionSettingsPanel
              plan={editPlan}
              selectedSection={selectedSection}
              onSelectSection={selectSection}
              onSave={(section, patch) => void saveSectionPatch(section, patch)}
              onPreview={() => onManualRerender()}
              onCreateAIMotion={() => void onGenerateAIMotion()}
              isPlanningMotion={isPlanningMotion}
              isRerendering={isRerendering}
            />
          ) : activeWorkspaceTab === "color" ? (
            <ColorSettingsPanel
              colorPresetId={colorPresetId}
              appliedColorPresetId={(editPlan?.color.presetId as ColorPresetId | undefined) || "neutral"}
              adjustments={colorAdjustments}
              appliedAdjustments={editPlan?.color.adjustments ?? DEFAULT_COLOR_ADJUSTMENTS}
              flipHorizontal={flipHorizontal}
              appliedFlipHorizontal={editPlan?.video.flipHorizontal ?? false}
              isRerendering={isRerendering}
              onColorChange={setColorPresetId}
              onAdjustmentChange={(key, value) => setColorAdjustments((current) => ({ ...current, [key]: value }))}
              onFlipHorizontalChange={onFlipHorizontalToggle}
              onApply={() => onManualRerender({ applyColor: true, flipHorizontal })}
            />
          ) : (
            <FinalizePanel
              publishReadiness={editPlan?.publishReadiness ?? null}
              onRefreshReadiness={refreshPublishReadiness}
              exportRenderMode={exportRenderMode}
              onExportRenderModeChange={setExportRenderMode}
              exportAspect={exportAspect}
              onExportAspectChange={setExportAspect}
              exportResolution={exportResolution}
              onExportResolutionChange={setExportResolution}
              exportQuality={exportQuality}
              onExportQualityChange={setExportQuality}
              exportSdrMode={exportSdrMode}
              onExportSdrModeChange={setExportSdrMode}
              exportName={exportName}
              onExportNameChange={setExportName}
              onExport={onExport}
              isExporting={isExporting}
              onDownloadExport={onDownloadExport}
              isDownloadingExport={isDownloadingExport}
              exportJob={exportJob}
              onGenerateYoutubePackage={onGenerateYoutubePackage}
              isGeneratingYoutubePackage={isGeneratingYoutubePackage}
              youtubePackageJob={youtubePackageJob}
              hasTranscript={Boolean(editPlan?.captions.length)}
              canUseProject={Boolean(job)}
            />
          )}
          {activeWorkspaceTab === "cut" && editPlan && previewCutId ? (
            <video
              className="cut-preview"
              key={previewCutId}
              src={`${editPlan.sourceUrl}#t=${Math.max(0, (knownCuts.find((cut) => cut.id === previewCutId)?.startSec ?? 0) - 2)},${(knownCuts.find((cut) => cut.id === previewCutId)?.endSec ?? 0) + 2}`}
              controls
              autoPlay
            />
          ) : null}
        </aside>
      </section>
      ) : null}
    </>
  );
}

type GuidedSaasFlowProps = {
  file: File | null;
  job: ProjectJob | null;
  editPlan: EditPlanSummary | null;
  youtubePackageSummary: YoutubePackageSummary | null;
  selectedAssetName: string | null;
  selectedGeneratedThumbnailName: string | null;
  isPublicationReviewOpen: boolean;
  publicationTitle: string;
  publicationDescription: string;
  publicationVisibility: "private" | "unlisted" | "public";
  isExporting: boolean;
  exportJob: ProjectJob | null;
  isUploading: boolean;
  isCaptioning: boolean;
  captionJob: ProjectJob | null;
  isGeneratingYoutubePackage: boolean;
  youtubePackageJob: ProjectJob | null;
  fileLimitBytes: number | undefined;
  isFileTooLarge: boolean;
  error: string | null;
  isAdvancedEditorOpen: boolean;
  onFileSelected: (file: File | null) => void;
  onStartUpload: () => void;
  onGenerateCaptions: () => void;
  onGenerateYoutubePackage: () => void;
  onReviewPublish: () => void;
  onSelectAsset: (assetName: string) => void;
  onSelectGeneratedThumbnail: (assetName: string) => void;
  onPublicationTitleChange: (title: string) => void;
  onPublicationDescriptionChange: (description: string) => void;
  onPublicationVisibilityChange: (visibility: "private" | "unlisted" | "public") => void;
  onStartFinalExport: () => void;
  onOpenAdvancedExport: () => void;
  onToggleAdvanced: () => void;
};

function GuidedSaasFlow({
  file,
  job,
  editPlan,
  youtubePackageSummary,
  selectedAssetName,
  selectedGeneratedThumbnailName,
  isPublicationReviewOpen,
  publicationTitle,
  publicationDescription,
  publicationVisibility,
  isExporting,
  exportJob,
  isUploading,
  isCaptioning,
  captionJob,
  isGeneratingYoutubePackage,
  youtubePackageJob,
  fileLimitBytes,
  isFileTooLarge,
  error,
  isAdvancedEditorOpen,
  onFileSelected,
  onStartUpload,
  onGenerateCaptions,
  onGenerateYoutubePackage,
  onReviewPublish,
  onSelectAsset,
  onSelectGeneratedThumbnail,
  onPublicationTitleChange,
  onPublicationDescriptionChange,
  onPublicationVisibilityChange,
  onStartFinalExport,
  onOpenAdvancedExport,
  onToggleAdvanced
}: GuidedSaasFlowProps) {
  const hasCut = Boolean(job?.outputUrl);
  const hasCaptions = Boolean(editPlan?.captions.length);
  const hasPackage = youtubePackageSummary?.status === "ready";
  const thumbnailIdeaCount = youtubePackageSummary?.thumbnailIdeas.length ?? 0;
  const isCutRunning = Boolean(job && isActiveJob(job));
  const isCaptionJobRunning = Boolean(captionJob && isActiveJob(captionJob));
  const isPackageRunning = Boolean(youtubePackageJob && isActiveJob(youtubePackageJob));
  const selectedAsset = youtubePackageSummary?.assets.find((asset) => asset.name === selectedAssetName)
    ?? youtubePackageSummary?.assets[0]
    ?? null;
  const generatedThumbnails = getGeneratedThumbnailAssets(youtubePackageSummary);
  const selectedGeneratedThumbnail = generatedThumbnails.find((asset) => asset.name === selectedGeneratedThumbnailName)
    ?? generatedThumbnails[0]
    ?? null;
  const packageIssue = youtubePackageSummary?.status === "incomplete"
    ? `Faltando: ${youtubePackageSummary.missing.join(", ")}`
    : null;

  const steps: Array<{ label: string; detail: string; state: "done" | "active" | "waiting" | "failed" }> = [
    {
      label: "Upload",
      detail: file ? file.name : job ? job.projectId : "Aguardando vídeo",
      state: file || job ? "done" : "active"
    },
    {
      label: "Corte",
      detail: hasCut ? "Rascunho pronto" : isCutRunning || isUploading ? "Processando" : "Próximo passo",
      state: job?.status === "failed" ? "failed" : hasCut ? "done" : file || job || isUploading ? "active" : "waiting"
    },
    {
      label: "IA",
      detail: hasCaptions
        ? `${editPlan?.captions.length ?? 0} legendas`
        : captionJob?.status === "failed"
          ? "Falha na transcrição"
          : isCaptioning || isCaptionJobRunning
            ? "Transcrevendo"
            : "Legenda e copy",
      state: captionJob?.status === "failed" ? "failed" : hasCaptions ? "done" : hasCut ? "active" : "waiting"
    },
    {
      label: "Thumbnail",
      detail: thumbnailIdeaCount ? `${thumbnailIdeaCount} ideias V9` : youtubePackageSummary?.assets.length ? `${youtubePackageSummary.assets.length} referências` : "Ideias e assets",
      state: hasPackage ? "done" : hasCaptions || isPackageRunning ? "active" : "waiting"
    },
    {
      label: "Revisão",
      detail: hasPackage ? "Pacote pronto" : "Antes de publicar",
      state: hasPackage ? "active" : "waiting"
    },
    {
      label: "Publicação",
      detail: "YouTube conectado depois",
      state: "waiting"
    }
  ];

  let action: ReactNode;
  if (!file && !job) {
    action = (
      <label className="saas-primary-action">
        Enviar vídeo
        <input
          type="file"
          accept={VIDEO_FILE_INPUT_ACCEPT}
          onChange={(event) => onFileSelected(event.currentTarget.files?.[0] ?? null)}
        />
      </label>
    );
  } else if (file && !job) {
    action = (
      <button type="button" className="saas-primary-action" onClick={onStartUpload} disabled={isUploading || isFileTooLarge}>
        {isUploading ? "Enviando..." : "Gerar corte"}
      </button>
    );
  } else if (hasCut && !hasCaptions) {
    action = (
      <button type="button" className="saas-primary-action" onClick={onGenerateCaptions} disabled={isCaptioning || isCaptionJobRunning}>
        {isCaptioning || isCaptionJobRunning ? "Gerando IA..." : "Gerar transcrição e captions"}
      </button>
    );
  } else if (hasCaptions && !hasPackage) {
    action = (
      <button
        type="button"
        className="saas-primary-action"
        onClick={onGenerateYoutubePackage}
        disabled={isGeneratingYoutubePackage || isPackageRunning}
      >
        {isGeneratingYoutubePackage || isPackageRunning ? "Montando pacote..." : "Gerar pacote YouTube"}
      </button>
    );
  } else if (hasPackage) {
    action = (
      <button type="button" className="saas-primary-action" onClick={onReviewPublish}>
        Revisar publicação
      </button>
    );
  } else {
    action = <button type="button" className="saas-primary-action" disabled>Processando corte</button>;
  }

  return (
    <section className="saas-flow" aria-label="Fluxo principal do Flowcut">
      <div className="saas-flow-main">
        <div className="saas-copy">
          <p className="eyebrow">Fluxo principal</p>
          <h2>Do vídeo bruto ao pacote pronto para YouTube.</h2>
          <p>
            Envie o arquivo, gere o corte horizontal, deixe a IA preparar transcrição, título, descrição e referências
            de thumbnail, depois revise antes de publicar.
          </p>
        </div>
        <div className="saas-action-block">
          {action}
          <button type="button" className="ghost-button" onClick={onToggleAdvanced}>
            {isAdvancedEditorOpen ? "Ocultar editor avançado" : "Abrir editor avançado"}
          </button>
          {file ? (
            <small>
              {formatBytes(file.size)}
              {fileLimitBytes !== undefined ? ` de ${formatBytes(fileLimitBytes)} max.` : ""}
            </small>
          ) : null}
        </div>
      </div>

      <div className="saas-steps" role="list">
        {steps.map((step, index) => (
          <div className={`saas-step saas-step-${step.state}`} role="listitem" key={step.label}>
            <span>{index + 1}</span>
            <strong>{step.label}</strong>
            <small>{step.detail}</small>
          </div>
        ))}
      </div>

      {error || isFileTooLarge || packageIssue ? (
        <div className="saas-alert">
          {isFileTooLarge ? <span>Arquivo acima do limite configurado.</span> : null}
          {packageIssue ? <span>{packageIssue}</span> : null}
          {error ? <span>{error}</span> : null}
        </div>
      ) : null}

      <div className="saas-review-grid">
        <div className="saas-preview">
          {job?.outputUrl ? (
            <video src={appendMediaCacheBust(job.outputUrl, `${job.id}-${job.updatedAt}`) ?? job.outputUrl} controls playsInline />
          ) : (
            <div className="saas-preview-empty">
              <strong>Sem corte ainda</strong>
              <span>O primeiro MP4 aparece aqui quando o render terminar.</span>
            </div>
          )}
        </div>

        <div className="saas-package-panel">
          <div>
            <p className="section-label">Pacote YouTube</p>
            <h3>{youtubePackageSummary?.title ?? "Título gerado aparece aqui"}</h3>
          </div>
          <p>{youtubePackageSummary?.description ?? "A descrição e o prompt de thumbnail ficam disponíveis depois da etapa de IA."}</p>
          <div className="saas-package-facts">
            <span>{hasCaptions ? "Transcrição pronta" : "Sem transcrição"}</span>
            <span>{thumbnailIdeaCount ? `${thumbnailIdeaCount} ideias V9 prontas` : youtubePackageSummary?.thumbnailPrompt ? "Prompt de thumbnail pronto" : "Prompt pendente"}</span>
            <span>{hasPackage ? "Revisão liberada" : "Pacote pendente"}</span>
          </div>
          {isPublicationReviewOpen && hasPackage ? (
            <section className="saas-publication-review" aria-label="Revisão da publicação YouTube">
              <div className="publication-thumb-stage">
                {selectedGeneratedThumbnail ? (
                  <img src={selectedGeneratedThumbnail.url} alt={`Thumbnail selecionada ${selectedGeneratedThumbnail.name}`} />
                ) : (
                  <div className="publication-thumb-empty">
                    <strong>Sem thumbnail renderizada</strong>
                    <span>Gere o pacote YouTube novamente para criar as opções V9.</span>
                  </div>
                )}
                <div>
                  <p className="section-label">Thumbnail escolhida</p>
                  <strong>{selectedGeneratedThumbnail?.name ?? "Nenhuma opção selecionada"}</strong>
                </div>
              </div>

              {generatedThumbnails.length ? (
                <div className="publication-thumb-picker" aria-label="Selecionar thumbnail">
                  {generatedThumbnails.map((asset, index) => (
                    <button
                      type="button"
                      className={asset.name === selectedGeneratedThumbnail?.name ? "publication-thumb-option publication-thumb-option-selected" : "publication-thumb-option"}
                      key={asset.name}
                      onClick={() => onSelectGeneratedThumbnail(asset.name)}
                    >
                      <img src={asset.url} alt={`Opção de thumbnail ${index + 1}`} />
                      <span>{String(index + 1).padStart(2, "0")}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="publication-final-copy">
                <label>
                  <span>Título final</span>
                  <input value={publicationTitle} onChange={(event) => onPublicationTitleChange(event.currentTarget.value)} />
                </label>
                <label>
                  <span>Descrição final</span>
                  <textarea value={publicationDescription} rows={6} onChange={(event) => onPublicationDescriptionChange(event.currentTarget.value)} />
                </label>
                <div className="publication-settings-row" role="group" aria-label="Visibilidade do YouTube">
                  {(["private", "unlisted", "public"] as const).map((visibility) => (
                    <button
                      type="button"
                      className={visibility === publicationVisibility ? "publication-setting-active" : ""}
                      key={visibility}
                      onClick={() => onPublicationVisibilityChange(visibility)}
                    >
                      {translateVisibility(visibility)}
                    </button>
                  ))}
                </div>
                {youtubePackageSummary?.chapters ? (
                  <details className="publication-chapters">
                    <summary>Capítulos que vão para a descrição</summary>
                    <pre>{youtubePackageSummary.chapters}</pre>
                  </details>
                ) : (
                  <small>Capítulos ainda não foram gerados neste pacote. Gere o pacote YouTube de novo para incluir chapters.</small>
                )}
                <div className="publication-actions">
                  <button type="button" onClick={onOpenAdvancedExport}>
                    Ajustes avançados
                  </button>
                  <button type="button" className="saas-primary-action" onClick={onStartFinalExport} disabled={isExporting || !job}>
                    {isExporting ? "Gerando export..." : exportJob?.outputUrl ? "Gerar novo export" : "Gerar export final"}
                  </button>
                  <button type="button" className="saas-publish-disabled" disabled>
                    Postar no YouTube
                  </button>
                </div>
                <small>
                  {exportJob?.outputUrl
                    ? "Export final pronto. A postagem direta entra quando a conexão do YouTube estiver ativa neste app."
                    : "Revise thumb, título e descrição antes de gerar o export final."}
                </small>
              </div>
            </section>
          ) : null}
          {youtubePackageSummary?.thumbnailIdeas.length ? (
            <div className="saas-thumbnail-ideas">
              {youtubePackageSummary.thumbnailIdeas.map((idea) => (
                <article className="saas-thumbnail-idea" key={idea.index}>
                  <span>{String(idea.index).padStart(2, "0")}</span>
                  <strong>{idea.title}</strong>
                  <p>{idea.prompt}</p>
                </article>
              ))}
            </div>
          ) : null}
          {youtubePackageSummary?.thumbnailPrompt ? (
            <details className="saas-prompt">
              <summary>Ver prompt de thumbnail</summary>
              <pre>{youtubePackageSummary.thumbnailPrompt}</pre>
            </details>
          ) : null}
          {youtubePackageSummary?.assets.length ? (
            <div className="saas-assets">
              {youtubePackageSummary.assets.map((asset) => (
                <button
                  type="button"
                  className={asset.name === selectedAsset?.name ? "saas-asset saas-asset-selected" : "saas-asset"}
                  key={asset.name}
                  onClick={() => onSelectAsset(asset.name)}
                >
                  {asset.kind === "identity_clip" ? (
                    <span className="saas-asset-video">MP4</span>
                  ) : (
                    <img src={asset.url} alt={asset.name} />
                  )}
                  <small>{asset.name}</small>
                </button>
              ))}
            </div>
          ) : null}
          <button type="button" className="saas-publish-disabled" disabled>
            Publicar no YouTube após conectar conta
          </button>
        </div>
      </div>
    </section>
  );
}

function formatSeconds(seconds: number) {
  return `${seconds.toFixed(1)}s`;
}

function translateVisibility(visibility: "private" | "unlisted" | "public") {
  const labels = {
    private: "Privado",
    unlisted: "Não listado",
    public: "Público"
  };
  return labels[visibility];
}

function formatSignedSeconds(seconds: number) {
  const sign = seconds > 0 ? "+" : "";
  return `${sign}${formatSeconds(seconds)}`;
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}:${String(seconds).padStart(2, "0")}`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function translateProjectStatus(status: ProjectLibraryItem["status"]) {
  const labels: Record<ProjectLibraryItem["status"], string> = {
    missing_plan: "sem plano",
    invalid_plan: "plano inválido",
    planned: "planejado",
    captioned: "legendado",
    music: "com música",
    rendered: "renderizado"
  };
  return labels[status];
}

function getWorkspaceTabLabel(tab: WorkspaceTab) {
  return WORKSPACE_TABS.find((item) => item.id === tab)?.label ?? "Editor";
}

export function getVisibleWorkspaceTabs(hasEditorSurface: boolean) {
  return hasEditorSurface ? WORKSPACE_TABS : WORKSPACE_TABS.filter((tab) => tab.id === "projects");
}

export function appendMediaCacheBust(url: string | null, token: string) {
  if (!url || !token) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(token)}`;
}

function getExportProgress(job: ProjectJob) {
  const exactProgress = getProgressPercentFromMessage(job.message);
  if (exactProgress !== null) return exactProgress;
  if (job.status === "failed") return 100;
  if (job.status === "passed" || job.status === "warning" || job.stage === "complete") return 100;
  const progressByStage: Record<string, number> = {
    export_queued: 10,
    export_prepare: 22,
    export_fast_cut: 55,
    export_full_render: 48,
    export_motion: 62,
    export_render: 72
  };
  return progressByStage[job.stage] ?? (job.status === "running" ? 55 : 8);
}

export function getProgressPercentFromMessage(message: string) {
  const match = message.match(/(?:^|[^0-9])(\d{1,3})%/);
  if (!match) return null;
  return Math.max(0, Math.min(100, Number(match[1])));
}

function getYoutubePackageProgress(job: ProjectJob) {
  if (job.status === "failed") return 100;
  if (job.status === "passed" || job.status === "warning" || job.stage === "complete") return 100;
  const progressByStage: Record<string, number> = {
    youtube_package_queued: 8,
    youtube_package_prepare: 22,
    youtube_package_ai: 55,
    youtube_package_frames: 82,
    youtube_package_thumbnails: 92
  };
  return progressByStage[job.stage] ?? (job.status === "running" ? 50 : 8);
}

function isActiveJob(job: ProjectJob | null) {
  return Boolean(job && !["passed", "warning", "failed"].includes(job.status));
}

function getProjectJobProgress(job: ProjectJob) {
  if (job.status === "failed") return Math.max(18, getProgressForStage(job.stage));
  if (job.status === "passed" || job.status === "warning" || job.stage === "complete") return 100;
  return getProgressForStage(job.stage);
}

function getProgressForStage(stage: string) {
  const progressByStage: Record<string, number> = {
    queued: 6,
    probe: 16,
    analysis: 38,
    planning: 58,
    render: 78,
    qa: 92,
    complete: 100
  };
  return progressByStage[stage] ?? 10;
}

type ProcessingStepStatus = "pending" | "active" | "complete" | "failed";

function getUploadSteps(): Array<{ id: string; label: string; description: string; status: ProcessingStepStatus }> {
  return [
    { id: "upload", label: "Recebendo arquivo", description: "Copiando o vídeo para o workspace local.", status: "active" },
    { id: "queue", label: "Criar projeto", description: "Assim que terminar, o app abre um job de edição.", status: "pending" },
    { id: "analysis", label: "Analisar mídia", description: "Leitura de áudio, duração e formato.", status: "pending" }
  ];
}

function getProjectProcessingSteps(job: ProjectJob): Array<{ id: string; label: string; description: string; status: ProcessingStepStatus }> {
  const steps = [
    { id: "queued", label: "Fila", description: "Projeto recebido pelo servidor local." },
    { id: "probe", label: "Leitura", description: "Detectando duração, orientação, áudio e FPS." },
    { id: "analysis", label: "Pausas", description: "Rodando FFmpeg para encontrar trechos silenciosos." },
    { id: "planning", label: "Plano", description: "Montando cortes, seções inteligentes e tratamentos." },
    { id: "render", label: "Render", description: "Gerando o primeiro rascunho com os cortes." },
    { id: "qa", label: "QA", description: "Verificando se o rascunho finalizou corretamente." }
  ];
  const foundIndex = steps.findIndex((step) => step.id === job.stage);
  const currentIndex = foundIndex >= 0 ? foundIndex : 0;
  const isComplete = job.status === "passed" || job.status === "warning";

  return steps.map((step, index) => {
    let status: ProcessingStepStatus = "pending";
    if (index < currentIndex || isComplete) status = "complete";
    if (index === currentIndex && !isComplete && job.status !== "failed") status = "active";
    if (index === currentIndex && job.status === "failed") status = "failed";
    return { ...step, status };
  });
}

function getProcessingDetail(job: ProjectJob) {
  if (job.status === "failed") {
    return "O editor parou nesta etapa para evitar deixar você esperando sem resposta.";
  }
  if (job.stage === "analysis") {
    return "Vídeos longos passam mais tempo aqui. O app está escaneando o áudio para cortar pausas com segurança.";
  }
  if (job.stage === "render") {
    return "O plano já foi criado. Agora o FFmpeg está renderizando a primeira prévia.";
  }
  return translateJobMessage(job.message);
}

function friendlyJobError(error: string | null) {
  if (!error) return "Não consegui concluir esse processamento.";
  if (/timed out/i.test(error)) {
    return "Esse vídeo demorou mais do que o limite anterior permitia. Atualizei o processamento para aguentar arquivos longos.";
  }
  if (/ffmpeg/i.test(error)) {
    return "O FFmpeg não conseguiu concluir esta etapa. O detalhe técnico fica abaixo para diagnóstico.";
  }
  return "Não consegui concluir esse processamento.";
}

function getRenderedDuration(plan: EditPlanSummary) {
  return plan.segments.at(-1)?.timelineEndSec ?? plan.source.durationSec;
}

type SectionTimelineProps = {
  sections: TimelineSection[];
  durationSec: number;
  selectedSectionId: string | null;
  onSelect: (section: TimelineSection) => void;
};

function SectionTimeline({ sections, durationSec, selectedSectionId, onSelect }: SectionTimelineProps) {
  const safeDuration = Math.max(0.1, durationSec);
  if (!sections.length) {
    return (
      <div className="section-timeline section-timeline-empty" aria-label="Timeline inteligente">
        <span>Ainda sem trechos inteligentes</span>
      </div>
    );
  }
  return (
    <div className="section-timeline" aria-label="Timeline inteligente">
      {sections.map((section) => {
        const left = `${Math.max(0, (section.startSec / safeDuration) * 100)}%`;
        const width = `${Math.max(2, ((section.endSec - section.startSec) / safeDuration) * 100)}%`;
        return (
          <button
            type="button"
            className={`section-chip section-chip-${section.type} ${selectedSectionId === section.id ? "section-chip-selected" : ""}`}
            style={{ left, width }}
            key={section.id}
            onClick={() => onSelect(section)}
            title={`${getSectionLabel(section.type)} · ${formatSeconds(section.startSec)} até ${formatSeconds(section.endSec)}`}
          >
            <span>{getSectionLabel(section.type)}</span>
          </button>
        );
      })}
    </div>
  );
}

type ReviewCockpitProps = {
  plan: EditPlanSummary;
  selectedSection: TimelineSection | null;
  selectedSectionId: string | null;
  sectionFilter: TimelineSectionType | "all";
  onSectionFilterChange: (filter: TimelineSectionType | "all") => void;
  onSelectSection: (section: TimelineSection) => void;
  onOpenTarget: (tab: WorkspaceTab, sectionId?: string) => void;
};

function ReviewCockpit({
  plan,
  selectedSection,
  selectedSectionId,
  sectionFilter,
  onSectionFilterChange,
  onSelectSection,
  onOpenTarget
}: ReviewCockpitProps) {
  const durationSec = getRenderedDuration(plan);
  const visibleSections = sectionFilter === "all"
    ? plan.sections
    : plan.sections.filter((section) => section.type === sectionFilter);
  const warningItems = getReviewWarnings(plan).slice(0, 4);
  const filters = getSectionFilterOptions(plan.sections);

  return (
    <div className="review-cockpit">
      <div className="review-grid">
        <button type="button" onClick={() => onOpenTarget("cut")}>
          <span>Cortes</span>
          <strong>{plan.removed.length}</strong>
        </button>
        <button type="button" onClick={() => onOpenTarget("captions")}>
          <span>Legendas</span>
          <strong>{plan.captions.length}</strong>
        </button>
        <button type="button" onClick={() => onOpenTarget("audio")}>
          <span>Áudio</span>
          <strong>{plan.audio.music ? "Mix" : "Voz"}</strong>
        </button>
        <button type="button" onClick={() => onOpenTarget("motion")}>
          <span>Motion</span>
          <strong>{countMotionSlots(plan)}</strong>
        </button>
        <button type="button" onClick={() => onOpenTarget("export")}>
          <span>Pronto?</span>
          <strong>{translateReadiness(plan.publishReadiness.status)}</strong>
        </button>
      </div>

      {plan.sections.length ? (
        <div className="section-filter-row" role="group" aria-label="Filtro de seções">
          {filters.map((filter) => (
            <button
              type="button"
              className={sectionFilter === filter.id ? "section-filter-active" : ""}
              key={filter.id}
              onClick={() => onSectionFilterChange(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      ) : null}

      <SectionTimeline
        sections={visibleSections}
        durationSec={durationSec}
        selectedSectionId={selectedSectionId}
        onSelect={onSelectSection}
      />

      <div className="review-strip">
        <span>{selectedSection ? `${selectedSection.label} · ${formatSeconds(selectedSection.startSec)}-${formatSeconds(selectedSection.endSec)}` : plan.sections.length ? `${plan.sections.length} seções` : "Trechos serão criados em novos rascunhos"}</span>
        <span>{formatSeconds(durationSec)} final</span>
      </div>

      <div className="review-warnings">
        {warningItems.length ? warningItems.map((warning) => (
          <button type="button" key={warning.id} onClick={() => onOpenTarget(warning.tab, warning.sectionId)}>
            <span>{warning.label}</span>
            <strong>{warning.message}</strong>
          </button>
        )) : <span className="review-ok">Sem bloqueios críticos</span>}
      </div>
    </div>
  );
}

type ReviewInspectorPanelProps = {
  plan: EditPlanSummary | null;
  selectedSection: TimelineSection | null;
  onOpenTarget: (tab: WorkspaceTab, sectionId?: string) => void;
  onSeek: (seconds: number) => void;
};

function ReviewInspectorPanel({ plan, selectedSection, onOpenTarget, onSeek }: ReviewInspectorPanelProps) {
  if (!plan) return <p className="file-meta">Nenhum plano aberto.</p>;
  const checks = plan.publishReadiness.checks.filter((check) => check.status !== "passed").slice(0, 5);
  return (
    <div className="workspace-panel">
      <div className="review-inspector-card">
        <span>Status</span>
        <strong>{translateReadiness(plan.publishReadiness.status)}</strong>
      </div>
      {selectedSection ? (
        <div className="review-inspector-card">
          <span>{getSectionLabel(selectedSection.type)}</span>
          <strong>{selectedSection.label}</strong>
          <small>{formatSeconds(selectedSection.startSec)} até {formatSeconds(selectedSection.endSec)}</small>
          <button type="button" className="ghost-button" onClick={() => onSeek(selectedSection.startSec)}>Ir para seção</button>
          <button type="button" className="ghost-button" onClick={() => onOpenTarget("motion", selectedSection.id)}>Editar motion</button>
        </div>
      ) : null}
      {checks.map((check) => (
        <button
          type="button"
          className={`readiness-row readiness-row-${check.status}`}
          key={check.id}
          onClick={() => onOpenTarget(mapReadinessTab(check.targetTab), check.sectionId)}
        >
          <span>{check.label}</span>
          <strong>{check.message}</strong>
        </button>
      ))}
      <button type="button" onClick={() => onOpenTarget("projects")}>Projetos</button>
    </div>
  );
}

type ReviewWarning = {
  id: string;
  label: string;
  message: string;
  tab: WorkspaceTab;
  sectionId?: string;
};

function getReviewWarnings(plan: EditPlanSummary): ReviewWarning[] {
  return [
    ...plan.qa.warnings.map((message) => ({
      id: `qa_${message}`,
      label: "QA",
      message: translateWarning(message),
      tab: "cut" as WorkspaceTab
    })),
    ...plan.publishReadiness.checks
      .filter((check) => check.status !== "passed")
      .map((check) => ({
        id: check.id,
        label: check.label,
        message: check.message,
        tab: mapReadinessTab(check.targetTab),
        sectionId: check.sectionId
      }))
  ];
}

function getSectionFilterOptions(sections: TimelineSection[]): Array<{ id: TimelineSectionType | "all"; label: string }> {
  const sectionTypes = new Set(sections.map((section) => section.type));
  return [
    { id: "all", label: "Tudo" },
    ...([...sectionTypes] as TimelineSectionType[]).map((type) => ({ id: type, label: getSectionLabel(type) }))
  ];
}

type SectionInspectorProps = {
  section: TimelineSection | null;
  onClear: () => void;
  onSave: (section: TimelineSection, patch: SectionPatch) => void;
};

function SectionInspector({ section, onClear, onSave }: SectionInspectorProps) {
  const [draftLabel, setDraftLabel] = useState(section?.label ?? "");

  useEffect(() => {
    setDraftLabel(section?.label ?? "");
  }, [section?.id, section?.label]);

  if (!section) {
    return (
      <div className="section-inspector section-inspector-empty">
        <span>Seção</span>
        <strong>Nenhuma seção selecionada</strong>
        <small>Escolha um trecho na timeline inteligente.</small>
      </div>
    );
  }

  const captionsEnabled = section.treatments.captions?.enabled ?? true;
  const voiceCleanup = section.treatments.audio?.voiceCleanup ?? false;
  const sharpenScreen = section.treatments.image?.sharpenScreen ?? false;

  function commitLabel() {
    if (!section) return;
    const label = draftLabel.trim();
    if (!label) {
      setDraftLabel(section.label);
      return;
    }
    if (label !== section.label) {
      onSave(section, { label });
    }
  }

  return (
    <div className="section-inspector">
      <div className="section-inspector-head">
        <div>
          <span>Seção selecionada</span>
          <strong>{formatSeconds(section.startSec)} até {formatSeconds(section.endSec)}</strong>
        </div>
        <div className="section-inspector-actions">
          <span className={`section-type-pill section-type-pill-${section.type}`}>{getSectionLabel(section.type)}</span>
          <button type="button" className="tiny-button" onClick={onClear}>Limpar</button>
        </div>
      </div>

      <div className="section-inspector-grid">
        <label className="field-label">
          Tipo
          <select value={section.type} onChange={(event) => onSave(section, { type: event.currentTarget.value as TimelineSectionType })}>
            {SECTION_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>{getSectionLabel(type)}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Rótulo
          <input
            className="text-input"
            value={draftLabel}
            onChange={(event) => setDraftLabel(event.currentTarget.value)}
            onBlur={commitLabel}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
        </label>
      </div>

      <div className="section-toggle-grid">
        <label className="section-toggle">
          <input
            type="checkbox"
            checked={captionsEnabled}
            onChange={(event) => onSave(section, { treatments: { captions: { enabled: event.currentTarget.checked } } })}
          />
          <span>
            <strong>Legendas</strong>
            <small>{captionsEnabled ? "Ativas neste trecho" : "Ocultas neste trecho"}</small>
          </span>
        </label>
        <label className="section-toggle">
          <input
            type="checkbox"
            checked={voiceCleanup}
            onChange={(event) => onSave(section, { treatments: { audio: { voiceCleanup: event.currentTarget.checked } } })}
          />
          <span>
            <strong>Limpar voz</strong>
            <small>Redução contextual</small>
          </span>
        </label>
        <label className="section-toggle">
          <input
            type="checkbox"
            checked={sharpenScreen}
            onChange={(event) => onSave(section, { treatments: { image: { sharpenScreen: event.currentTarget.checked } } })}
          />
          <span>
            <strong>Nitidez de tela</strong>
            <small>Texto e UI mais claros</small>
          </span>
        </label>
      </div>
    </div>
  );
}

function mergeSectionPatchLocal(section: TimelineSection, patch: SectionPatch): TimelineSection {
  const treatments = patch.treatments
    ? {
        ...section.treatments,
        ...patch.treatments,
        captions: patch.treatments.captions
          ? { ...section.treatments.captions, ...patch.treatments.captions }
          : section.treatments.captions,
        audio: patch.treatments.audio
          ? { ...section.treatments.audio, ...patch.treatments.audio }
          : section.treatments.audio,
        image: patch.treatments.image
          ? { ...section.treatments.image, ...patch.treatments.image }
          : section.treatments.image,
        motion: patch.treatments.motion
          ? { ...(section.treatments.motion ?? { enabled: false, slots: [] }), ...patch.treatments.motion }
          : section.treatments.motion
      }
    : section.treatments;

  return { ...section, ...patch, treatments };
}

function mapReadinessTab(tab: string | undefined): WorkspaceTab {
  if (tab === "review") return "review";
  if (tab === "captions") return "captions";
  if (tab === "audio") return "audio";
  if (tab === "motion") return "motion";
  if (tab === "image") return "color";
  if (tab === "export") return "export";
  return "cut";
}

function translateReadiness(status: string) {
  if (status === "ready") return "Pronto";
  if (status === "blocked") return "Bloqueado";
  return "Revisar";
}

type CaptionPreviewLayerProps = {
  captions: Caption[];
  sections: TimelineSection[];
  currentTimeSec: number;
  settings: CaptionSettings;
  selectedCaptionId: string | null;
  onSelectCaption: (caption: Caption) => void;
};

function CaptionPreviewLayer({ captions, sections, currentTimeSec, settings, selectedCaptionId, onSelectCaption }: CaptionPreviewLayerProps) {
  const activeCaption = getActiveCaption(captions, currentTimeSec);
  const activeWords = useMemo(() => activeCaption ? normalizeCaptionWords(activeCaption) : [], [activeCaption]);
  const effectiveSettings = getEffectiveCaptionPreviewSettings(settings, sections, currentTimeSec);
  if (!effectiveSettings.enabled || !activeCaption) return <div className="caption-preview-layer" aria-hidden="true" />;

  const activeWordIndex = getActiveWordIndex(activeWords, currentTimeSec);
  const selected = selectedCaptionId === activeCaption.id;
  const cssVars = getCaptionCssVars(effectiveSettings);

  return (
    <div className={`caption-preview-layer caption-preview-layer-active ${selected ? "caption-preview-layer-selected" : ""}`} style={cssVars}>
      <button type="button" className="caption-preview-hit" onClick={() => onSelectCaption(activeCaption)} aria-label="Editar legenda atual">
        <CaptionPreviewText caption={activeCaption} words={activeWords} activeWordIndex={activeWordIndex} settings={effectiveSettings} />
      </button>
    </div>
  );
}

export function getEffectiveCaptionPreviewSettings(
  settings: CaptionSettings,
  sections: TimelineSection[],
  currentTimeSec: number
) {
  return mergeSectionCaptionSettings(settings, getSectionAtTime(sections, currentTimeSec));
}

type CaptionPreviewTextProps = {
  caption: Caption;
  words: CaptionWord[];
  activeWordIndex: number;
  settings: CaptionSettings;
};

function CaptionPreviewText({ caption, words, activeWordIndex, settings }: CaptionPreviewTextProps) {
  const block = getCaptionBlock(words, activeWordIndex, settings.wordsPerBlock);
  const textTransform = settings.uppercase ? (text: string) => text.toUpperCase() : (text: string) => text;

  if (settings.displayMode === "word_ping") {
    const word = words[activeWordIndex]?.text ?? caption.text;
    return <span className="caption-word-ping">{textTransform(word)}</span>;
  }

  if (settings.displayMode === "stacked") {
    const visibleWords = block.words.slice(0, block.activeOffset + 1);
    return (
      <span className="caption-stack-pop">
        {visibleWords.map((word, index) => (
          <span className={index === block.activeOffset ? "caption-active-word" : ""} key={word.id}>{textTransform(word.text)}</span>
        ))}
      </span>
    );
  }

  if (settings.displayMode === "block_highlight") {
    return (
      <span className="caption-focus-word">
        {block.words.map((word, index) => (
          <span className={index === block.activeOffset ? "caption-active-word" : ""} key={word.id}>{textTransform(word.text)}</span>
        ))}
      </span>
    );
  }

  const blockText = block.words.map((word) => textTransform(word.text)).join(" ");
  return <span className="caption-youtube-clean">{blockText}</span>;
}

type CaptionSettingsPanelProps = {
  settings: CaptionSettings;
  caption: Caption | null;
  currentTimeSec: number;
  captionCount: number;
  wordCount: number;
  onChangeSetting: <K extends keyof CaptionSettings>(key: K, value: CaptionSettings[K]) => void;
  onCommitSettings: (settings: CaptionSettings) => void;
  onChangeText: (text: string) => void | undefined;
  onCommitText: () => void | undefined;
  onSeek: () => void | undefined;
};

function CaptionSettingsPanel({
  settings,
  caption,
  currentTimeSec,
  captionCount,
  wordCount,
  onChangeSetting,
  onCommitSettings,
  onChangeText,
  onCommitText,
  onSeek
}: CaptionSettingsPanelProps) {
  const currentWords = caption ? normalizeCaptionWords(caption) : [];
  const currentWord = getActiveWord(currentWords, currentTimeSec);
  function commitPatch<K extends keyof CaptionSettings>(key: K, value: CaptionSettings[K]) {
    const nextSettings = { ...settings, [key]: value };
    onChangeSetting(key, value);
    onCommitSettings(nextSettings);
  }

  return (
    <div className="caption-settings-panel">
      <div className="caption-status-row">
        <span>{captionCount} legendas</span>
        <span>{wordCount} palavras</span>
      </div>

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => commitPatch("enabled", event.currentTarget.checked)}
        />
        <span>Mostrar legendas</span>
      </label>

      <label className="field-label">
        Estilo
        <select value={settings.styleId} onChange={(event) => commitPatch("styleId", event.currentTarget.value as CaptionStyleId)}>
          {CAPTION_STYLES.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
        </select>
      </label>

      <label className="field-label">
        Comportamento
        <select value={settings.displayMode} onChange={(event) => commitPatch("displayMode", event.currentTarget.value as CaptionSettings["displayMode"])}>
          {CAPTION_DISPLAY_MODE_OPTIONS.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
        </select>
      </label>

      <label className="field-label">
        Fonte
        <select value={settings.fontId} onChange={(event) => commitPatch("fontId", event.currentTarget.value as CaptionSettings["fontId"])}>
          {CAPTION_FONT_OPTIONS.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}
        </select>
      </label>

      <div className="field-grid">
        <label className="field-label">
          Texto
          <input type="color" value={settings.primaryColor} onChange={(event) => commitPatch("primaryColor", event.currentTarget.value)} />
        </label>
        <label className="field-label">
          Ativa
          <input type="color" value={settings.activeColor} onChange={(event) => commitPatch("activeColor", event.currentTarget.value)} />
        </label>
        <label className="field-label">
          Contorno
          <input type="color" value={settings.outlineColor} onChange={(event) => commitPatch("outlineColor", event.currentTarget.value)} />
        </label>
      </div>

      <RangeField label="Tamanho" value={settings.fontSizePct} min={3} max={12} step={0.2} suffix="%" onChange={(value) => onChangeSetting("fontSizePct", value)} onCommit={(value) => commitPatch("fontSizePct", value)} />
      <RangeField label="Posição" value={settings.positionYPct} min={50} max={94} step={1} suffix="%" onChange={(value) => onChangeSetting("positionYPct", value)} onCommit={(value) => commitPatch("positionYPct", value)} />
      <RangeField label="Largura" value={settings.maxWidthPct} min={45} max={96} step={1} suffix="%" onChange={(value) => onChangeSetting("maxWidthPct", value)} onCommit={(value) => commitPatch("maxWidthPct", value)} />
      <RangeField label="Palavras por bloco" value={settings.wordsPerBlock} min={1} max={8} step={1} onChange={(value) => onChangeSetting("wordsPerBlock", Math.round(value))} onCommit={(value) => commitPatch("wordsPerBlock", Math.round(value))} />
      <RangeField label="Contorno" value={settings.outlineWidthPct} min={0} max={1.2} step={0.05} suffix="%" onChange={(value) => onChangeSetting("outlineWidthPct", value)} onCommit={(value) => commitPatch("outlineWidthPct", value)} />

      <div className="caption-options-grid">
        <label className="toggle-row">
          <input type="checkbox" checked={settings.shadow} onChange={(event) => commitPatch("shadow", event.currentTarget.checked)} />
          <span>Sombra</span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={settings.uppercase} onChange={(event) => commitPatch("uppercase", event.currentTarget.checked)} />
          <span>Caixa alta</span>
        </label>
      </div>

      {caption ? (
        <div className="caption-inspector">
          <div className="inspector-head">
            <strong>{formatSeconds(caption.startSec)} até {formatSeconds(caption.endSec)}</strong>
            <button type="button" className="ghost-button" onClick={onSeek}>Ir</button>
          </div>
          <label className="field-label">
            Texto do bloco
            <textarea value={caption.text} onChange={(event) => onChangeText(event.currentTarget.value)} onBlur={onCommitText} rows={5} />
          </label>
          {currentWord ? <p className="file-meta">Palavra atual: <strong>{currentWord.text}</strong></p> : null}
        </div>
      ) : (
        <p className="file-meta">Dê play e clique em uma legenda para editar o texto do bloco.</p>
      )}
    </div>
  );
}

type ProjectLibraryPanelProps = {
  projects: ProjectLibraryItem[];
  activeProjectId: string | null;
  isLoading: boolean;
  onRefresh: () => void;
  onOpen: (project: ProjectLibraryItem) => void;
  onDelete: (project: ProjectLibraryItem) => void;
};

function ProjectLibraryPanel({ projects, activeProjectId, isLoading, onRefresh, onOpen, onDelete }: ProjectLibraryPanelProps) {
  return (
    <div className="workspace-panel">
      <div className="section-row">
        <p className="section-label">Histórico</p>
        <button type="button" className="tiny-button" onClick={onRefresh} disabled={isLoading}>Atualizar</button>
      </div>
      <div className="project-list project-list-expanded">
        {projects.map((project) => (
          <div className={`project-card project-card-row ${activeProjectId === project.id ? "project-card-active" : ""}`} key={project.id}>
            <button type="button" className="project-open-button" onClick={() => onOpen(project)}>
              <span>{project.name}</span>
              <small>{project.durationSec ? formatSeconds(project.durationSec) : "sem plano"} · {translateProjectStatus(project.status)}</small>
              {project.versions.length ? <small>{project.versions.length} versões salvas</small> : null}
            </button>
            <button type="button" className="danger-button" onClick={() => onDelete(project)}>Apagar</button>
          </div>
        ))}
        {!projects.length ? <p className="file-meta">{isLoading ? "Carregando..." : "Nenhum projeto salvo ainda."}</p> : null}
      </div>
    </div>
  );
}

type CutWorkspacePanelProps = {
  selectedCut: ManualCut | null;
  activeCutIds: string[];
  editPlan: EditPlanSummary | null;
  cutPresetId: CutPresetId;
  previewCutId: string | null;
  onCutPresetChange: (preset: CutPresetId) => void;
  onPreview: (cutId: string) => void;
  onToggle: (cutId: string) => void;
  onNudge: (cutId: string, edge: "startSec" | "endSec", delta: number) => void;
  onBeginAdjust: () => void;
  onSetEdge: (cutId: string, edge: "startSec" | "endSec", value: number) => void;
};

function CutWorkspacePanel({
  selectedCut,
  activeCutIds,
  editPlan,
  cutPresetId,
  previewCutId,
  onCutPresetChange,
  onPreview,
  onToggle,
  onNudge,
  onBeginAdjust,
  onSetEdge
}: CutWorkspacePanelProps) {
  return (
    <div className="workspace-panel">
      <div className="settings-block">
        <p className="section-label">Corte de silêncio</p>
        <div className="preset-grid" role="radiogroup" aria-label="Preset de corte">
          {CUT_PRESETS.map((preset) => (
            <label className={`preset-option ${cutPresetId === preset.id ? "preset-option-active" : ""}`} key={preset.id}>
              <input
                type="radio"
                name="cut-preset"
                value={preset.id}
                checked={cutPresetId === preset.id}
                onChange={() => onCutPresetChange(preset.id)}
              />
              <span>{preset.label}</span>
              <small>{preset.description}</small>
            </label>
          ))}
        </div>
      </div>

      {editPlan && selectedCut ? (
        <div className="settings-block">
          <p className="section-label">Corte selecionado</p>
          <CutInspector
            cut={selectedCut}
            active={activeCutIds.includes(selectedCut.id)}
            sourceUrl={editPlan.sourceUrl}
            previewing={previewCutId === selectedCut.id}
            onPreview={() => onPreview(selectedCut.id)}
            onToggle={() => onToggle(selectedCut.id)}
            onNudge={(edge, delta) => onNudge(selectedCut.id, edge, delta)}
            sourceDuration={editPlan.source.durationSec}
            onBeginAdjust={onBeginAdjust}
            onSetEdge={(edge, value) => onSetEdge(selectedCut.id, edge, value)}
          />
        </div>
      ) : (
        <p className="file-meta">Selecione um bloco vermelho na timeline ou clique em “Ajustar” na lista de cortes.</p>
      )}
    </div>
  );
}

type ActionPanelProps = {
  title: string;
  description: string;
  actionLabel: string;
  disabled?: boolean;
  onAction: () => void;
};

function ActionPanel({ title, description, actionLabel, disabled = false, onAction }: ActionPanelProps) {
  return (
    <div className="workspace-panel action-panel">
      <strong>{title}</strong>
      <p className="file-meta">{description}</p>
      <button type="button" onClick={onAction} disabled={disabled}>{actionLabel}</button>
    </div>
  );
}

type AudioSettingsPanelProps = {
  musicPath: string | null;
  audioCleanup: boolean;
  audioDucking: boolean;
  isRerendering: boolean;
  onMusicSelected: (file: File | null) => void;
  onAudioCleanupChange: (value: boolean) => void;
  onAudioDuckingChange: (value: boolean) => void;
  onApplyPreview: () => void;
};

function AudioSettingsPanel({ musicPath, audioCleanup, audioDucking, isRerendering, onMusicSelected, onAudioCleanupChange, onAudioDuckingChange, onApplyPreview }: AudioSettingsPanelProps) {
  return (
    <div className="workspace-panel">
      <label className="field-label">
        Música
        <span className="music-picker">
          <span>{musicPath ? "Trilha carregada" : "Escolher trilha"}</span>
          <input type="file" accept="audio/*" onChange={(event) => onMusicSelected(event.currentTarget.files?.[0] ?? null)} />
        </span>
      </label>
      {musicPath ? <p className="file-meta">Música carregada. Clique em aplicar para ouvir em uma prévia curta.</p> : null}
      <label className="toggle-row">
        <input type="checkbox" checked={audioCleanup} disabled={isRerendering} onChange={(event) => onAudioCleanupChange(event.currentTarget.checked)} />
        <span>Limpar voz e normalizar volume</span>
      </label>
      <label className="toggle-row">
        <input type="checkbox" checked={audioDucking} disabled={isRerendering || !musicPath} onChange={(event) => onAudioDuckingChange(event.currentTarget.checked)} />
        <span>Ducking automático da música</span>
      </label>
      <button type="button" onClick={onApplyPreview} disabled={isRerendering}>
        {isRerendering ? "Gerando prévia..." : "Aplicar áudio na prévia"}
      </button>
      <p className="file-meta">{isRerendering ? "Gerando antes/depois de áudio em 20s..." : "Os ajustes ficam pendentes até você aplicar."}</p>
    </div>
  );
}

type MotionSettingsPanelProps = {
  plan: EditPlanSummary | null;
  selectedSection: TimelineSection | null;
  isRerendering: boolean;
  isPlanningMotion: boolean;
  onSelectSection: (section: TimelineSection) => void;
  onSave: (section: TimelineSection, patch: SectionPatch) => void;
  onPreview: () => void;
  onCreateAIMotion: () => void;
};

function MotionSettingsPanel({
  plan,
  selectedSection,
  isRerendering,
  isPlanningMotion,
  onSelectSection,
  onSave,
  onPreview,
  onCreateAIMotion
}: MotionSettingsPanelProps) {
  if (!plan) return <p className="file-meta">Nenhum plano aberto.</p>;
  const sectionsWithMotion = plan.sections.filter((section) => section.treatments.motion?.slots.length);
  const activeSection = selectedSection ?? sectionsWithMotion[0] ?? null;
  const motion = activeSection?.treatments.motion;
  return (
    <div className="workspace-panel">
      <p className="section-label">IA diretora visual</p>
      <div className="motion-empty-state">
        <strong>{sectionsWithMotion.length ? "Recriar motions com análise editorial" : "Este projeto ainda não tem motion editorial."}</strong>
        <p>A IA lê a transcrição, escolhe o hook dos primeiros 20s e substitui os motions genéricos por instruções reais para o Remotion.</p>
        <button type="button" onClick={onCreateAIMotion} disabled={isPlanningMotion}>
          {isPlanningMotion ? "Planejando com IA..." : sectionsWithMotion.length ? "Recriar motion com IA" : "Criar motion com IA"}
        </button>
      </div>
      {sectionsWithMotion.length ? (
        <div className="motion-section-list">
          {sectionsWithMotion.map((section) => (
            <button
              type="button"
              key={section.id}
              className={activeSection?.id === section.id ? "motion-section-active" : ""}
              onClick={() => onSelectSection(section)}
            >
              <strong>{section.label}</strong>
              <span>{section.treatments.motion?.slots.length ?? 0} motions</span>
            </button>
          ))}
        </div>
      ) : null}
      {activeSection && motion ? (
        <>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={motion.enabled}
              onChange={(event) => onSave(activeSection, { treatments: { motion: { enabled: event.currentTarget.checked, slots: motion.slots } } })}
            />
            <span>Aplicar pacote visual neste trecho</span>
          </label>
          <div className="motion-slot-list">
            {motion.slots.map((slot) => (
              <div className="motion-slot-card" key={slot.id}>
                <span>{translateMotionKind(slot.kind)}</span>
                <strong>{slot.label}</strong>
                <small>{formatSeconds(slot.startSec)} até {formatSeconds(slot.endSec)}</small>
              </div>
            ))}
          </div>
          <button type="button" onClick={onPreview} disabled={isRerendering}>
            {isRerendering ? "Gerando prévia..." : "Atualizar prévia base de 20s"}
          </button>
          <p className="file-meta">Os motions entram no render final do export. A prévia curta mantém o fluxo leve para ajustar corte, áudio e imagem.</p>
        </>
      ) : (
        <p className="file-meta">Depois que a IA terminar, os trechos planejados aparecem aqui para revisão antes do export.</p>
      )}
    </div>
  );
}

type ColorSettingsPanelProps = {
  colorPresetId: ColorPresetId;
  appliedColorPresetId: ColorPresetId;
  adjustments: ColorAdjustments;
  appliedAdjustments: ColorAdjustments;
  flipHorizontal: boolean;
  appliedFlipHorizontal: boolean;
  isRerendering: boolean;
  onColorChange: (value: ColorPresetId) => void;
  onAdjustmentChange: (key: keyof ColorAdjustments, value: number) => void;
  onFlipHorizontalChange: (value: boolean) => void;
  onApply: () => void;
};

function ColorSettingsPanel({
  colorPresetId,
  appliedColorPresetId,
  adjustments,
  appliedAdjustments,
  flipHorizontal,
  appliedFlipHorizontal,
  isRerendering,
  onColorChange,
  onAdjustmentChange,
  onFlipHorizontalChange,
  onApply
}: ColorSettingsPanelProps) {
  const hasPendingColor = colorPresetId !== appliedColorPresetId
    || flipHorizontal !== appliedFlipHorizontal
    || !sameColorAdjustments(adjustments, appliedAdjustments);
  return (
    <div className="workspace-panel">
      <p className="section-label">Color grading</p>
      <div className="color-preset-grid">
        {COLOR_PRESETS.map((preset) => (
          <button
            type="button"
            className={`color-preset-card color-preset-${preset.id} ${colorPresetId === preset.id ? "color-preset-active" : ""}`}
            key={preset.id}
            onClick={() => onColorChange(preset.id)}
            title={preset.description}
          >
            <span aria-hidden="true" style={{ background: preset.swatch }} />
            <strong>{preset.label}</strong>
            <small>{preset.description}</small>
          </button>
        ))}
      </div>
      <div className="settings-block">
        <p className="section-label">Ajuste fino</p>
        <RangeField label="Intensidade" value={adjustments.intensity} min={0} max={1} step={0.05} onChange={(value) => onAdjustmentChange("intensity", value)} onCommit={(value) => onAdjustmentChange("intensity", value)} />
        <RangeField label="Exposição" value={adjustments.exposure} min={-0.2} max={0.2} step={0.01} onChange={(value) => onAdjustmentChange("exposure", value)} onCommit={(value) => onAdjustmentChange("exposure", value)} />
        <RangeField label="Contraste" value={adjustments.contrast} min={0.75} max={1.35} step={0.01} onChange={(value) => onAdjustmentChange("contrast", value)} onCommit={(value) => onAdjustmentChange("contrast", value)} />
        <RangeField label="Saturação" value={adjustments.saturation} min={0.6} max={1.6} step={0.02} onChange={(value) => onAdjustmentChange("saturation", value)} onCommit={(value) => onAdjustmentChange("saturation", value)} />
        <RangeField label="Temperatura" value={adjustments.temperature} min={-0.25} max={0.25} step={0.01} onChange={(value) => onAdjustmentChange("temperature", value)} onCommit={(value) => onAdjustmentChange("temperature", value)} />
        <RangeField label="Tint" value={adjustments.tint} min={-0.2} max={0.2} step={0.01} onChange={(value) => onAdjustmentChange("tint", value)} onCommit={(value) => onAdjustmentChange("tint", value)} />
        <RangeField label="Vinheta" value={adjustments.vignette} min={0} max={0.7} step={0.05} onChange={(value) => onAdjustmentChange("vignette", value)} onCommit={(value) => onAdjustmentChange("vignette", value)} />
      </div>
      <label className="toggle-row">
        <input type="checkbox" checked={flipHorizontal} disabled={isRerendering} onChange={(event) => onFlipHorizontalChange(event.currentTarget.checked)} />
        <span>Espelhar vídeo horizontalmente</span>
      </label>
      {hasPendingColor ? (
        <p className="pending-note">Cor selecionada ainda não está no vídeo da direita. Aplique para gerar uma prévia nova.</p>
      ) : (
        <p className="file-meta">A prévia atual já está usando estes ajustes.</p>
      )}
      <button type="button" onClick={onApply} disabled={isRerendering}>
        {isRerendering ? "Aplicando..." : hasPendingColor ? "Aplicar cor na prévia" : "Renderizar prévia de cor"}
      </button>
    </div>
  );
}

function sameColorAdjustments(left: ColorAdjustments, right: ColorAdjustments) {
  return left.intensity === right.intensity
    && left.exposure === right.exposure
    && left.contrast === right.contrast
    && left.saturation === right.saturation
    && left.temperature === right.temperature
    && left.tint === right.tint
    && left.vignette === right.vignette;
}

type ExportSettingsPanelProps = {
  exportRenderMode: ExportRenderMode;
  onExportRenderModeChange: (value: ExportRenderMode) => void;
  exportAspect: ExportAspect;
  onExportAspectChange: (value: ExportAspect) => void;
  exportResolution: ExportResolution;
  onExportResolutionChange: (value: ExportResolution) => void;
  exportQuality: ExportQuality;
  onExportQualityChange: (value: ExportQuality) => void;
  exportSdrMode: ExportSdrMode;
  onExportSdrModeChange: (value: ExportSdrMode) => void;
  exportName: string;
  onExportNameChange: (value: string) => void;
  onExport: () => void;
  isExporting: boolean;
  onDownloadExport: () => void;
  isDownloadingExport: boolean;
  exportJob: ProjectJob | null;
  onGenerateYoutubePackage: () => void;
  isGeneratingYoutubePackage: boolean;
  youtubePackageJob: ProjectJob | null;
  hasTranscript: boolean;
};

type FinalizePanelProps = ExportSettingsPanelProps & {
  publishReadiness: PublishReadiness | null;
  onRefreshReadiness: () => Promise<void>;
  canUseProject: boolean;
};

function FinalizePanel({
  publishReadiness,
  onRefreshReadiness,
  exportRenderMode,
  onExportRenderModeChange,
  exportAspect,
  onExportAspectChange,
  exportResolution,
  onExportResolutionChange,
  exportQuality,
  onExportQualityChange,
  exportSdrMode,
  onExportSdrModeChange,
  exportName,
  onExportNameChange,
  onExport,
  isExporting,
  onDownloadExport,
  isDownloadingExport,
  exportJob,
  onGenerateYoutubePackage,
  isGeneratingYoutubePackage,
  youtubePackageJob,
  hasTranscript,
  canUseProject
}: FinalizePanelProps) {
  const progress = exportJob ? getExportProgress(exportJob) : null;
  const exportRunning = isExporting || exportJob?.status === "queued" || exportJob?.status === "running";
  const packageProgress = youtubePackageJob ? getYoutubePackageProgress(youtubePackageJob) : null;
  const packageRunning = isGeneratingYoutubePackage || youtubePackageJob?.status === "queued" || youtubePackageJob?.status === "running";
  const checks = publishReadiness?.checks ?? [];
  return (
    <div className="workspace-panel">
      <div className="finalize-card">
        <div className="finalize-card-head">
          <div>
            <span>Finalizar</span>
            <strong>{publishReadiness ? translateReadiness(publishReadiness.status) : "Checklist indisponível"}</strong>
          </div>
          <button type="button" className="ghost-button" onClick={() => void onRefreshReadiness()} disabled={!canUseProject}>
            Atualizar
          </button>
        </div>
        <div className="publish-checklist" aria-label="Checklist de publicação">
          {checks.length ? checks.map((check) => (
            <div className={`publish-check publish-check-${check.status}`} key={check.id}>
              <span>{check.status === "passed" ? "OK" : check.status === "warning" ? "Atenção" : "Bloqueio"}</span>
              <div>
                <strong>{check.label}</strong>
                <small>{check.message}</small>
              </div>
            </div>
          )) : (
            <p className="file-meta">{canUseProject ? "Atualize para ver os checks de publicação." : "Abra um projeto para revisar os checks de publicação."}</p>
          )}
        </div>
      </div>

      <div className="finalize-card finalize-export-card">
        <div className="finalize-card-head">
          <div>
            <span>Exportação</span>
            <strong>Arquivo final</strong>
          </div>
        </div>
      <label className="field-label">
        Nome do arquivo
        <input className="text-input" value={exportName} onChange={(event) => onExportNameChange(event.currentTarget.value)} />
      </label>
      <div className="segmented-grid" role="group" aria-label="Modo de exportação">
        {(["fast_cuts", "full"] as const).map((value) => (
          <button type="button" className={exportRenderMode === value ? "segment-active" : ""} key={value} aria-pressed={exportRenderMode === value} onClick={() => onExportRenderModeChange(value)}>
            {value === "fast_cuts" ? "Só cortes" : "Completo"}
          </button>
        ))}
      </div>
      {exportRenderMode === "full" ? (
        <>
          <div className="segmented-grid" role="group" aria-label="Formato">
            {(["original", "vertical", "horizontal"] as const).map((value) => (
              <button type="button" className={exportAspect === value ? "segment-active" : ""} key={value} aria-pressed={exportAspect === value} onClick={() => onExportAspectChange(value)}>
                {value === "original" ? "Original" : value === "vertical" ? "Vertical" : "Horizontal"}
              </button>
            ))}
          </div>
          <div className="segmented-grid" role="group" aria-label="Resolução">
            {(["original", "1080p", "4k"] as const).map((value) => (
              <button type="button" className={exportResolution === value ? "segment-active" : ""} key={value} aria-pressed={exportResolution === value} onClick={() => onExportResolutionChange(value)}>
                {value === "original" ? "Original" : value}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <div className="segmented-grid" role="group" aria-label="Qualidade">
        {(["fast", "max"] as const).map((value) => (
          <button type="button" className={exportQuality === value ? "segment-active" : ""} key={value} aria-pressed={exportQuality === value} onClick={() => onExportQualityChange(value)}>
            {value === "fast" ? "Rápida" : "Máxima"}
          </button>
        ))}
      </div>
      {exportRenderMode === "full" ? (
        <div className="segmented-grid" role="group" aria-label="Cor de saída">
          {(["preserve", "convert_to_sdr"] as const).map((value) => (
            <button type="button" className={exportSdrMode === value ? "segment-active" : ""} key={value} aria-pressed={exportSdrMode === value} onClick={() => onExportSdrModeChange(value)}>
              {value === "preserve" ? "Manter cor" : "SDR YouTube"}
            </button>
          ))}
        </div>
      ) : null}
      <button type="button" onClick={onExport} disabled={!canUseProject || exportRunning || !exportName.trim()}>
        {exportRunning ? "Exportando..." : "Iniciar export"}
      </button>
      {exportJob ? (
        <div className="export-progress">
          <div className="export-progress-head">
            <span>{translateStage(exportJob.stage)}</span>
            <strong>{progress}%</strong>
          </div>
          <div className="progress-track" aria-label="Progresso da exportação">
            <span style={{ width: `${progress}%` }} />
          </div>
          <strong>{translateJobMessage(exportJob.message)}</strong>
          {exportJob.status !== "failed" && exportJob.outputUrl ? (
            <button type="button" onClick={onDownloadExport} disabled={isDownloadingExport}>
              {isDownloadingExport ? "Baixando..." : "Baixar MP4"}
            </button>
          ) : null}
        </div>
      ) : null}
      </div>

      <div className="finalize-card youtube-package-card">
        <div className="finalize-card-head">
          <div>
            <span>Pacote YouTube</span>
            <strong>Thumbnail, título e descrição</strong>
          </div>
        </div>
        <div className="package-inventory" aria-label="Arquivos do pacote YouTube">
          <span>4 JPG</span>
          <span>2 MP4</span>
          <span>titulo.txt</span>
          <span>descricao.txt</span>
          <span>prompt-thumbnail.txt</span>
        </div>
        <button type="button" onClick={onGenerateYoutubePackage} disabled={!canUseProject || packageRunning || !hasTranscript}>
          {packageRunning ? "Gerando pacote..." : "Gerar pacote YouTube"}
        </button>
        {!hasTranscript ? (
          <p className="file-meta">Gere as legendas antes para a IA trabalhar com a transcrição real.</p>
        ) : null}
        {youtubePackageJob ? (
          <div className="export-progress">
            <div className="export-progress-head">
              <span>{translateStage(youtubePackageJob.stage)}</span>
              <strong>{packageProgress}%</strong>
            </div>
            <div className="progress-track" aria-label="Progresso do pacote YouTube">
              <span style={{ width: `${packageProgress}%` }} />
            </div>
            <strong>{translateJobMessage(youtubePackageJob.message)}</strong>
            {youtubePackageJob.status === "passed" && youtubePackageJob.outputPath ? (
              <p className="package-output-path">{youtubePackageJob.outputPath}</p>
            ) : null}
            {youtubePackageJob.status === "failed" && youtubePackageJob.error ? (
              <p className="file-meta">{youtubePackageJob.error}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type ProcessingPanelProps =
  | {
    mode: "upload";
    fileName: string;
    fileSizeBytes: number;
    startedAtMs: number;
    nowMs: number;
  }
  | {
    mode: "job";
    job: ProjectJob;
    fileName: string;
    fileSizeBytes: number | null;
    startedAtMs: number;
    nowMs: number;
  };

function ProcessingPanel(props: ProcessingPanelProps) {
  const elapsedMs = Math.max(0, props.nowMs - props.startedAtMs);
  const steps = props.mode === "upload" ? getUploadSteps() : getProjectProcessingSteps(props.job);
  const progress = props.mode === "upload" ? null : getProjectJobProgress(props.job);
  const isFailed = props.mode === "job" && props.job.status === "failed";
  const title = props.mode === "upload"
    ? "Enviando arquivo para o editor local"
    : isFailed
      ? "Processamento interrompido"
      : "Preparando rascunho editável";
  const detail = props.mode === "upload"
    ? "Arquivos grandes podem levar alguns minutos antes da análise começar."
    : getProcessingDetail(props.job);
  const fileSize = props.fileSizeBytes ? formatBytes(props.fileSizeBytes) : null;

  return (
    <section className={`processing-panel ${isFailed ? "processing-panel-failed" : ""}`} aria-live="polite">
      <div className="processing-head">
        <div>
          <p className="eyebrow">{props.mode === "upload" ? "Upload" : "Processamento local"}</p>
          <h3>{title}</h3>
          <p>{detail}</p>
        </div>
        <div className="processing-timer">
          <span>Tempo</span>
          <strong>{formatElapsed(elapsedMs)}</strong>
        </div>
      </div>

      <div className="processing-file">
        <span>{props.fileName}</span>
        {fileSize ? <small>{fileSize}</small> : null}
      </div>

      <div className="progress-track processing-progress" aria-label="Progresso estimado">
        <span
          className={props.mode === "upload" ? "progress-indeterminate" : ""}
          style={props.mode === "upload" ? undefined : { width: `${progress}%` }}
        />
      </div>

      <div className="processing-steps">
        {steps.map((step) => (
          <div className={`processing-step processing-step-${step.status}`} key={step.id}>
            <span />
            <div>
              <strong>{step.label}</strong>
              <small>{step.description}</small>
            </div>
          </div>
        ))}
      </div>

      {isFailed ? (
        <div className="processing-failure">
          <strong>{friendlyJobError(props.job.error)}</strong>
          <small>{props.job.error}</small>
        </div>
      ) : (
        <p className="processing-note">Pode deixar rodando. A prévia aparece automaticamente quando o rascunho terminar.</p>
      )}
    </section>
  );
}

type RangeFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onBegin?: () => void;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
};

function RangeField({ label, value, min, max, step, suffix = "", onBegin, onChange, onCommit }: RangeFieldProps) {
  return (
    <label className="range-field">
      <span>{label}</span>
      <strong>{value}{suffix}</strong>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onPointerDown={onBegin}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        onPointerUp={(event) => onCommit(Number(event.currentTarget.value))}
        onBlur={(event) => onCommit(Number(event.currentTarget.value))}
      />
    </label>
  );
}

type CaptionInspectorProps = {
  caption: Caption;
  currentTimeSec: number;
  onChangeText: (text: string) => void;
  onCommit: () => void;
  onSeek: () => void;
};

function CaptionInspector({ caption, currentTimeSec, onChangeText, onCommit, onSeek }: CaptionInspectorProps) {
  const currentWord = getActiveWord(normalizeCaptionWords(caption), currentTimeSec);
  return (
    <div className="caption-inspector">
      <div className="inspector-head">
        <strong>{formatSeconds(caption.startSec)} até {formatSeconds(caption.endSec)}</strong>
        <button type="button" className="ghost-button" onClick={onSeek}>Ir</button>
      </div>
      <label className="field-label">
        Texto
        <textarea value={caption.text} onChange={(event) => onChangeText(event.currentTarget.value)} onBlur={onCommit} rows={5} />
      </label>
      {currentWord ? <p className="file-meta">Palavra atual: <strong>{currentWord.text}</strong></p> : null}
      <p className="file-meta">Essa edição muda a prévia instantaneamente. O MP4 final fica para a etapa de exportação.</p>
    </div>
  );
}

type TimelineProps = {
  plan: EditPlanSummary;
  cuts: ManualCut[];
  activeCutIds: string[];
  selectedCutId: string | null;
  zoom: number;
  onSelect: (cutId: string) => void;
};

function Timeline({ plan, cuts, activeCutIds, selectedCutId, zoom, onSelect }: TimelineProps) {
  const selectedCut = selectedCutId ? cuts.find((cut) => cut.id === selectedCutId) : null;
  const centerSec = selectedCut ? (selectedCut.startSec + selectedCut.endSec) / 2 : plan.source.durationSec / 2;
  const windowRange = getZoomWindow({
    videoDurationSec: plan.source.durationSec,
    centerSec,
    zoom,
    minWindowSec: 1.5
  });
  return (
    <div className="timeline-wrap">
      <div className="timeline-window-label">
        <span>{formatSeconds(windowRange.startSec)}</span>
        <span>{formatSeconds(windowRange.endSec)}</span>
      </div>
      <div className="timeline" aria-label="Linha do tempo">
      {cuts.map((cut) => {
        const visibleStartSec = Math.max(cut.startSec, windowRange.startSec);
        const visibleEndSec = Math.min(cut.endSec, windowRange.endSec);
        if (visibleEndSec <= windowRange.startSec || visibleStartSec >= windowRange.endSec) return null;
        const left = `${timeToWindowPercent(visibleStartSec, windowRange)}%`;
        const width = `${Math.max(0.5, timeToWindowPercent(visibleEndSec, windowRange) - timeToWindowPercent(visibleStartSec, windowRange))}%`;
        const active = activeCutIds.includes(cut.id);
        return (
          <button
            key={cut.id}
            type="button"
            className={`timeline-cut ${active ? "timeline-cut-active" : "timeline-cut-muted"} ${selectedCutId === cut.id ? "timeline-cut-selected" : ""}`}
            style={{ left, width }}
            onClick={() => onSelect(cut.id)}
            title={`${formatSeconds(cut.startSec)} até ${formatSeconds(cut.endSec)}`}
          />
        );
      })}
      </div>
    </div>
  );
}

function getActiveCaption(captions: Caption[], currentTimeSec: number) {
  return captions.find((caption) => currentTimeSec >= caption.startSec && currentTimeSec <= caption.endSec) ?? null;
}

export function getActiveWordIndex(words: CaptionWord[], currentTimeSec: number) {
  if (words.length === 0) return 0;

  const exactIndex = words.findIndex((word) => currentTimeSec >= word.startSec && currentTimeSec <= word.endSec);
  if (exactIndex >= 0) return exactIndex;

  const nextIndex = words.findIndex((word) => currentTimeSec < word.startSec);
  if (nextIndex === -1) return words.length - 1;
  return Math.max(0, nextIndex - 1);
}

function getActiveWord(words: CaptionWord[], currentTimeSec: number) {
  if (words.length === 0) return null;
  return words[getActiveWordIndex(words, currentTimeSec)] ?? null;
}

export function getCaptionBlock(words: CaptionWord[], activeIndex: number, wordsPerBlock: number) {
  const safeBlockSize = Math.max(1, wordsPerBlock);
  const safeActiveIndex = Math.max(0, activeIndex);
  const blockStart = Math.floor(safeActiveIndex / safeBlockSize) * safeBlockSize;
  const blockWords = words.slice(blockStart, blockStart + safeBlockSize);
  return {
    words: blockWords.length > 0 ? blockWords : words.slice(0, safeBlockSize),
    activeOffset: Math.max(0, Math.min(safeActiveIndex - blockStart, blockWords.length - 1))
  };
}

function getCaptionCssVars(settings: CaptionSettings): CSSProperties {
  return {
    "--caption-y": `${settings.positionYPct}%`,
    "--caption-max-width": `${settings.maxWidthPct}%`,
    "--caption-font-size": `${settings.fontSizePct}cqw`,
    "--caption-primary": settings.primaryColor,
    "--caption-active": settings.activeColor,
    "--caption-outline": settings.outlineColor,
    "--caption-outline-width": `${settings.outlineWidthPct}cqw`,
    "--caption-shadow": settings.shadow ? "0 12px 26px rgba(0, 0, 0, 0.45)" : "none",
    "--caption-font-family": getCaptionFontFamily(settings.fontId)
  } as CSSProperties;
}

function normalizeCaptionWords(caption: Caption): CaptionWord[] {
  if (caption.words.length > 0) return caption.words;
  return [{
    id: `${caption.id}_fallback`,
    startSec: caption.startSec,
    endSec: caption.endSec,
    text: caption.text
  }];
}

type CutInspectorProps = {
  cut: ManualCut | null;
  active: boolean;
  sourceUrl: string;
  previewing: boolean;
  sourceDuration: number;
  onPreview: () => void;
  onToggle: () => void;
  onNudge: (edge: "startSec" | "endSec", delta: number) => void;
  onBeginAdjust: () => void;
  onSetEdge: (edge: "startSec" | "endSec", value: number) => void;
};

function CutInspector({ cut, active, previewing, sourceDuration, onPreview, onToggle, onNudge, onBeginAdjust, onSetEdge }: CutInspectorProps) {
  if (!cut) return null;
  return (
    <div className="cut-inspector">
      <div className="inspector-head">
        <strong>{formatSeconds(cut.startSec)} até {formatSeconds(cut.endSec)}</strong>
        <button type="button" className="ghost-button" onClick={onToggle}>{active ? "Restaurar" : "Cortar"}</button>
      </div>
      <div className="nudge-grid">
        <span>Início</span>
        <button type="button" onClick={() => onNudge("startSec", -0.1)}>-0.1s</button>
        <button type="button" onClick={() => onNudge("startSec", 0.1)}>+0.1s</button>
        <span>Fim</span>
        <button type="button" onClick={() => onNudge("endSec", -0.1)}>-0.1s</button>
        <button type="button" onClick={() => onNudge("endSec", 0.1)}>+0.1s</button>
      </div>
      <div className="edge-controls">
        <RangeField
          label="Arrastar início"
          value={cut.startSec}
          min={0}
          max={Math.max(0, cut.endSec - 0.1)}
          step={0.05}
          suffix="s"
          onBegin={onBeginAdjust}
          onChange={(value) => onSetEdge("startSec", value)}
          onCommit={() => undefined}
        />
        <RangeField
          label="Arrastar fim"
          value={cut.endSec}
          min={Math.min(sourceDuration, cut.startSec + 0.1)}
          max={sourceDuration}
          step={0.05}
          suffix="s"
          onBegin={onBeginAdjust}
          onChange={(value) => onSetEdge("endSec", value)}
          onCommit={() => undefined}
        />
      </div>
      <button type="button" onClick={onPreview}>{previewing ? "Prévia ativa" : "Ver prévia do corte"}</button>
    </div>
  );
}

function translateStage(stage: string) {
  const labels: Record<string, string> = {
    queued: "na fila",
    probe: "lendo mídia",
    analysis: "analisando",
    planning: "planejando",
    render: "renderizando",
    qa: "verificando",
    captions: "legendando",
    motion_queued: "motion na fila",
    motion_transcript: "preparando transcrição",
    motion_ai: "planejando motion",
    youtube_package_queued: "pacote na fila",
    youtube_package_prepare: "preparando pacote",
    youtube_package_ai: "IA escrevendo",
    youtube_package_frames: "extraindo imagens",
    youtube_package_thumbnails: "renderizando thumbs",
    export_queued: "export na fila",
    export_prepare: "preparando export",
    export_fast_cut: "export rápido",
    export_full_render: "renderizando edição completa",
    export_motion: "renderizando motion",
    export_render: "renderizando export",
    complete: "concluído",
    qa_failed: "falhou na verificação",
    failed: "falhou"
  };
  return labels[stage] ?? stage;
}

function translateJobState(job: ProjectJob) {
  if (job.status === "failed") return `falhou em ${translateStage(job.stage)}`;
  if (job.status === "queued") return "na fila";
  return translateStage(job.stage);
}

function translateJobMessage(message: string) {
  const exact: Record<string, string> = {
    "Waiting to start": "Aguardando início",
    "Reading media metadata": "Lendo metadados da mídia",
    "Detecting silence": "Detectando silêncios",
    "Creating edit plan": "Criando plano de edição",
    "Checking rendered draft": "Verificando o rascunho renderizado",
    "Rough cut draft passed basic QA": "Rascunho com cortes passou na verificação básica",
    "Rough cut draft failed QA": "Rascunho com cortes falhou na verificação",
    "Rough cut draft is ready with warnings": "Rascunho com cortes pronto, com avisos",
    "Project job failed": "Falha ao processar o projeto",
    "Applying manual cuts": "Aplicando cortes manuais",
    "Checking manual render": "Verificando render manual",
    "Manual edit passed basic QA": "Edição manual passou na verificação básica",
    "Manual edit failed QA": "Edição manual falhou na verificação",
    "Manual edit is ready with warnings": "Edição manual pronta, com avisos",
    "Manual render failed": "Falha ao renderizar edição manual",
    "Transcribing with Whisper": "Transcrevendo com Whisper",
    "Checking caption timeline": "Verificando timeline de legendas",
    "Whisper captions failed": "Falha ao gerar legendas com Whisper",
    "Preparing transcript for AI motion": "Preparando transcrição para motion",
    "Planning Remotion edits with AI": "IA escolhendo motions editoriais",
    "AI motion accepted": "Motion com IA aceito",
    "AI motion planning failed": "Falha ao planejar motion com IA",
    "YouTube package accepted": "Pacote YouTube aceito",
    "Preparing YouTube package": "Preparando pacote YouTube",
    "Writing YouTube title, description and thumbnail prompt": "IA escrevendo título, descrição e prompt",
    "Extracting thumbnail reference frames": "Extraindo imagens de referência",
    "Rendering V9 thumbnail images": "Renderizando thumbnails V9",
    "YouTube package is ready": "Pacote YouTube pronto",
    "YouTube package failed": "Falha ao criar pacote YouTube",
    "Export accepted": "Exportação aceita",
    "Preparing export": "Preparando exportação",
    "Rendering fast cuts-only export": "Renderizando só os cortes",
    "Rendering complete edit for export": "Renderizando edição completa para exportação",
    "Rendering Remotion motions": "Renderizando motions com Remotion",
    "Rendering final export": "Renderizando exportação final",
    "Fast cuts export is ready": "Exportação rápida pronta",
    "Export is ready": "Exportação pronta",
    "Export failed": "Falha ao exportar"
  };
  if (exact[message]) return exact[message];
  const renderMatch = message.match(/^Rendering (\d+) kept segments$/);
  if (renderMatch) return `Renderizando ${renderMatch[1]} segmentos mantidos`;
  const manualRenderMatch = message.match(/^Rendering (\d+) manually kept segments$/);
  if (manualRenderMatch) return `Renderizando ${manualRenderMatch[1]} segmentos mantidos manualmente`;
  const previewRenderMatch = message.match(/^Rendering (\d+) second edit preview$/);
  if (previewRenderMatch) return `Gerando prévia de ${previewRenderMatch[1]} segundos`;
  const motionRenderMatch = message.match(/^Rendering (\d+) Remotion motions$/);
  if (motionRenderMatch) return `Renderizando ${motionRenderMatch[1]} motions com Remotion`;
  const aiMotionMatch = message.match(/^Planned (\d+) AI motions$/);
  if (aiMotionMatch) return `${aiMotionMatch[1]} motions planejados com IA`;
  const captionsMatch = message.match(/^Generated (\d+) captions$/);
  if (captionsMatch) return `${captionsMatch[1]} legendas geradas`;
  return message;
}

function translateWarning(warning: string) {
  if (warning === "Rendered video is shorter than one second.") return "O vídeo renderizado tem menos de um segundo.";
  if (warning === "Rendered video has no audio track.") return "O vídeo renderizado não tem faixa de áudio.";
  if (warning === "Black-frame QA check failed.") return "A verificação de quadros pretos falhou.";
  if (warning.startsWith("Detected possible black frame regions:")) {
    return warning.replace("Detected possible black frame regions:", "Possíveis regiões com tela preta detectadas:");
  }
  if (warning.startsWith("QA failed to complete:")) {
    return warning.replace("QA failed to complete:", "A verificação não conseguiu finalizar:");
  }
  return warning;
}

function getManualRenderedDuration(plan: EditPlanSummary, cuts: ManualCut[], activeIds: string[]) {
  const active = new Set(activeIds);
  const removedDuration = cuts
    .filter((cut) => active.has(cut.id))
    .reduce((total, cut) => total + cut.endSec - cut.startSec, 0);
  return Math.max(0, plan.source.durationSec - removedDuration);
}

function countCaptionWords(plan: EditPlanSummary) {
  return plan.captions.reduce((total, caption) => total + caption.words.length, 0);
}

function countMotionSlots(plan: EditPlanSummary) {
  return plan.sections.reduce((total, section) => total + (section.treatments.motion?.enabled ? section.treatments.motion.slots.length : 0), 0);
}

async function downloadMediaFile(url: string, fileName: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar arquivo (${response.status})`);
  }
  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error("O arquivo baixado veio vazio.");
  }
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function normalizeMp4FileName(fileName: string) {
  const trimmed = fileName.trim() || "youtube-edit";
  return trimmed.toLowerCase().endsWith(".mp4") ? trimmed : `${trimmed}.mp4`;
}

function translateMotionKind(kind: string) {
  const labels: Record<string, string> = {
    hook_title: "Título de gancho",
    kinetic_keyword: "Palavra cinética",
    zoom: "Zoom",
    callout: "Callout",
    highlight: "Highlight",
    focus_frame: "Moldura de foco",
    lower_third: "Lower third",
    chapter_card: "Card de capítulo"
  };
  return labels[kind] ?? kind;
}

function mergeCuts(currentCuts: ManualCut[], nextCuts: EditPlanSummary["removed"]): ManualCut[] {
  const cuts = new Map(currentCuts.map((cut) => [cut.id, cut]));
  nextCuts.forEach((cut) => cuts.set(cut.id, cut));
  return [...cuts.values()].sort((a, b) => a.startSec - b.startSec);
}
