import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const stagedDir = path.join(root, "build", "webos");
const artifactsDir = path.join(root, "artifacts");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = String(packageJson.version || "");
const appId = "com.ronecaplaytv.app";
const baselineAndroid = "2.9.5";

function fail(message) {
  console.error(`LG-01 validation failed: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    ...options,
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.error) fail(`${command} não pôde ser executado: ${result.error.message}`);
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : String(result.stderr || "");
    fail(`${command} ${args.join(" ")} falhou (${result.status}). ${stderr.trim()}`);
  }
  return result;
}

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`package.json possui versão inválida: ${version || "<vazia>"}`);
}
if (!fs.existsSync(stagedDir)) fail("build/webos não existe. Execute o empacotamento primeiro.");

const appInfoPath = path.join(stagedDir, "appinfo.json");
if (!fs.existsSync(appInfoPath)) fail("appinfo.json não existe no pacote staged.");

let appInfo;
try {
  appInfo = JSON.parse(fs.readFileSync(appInfoPath, "utf8"));
} catch (error) {
  fail(`appinfo.json não é JSON válido: ${error instanceof Error ? error.message : String(error)}`);
}

const requiredFields = ["id", "version", "vendor", "type", "main", "title", "icon", "largeIcon", "resolution"];
for (const field of requiredFields) {
  if (typeof appInfo[field] !== "string" || !appInfo[field].trim()) fail(`appinfo.json: campo ${field} ausente/vazio.`);
}
if (appInfo.id !== appId) fail(`App ID ${appInfo.id} não corresponde a ${appId}.`);
if (appInfo.version !== version) fail(`Versão staged ${appInfo.version} diverge de package.json ${version}.`);
if (appInfo.type !== "web") fail(`appinfo.json type deve ser web, encontrado ${appInfo.type}.`);
if (appInfo.resolution !== "1920x1080") fail(`appinfo.json resolution deve ser 1920x1080, encontrado ${appInfo.resolution}.`);

const stagedRoot = path.resolve(stagedDir);
for (const relativeFile of [appInfo.main, appInfo.icon, appInfo.largeIcon]) {
  const absoluteFile = path.resolve(stagedDir, relativeFile);
  if (!absoluteFile.startsWith(`${stagedRoot}${path.sep}`) || !fs.existsSync(absoluteFile)) {
    fail(`Arquivo referenciado pelo appinfo.json não existe: ${relativeFile}`);
  }
}

const indexPath = path.join(stagedDir, appInfo.main);
const html = fs.readFileSync(indexPath, "utf8");
const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map(match => match[1]);
for (const reference of references) {
  if (!reference || /^(?:https?:|data:|blob:|#|mailto:|tel:)/i.test(reference)) continue;
  const clean = reference.split(/[?#]/, 1)[0].replace(/^\.\//, "");
  if (!clean) continue;
  const absoluteFile = path.resolve(stagedDir, clean);
  if (!absoluteFile.startsWith(`${stagedRoot}${path.sep}`) || !fs.existsSync(absoluteFile)) {
    fail(`index.html referencia asset ausente: ${reference}`);
  }
}

const expectedName = `${appId}_${version}_all.ipk`;
const ipks = fs.readdirSync(artifactsDir, { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith(".ipk"))
  .map(entry => entry.name);
if (ipks.length !== 1) fail(`Esperado exatamente 1 IPK em artifacts/, encontrados ${ipks.length}: ${ipks.join(", ") || "nenhum"}.`);
if (ipks[0] !== expectedName) fail(`Nome do IPK inesperado: ${ipks[0]}. Esperado ${expectedName}.`);

const ipkPath = path.join(artifactsDir, ipks[0]);
const arList = run("ar", ["t", ipkPath], { encoding: "utf8" }).stdout.trim().split(/\r?\n/).filter(Boolean);
if (!arList.includes("debian-binary")) fail("IPK não contém debian-binary.");
if (!arList.some(name => /^control\.tar(?:\.|$)/.test(name))) fail("IPK não contém control.tar.*.");
const dataMember = arList.find(name => /^data\.tar(?:\.|$)/.test(name));
if (!dataMember) fail("IPK não contém data.tar.*.");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "roneca-webos-ipk-"));
try {
  const dataArchive = path.join(tempDir, dataMember);
  const archiveBytes = run("ar", ["p", ipkPath, dataMember]).stdout;
  fs.writeFileSync(dataArchive, archiveBytes);
  const entries = run("tar", ["-tf", dataArchive], { encoding: "utf8" }).stdout.trim().split(/\r?\n/).filter(Boolean);
  for (const requiredFile of ["appinfo.json", "index.html", "icon.png", "largeIcon.png"]) {
    const found = entries.some(entry => entry === requiredFile || entry === `./${requiredFile}` || entry.endsWith(`/${requiredFile}`));
    if (!found) fail(`Conteúdo interno do IPK não contém ${requiredFile}.`);
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

const bytes = fs.readFileSync(ipkPath);
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
const sizeBytes = bytes.byteLength;
const commit = process.env.GITHUB_SHA || process.env.GIT_COMMIT || null;
const metadata = {
  platform: "webos",
  appId,
  version,
  baselineAndroid,
  artifact: path.basename(ipkPath),
  sha256,
  sizeBytes,
  commit,
  status: "CANDIDATE",
  generatedAt: new Date().toISOString(),
  validation: {
    manifest: true,
    resolutionFhd: true,
    referencedAssets: true,
    ipkArStructure: true,
    ipkRequiredFiles: true
  }
};

fs.writeFileSync(path.join(artifactsDir, "SHA256SUMS"), `${sha256}  ${path.basename(ipkPath)}\n`);
fs.writeFileSync(path.join(artifactsDir, "webos-release-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);

console.log(`LG-01: ${path.basename(ipkPath)} validado.`);
console.log(`LG-01: SHA-256 ${sha256}`);
console.log(`LG-01: ${sizeBytes} bytes; versão ${version}; resolução ${appInfo.resolution}; baseline Android ${baselineAndroid}.`);
