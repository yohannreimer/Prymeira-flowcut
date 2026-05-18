import { describe, expect, it } from "vitest";
import { routeMedia } from "./router";

describe("routeMedia", () => {
  it("routes horizontal media to the horizontal pipeline", () => {
    expect(routeMedia({ width: 1920, height: 1080 })).toEqual({
      orientation: "horizontal",
      pipeline: "horizontal_youtube_podcast_x"
    });
  });

  it("routes vertical media to the short clips pipeline", () => {
    expect(routeMedia({ width: 1080, height: 1920 })).toEqual({
      orientation: "vertical",
      pipeline: "vertical_short_clips"
    });
  });

  it("routes square media to the horizontal pipeline", () => {
    expect(routeMedia({ width: 1080, height: 1080 })).toEqual({
      orientation: "horizontal",
      pipeline: "horizontal_youtube_podcast_x"
    });
  });
});
