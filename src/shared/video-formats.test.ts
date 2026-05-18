import { describe, expect, it } from "vitest";
import { VIDEO_FILE_INPUT_ACCEPT } from "./video-formats";

describe("video formats", () => {
  it("does not constrain the native file picker while MOV support is being tested", () => {
    expect(VIDEO_FILE_INPUT_ACCEPT).toBeUndefined();
  });
});
