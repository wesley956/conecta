import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

function androidLaunchVideo() {
  return {
    name: "roneca-android-launch-video",
    closeBundle() {
      const source = path.resolve(
        process.cwd(),
        "../native-android/app/src/main/res/raw/roneca_launch_video.mp4"
      );
      const target = path.resolve(process.cwd(), "dist/roneca_launch_video.mp4");
      if (!fs.existsSync(source)) {
        throw new Error(`Vídeo oficial Android 2.9.8 não encontrado: ${source}`);
      }
      fs.copyFileSync(source, target);
    }
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), androidLaunchVideo()],
  build: {
    target: ["chrome53", "safari11"],
    outDir: "dist",
    assetsInlineLimit: 0,
    sourcemap: false
  }
});
