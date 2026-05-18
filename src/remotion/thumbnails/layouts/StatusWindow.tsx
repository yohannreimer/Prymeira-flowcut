import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { ThumbnailRenderProps } from "../types";
import { bebasNeue, inter } from "../fonts";
import { FaceImage } from "../FaceImage";
import { INK, CREAM, YELLOW, RED, fitFontSize } from "../utils";

export function StatusWindow({ renderText, imageDataUrls }: ThumbnailRenderProps) {
  const { width, height } = useVideoConfig();
  const mainFontSize = fitFontSize(renderText.headline, Math.round(width * 0.108));
  const dotSize = Math.round(width * 0.018);

  return (
    <AbsoluteFill style={{ background: INK, fontFamily: inter.fontFamily }}>
      {/* Blurred background — uses identity photo for consistent professional look */}
      <img
        src={imageDataUrls[0]}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center top",
          opacity: 0.45,
          filter: "blur(8px) brightness(0.55)",
        }}
      />

      {/* OS window panel */}
      <div
        style={{
          position: "absolute",
          left: "3%",
          top: "5%",
          width: "54%",
          height: "80%",
          background: "rgba(5,5,5,0.80)",
          border: `1px solid rgba(255,255,255,0.15)`,
          borderRadius: Math.round(width * 0.014),
          overflow: "hidden",
        }}
      >
        {/* Title bar */}
        <div
          style={{
            width: "100%",
            height: "11%",
            background: "#111",
            display: "flex",
            alignItems: "center",
            gap: Math.round(width * 0.012),
            padding: `0 ${Math.round(width * 0.02)}px`,
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: dotSize,
                height: dotSize,
                borderRadius: "50%",
                background: YELLOW,
              }}
            />
          ))}
          <span
            style={{
              fontFamily: inter.fontFamily,
              fontWeight: 800,
              fontSize: Math.round(width * 0.013),
              color: CREAM,
              marginLeft: Math.round(width * 0.01),
            }}
          >
            {renderText.badge} · {renderText.stamp}
          </span>
        </div>
      </div>

      {/* STATUS badge */}
      <div
        style={{
          position: "absolute",
          left: "7%",
          top: "18%",
          background: YELLOW,
          borderRadius: 999,
          padding: `${Math.round(height * 0.02)}px ${Math.round(width * 0.04)}px`,
          fontFamily: inter.fontFamily,
          fontWeight: 900,
          fontSize: Math.round(width * 0.015),
          color: INK,
          textTransform: "uppercase",
          letterSpacing: 1.5,
        }}
      >
        STATUS
      </div>

      {/* Main headline */}
      <div
        style={{
          position: "absolute",
          left: "6%",
          top: "32%",
          width: "45%",
          fontFamily: bebasNeue.fontFamily,
          fontSize: mainFontSize,
          color: CREAM,
          lineHeight: 0.88,
          textShadow: `2px 2px 0 ${INK}`,
        }}
      >
        {renderText.headline.slice(0, 3).join("\n")}
      </div>

      {/* Checklist — bad item */}
      <div
        style={{
          position: "absolute",
          left: "7%",
          top: "63%",
          fontFamily: inter.fontFamily,
          fontWeight: 800,
          fontSize: Math.round(width * 0.018),
          color: RED,
        }}
      >
        ✕ {renderText.checklistBad}
      </div>

      {/* Checklist — good items */}
      {renderText.checklistGood.map((item, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: "7%",
            top: `${73 + i * 10}%`,
            fontFamily: inter.fontFamily,
            fontWeight: 800,
            fontSize: Math.round(width * 0.018),
            color: CREAM,
          }}
        >
          ✓ {item}
        </div>
      ))}

      {/* Progress bar */}
      <div
        style={{
          position: "absolute",
          left: "7%",
          bottom: "13%",
          width: "42%",
          height: Math.round(height * 0.035),
          background: "#252525",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div style={{ width: "82%", height: "100%", background: YELLOW, borderRadius: 999 }} />
      </div>

      {/* Face — right side */}
      <FaceImage
        src={imageDataUrls[0]}
        style={{
          position: "absolute",
          right: "2%",
          top: "5%",
          width: "38%",
          height: "88%",
        }}
        borderRadius={`${Math.round(width * 0.012)}px`}
        border={`1px solid rgba(255,255,255,0.18)`}
        objectPosition="center top"
      />
    </AbsoluteFill>
  );
}
