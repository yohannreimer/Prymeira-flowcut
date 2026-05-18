import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { ThumbnailRenderProps } from "../types";
import { bebasNeue, inter } from "../fonts";
import { FaceImage } from "../FaceImage";
import { INK, CREAM, YELLOW, fitFontSize } from "../utils";

export function SplitResult({ renderText, imageDataUrls }: ThumbnailRenderProps) {
  const { width, height } = useVideoConfig();
  const leftFontSize = fitFontSize([renderText.leftLabel], Math.round(width * 0.12));
  const rightFontSize = fitFontSize([renderText.rightLabel], Math.round(width * 0.09));

  return (
    <AbsoluteFill style={{ background: INK, fontFamily: inter.fontFamily }}>
      {/* Left half — identity photo (dark/red tint) */}
      <div style={{ position: "absolute", left: 0, top: 0, width: "52%", height: "100%", overflow: "hidden" }}>
        <img
          src={imageDataUrls[0]}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", opacity: 0.5 }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to right, rgba(60,0,0,0.8), rgba(0,0,0,0.75))",
          }}
        />
      </div>

      {/* Right half — identity photo (neutral tint) */}
      <div style={{ position: "absolute", right: 0, top: 0, width: "52%", height: "100%", overflow: "hidden" }}>
        <img
          src={imageDataUrls[0]}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", opacity: 0.55 }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to left, rgba(0,0,0,0.3), rgba(0,0,0,0.7))",
          }}
        />
      </div>

      {/* Diagonal yellow divider */}
      <div
        style={{
          position: "absolute",
          left: "46%",
          top: "-5%",
          width: "7%",
          height: "110%",
          background: YELLOW,
          transform: "rotate(5deg)",
          border: `${Math.round(width * 0.002)}px solid ${INK}`,
        }}
      />

      {/* Left label */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          top: "14%",
          width: "38%",
          fontFamily: bebasNeue.fontFamily,
          fontSize: leftFontSize,
          color: CREAM,
          lineHeight: 0.88,
          textShadow: `2px 2px 0 ${INK}`,
        }}
      >
        {renderText.leftLabel}
      </div>

      {/* Right card */}
      <div
        style={{
          position: "absolute",
          right: "4%",
          top: "12%",
          width: "40%",
          background: YELLOW,
          borderRadius: Math.round(width * 0.02),
          padding: `${Math.round(height * 0.05)}px ${Math.round(width * 0.03)}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: bebasNeue.fontFamily,
            fontSize: rightFontSize,
            color: INK,
            textAlign: "center",
            lineHeight: 0.9,
          }}
        >
          {renderText.rightLabel}
        </div>
      </div>

      {/* Face — centered, taller portrait */}
      <FaceImage
        src={imageDataUrls[0]}
        style={{
          position: "absolute",
          left: "33%",
          bottom: 0,
          width: "34%",
          aspectRatio: "0.75",
        }}
        borderRadius={`${Math.round(width * 0.007)}px ${Math.round(width * 0.007)}px 0 0`}
        border={`${Math.round(width * 0.003)}px solid ${INK}`}
        boxShadow={`0 0 0 ${Math.round(width * 0.004)}px ${YELLOW}`}
        objectPosition="center top"
      />

      {/* Checkmark */}
      <div
        style={{
          position: "absolute",
          right: "3%",
          bottom: "4%",
          fontFamily: bebasNeue.fontFamily,
          fontSize: Math.round(width * 0.14),
          color: YELLOW,
          textShadow: `3px 3px 0 ${INK}`,
          lineHeight: 1,
        }}
      >
        ✓
      </div>
    </AbsoluteFill>
  );
}
