import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "smart-tv", "dist");
const target = path.join(root, "admin-panel", "tv");
const smartPackagePath = path.join(root, "smart-tv", "package.json");

if (!fs.existsSync(path.join(source, "index.html"))) {
  throw new Error("O build Smart TV não foi encontrado. Execute npm run build em smart-tv.");
}
if (!fs.existsSync(smartPackagePath)) {
  throw new Error("O package.json da Smart TV não foi encontrado.");
}

const smartPackage = JSON.parse(fs.readFileSync(smartPackagePath, "utf8"));
const smartVersion = String(smartPackage.version || "").trim();
if (!/^\d+\.\d+\.\d+$/.test(smartVersion)) {
  throw new Error(`Versão Smart TV inválida: ${smartVersion || "não informada"}`);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, { recursive: true });

const version = {
  version: smartVersion,
  commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local",
  builtAt: new Date().toISOString()
};
fs.writeFileSync(path.join(target, "version.json"), JSON.stringify(version, null, 2) + "\n");

console.log(`Smart TV hospedada v${smartVersion} preparada em ${path.relative(root, target)}.`);
