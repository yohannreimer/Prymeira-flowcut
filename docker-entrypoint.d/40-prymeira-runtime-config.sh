#!/bin/sh
set -eu

cat > /usr/share/nginx/html/config.js <<EOF
window.__PRYMEIRA_CONFIG__ = {
  VITE_CLERK_PUBLISHABLE_KEY: "${VITE_CLERK_PUBLISHABLE_KEY:-${CLERK_PUBLISHABLE_KEY:-}}",
  CLERK_PUBLISHABLE_KEY: "${CLERK_PUBLISHABLE_KEY:-}",
  VITE_PRYMEIRA_HUB_URL: "${VITE_PRYMEIRA_HUB_URL:-https://hub.prymeiradigital.com.br}"
};
EOF
