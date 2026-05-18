import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { ThumbnailRenderProps } from "../types";
import { inter, playfairDisplay } from "../fonts";
import { FaceImage } from "../FaceImage";
import { INK, YELLOW, fitFontSize } from "../utils";

const PARCHMENT = "#f0e3c8";

export function Editorial({ renderText, imageDataUrls }: ThumbnailRenderProps) {
  const { width, height } = useVideoConfig();
  const [line1, line2] = renderText.headline;
  const headlineFontSize = fitFontSize(renderText.headline, Math.round(width * 0.095));

  return (
    <AbsoluteFill style={{ background: PARCHMENT, fontFamily: inter.fontFamily }}>
      {/* Dot texture overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.18) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />

      {/* Masthead */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          top: "5%",
          fontFamily: playfairDisplay.fontFamily,
          fontWeight: 900,
          fontSize: Math.round(width * 0.022),
          color: INK,
          letterSpacing: 3,
          textTransform: "uppercase",
        }}
      >
        {renderText.badge}
      </div>

      {/* Date */}
      <div
        style={{
          position: "absolute",
          right: "4%",
          top: "5%",
          fontFamily: inter.fontFamily,
          fontWeight: 700,
          fontSize: Math.round(width * 0.012),
          color: "#444",
        }}
      >
        {renderText.stamp}
      </div>

      {/* Horizontal rule */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          right: "4%",
          top: "16%",
          height: 3,
          background: INK,
        }}
      />

      {/* Headline line 1 */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          top: "20%",
          width: "56%",
          fontFamily: playfairDisplay.fontFamily,
          fontWeight: 900,
          fontSize: headlineFontSize,
          color: INK,
          lineHeight: 0.95,
          letterSpacing: -1,
        }}
      >
        {line1}
      </div>

      {/* Headline line 2 on yellow bar */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          top: "40%",
          width: "56%",
        }}
      >
        <div style={{ background: YELLOW, display: "inline", padding: "0 4px" }}>
          <span
            style={{
              fontFamily: playfairDisplay.fontFamily,
              fontWeight: 900,
              fontSize: headlineFontSize,
              color: INK,
              lineHeight: 0.95,
              letterSpacing: -1,
            }}
          >
            {line2 ?? renderText.subhead.slice(0, 20).toUpperCase()}
          </span>
        </div>
      </div>

      {/* Dek / subhead */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          top: "58%",
          width: "52%",
          fontFamily: inter.fontFamily,
          fontWeight: 700,
          fontSize: Math.round(width * 0.016),
          color: "#222",
          lineHeight: 1.4,
        }}
      >
        {renderText.subhead}
      </div>

      {/* Tags */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          bottom: "8%",
          display: "flex",
          gap: "5%",
          fontFamily: inter.fontFamily,
          fontWeight: 900,
          fontSize: Math.round(width * 0.012),
          color: INK,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {renderText.tags.map((tag, i) => (
          <span key={i}>{tag}</span>
        ))}
      </div>

      {/* Face — right side */}
      <FaceImage
        src={imageDataUrls[0]}
        style={{
          position: "absolute",
          right: "3%",
          top: "14%",
          width: "34%",
          height: "68%",
        }}
        borderRadius="0"
        border={`${Math.round(width * 0.003)}px solid ${INK}`}
        boxShadow={`${Math.round(width * 0.007)}px ${Math.round(width * 0.007)}px 0 ${YELLOW}`}
        objectPosition="center top"
      />

      {/* Caption */}
      <div
        style={{
          position: "absolute",
          right: "3%",
          bottom: "14%",
          width: "34%",
          background: INK,
          padding: `${Math.round(height * 0.022)}px ${Math.round(width * 0.02)}px`,
          textAlign: "center",
          fontFamily: inter.fontFamily,
          fontWeight: 900,
          fontSize: Math.round(width * 0.012),
          color: YELLOW,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {renderText.stamp}
      </div>
    </AbsoluteFill>
  );
}
