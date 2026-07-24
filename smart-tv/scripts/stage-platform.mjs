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

if (!fs.existsSync(path.join(dist, "index.html"))) {
  throw new Error("Execute npm run build antes de preparar o pacote.");
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(dist, output, { recursive: true });

const manifest = platform === "webos" ? "appinfo.json" : "config.xml";
fs.copyFileSync(path.join(platformRoot, manifest), path.join(output, manifest));

for (const icon of ["icon.png", "largeIcon.png"]) {
  const source = path.join(root, "platforms", "shared", icon);
  if (fs.existsSync(source) && (platform === "webos" || icon === "icon.png")) {
    fs.copyFileSync(source, path.join(output, icon));
  }
}

if (!fs.existsSync(path.join(output, "icon.png"))) {
  throw new Error("O ícone obrigatório da plataforma não foi encontrado.");
}

console.log(`Pacote ${platform} preparado em ${path.relative(root, output)}.`);
