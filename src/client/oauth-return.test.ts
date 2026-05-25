import { describe, expect, it } from "vitest";
import { buildYoutubeOAuthReturnTo } from "./oauth-return";

describe("buildYoutubeOAuthReturnTo", () => {
  it("preserves the active project even when the current URL has no projectId", () => {
    expect(buildYoutubeOAuthReturnTo({
      pathname: "/",
      search: "",
      hash: "",
      projectId: "project_123"
    })).toBe("/?projectId=project_123&flowcutStep=publish");
  });

  it("keeps the existing project URL and marks the publish step", () => {
    expect(buildYoutubeOAuthReturnTo({
      pathname: "/",
      search: "?projectId=project_123&youtube=connected",
      hash: "",
      projectId: "project_123"
    })).toBe("/?projectId=project_123&flowcutStep=publish");
  });
});
