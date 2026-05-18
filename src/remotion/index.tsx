import React from "react";
import { Composition, registerRoot } from "remotion";
import { AiMotionVideo } from "./AiMotionVideo";
import { DEFAULT_AI_MOTION_PROPS, type AiMotionVideoProps } from "./motion-types";
import type { ThumbnailRenderProps } from "./thumbnails/types";
import { PremiumExecution } from "./thumbnails/layouts/PremiumExecution";
import { SplitResult } from "./thumbnails/layouts/SplitResult";
import { Editorial } from "./thumbnails/layouts/Editorial";
import { StatusWindow } from "./thumbnails/layouts/StatusWindow";
import { SocialCards } from "./thumbnails/layouts/SocialCards";
import { BreakingNews } from "./thumbnails/layouts/BreakingNews";

const THUMBNAIL_WIDTH = 1280;
const THUMBNAIL_HEIGHT = 720;

const DEFAULT_THUMBNAIL_PROPS: ThumbnailRenderProps = {
  renderText: {
    headline: ["THUMBNAIL", "PREMIUM", "V10"],
    subhead: "preview de desenvolvimento local",
    badge: "CANAL",
    stamp: "18 mai 2026",
    leftLabel: "ANTES",
    rightLabel: "DEPOIS",
    checklistBad: "trava inicial",
    checklistGood: ["continuei mesmo assim", "canal criado"],
    tags: ["PROCESSO REAL", "SEM FILTRO", "BASTIDOR"],
  },
  imageDataUrls: ["", "", "", ""] as [string, string, string, string],
};

function RemotionRoot() {
  return (
    <>
      <Composition
        id="AiMotionVideo"
        component={AiMotionVideo}
        durationInFrames={Math.ceil(DEFAULT_AI_MOTION_PROPS.durationSec * DEFAULT_AI_MOTION_PROPS.fps)}
        fps={DEFAULT_AI_MOTION_PROPS.fps}
        width={DEFAULT_AI_MOTION_PROPS.width}
        height={DEFAULT_AI_MOTION_PROPS.height}
        defaultProps={DEFAULT_AI_MOTION_PROPS}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(1, Math.ceil(props.durationSec * props.fps)),
          fps: props.fps,
          width: props.width,
          height: props.height,
        })}
      />
      <Composition
        id="thumbnail-premium-execution"
        component={PremiumExecution}
        durationInFrames={1}
        fps={30}
        width={THUMBNAIL_WIDTH}
        height={THUMBNAIL_HEIGHT}
        defaultProps={DEFAULT_THUMBNAIL_PROPS}
      />
      <Composition
        id="thumbnail-split-result"
        component={SplitResult}
        durationInFrames={1}
        fps={30}
        width={THUMBNAIL_WIDTH}
        height={THUMBNAIL_HEIGHT}
        defaultProps={DEFAULT_THUMBNAIL_PROPS}
      />
      <Composition
        id="thumbnail-editorial"
        component={Editorial}
        durationInFrames={1}
        fps={30}
        width={THUMBNAIL_WIDTH}
        height={THUMBNAIL_HEIGHT}
        defaultProps={DEFAULT_THUMBNAIL_PROPS}
      />
      <Composition
        id="thumbnail-status-window"
        component={StatusWindow}
        durationInFrames={1}
        fps={30}
        width={THUMBNAIL_WIDTH}
        height={THUMBNAIL_HEIGHT}
        defaultProps={DEFAULT_THUMBNAIL_PROPS}
      />
      <Composition
        id="thumbnail-social-cards"
        component={SocialCards}
        durationInFrames={1}
        fps={30}
        width={THUMBNAIL_WIDTH}
        height={THUMBNAIL_HEIGHT}
        defaultProps={DEFAULT_THUMBNAIL_PROPS}
      />
      <Composition
        id="thumbnail-breaking-news"
        component={BreakingNews}
        durationInFrames={1}
        fps={30}
        width={THUMBNAIL_WIDTH}
        height={THUMBNAIL_HEIGHT}
        defaultProps={DEFAULT_THUMBNAIL_PROPS}
      />
    </>
  );
}

registerRoot(RemotionRoot);
