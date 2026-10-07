import { defineConfig } from "vite";

// Relative base so the build works when served from a subpath (e.g. GitHub Pages).
export default defineConfig({
  base: "./",
  // Phaser (~1.2 MB) + three.js (~0.6 MB) minified; ~480 KB gzipped together.
  build: { chunkSizeWarningLimit: 2000 },
});
