import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: ["chrome53", "safari11"],
    outDir: "dist",
    assetsInlineLimit: 0,
    sourcemap: false
  }
});
