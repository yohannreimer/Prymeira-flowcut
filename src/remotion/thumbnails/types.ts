import type { YoutubePackageCopy } from "../../server/youtube/youtube-package-copy";

export type ThumbnailRenderText = YoutubePackageCopy["thumbnailPrompts"][number]["renderText"];

export type ThumbnailRenderProps = {
  renderText: ThumbnailRenderText;
  imageDataUrls: [string, string, string, string];
  channelName?: string;
};
