export type JobStatus = "queued" | "running" | "passed" | "warning" | "failed";

export type ProjectJob = {
  id: string;
  projectId: string;
  status: JobStatus;
  stage: string;
  message: string;
  sourcePath: string;
  workspaceId: string | null;
  outputPath: string | null;
  planPath: string | null;
  warnings: string[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateJobInput = Pick<ProjectJob, "projectId" | "sourcePath"> & { workspaceId?: string | null };
export type JobUpdate = Partial<Pick<ProjectJob, "status" | "stage" | "message" | "outputPath" | "planPath" | "warnings" | "error">>;
export type JobStore = ReturnType<typeof createJobStore>;

function cloneJob(job: ProjectJob): ProjectJob {
  return {
    ...job,
    warnings: [...job.warnings]
  };
}

export function createJobStore() {
  const jobs = new Map<string, ProjectJob>();

  return {
    create(input: CreateJobInput) {
      const now = new Date().toISOString();
      const job: ProjectJob = {
        id: `job_${crypto.randomUUID()}`,
        projectId: input.projectId,
        status: "queued",
        stage: "queued",
        message: "Waiting to start",
        sourcePath: input.sourcePath,
        workspaceId: input.workspaceId ?? null,
        outputPath: null,
        planPath: null,
        warnings: [],
        error: null,
        createdAt: now,
        updatedAt: now
      };
      jobs.set(job.id, job);
      return cloneJob(job);
    },
    get(id: string) {
      const job = jobs.get(id);
      return job ? cloneJob(job) : null;
    },
    getForWorkspace(id: string, workspaceId: string) {
      const job = jobs.get(id);
      if (!job) return null;
      // Null workspaceId is legacy unscoped data kept readable until all callers create tenant-scoped jobs.
      if (job.workspaceId && job.workspaceId !== workspaceId) return null;
      return cloneJob(job);
    },
    list() {
      return Array.from(jobs.values()).map(cloneJob);
    },
    update(id: string, patch: JobUpdate) {
      const current = jobs.get(id);
      if (!current) return null;
      const updated = {
        ...current,
        ...patch,
        warnings: patch.warnings ? [...patch.warnings] : [...current.warnings],
        updatedAt: new Date().toISOString()
      };
      jobs.set(id, updated);
      return cloneJob(updated);
    }
  };
}
