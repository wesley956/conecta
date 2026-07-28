import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const buildDir = path.join(root, "build", "tizen");
const artifactsDir = path.join(root, "artifacts");
const signed = process.argv.includes("--signed");
const configPath = path.join(buildDir, "config.xml");
const config = await import("node:fs/promises").then(fs => fs.readFile(configPath, "utf8"));
const version = config.match(/\bversion="([0-9]+\.[0-9]+\.[0-9]+)"/)?.[1];
if (!version) throw new Error("A versão do config.xml não foi encontrada.");
await mkdir(artifactsDir, { recursive: true });

function run(command, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`${command} encerrou com código ${code}.`)));
  });
}

if (!signed) {
  const output = path.join(artifactsDir, `ronecaPlayerTV-tizen-v${version}-unsigned.wgt`);
  await rm(output, { force: true });
  if (process.platform === "win32") {
    await run("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${buildDir}\\*' -DestinationPath '${output}' -Force`]);
  } else {
    await run("zip", ["-q", "-r", output, "."], buildDir);
  }
  console.log(`Estrutura WGT não assinada criada em ${path.relative(root, output)}.`);
  console.log("Use npm run package:tizen:signed em uma máquina com Tizen Studio e certificado Samsung.");
  process.exit(0);
}

const profile = String(process.env.TIZEN_CERT_PROFILE || "").trim();
const tizen = String(process.env.TIZEN_CLI || "tizen").trim();
if (!profile) throw new Error("TIZEN_CERT_PROFILE não foi configurado.");
await run(tizen, ["package", "-t", "wgt", "-s", profile, "--", buildDir]);
const files = await readdir(buildDir);
const generated = files.find(file => file.toLowerCase().endsWith(".wgt"));
if (!generated) throw new Error("O Tizen Studio não gerou o WGT assinado.");
const output = path.join(artifactsDir, `ronecaPlayerTV-tizen-v${version}.wgt`);
await copyFile(path.join(buildDir, generated), output);
console.log(`WGT assinado criado em ${path.relative(root, output)}.`);
