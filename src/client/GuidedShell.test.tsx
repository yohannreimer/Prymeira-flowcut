import { describe, it, expect } from "vitest";
import type { EditPlanSummary, ProjectJob } from "./api";
import { deriveCurrentStep, buildSidebarSteps } from "./GuidedShell";

describe("deriveCurrentStep", () => {
  it("returns 1 when nothing is loaded", () => {
    expect(deriveCurrentStep(null, null, false, false, false, false)).toBe(1);
  });

  it("returns 1 when file is selected but upload not started", () => {
    const file = new File([""], "test.mp4");
    expect(deriveCurrentStep(file, null, false, false, false, false)).toBe(1);
  });

  it("returns 2 when uploading even if nothing else is loaded", () => {
    expect(deriveCurrentStep(null, null, true, false, false, false)).toBe(2);
  });

  it("returns 3 when cut is done but no captions", () => {
    // job must exist (upload completed) to advance past step 1
    const mockJob = { id: "j", projectId: "p", type: "ai_cut", status: "passed", createdAt: new Date(), updatedAt: new Date() } as unknown as ProjectJob;
    expect(deriveCurrentStep(null, mockJob, false, true, false, false)).toBe(3);
  });

  it("returns 4 when captions done but no package", () => {
    const mockJob = { id: "j", projectId: "p", type: "ai_cut", status: "passed", createdAt: new Date(), updatedAt: new Date() } as unknown as ProjectJob;
    expect(deriveCurrentStep(null, mockJob, false, true, true, false)).toBe(4);
  });

  it("returns 5 when package is ready", () => {
    const mockJob = { id: "j", projectId: "p", type: "ai_cut", status: "passed", createdAt: new Date(), updatedAt: new Date() } as unknown as ProjectJob;
    expect(deriveCurrentStep(null, mockJob, false, true, true, true)).toBe(5);
  });

  it("prioritizes hasCut over job presence", () => {
    const mockJob = { id: "j", projectId: "p", type: "ai_cut", status: "passed", createdAt: new Date(), updatedAt: new Date() } as unknown as ProjectJob;
    expect(deriveCurrentStep(null, mockJob, false, true, false, false)).toBe(3);
  });

  it("prioritizes hasCaptions over hasCut", () => {
    const mockJob = { id: "j", projectId: "p", type: "ai_cut", status: "passed", createdAt: new Date(), updatedAt: new Date() } as unknown as ProjectJob;
    expect(deriveCurrentStep(null, mockJob, false, true, true, false)).toBe(4);
  });

  it("returns correct step when job exists", () => {
    const mockJob = { id: "job1", projectId: "proj1", status: "queued" } as unknown as ProjectJob;
    expect(deriveCurrentStep(null, mockJob, false, true, true, false)).toBe(4);
  });

  it("honors a preferred publish step after an OAuth callback restores a project", () => {
    const mockJob = { id: "job1", projectId: "project_123", status: "passed" } as unknown as ProjectJob;
    expect(deriveCurrentStep(null, mockJob, false, true, false, false, 5)).toBe(5);
  });
});

