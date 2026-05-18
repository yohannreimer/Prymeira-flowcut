import React from "react";
import {
  AbsoluteFill,
  interpolate,
  OffthreadVideo,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig
} from "remotion";
import type { AiMotionVideoProps, RemotionMotionEvent } from "./motion-types";

const ink = "#171716";
const paper = "#fbfaf4";
const gold = "#fcc009";
const blue = "#509ad4";
const line = "rgba(251, 250, 244, 0.18)";

export function AiMotionVideo({ sourceUrl, events }: AiMotionVideoProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zoom = getZoomScale(events, frame / fps);

  return (
    <AbsoluteFill style={{ background: ink, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: "50% 50%",
          transition: "transform 120ms linear"
        }}
      >
        {sourceUrl ? (
          <OffthreadVideo
            src={sourceUrl}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : null}
      </AbsoluteFill>
      <FilmTexture />
      {events.filter((event) => event.kind !== "zoom").map((event) => (
        <Sequence
          key={event.id}
          from={Math.max(0, Math.floor(event.startSec * fps))}
          durationInFrames={Math.max(1, Math.ceil((event.endSec - event.startSec) * fps))}
        >
          <MotionLayer event={event} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

function MotionLayer({ event }: { event: RemotionMotionEvent }) {
  if (event.kind === "hook_title") return <HookTitle event={event} />;
  if (event.kind === "kinetic_keyword") return <KineticKeyword event={event} />;
  if (event.kind === "callout") return <Callout event={event} />;
  if (event.kind === "highlight" || event.kind === "focus_frame") return <FocusFrame event={event} />;
  if (event.kind === "chapter_card") return <ChapterCard event={event} />;
  return <LowerThird event={event} />;
}

function HookTitle({ event }: { event: RemotionMotionEvent }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 18, stiffness: 120 } });
  const title = getPayloadText(event, "title", event.label);
  const subtitle = getPayloadText(event, "subtitle", "");
  const eyebrow = getSafeBadge(event);
  const words = title.split(" ").filter(Boolean);
  const compact = width < height;
  const headline = words.slice(0, compact ? 6 : 8).join(" ");

  return (
    <AbsoluteFill style={{ justifyContent: compact ? "flex-end" : "center", padding: compact ? "8%" : "5.5% 6%" }}>
      <div style={{
        maxWidth: compact ? "92%" : "48%",
        transform: `translateY(${interpolate(entrance, [0, 1], [32, 0])}px)`,
        opacity: entrance
      }}>
        {eyebrow ? (
          <div style={{
            display: "inline-flex",
            gap: 10,
            alignItems: "center",
            color: paper,
            background: "rgba(23, 23, 22, 0.74)",
            border: `1px solid ${line}`,
            borderRadius: 999,
            padding: "9px 14px",
            fontFamily: "Inter, Arial, sans-serif",
            fontWeight: 850,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            fontSize: Math.max(12, width * 0.01)
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: gold, boxShadow: `0 0 28px ${gold}` }} />
            {eyebrow}
          </div>
        ) : null}
        <h1 style={{
          margin: eyebrow ? "16px 0 0" : 0,
          color: paper,
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: compact ? width * 0.092 : width * 0.044,
          lineHeight: 0.98,
          fontWeight: 950,
          letterSpacing: 0,
          textShadow: "0 12px 38px rgba(0,0,0,0.5)"
        }}>
          {headline}
        </h1>
        {subtitle ? (
          <div style={{
            marginTop: 14,
            maxWidth: compact ? "88%" : "64%",
            color: "rgba(251,250,244,0.86)",
            fontFamily: "Inter, Arial, sans-serif",
            fontWeight: 750,
            fontSize: compact ? width * 0.045 : width * 0.02,
            lineHeight: 1.1,
            textShadow: "0 10px 28px rgba(0,0,0,0.42)"
          }}>
            {subtitle}
          </div>
        ) : null}
        <div style={{
          marginTop: 18,
          width: compact ? "70%" : "46%",
          height: 6,
          borderRadius: 99,
          overflow: "hidden",
          background: "rgba(251, 250, 244, 0.18)"
        }}>
          <div style={{
            height: "100%",
            width: `${interpolate(frame, [0, 110], [12, 100], { extrapolateRight: "clamp" })}%`,
            background: `linear-gradient(90deg, ${gold}, ${blue})`
          }} />
        </div>
      </div>
      {height >= width ? null : <EditorialRail />}
    </AbsoluteFill>
  );
}

function LowerThird({ event }: { event: RemotionMotionEvent }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 20, stiffness: 140 } });
  const title = getPayloadText(event, "title", event.label);
  const subtitle = getPayloadText(event, "subtitle", "");
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 6% 8%" }}>
      <div style={{
        width: "min(740px, 68%)",
        transform: `translateX(${interpolate(enter, [0, 1], [-52, 0])}px)`,
        opacity: enter,
        background: "rgba(23, 23, 22, 0.78)",
        backdropFilter: "blur(18px)",
        border: `1px solid ${line}`,
        borderRadius: 18,
        padding: "22px 26px"
      }}>
        <div style={{ color: gold, fontWeight: 900, fontSize: Math.max(15, width * 0.012), textTransform: "uppercase", letterSpacing: 1.2 }}>
          Ponto-chave
        </div>
        <div style={{ color: paper, fontWeight: 900, fontSize: Math.max(26, width * 0.026), lineHeight: 1.02, marginTop: 8 }}>
          {title}
        </div>
        {subtitle ? <div style={{ color: "rgba(251,250,244,0.76)", fontWeight: 650, fontSize: Math.max(16, width * 0.014), marginTop: 8 }}>{subtitle}</div> : null}
      </div>
    </AbsoluteFill>
  );
}

