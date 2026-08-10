import fs from "node:fs";
import path from "node:path";

const platform = process.argv[2];
if (!["webos", "tizen"].includes(platform)) {
  throw new Error("Use: node scripts/stage-platform.mjs webos|tizen");
}

const root = process.cwd();
const dist = path.join(root, "dist");
const platformRoot = path.join(root, "platforms", platform);
const output = path.join(root, "build", platform);
const androidDrawableRoot = path.resolve(
  root,
  "..",
  "native-android",
  "app",
  "src",
  "main",
  "res",
  "drawable-nodpi"
);
const officialAppIcon = path.join(androidDrawableRoot, "ic_app.png");

if (!fs.existsSync(path.join(dist, "index.html"))) {
  throw new Error("Execute npm run build antes de preparar o pacote.");
}

if (!fs.existsSync(officialAppIcon)) {
  throw new Error(`LG-02: ícone oficial Android não encontrado em ${officialAppIcon}.`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(String(packageJson.version || ""))) {
  throw new Error(`Versão inválida em package.json: ${packageJson.version || "<vazia>"}. Use MAJOR.MINOR.PATCH.`);
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(dist, output, { recursive: true });

if (platform === "webos") {
  const indexPath = path.join(output, "index.html");
  let html = fs.readFileSync(indexPath, "utf8");
  html = html
    .replace(/\s*<script[^>]*src=["']\$WEBAPIS\/webapis\/webapis\.js["'][^>]*><\/script>/gi, "")
    .replace(/\s*<object[^>]*type=["']application\/avplayer["'][^>]*><\/object>/gi, "");
  fs.writeFileSync(indexPath, html);
}

const manifest = platform === "webos" ? "appinfo.json" : "config.xml";
const manifestSource = path.join(platformRoot, manifest);
const manifestTarget = path.join(output, manifest);

if (platform === "webos") {
  const appInfo = JSON.parse(fs.readFileSync(manifestSource, "utf8"));
  appInfo.version = packageJson.version;

  const requiredStringFields = ["id", "version", "vendor", "type", "main", "title", "icon", "largeIcon"];
  for (const field of requiredStringFields) {
    if (typeof appInfo[field] !== "string" || !appInfo[field].trim()) {
      throw new Error(`appinfo.json inválido: campo obrigatório ${field} ausente ou vazio.`);
    }
  }
  if (appInfo.id !== "com.ronecaplaytv.app") {
    throw new Error(`App ID webOS inesperado: ${appInfo.id}. Esperado com.ronecaplaytv.app.`);
  }
  if (appInfo.type !== "web") {
    throw new Error(`Tipo webOS inválido: ${appInfo.type}. Esperado web.`);
  }
  if (appInfo.version !== packageJson.version) {
    throw new Error(`Versão webOS divergente: ${appInfo.version} != package.json ${packageJson.version}.`);
  }

  fs.writeFileSync(manifestTarget, `${JSON.stringify(appInfo, null, 2)}\n`);
} else {
  fs.copyFileSync(manifestSource, manifestTarget);
}

/*
 * LG-P02 freezes the Android 2.9.5 brand source as the canonical Smart TV
 * launcher source. The package never regenerates or falls back to the old
 * letter-R bitmap. Both webOS icon slots receive the same safe-area master;
 * Tizen shares the official icon as well so the shared codebase cannot drift.
 */
fs.copyFileSync(officialAppIcon, path.join(output, "icon.png"));
if (platform === "webos") {
  fs.copyFileSync(officialAppIcon, path.join(output, "largeIcon.png"));
}

if (!fs.existsSync(path.join(output, "icon.png"))) {
  throw new Error("O ícone obrigatório da plataforma não foi encontrado.");
}

if (platform === "webos") {
  const appInfo = JSON.parse(fs.readFileSync(manifestTarget, "utf8"));
  for (const referencedFile of [appInfo.main, appInfo.icon, appInfo.largeIcon]) {
    const target = path.resolve(output, referencedFile);
    if (!target.startsWith(`${path.resolve(output)}${path.sep}`) || !fs.existsSync(target)) {
      throw new Error(`appinfo.json referencia arquivo ausente ou inválido: ${referencedFile}`);
    }
  }

  for (const brandAsset of [
    "brand/ronecaplaytv-symbol.svg",
    "brand/ronecaplaytv-wordmark.svg",
    "brand/ronecaplaytv-lockup-horizontal.svg",
    "brand/ronecaplaytv-app-icon.svg"
  ]) {
    if (!fs.existsSync(path.join(output, brandAsset))) {
      throw new Error(`LG-02: asset oficial ausente no pacote webOS: ${brandAsset}`);
    }
  }
}

console.log(`Pacote ${platform} preparado em ${path.relative(root, output)}.`);
