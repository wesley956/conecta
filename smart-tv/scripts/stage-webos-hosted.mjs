import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "platforms", "webos-hosted");
const output = path.join(root, "build", "webos-hosted");
const officialAppIcon = path.resolve(
  root,
  "..",
  "native-android",
  "app",
  "src",
  "main",
  "res",
  "drawable-nodpi",
  "ic_app.png"
);
const channel = process.env.RONECA_TV_HOSTED_CHANNEL === "test" ? "test" : "stable";
const rawUrl = process.env.RONECA_TV_HOSTED_URL || "https://conecta-five-iota.vercel.app/tv/";
const hostedUrl = rawUrl.endsWith("/") ? rawUrl : rawUrl + "/";
const parsed = new URL(hostedUrl);

if (parsed.protocol !== "https:") {
  throw new Error("O aplicativo hospedado exige um endereço HTTPS.");
}
if (!fs.existsSync(officialAppIcon)) {
  throw new Error("LG-02: o ícone oficial Android 2.9.5 não foi encontrado para o pacote hosted.");
}

const appId = channel === "test" ? "com.ronecaplaytv.app.test" : "com.ronecaplaytv.app";
const title = channel === "test" ? "RonecaPlayTV Teste" : "RonecaPlayTV";
const channelLabel = channel === "test" ? "DE TESTE" : "ESTÁVEL";

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const replace = (value) => value
  .replaceAll("__RONECA_TV_APP_ID__", appId)
  .replaceAll("__RONECA_TV_TITLE__", title)
  .replaceAll("__RONECA_TV_HOSTED_URL__", hostedUrl)
  .replaceAll("__RONECA_TV_CHANNEL_LABEL__", channelLabel);

fs.writeFileSync(
  path.join(output, "appinfo.json"),
  replace(fs.readFileSync(path.join(source, "appinfo.template.json"), "utf8"))
);
fs.writeFileSync(
  path.join(output, "index.html"),
  replace(fs.readFileSync(path.join(source, "index.template.html"), "utf8"))
);
fs.copyFileSync(officialAppIcon, path.join(output, "icon.png"));
fs.copyFileSync(officialAppIcon, path.join(output, "largeIcon.png"));

console.log(`Pacote LG hospedado preparado para o canal ${channel}: ${hostedUrl}`);
