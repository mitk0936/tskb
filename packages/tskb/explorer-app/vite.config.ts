import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import path from "path";
import { tskbDevChunks } from "./plugins/tskb-dev-chunks.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  // Fixed dev-server port so consumers (e.g. the omkit dev pipeline's healthcheck)
  // can probe a known URL. strictPort makes Vite fail rather than silently hop to
  // the next free port, keeping that URL deterministic.
  server: {
    port: 9876,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(__dirname, "../dist/explorer"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["d3"],
          highlight: ["highlight.js"],
        },
      },
    },
  },
  plugins: [tskbDevChunks()],
});
