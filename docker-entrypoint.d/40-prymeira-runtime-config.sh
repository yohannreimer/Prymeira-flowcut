#!/bin/sh
set -eu

CONFIG_PATH="${FLOWCUT_RUNTIME_CONFIG_PATH:-/usr/share/nginx/html/config.js}"
CLERK_KEY="${VITE_CLERK_PUBLISHABLE_KEY:-${CLERK_PUBLISHABLE_KEY:-}}"

jq -n \
  --arg viteClerkPublishableKey "$CLERK_KEY" \
  --arg clerkPublishableKey "${CLERK_PUBLISHABLE_KEY:-}" \
  --arg prymeiraHubUrl "${VITE_PRYMEIRA_HUB_URL:-https://hub.prymeiradigital.com.br}" \
  '{
    VITE_CLERK_PUBLISHABLE_KEY: $viteClerkPublishableKey,
    CLERK_PUBLISHABLE_KEY: $clerkPublishableKey,
    VITE_PRYMEIRA_HUB_URL: $prymeiraHubUrl
  }' | sed '1s/^/window.__PRYMEIRA_CONFIG__ = /;$s/$/;/' > "$CONFIG_PATH"
