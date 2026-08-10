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
const fallbackIcon = Buffer.from("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", "base64");

if (!fs.existsSync(path.join(dist, "index.html"))) {
  throw new Error("Execute npm run build antes de preparar o pacote.");
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(String(packageJson.version || ""))) {
  throw new Error(`Versão inválida em package.json: ${packageJson.version || "<vazia>"}. Use MAJOR.MINOR.PATCH.`);
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(dist, output, { recursive: true });

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

fs.mkdirSync(path.join(root, "platforms", "shared"), { recursive: true });
const sharedIcon = path.join(root, "platforms", "shared", "icon.png");
if (!fs.existsSync(sharedIcon)) fs.writeFileSync(sharedIcon, fallbackIcon);

for (const icon of ["icon.png", "largeIcon.png"]) {
  const source = icon === "largeIcon.png" && !fs.existsSync(path.join(root, "platforms", "shared", icon))
    ? sharedIcon
    : path.join(root, "platforms", "shared", icon);
  if (fs.existsSync(source) && (platform === "webos" || icon === "icon.png")) {
    fs.copyFileSync(source, path.join(output, icon));
  }
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
}

console.log(`Pacote ${platform} preparado em ${path.relative(root, output)}.`);
