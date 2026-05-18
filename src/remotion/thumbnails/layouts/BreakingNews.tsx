import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { ThumbnailRenderProps } from "../types";
import { bebasNeue, inter } from "../fonts";
import { FaceImage } from "../FaceImage";
import { INK, CREAM, YELLOW, RED, fitFontSize } from "../utils";

export function BreakingNews({ renderText, imageDataUrls, channelName }: ThumbnailRenderProps) {
  const { width, height } = useVideoConfig();
  const [line1, line2] = renderText.headline;
  const headlineFontSize = fitFontSize(renderText.headline, Math.round(width * 0.1));

  return (
    <AbsoluteFill style={{ background: INK, fontFamily: inter.fontFamily }}>
      {/* Background — uses identity photo for consistent professional look */}
      <img
        src={imageDataUrls[0]}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center top",
          opacity: 0.4,
          filter: "brightness(0.55)",
        }}
      />

      {/* Dark gradient overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to right, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0.2) 100%)",
        }}
      />

      {/* Face — right side */}
      <FaceImage
        src={imageDataUrls[0]}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: "42%",
          height: `${Math.round(height * 0.72)}px`,
        }}
        borderRadius="0"
        objectPosition="center top"
      />

      {/* Headline */}
      <div style={{ position: "absolute", left: "4%", top: "10%", width: "52%" }}>
        <div
          style={{
            fontFamily: bebasNeue.fontFamily,
            fontSize: headlineFontSize,
            color: CREAM,
            lineHeight: 0.9,
          }}
        >
          {line1}
        </div>
        {line2 ? (
          <div
            style={{
              fontFamily: bebasNeue.fontFamily,
              fontSize: headlineFontSize,
              color: YELLOW,
              lineHeight: 0.9,
              marginTop: Math.round(height * 0.01),
            }}
          >
            {line2}
          </div>
        ) : null}
      </div>

      {/* Yellow separator stripe */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "28%",
          height: Math.round(height * 0.014),
          background: YELLOW,
        }}
      />

      {/* Lower third */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "28%",
          background: "rgba(5,5,5,0.92)",
          display: "flex",
          alignItems: "center",
          padding: `0 ${Math.round(width * 0.04)}px`,
          gap: Math.round(width * 0.04),
        }}
      >
        <div>
          <div
            style={{
              fontFamily: bebasNeue.fontFamily,
              fontSize: Math.round(width * 0.038),
              color: CREAM,
              lineHeight: 1,
            }}
          >
            {channelName ?? renderText.stamp}
          </div>
          <div
            style={{
              fontFamily: inter.fontFamily,
              fontWeight: 700,
              fontSize: Math.round(width * 0.014),
              color: YELLOW,
              textTransform: "uppercase",
              letterSpacing: 1,
              marginTop: Math.round(height * 0.008),
            }}
          >
            {renderText.subhead.slice(0, 40)}
          </div>
        </div>

        {/* AO VIVO badge */}
        <div style={{ marginLeft: "auto" }}>
          <div
            style={{
              background: RED,
              color: "#fff",
              fontFamily: inter.fontFamily,
              fontWeight: 900,
              fontSize: Math.round(width * 0.014),
              padding: `${Math.round(height * 0.015)}px ${Math.round(width * 0.025)}px`,
              borderRadius: Math.round(width * 0.004),
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            ● AO VIVO
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