describe("buildSidebarSteps", () => {
  it("returns 5 steps with step 1 active when nothing loaded", () => {
    const steps = buildSidebarSteps(null, null, false, false, false, null, false, false, false, false);
    expect(steps).toHaveLength(5);
    expect(steps[0].status).toBe("active");
    expect(steps[1].status).toBe("locked");
    expect(steps[2].status).toBe("locked");
    expect(steps[3].status).toBe("locked");
    expect(steps[4].status).toBe("locked");
  });

  it("keeps step 1 active when only file is selected (upload not started)", () => {
    const file = new File([""], "video.mp4");
    const steps = buildSidebarSteps(file, null, false, false, false, null, false, false, false, false);
    expect(steps[0].status).toBe("active");
  });

  it("marks step 1 done and step 2 processing when uploading", () => {
    const file = new File([""], "video.mp4");
    const steps = buildSidebarSteps(file, null, true, false, false, null, false, false, false, false);
    expect(steps[0].status).toBe("done");
    expect(steps[1].status).toBe("processing");
  });

  it("shows uploading status in step 1 sub when uploading", () => {
    const file = new File([""], "video.mp4");
    const steps = buildSidebarSteps(file, null, true, false, false, null, false, false, false, false);
    expect(steps[0].sub).toContain("Enviando");
  });

  it("marks step 2 done when cut is complete (job exists)", () => {
    const mockJob = { id: "j", projectId: "p", type: "ai_cut", status: "passed", createdAt: new Date(), updatedAt: new Date() } as unknown as ProjectJob;
    const steps = buildSidebarSteps(null, mockJob, false, true, false, null, false, false, false, false);
    expect(steps[1].status).toBe("done");
  });

  it("marks step 2 processing when cut is running (isUploading)", () => {
    const file = new File([""], "video.mp4");
    const steps = buildSidebarSteps(file, null, true, false, false, null, false, false, false, false);
    expect(steps[1].status).toBe("processing");
  });

  it("marks step 3 active when cut is done but no captions", () => {
    const steps = buildSidebarSteps(null, null, false, true, false, null, false, false, false, false);
    expect(steps[2].status).toBe("active");
  });

  it("marks step 3 done when captions are complete", () => {
    const steps = buildSidebarSteps(null, null, false, true, false, null, true, false, false, false);
    expect(steps[2].status).toBe("done");
  });

  it("marks step 3 processing when caption job is running", () => {
    const steps = buildSidebarSteps(null, null, false, true, false, null, false, true, false, false);
    expect(steps[2].status).toBe("processing");
  });

  it("shows caption count in step 3 sub when captions exist", () => {
    const editPlan = {
      captions: [
        { id: "c1", text: "Caption 1", startSec: 0, endSec: 5 },
        { id: "c2", text: "Caption 2", startSec: 5, endSec: 10 }
      ]
    } as unknown as EditPlanSummary;
    const steps = buildSidebarSteps(null, null, false, true, false, editPlan, true, false, false, false);
    expect(steps[2].sub).toContain("2");
  });

  it("marks step 4 active when captions done but no package", () => {
    const steps = buildSidebarSteps(null, null, false, true, false, null, true, false, false, false);
    expect(steps[3].status).toBe("active");
  });

  it("marks step 4 done when package is complete", () => {
    const steps = buildSidebarSteps(null, null, false, true, false, null, true, false, true, false);
    expect(steps[3].status).toBe("done");
  });

  it("marks step 4 processing when package job is running", () => {
    const steps = buildSidebarSteps(null, null, false, true, false, null, true, false, false, true);
    expect(steps[3].status).toBe("processing");
  });

  it("marks step 5 active when package is ready", () => {
    const steps = buildSidebarSteps(null, null, false, true, false, null, true, false, true, false);
    expect(steps[4].status).toBe("active");
  });

  it("does not require captions for a ready vertical SupoClip package", () => {
    const steps = buildSidebarSteps(null, null, false, true, false, null, false, false, true, false, "vertical");
    expect(steps[2]).toMatchObject({ label: "Revisão", status: "done" });
    expect(steps[3]).toMatchObject({ label: "Shorts/Reels", status: "done" });
    expect(steps[4]).toMatchObject({ status: "active" });
  });

  it("marks step 5 locked when package is not ready", () => {
    const steps = buildSidebarSteps(null, null, false, true, false, null, true, false, false, false);
    expect(steps[4].status).toBe("locked");
  });

  it("locks all steps after step 1 when no file/upload", () => {
    const steps = buildSidebarSteps(null, null, false, false, false, null, false, false, false, false);
    expect(steps[1].status).toBe("locked");
    expect(steps[2].status).toBe("locked");
    expect(steps[3].status).toBe("locked");
    expect(steps[4].status).toBe("locked");
  });

  it("locks step 3 and beyond when no cut", () => {
    const file = new File([""], "video.mp4");
    const steps = buildSidebarSteps(file, null, false, false, false, null, false, false, false, false);
    expect(steps[2].status).toBe("locked");
    expect(steps[3].status).toBe("locked");
    expect(steps[4].status).toBe("locked");
  });

  it("locks step 4 and beyond when no captions", () => {
    const file = new File([""], "video.mp4");
    const steps = buildSidebarSteps(file, null, false, true, false, null, false, false, false, false);
    expect(steps[3].status).toBe("locked");
    expect(steps[4].status).toBe("locked");
  });

  it("shows project ID in step 1 sub when job exists", () => {
    const mockJob = { id: "job1", projectId: "proj123456789012345678", status: "queued" } as unknown as ProjectJob;
    const steps = buildSidebarSteps(null, mockJob, false, false, false, null, false, false, false, false);
    expect(steps[0].sub).toContain("proj12345678901234");
  });

  it("shows awaiting upload when no file or job or uploading", () => {
    const steps = buildSidebarSteps(null, null, false, false, false, null, false, false, false, false);
    expect(steps[0].sub).toContain("Aguardando upload");
  });

  it("shows analyzing status in step 2 when uploading or cut running", () => {
    const file = new File([""], "video.mp4");
    const steps = buildSidebarSteps(file, null, true, false, false, null, false, false, false, false);
    expect(steps[1].sub).toContain("Analisando");
  });

  it("all steps have correct number labels", () => {
    const steps = buildSidebarSteps(null, null, false, false, false, null, false, false, false, false);
    expect(steps.map((s) => s.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it("all steps have labels in Portuguese", () => {
    const steps = buildSidebarSteps(null, null, false, false, false, null, false, false, false, false);
    const labels = steps.map((s) => s.label);
    expect(labels).toContain("Vídeo");
    expect(labels).toContain("Corte IA");
    expect(labels).toContain("Transcrição");
    expect(labels).toContain("Pacote YT");
    expect(labels).toContain("Publicar");
  });
});
