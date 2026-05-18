import { describe, expect, it } from "vitest";
import { createJobStore, type JobUpdate } from "./job-store";

describe("createJobStore", () => {
  it("returns defensive copies so callers cannot mutate stored jobs", () => {
    const jobs = createJobStore();
    const created = jobs.create({ projectId: "project_123", sourcePath: "/tmp/source.mp4" });

    created.status = "failed";
    created.warnings.push("mutated from create");

    expect(jobs.get(created.id)?.status).toBe("queued");
    expect(jobs.get(created.id)?.warnings).toEqual([]);

    const updated = jobs.update(created.id, { status: "warning", warnings: ["render warning"] });
    expect(updated).not.toBeNull();
    updated?.warnings.push("mutated from update");

    expect(jobs.get(created.id)?.warnings).toEqual(["render warning"]);
  });
});

const invalidUpdate: JobUpdate = {
  // @ts-expect-error id is immutable and cannot be updated through JobUpdate
  id: "job_other"
};
void invalidUpdate;
