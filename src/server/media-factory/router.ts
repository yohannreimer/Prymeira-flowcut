export const mediaFactoryOrientationValues = ["horizontal", "vertical"] as const;
export const mediaFactoryPipelineValues = ["horizontal_youtube_podcast_x", "vertical_short_clips"] as const;

export type MediaFactoryOrientation = (typeof mediaFactoryOrientationValues)[number];
export type MediaFactoryPipeline = (typeof mediaFactoryPipelineValues)[number];

export function routeMedia(input: { width: number; height: number }): {
  orientation: MediaFactoryOrientation;
  pipeline: MediaFactoryPipeline;
} {
  if (input.height > input.width) {
    return {
      orientation: "vertical",
      pipeline: "vertical_short_clips"
    };
  }

  return {
    orientation: "horizontal",
    pipeline: "horizontal_youtube_podcast_x"
  };
}
