import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appVersionSource = fs.readFileSync(path.join(root, "smart-tv/src/deviceSession.ts"), "utf8");
const appVersion = appVersionSource.match(/APP_VERSION = "([^"]+)"/)?.[1];
if (!appVersion) throw new Error("A versão interna das Smart TVs não foi encontrada.");

const targets = [
  { platform: "webos", manifest: "appinfo.json", extension: "ipk" },
  { platform: "tizen", manifest: "config.xml", extension: "wgt" }
];

for (const target of targets) {
  const directory = path.join(root, "smart-tv/build", target.platform);
  for (const file of ["index.html", target.manifest, "icon.png"]) {
    if (!fs.existsSync(path.join(directory, file))) {
      throw new Error(`${target.platform}: arquivo obrigatório ausente: ${file}`);
    }
  }
  const manifest = fs.readFileSync(path.join(directory, target.manifest), "utf8");
  if (!manifest.includes(appVersion)) {
    throw new Error(`${target.platform}: manifesto não usa a versão ${appVersion}.`);
  }
  if (target.platform === "tizen" && !manifest.includes("tv-samsung")) {
    throw new Error("Tizen: perfil de TV Samsung ausente.");
  }
  if (target.platform === "webos" && !manifest.includes('"type": "web"')) {
    throw new Error("webOS: tipo de aplicativo web ausente.");
  }
}

console.log(`Estruturas LG IPK e Samsung WGT validadas na versão ${appVersion}.`);
