export function clampSeconds(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error("Seconds must be finite");
  }

  return Math.max(0, Number(value.toFixed(3)));
}

export function secondsToTimecode(totalSeconds: number) {
  const clamped = clampSeconds(totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}