function Callout({ event }: { event: RemotionMotionEvent }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 22, stiffness: 160 } });
  const isVertical = height > width;
  const title = getPayloadText(event, "title", event.label);
  const subtitle = getPayloadText(event, "subtitle", getPayloadText(event, "visualDirection", ""));
  const alignItems = isVertical ? "center" : getPayloadText(event, "position", "left") === "right" ? "flex-end" : "flex-start";
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems, padding: "6%" }}>
      <div style={{
        width: isVertical ? "82%" : "34%",
        transform: `translateX(${interpolate(enter, [0, 1], [46, 0])}px) scale(${interpolate(enter, [0, 1], [0.96, 1])})`,
        opacity: enter,
        background: paper,
        color: ink,
        border: `3px solid ${ink}`,
        borderRadius: 20,
        boxShadow: `10px 10px 0 ${gold}`,
        padding: "24px 26px",
        fontFamily: "Inter, Arial, sans-serif"
      }}>
        <div style={{ fontSize: Math.max(13, width * 0.01), fontWeight: 950, textTransform: "uppercase", letterSpacing: 1.1, color: "#746b60" }}>
          Atenção
        </div>
        <div style={{ marginTop: 8, fontSize: Math.max(24, width * 0.022), fontWeight: 950, lineHeight: 1.04 }}>
          {title}
        </div>
        {subtitle ? <div style={{ marginTop: 10, color: "#5e554c", fontWeight: 760, fontSize: Math.max(15, width * 0.012), lineHeight: 1.18 }}>{subtitle}</div> : null}
      </div>
    </AbsoluteFill>
  );
}

function FocusFrame({ event }: { event: RemotionMotionEvent }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 120 } });
  const title = getPayloadText(event, "title", event.label);
  return (
    <AbsoluteFill style={{ padding: "5%" }}>
      <div style={{
        position: "absolute",
        inset: "8% 7%",
        border: `4px solid ${gold}`,
        borderRadius: 24,
        opacity: interpolate(enter, [0, 1], [0, 0.92]),
        boxShadow: `0 0 0 999px rgba(0,0,0,0.18), 0 18px 70px rgba(0,0,0,0.28)`
      }} />
      <div style={{
        position: "absolute",
        left: "7%",
        top: "8%",
        transform: `translateY(${interpolate(enter, [0, 1], [-18, 0])}px)`,
        background: ink,
        color: paper,
        borderRadius: 999,
        padding: "12px 18px",
        fontWeight: 950,
        fontFamily: "Inter, Arial, sans-serif",
        border: `1px solid ${line}`
      }}>
        {title}
      </div>
    </AbsoluteFill>
  );
}

