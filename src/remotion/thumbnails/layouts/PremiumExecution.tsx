import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { ThumbnailRenderProps } from "../types";
import { bebasNeue, inter } from "../fonts";
import { FaceImage } from "../FaceImage";
import { INK, CREAM, PAPER, YELLOW, fitFontSize } from "../utils";

export function PremiumExecution({ renderText, imageDataUrls }: ThumbnailRenderProps) {
  const { width, height } = useVideoConfig();
  const lines = renderText.headline.slice(0, 3);
  const headlineFontSize = fitFontSize(lines, Math.round(width * 0.115));

  return (
    <AbsoluteFill style={{ background: PAPER, fontFamily: inter.fontFamily }}>
      {/* Dark diagonal left panel */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "50%",
          background: INK,
          clipPath: "polygon(0 0, 100% 0, 87% 100%, 0 100%)",
        }}
      />

      {/* Headline — 3 lines */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          top: "8%",
          width: "44%",
          fontFamily: bebasNeue.fontFamily,
          lineHeight: 0.88,
        }}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              fontSize: headlineFontSize,
              color: i === 1 ? YELLOW : CREAM,
              display: "block",
            }}
          >
            {line}
          </div>
        ))}
      </div>

      {/* Subhead */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          top: "63%",
          width: "42%",
          fontFamily: inter.fontFamily,
          fontWeight: 900,
          fontSize: Math.round(width * 0.018),
          color: CREAM,
          lineHeight: 1.25,
        }}
      >
        {renderText.subhead}
      </div>

      {/* Badge pill */}
      <div
        style={{
          position: "absolute",
          right: "3%",
          top: "6%",
          background: INK,
          borderRadius: 999,
          padding: `${Math.round(height * 0.025)}px ${Math.round(width * 0.04)}px`,
          fontFamily: inter.fontFamily,
          fontWeight: 900,
          fontSize: Math.round(width * 0.013),
          color: YELLOW,
          textTransform: "uppercase",
        }}
      >
        {renderText.badge}
      </div>

      {/* Decorative bars */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          bottom: "18%",
          width: "28%",
          height: Math.round(height * 0.028),
          background: YELLOW,
          borderRadius: 999,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "4%",
          bottom: "10%",
          width: "17%",
          height: Math.round(height * 0.016),
          background: CREAM,
          borderRadius: 999,
        }}
      />

      {/* Face — large portrait filling the right half */}
      <FaceImage
        src={imageDataUrls[0]}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: "52%",
          height: "100%",
        }}
        borderRadius="0"
        objectPosition="center top"
      />

      {/* Subtle left-edge gradient so text stays readable over the photo */}
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: "52%",
          height: "100%",
          background: "linear-gradient(to right, rgba(5,5,5,0.55) 0%, transparent 40%)",
          pointerEvents: "none",
        }}
      />

      {/* Stamp — repositioned to bottom-left */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          bottom: "6%",
          background: YELLOW,
          borderRadius: Math.round(width * 0.006),
          padding: `${Math.round(height * 0.018)}px ${Math.round(width * 0.025)}px`,
          fontFamily: inter.fontFamily,
          fontWeight: 900,
          fontSize: Math.round(width * 0.012),
          color: INK,
          textTransform: "uppercase",
        }}
      >
        {renderText.stamp}
      </div>
    </AbsoluteFill>
  );
}
