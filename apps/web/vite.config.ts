import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The engine is consumed from source (no build step for local play), and the
// shared rules come straight from the repo's content/ folder.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@emporion/engine": fileURLToPath(new URL("../../packages/engine/src/index.ts", import.meta.url)),
    },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1500,
  },
});