function ChapterCard({ event }: { event: RemotionMotionEvent }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 20, stiffness: 130 } });
  const title = getPayloadText(event, "title", event.label);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "7%" }}>
      <div style={{
        opacity: enter,
        transform: `scale(${interpolate(enter, [0, 1], [0.94, 1])})`,
        width: "min(900px, 84%)",
        background: "rgba(251,250,244,0.94)",
        color: ink,
        borderRadius: 26,
        padding: "34px 42px",
        border: `2px solid ${ink}`,
        boxShadow: `14px 14px 0 ${gold}`
      }}>
        <div style={{ color: "#746b60", fontWeight: 950, textTransform: "uppercase", letterSpacing: 1.2, fontSize: Math.max(14, width * 0.011) }}>
          Novo bloco
        </div>
        <div style={{ marginTop: 10, fontWeight: 950, fontSize: Math.max(38, width * 0.04), lineHeight: 0.98 }}>
          {title}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function KineticKeyword({ event }: { event: RemotionMotionEvent }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 180 } });
  const keyword = getPayloadText(event, "keyword", getPayloadText(event, "title", event.label));
  const position = getPayloadText(event, "position", "left");
  const justifyContent = position === "bottom" ? "flex-end" : "center";
  const alignItems = height > width ? "center" : position === "right" ? "flex-end" : "flex-start";
  return (
    <AbsoluteFill style={{ justifyContent, alignItems, padding: "7%" }}>
      <div style={{
        color: gold,
        fontWeight: 1000,
        maxWidth: height > width ? "86%" : "44%",
        fontSize: Math.max(46, width * 0.052),
        lineHeight: 0.92,
        transform: `rotate(${interpolate(enter, [0, 1], [-2, 0])}deg) scale(${interpolate(enter, [0, 1], [0.82, 1])})`,
        textShadow: "0 8px 0 rgba(23,23,22,0.95), 0 26px 60px rgba(0,0,0,0.38)"
      }}>
        {keyword}
      </div>
    </AbsoluteFill>
  );
}

function FilmTexture() {
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background: "radial-gradient(circle at 50% 35%, rgba(251,250,244,0.05), transparent 42%), linear-gradient(90deg, rgba(252,192,9,0.05), transparent 18%, transparent 82%, rgba(80,154,212,0.05))",
        mixBlendMode: "screen",
        opacity: 0.72
      }}
    />
  );
}

function EditorialRail() {
  return (
    <div style={{ position: "absolute", right: "5%", top: "13%", bottom: "13%", width: 2, background: "rgba(251,250,244,0.2)" }}>
      <div style={{ width: 8, height: "34%", background: gold, borderRadius: 99, transform: "translateX(-3px)" }} />
    </div>
  );
}

function getZoomScale(events: RemotionMotionEvent[], timeSec: number) {
  return events
    .filter((event) => event.kind === "zoom" && event.startSec <= timeSec && event.endSec >= timeSec)
    .reduce((scale, event) => {
      const local = (timeSec - event.startSec) / Math.max(0.1, event.endSec - event.startSec);
      const from = typeof event.payload.from === "number" ? event.payload.from : 1;
      const to = typeof event.payload.to === "number" ? event.payload.to : 1.04;
      const eased = Math.sin(Math.min(1, Math.max(0, local)) * Math.PI * 0.5);
      return Math.max(scale, interpolate(eased, [0, 1], [from, to]));
    }, 1);
}

function getPayloadText(event: RemotionMotionEvent, key: string, fallback: string) {
  const value = event.payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getSafeBadge(event: RemotionMotionEvent) {
  const badge = getPayloadText(event, "eyebrow", getPayloadText(event, "keyword", ""));
  if (!badge || isGenericBadge(badge)) return "";
  return badge.split(" ").slice(0, 3).join(" ");
}

function isGenericBadge(text: string) {
  const normalized = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return ["gancho", "gancho visual", "ponto-chave", "ponto chave", "atencao", "observe"].includes(normalized);
}
