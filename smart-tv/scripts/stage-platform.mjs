import fs from "node:fs";
import path from "node:path";
import { resizePngFile } from "./png-brand-derivatives.mjs";

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
const sellerLoungeIcon = path.join(root, "artifacts", "lg-seller-lounge-icon-400.png");

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

function classicizeWebOsEntry(html) {
  let converted = html.replace(/<script\b([^>]*)>/gi, (tag, attributes) => {
    if (!/\btype=["']module["']/i.test(attributes)) return tag;
    const cleaned = attributes
      .replace(/\s*type=["']module["']/i, "")
      .replace(/\s*crossorigin(?:=["'][^"']*["'])?/i, "")
      .replace(/\s*defer(?:=["'][^"']*["'])?/i, "");
    return `<script defer${cleaned}>`;
  });
  converted = converted.replace(/\s*<link\b[^>]*\brel=["']modulepreload["'][^>]*>/gi, "");
  return converted;
}

function validateClassicWebOsBundle() {
  const indexPath = path.join(output, "index.html");
  const html = fs.readFileSync(indexPath, "utf8");
  if (/\btype=["']module["']/i.test(html) || /\brel=["']modulepreload["']/i.test(html)) {
    throw new Error("LG-09: o pacote webOS ainda depende de ES Modules, incompatível com Chromium 53.");
  }

  const assets = path.join(output, "assets");
  const javascriptFiles = fs.existsSync(assets)
    ? fs.readdirSync(assets).filter(name => name.endsWith(".js"))
    : [];
  if (!javascriptFiles.length) throw new Error("LG-09: bundle JavaScript webOS não encontrado.");

  for (const fileName of javascriptFiles) {
    const source = fs.readFileSync(path.join(assets, fileName), "utf8");
    if (/\bimport\.meta\b/.test(source) || /\bimport\s*\(/.test(source)) {
      throw new Error(`LG-09: ${fileName} ainda contém import dinâmico/import.meta incompatível com a entrada clássica.`);
    }
    if (/(^|[;{}\n])\s*(?:import|export)\s+[A-Za-z*{]/m.test(source)) {
      throw new Error(`LG-09: ${fileName} ainda contém sintaxe ESM no bundle webOS.`);
    }
  }
}

if (platform === "webos") {
  const indexPath = path.join(output, "index.html");
  let html = fs.readFileSync(indexPath, "utf8");
  html = html
    .replace(/\s*<script[^>]*src=["']\$WEBAPIS\/webapis\/webapis\.js["'][^>]*><\/script>/gi, "")
    .replace(/\s*<object[^>]*type=["']application\/avplayer["'][^>]*><\/object>/gi, "");
  html = classicizeWebOsEntry(html);
  fs.writeFileSync(indexPath, html);
  validateClassicWebOsBundle();
}

const manifest = platform === "webos" ? "appinfo.json" : "config.xml";
const manifestSource = path.join(platformRoot, manifest);
const manifestTarget = path.join(output, manifest);

if (platform === "webos") {
  const appInfo = JSON.parse(fs.readFileSync(manifestSource, "utf8"));
  appInfo.version = packageJson.version;

  const requiredStringFields = ["id", "version", "vendor", "type", "main", "title", "icon", "largeIcon", "resolution"];
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
  if (appInfo.resolution !== "1920x1080") {
    throw new Error(`Resolução webOS inválida: ${appInfo.resolution}. Esperado 1920x1080 para o pacote Seller Lounge.`);
  }

  fs.writeFileSync(manifestTarget, `${JSON.stringify(appInfo, null, 2)}\n`);
} else {
  fs.copyFileSync(manifestSource, manifestTarget);
}

/*
 * A fonte visual continua sendo o sistema oficial Android/brand. O PNG Android
 * é um derivado versionado desses SVGs e serve de raster mestre para os tamanhos
 * exigidos pela LG: 80x80 (icon), 130x130 (largeIcon) e 400x400 (Seller Lounge).
 * Assim evitamos editar manualmente três bitmaps independentes.
 */
if (platform === "webos") {
  resizePngFile(officialAppIcon, path.join(output, "icon.png"), 80, 80);
  resizePngFile(officialAppIcon, path.join(output, "largeIcon.png"), 130, 130);
  resizePngFile(officialAppIcon, sellerLoungeIcon, 400, 400);
} else {
  fs.copyFileSync(officialAppIcon, path.join(output, "icon.png"));
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
