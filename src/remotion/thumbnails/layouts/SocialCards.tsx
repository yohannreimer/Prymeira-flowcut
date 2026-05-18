import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { ThumbnailRenderProps } from "../types";
import { bebasNeue, inter } from "../fonts";
import { FaceImage } from "../FaceImage";
import { INK, CREAM, YELLOW, fitFontSize } from "../utils";

export function SocialCards({ renderText, imageDataUrls }: ThumbnailRenderProps) {
  const { width, height } = useVideoConfig();
  const lines = renderText.headline.slice(0, 3);
  const titleFontSize = fitFontSize(lines, Math.round(width * 0.1));

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #090806 0%, #191207 56%, #050505 100%)",
        fontFamily: inter.fontFamily,
      }}
    >
      {/* Yellow glow background */}
      <div
        style={{
          position: "absolute",
          right: "18%",
          top: "-20%",
          width: "50%",
          aspectRatio: "1",
          background: YELLOW,
          borderRadius: "50%",
          opacity: 0.07,
          filter: "blur(80px)",
        }}
      />

      {/* Badge */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          top: "7%",
          background: YELLOW,
          borderRadius: 999,
          padding: `${Math.round(height * 0.02)}px ${Math.round(width * 0.04)}px`,
          fontFamily: inter.fontFamily,
          fontWeight: 900,
          fontSize: Math.round(width * 0.014),
          color: INK,
          textTransform: "uppercase",
        }}
      >
        {renderText.badge}
      </div>

      {/* Title — 3 lines */}
      <div style={{ position: "absolute", left: "4%", top: "18%" }}>
        {lines.map((line, i) => {
          if (i === 1) {
            return (
              <div
                key={i}
                style={{
                  display: "inline-block",
                  background: YELLOW,
                  padding: `0 ${Math.round(width * 0.015)}px`,
                  margin: `${Math.round(height * 0.015)}px 0`,
                }}
              >
                <span
                  style={{
                    fontFamily: bebasNeue.fontFamily,
                    fontSize: titleFontSize,
                    color: INK,
                    lineHeight: 0.9,
                    display: "block",
                  }}
                >
                  {line}
                </span>
              </div>
            );
          }
          return (
            <div
              key={i}
              style={{
                fontFamily: bebasNeue.fontFamily,
                fontSize: titleFontSize,
                color: CREAM,
                lineHeight: 0.9,
                textShadow: `1px 1px 0 ${INK}`,
              }}
            >
              {line}
            </div>
          );
        })}
      </div>

      {/* Subhead */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          top: "68%",
          fontFamily: inter.fontFamily,
          fontWeight: 900,
          fontSize: Math.round(width * 0.018),
          color: YELLOW,
          letterSpacing: -0.5,
        }}
      >
        {renderText.subhead}
      </div>

      {/* Back phone card (ghost) */}
      <div
        style={{
          position: "absolute",
          right: "20%",
          top: "5%",
          width: "22%",
          aspectRatio: "0.55",
          background: "#d8d0be",
          border: `2px solid ${INK}`,
          borderRadius: "8%",
          transform: "rotate(-7deg)",
          opacity: 0.75,
        }}
      />

      {/* Front phone card with face */}
      <div
        style={{
          position: "absolute",
          right: "4%",
          top: "2%",
          width: "22%",
          aspectRatio: "0.55",
          background: "#fff",
          border: `2px solid ${INK}`,
          borderRadius: "8%",
          transform: "rotate(5deg)",
          overflow: "hidden",
        }}
      >
        <FaceImage
          src={imageDataUrls[0]}
          style={{
            position: "absolute",
            left: "8%",
            top: "10%",
            width: "84%",
            height: "70%",
            borderRadius: "5%",
          }}
          objectPosition="center top"
        />
      </div>

      {/* Arrow */}
      <svg
        style={{ position: "absolute", left: "40%", top: "72%", width: "32%", height: "15%" }}
        viewBox="0 0 200 60"
        fill="none"
      >
        <path
          d="M10 50 C60 20 120 30 180 10"
          stroke={YELLOW}
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M155 2 L182 10 L168 32"
          stroke={YELLOW}
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </AbsoluteFill>
  );
}
