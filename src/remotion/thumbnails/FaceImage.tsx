import React from "react";

type FaceImageProps = {
  src: string;
  style?: React.CSSProperties;
  borderRadius?: string | number;
  objectPosition?: string;
  border?: string;
  boxShadow?: string;
};

export function FaceImage({
  src,
  style,
  borderRadius = "8%",
  objectPosition = "center top",
  border,
  boxShadow,
}: FaceImageProps) {
  return (
    <div
      style={{
        borderRadius,
        overflow: "hidden",
        border,
        boxShadow,
        flexShrink: 0,
        ...style,
      }}
    >
      <img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition,
          display: "block",
        }}
      />
    </div>
  );
}
