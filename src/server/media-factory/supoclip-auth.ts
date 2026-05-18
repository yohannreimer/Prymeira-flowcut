import { createHmac } from "node:crypto";

export function createSupoClipAuthHeaders(input: {
  userId: string;
  secret?: string;
  timestamp?: number;
}): Record<string, string> {
  if (!input.secret) return { "x-supoclip-user-id": input.userId };

  const timestamp = String(input.timestamp ?? Math.floor(Date.now() / 1000));
  const payload = `${input.userId}:${timestamp}`;

  return {
    "x-supoclip-user-id": input.userId,
    "x-supoclip-ts": timestamp,
    "x-supoclip-signature": createHmac("sha256", input.secret).update(payload).digest("hex")
  };
}
