import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import path from "path";
import { tskbDevChunks } from "./plugins/tskb-dev-chunks.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
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
