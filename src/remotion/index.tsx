import React from "react";
import { Composition, registerRoot } from "remotion";
import { AiMotionVideo } from "./AiMotionVideo";
import { DEFAULT_AI_MOTION_PROPS, type AiMotionVideoProps } from "./motion-types";

function RemotionRoot() {
  return (
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
        height: props.height
      })}
    />
  );
}

registerRoot(RemotionRoot);
