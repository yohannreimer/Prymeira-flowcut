import type express from "express";

const DEFAULT_PUBLIC_APP_URL = "https://flowcut.prymeiradigital.com.br";
const DEFAULT_DEVELOPMENT_ORIGINS = [
  DEFAULT_PUBLIC_APP_URL,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5177",
  "http://127.0.0.1:5177",
  "http://localhost:5180",
  "http://127.0.0.1:5180",
  "http://localhost:5182",
  "http://127.0.0.1:5182"
];

export type RateLimitOptions = {
  windowMs: number;
  max: number;
};

export function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

export function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getAllowedOrigins(env: Pick<NodeJS.ProcessEnv, string> = process.env): string[] {
  const configured = parseCsv(env.FLOWCUT_ALLOWED_ORIGINS).map(normalizeOrigin);
  if (configured.length) return Array.from(new Set(configured));

  if (env.NODE_ENV === "production") {
    return [normalizeOrigin(env.FLOWCUT_PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL)];
  }

  return DEFAULT_DEVELOPMENT_ORIGINS;
}

export function isAllowedOrigin(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return true;
  return allowedOrigins.includes(normalizeOrigin(origin));
}

export function buildCorsHeaders(origin: string | undefined, allowedOrigins: string[]) {
  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-max-age": "600",
    vary: "Origin"
  };

  if (origin && isAllowedOrigin(origin, allowedOrigins)) {
    headers["access-control-allow-origin"] = normalizeOrigin(origin);
  }

  return headers;
}

export function setSecurityHeaders(_req: express.Request, res: express.Response, next: express.NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  next();
}

export function createOriginGuard(allowedOrigins: string[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const origin = req.get("origin");
    const headers = buildCorsHeaders(origin, allowedOrigins);
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }

    if (origin && !isAllowedOrigin(origin, allowedOrigins)) {
      res.status(403).json({
        error: {
          code: "origin_not_allowed",
          message: "Request origin is not allowed."
        }
      });
      return;
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
  const buckets = new Map<string, { resetAt: number; count: number }>();

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.method === "OPTIONS") {
      next();
      return;
    }

    const now = Date.now();
    const key = `${req.ip}:${req.method}:${req.path}`;
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now
      ? { resetAt: now + options.windowMs, count: 0 }
      : current;

    bucket.count += 1;
    buckets.set(key, bucket);
    res.setHeader("RateLimit-Limit", String(options.max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, options.max - bucket.count)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > options.max) {
      res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many requests. Try again later."
        }
      });
      return;
    }

    next();
  };
}

export function sanitizeInternalErrorMessage(error: unknown, nodeEnv = process.env.NODE_ENV): string {
  if (nodeEnv === "production") {
    return "Internal server error";
  }

  return error instanceof Error ? error.message : "Unknown error";
}
