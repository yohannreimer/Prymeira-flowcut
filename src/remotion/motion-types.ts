export type RemotionMotionEventKind =
  | "zoom"
  | "callout"
  | "highlight"
  | "lower_third"
  | "hook_title"
  | "kinetic_keyword"
  | "focus_frame"
  | "chapter_card";

export type RemotionMotionEvent = {
  id: string;
  kind: RemotionMotionEventKind;
  startSec: number;
  endSec: number;
  label: string;
  sectionType: string;
  payload: Record<string, unknown>;
};

export type AiMotionVideoProps = {
  sourceUrl: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  events: RemotionMotionEvent[];
};

export const DEFAULT_AI_MOTION_PROPS: AiMotionVideoProps = {
  sourceUrl: "",
  durationSec: 10,
  width: 1920,
  height: 1080,
  fps: 30,
  events: []
};
