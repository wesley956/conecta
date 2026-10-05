import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const requireToken = (source, token, message) => {
  if (!source.includes(token)) throw new Error(`LG-2.9.8: ${message}: ${token}`);
};

const packageJson = JSON.parse(read("package.json"));
if (packageJson.version !== "1.1.0") throw new Error("LG-2.9.8: o novo candidate deve usar versão webOS 1.1.0.");

const androidGradle = read("../native-android/app/build.gradle.kts");
requireToken(androidGradle, "versionCode = 49", "versionCode Android divergente");
requireToken(androidGradle, 'versionName = "2.9.8"', "versionName Android divergente");

const overlay = read("src/LaunchVideoOverlay.tsx");
for (const token of ["CROSSFADE_START_SECONDS = 6.5", "EXPECTED_DURATION_SECONDS = 8.057", "roneca_launch_video.mp4", "stopImmediatePropagation", 'removeAttribute("src")']) {
  requireToken(overlay, token, "contrato de vídeo/crossfade incompleto");
}

const snapshot = read("src/catalogSnapshot.ts");
for (const token of ["indexedDB", "AES-GCM", "false, [\"encrypt\", \"decrypt\"]", "MAX_AGE_MILLIS", "MAX_JSON_BYTES", "clearCatalogSnapshots"]) {
  requireToken(snapshot, token, "contrato de snapshot seguro incompleto");
}

const catalog = read("src/catalog.ts");
for (const token of ["restoreCatalogSnapshot", "saveCatalogSnapshot", "Verificando atualizações em segundo plano"]) {
  requireToken(catalog, token, "startup cache não integrado");
}

const matrix = read("docs/LG-10-PARITY-MATRIX.md");
for (const token of ["versionCode 49", "v2.9.8", "48de0c8", "Vídeo/crossfade", "Snapshot/cache de startup"]) {
  requireToken(matrix, token, "matriz 2.9.8 incompleta");
}

console.log("LG-2.9.8: baseline, vídeo/crossfade e snapshot seguro validados.");
