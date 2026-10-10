import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pngDimensions, pngOpacityReport } from "./png-brand-derivatives.mjs";

const root = process.cwd();
const output = path.join(root, "build", "webos");
const publicBrand = path.join(root, "public", "brand");
const androidBrand = path.resolve(root, "..", "native-android", "brand");
const androidDrawable = path.resolve(root, "..", "native-android", "app", "src", "main", "res", "drawable-nodpi");
const artifacts = path.join(root, "artifacts");

function sha(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function normalizedSvg(file) {
  return fs.readFileSync(file, "utf8")
    .replace(/\r\n/g, "\n")
    .trim()
    .replace(/>\s+</g, "><");
}

function requireFile(file, label = file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) {
    throw new Error(`LG-02: arquivo obrigatório ausente ou vazio: ${label}`);
  }
}

function requireDimensions(file, width, height, label) {
  const actual = pngDimensions(file);
  if (actual.width !== width || actual.height !== height) {
    throw new Error(`LG-02: ${label} precisa ser ${width}x${height}, encontrado ${actual.width}x${actual.height}.`);
  }
}

if (!fs.existsSync(output)) {
  throw new Error("LG-02: execute npm run stage:webos ou package:webos antes da validação de marca.");
}

const vectorMasters = [
  "ronecaplaytv-symbol.svg",
  "ronecaplaytv-wordmark.svg",
  "ronecaplaytv-lockup-horizontal.svg",
  "ronecaplaytv-app-icon.svg"
];

for (const asset of vectorMasters) {
  const source = path.join(androidBrand, asset);
  const smartTv = path.join(publicBrand, asset);
  const packaged = path.join(output, "brand", asset);
  requireFile(source, `Android master ${asset}`);
  requireFile(smartTv, `Smart TV master ${asset}`);
  requireFile(packaged, `webOS packaged ${asset}`);

  if (normalizedSvg(source) !== normalizedSvg(smartTv)) {
    throw new Error(`LG-02: ${asset} divergiu semanticamente da fonte vetorial oficial.`);
  }
  if (sha(smartTv) !== sha(packaged)) {
    throw new Error(`LG-02: ${asset} foi alterado durante o build webOS.`);
  }
}

const officialPng = path.join(androidDrawable, "ic_app.png");
const webosIconSource = path.join(root, "platforms", "webos", "app-icon-source.png");
const icon = path.join(output, "icon.png");
const largeIcon = path.join(output, "largeIcon.png");
const sellerLoungeIcon = path.join(artifacts, "lg-seller-lounge-icon-400.png");
requireFile(officialPng, "Android ic_app.png");
requireFile(webosIconSource, "master do ícone webOS (platforms/webos/app-icon-source.png)");
requireFile(icon, "webOS icon.png");
requireFile(largeIcon, "webOS largeIcon.png");
requireFile(sellerLoungeIcon, "Seller Lounge icon 400x400");

requireDimensions(officialPng, 1024, 1024, "raster mestre Android");
requireDimensions(webosIconSource, 1024, 1024, "master do ícone webOS");
requireDimensions(icon, 80, 80, "icon.png interno");
requireDimensions(largeIcon, 130, 130, "largeIcon.png interno");
requireDimensions(sellerLoungeIcon, 400, 400, "ícone separado do Seller Lounge");

const appInfo = JSON.parse(fs.readFileSync(path.join(output, "appinfo.json"), "utf8"));
if (appInfo.resolution !== "1920x1080") {
  throw new Error(`LG-02: appinfo.json precisa declarar 1920x1080; encontrado ${appInfo.resolution || "<ausente>"}.`);
}

// LG rejeitou o IPK (QA2026091823049/50/51): ícone precisa ser 100% opaco, quadrado
// (sem cantos arredondados/transparentes) e com fundo em cor sólida igual à
// backgroundColor declarada no appinfo.json ("tile color"). Validamos aqui para que
// uma regressão (voltar a usar o raster adaptativo do Android, por exemplo) quebre o
// build antes de chegar à Seller Lounge de novo.
function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16)
  ];
}
const expectedBg = hexToRgb(appInfo.backgroundColor || "#080809");
for (const [label, file] of [
  ["master do ícone webOS", webosIconSource],
  ["icon.png", icon],
  ["largeIcon.png", largeIcon],
  ["Seller Lounge icon 400x400", sellerLoungeIcon]
]) {
  const report = pngOpacityReport(file);
  if (report.minAlpha !== 255) {
    throw new Error(`LG-02: ${label} tem pixels transparentes (alpha mín. ${report.minAlpha}). A LG exige 0% de transparência.`);
  }
  for (const [corner, [r, g, b]] of Object.entries(report.corners)) {
    if (r !== expectedBg[0] || g !== expectedBg[1] || b !== expectedBg[2]) {
      throw new Error(
        `LG-02: ${label} tem o canto ${corner} com cor rgb(${r},${g},${b}), diferente da backgroundColor do appinfo.json (${appInfo.backgroundColor}). ` +
        "A LG exige fundo em cor sólida única igual à tile color."
      );
    }
  }
}

const assetsDir = path.join(output, "assets");
requireFile(path.join(output, "index.html"), "webOS index.html");
if (!fs.existsSync(assetsDir)) throw new Error("LG-02: diretório de assets do bundle não existe.");

const css = fs.readdirSync(assetsDir)
  .filter(name => name.endsWith(".css"))
  .map(name => fs.readFileSync(path.join(assetsDir, name), "utf8"))
  .join("\n")
  .toLowerCase();

for (const token of ["#080809", "#131315", "#2b2b30", "#e3262e", "#ff454c", "#9c9ca5"]) {
  if (!css.includes(token)) {
    throw new Error(`LG-02: token oficial ${token} não chegou ao CSS final.`);
  }
}

if (!css.includes("ronecaplaytv-symbol.svg") || !css.includes("ronecaplaytv-lockup-horizontal.svg")) {
  throw new Error("LG-02: bundle visual não referencia o símbolo/lockup oficial.");
}

const stageScript = fs.readFileSync(path.join(root, "scripts", "stage-platform.mjs"), "utf8");
if (/Buffer\.from\(["'][A-Za-z0-9+/=]{100,}["']\s*,\s*["']base64["']\)/.test(stageScript)) {
  throw new Error("LG-02: staging ainda contém bitmap legado embutido em base64.");
}
if (!stageScript.includes("resizePngFile(webosAppIconSource") || !stageScript.includes("lg-seller-lounge-icon-400.png")) {
  throw new Error("LG-02: derivados PNG do webOS não estão ligados ao master dedicado (platforms/webos/app-icon-source.png).");
}

console.log("LG-02: identidade vetorial oficial validada no pacote webOS e materiais Seller Lounge.");
console.log(`LG-02: raster mestre Android SHA-256 ${sha(officialPng)}`);
console.log(`LG-02: master webOS SHA-256 ${sha(webosIconSource)}`);
console.log(`LG-02: icon 80 ${sha(icon)}; largeIcon 130 ${sha(largeIcon)}; Seller Lounge 400 ${sha(sellerLoungeIcon)}.`);
console.log("LG-02: ícones webOS 100% opacos e com fundo sólido igual à backgroundColor do appinfo.json (QA2026091823049/50/51 corrigidos).");
