import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  clean: true,
  sourcemap: true,
  dts: true,
  target: "es2022"
});
