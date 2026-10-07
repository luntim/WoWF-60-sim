import { defineConfig } from "vite";

// Relative base so the build works when served from a subpath (e.g. GitHub Pages).
export default defineConfig({
  base: "./",
  // Phaser alone is ~1.2 MB minified.
  build: { chunkSizeWarningLimit: 1500 },
});
