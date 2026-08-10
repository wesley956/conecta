import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "build", "webos");
const publicBrand = path.join(root, "public", "brand");
const androidBrand = path.resolve(root, "..", "native-android", "brand");
const androidDrawable = path.resolve(root, "..", "native-android", "app", "src", "main", "res", "drawable-nodpi");

function sha(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function requireFile(file, label = file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) {
    throw new Error(`LG-02: arquivo obrigatório ausente ou vazio: ${label}`);
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

  if (sha(source) !== sha(smartTv)) {
    throw new Error(`LG-02: ${asset} divergiu da fonte oficial Android 2.9.5.`);
  }
  if (sha(smartTv) !== sha(packaged)) {
    throw new Error(`LG-02: ${asset} foi alterado durante o build webOS.`);
  }
}

const officialPng = path.join(androidDrawable, "ic_app.png");
const icon = path.join(output, "icon.png");
const largeIcon = path.join(output, "largeIcon.png");
requireFile(officialPng, "Android ic_app.png");
requireFile(icon, "webOS icon.png");
requireFile(largeIcon, "webOS largeIcon.png");

const officialIconSha = sha(officialPng);
if (sha(icon) !== officialIconSha || sha(largeIcon) !== officialIconSha) {
  throw new Error("LG-02: icon.png/largeIcon.png não derivam do PNG oficial Android 2.9.5.");
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

console.log("LG-02: identidade oficial Android 2.9.5 validada no pacote webOS.");
console.log(`LG-02: launcher SHA-256 ${officialIconSha}`);
