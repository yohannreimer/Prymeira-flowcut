import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = process.env.AI_EDITOR_API_PROXY ?? "http://localhost:4317";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": apiTarget,
      "/media": apiTarget
    }
  }
});
