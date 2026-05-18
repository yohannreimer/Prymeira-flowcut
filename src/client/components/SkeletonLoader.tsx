type SkeletonLoaderProps = {
  width?: string;
  height?: number;
  borderRadius?: number;
};

export function SkeletonLoader({ width = "100%", height = 13, borderRadius = 6 }: SkeletonLoaderProps) {
  return (
    <div style={{
      width, height, borderRadius,
      background: "var(--shell-border)",
      animation: "shell-shimmer 1.8s ease-in-out infinite"
    }} />
  );
}
