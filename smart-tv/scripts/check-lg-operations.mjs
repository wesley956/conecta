import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const repo = path.resolve(root, "..");
const output = path.join(root, "build", "webos");

function read(relative, base = root) {
  const file = path.join(base, relative);
  if (!fs.existsSync(file)) throw new Error(`LG-08: arquivo obrigatório ausente: ${relative}`);
  return fs.readFileSync(file, "utf8");
}

function requireToken(source, token, message) {
  if (!source.includes(token)) throw new Error(`LG-08: ${message}: ${token}`);
}

const shell = read("src/content/MainShell.tsx");
const app = read("src/App.tsx");
const session = read("src/deviceSession.ts");
const update = read("src/appUpdate.ts");
const safety = read("src/diagnosticSafety.ts");
const maintenance = read("src/localMaintenance.ts");
const unlink = read("supabase/functions/device-unlink/index.ts", repo);
const config = read("supabase/config.toml", repo);
const release = read("supabase/functions/app-release/index.ts", repo);
const diagnostics = read("supabase/functions/playback-diagnostics-report/index.ts", repo);

for (const token of [
  "Aspecto da imagem",
  "Original",
  "Preencher",
  "Estender",
  "Código de suporte",
  "Saúde da lista ativa",
  "Último failover",
  "Limpar cache temporário",
  "Limpar dados desta TV",
  "Verificar atualização do aplicativo",
  "Stable publicada",
  "não envie senha, token nem URL da lista"
]) requireToken(shell, token, "configurações/diagnóstico incompletos");

for (const token of [
  "onClearCache",
  "onUnlinkDevice",
  "clearReconstructibleCache",
  "unlink()"
]) requireToken(app, token, "operações de manutenção não ligadas ao aplicativo");

for (const token of [
  "supportCode",
  "buildSupportCode",
  "sanitizeDiagnosticText",
  "device-unlink",
  "consecutiveFailures",
  "lastFailureAt",
  "lastError"
]) requireToken(session, token, "sessão operacional incompleta");

for (const token of [
  "latest",
  "lastCheckedAt",
  "setError",
  "15_000",
  "isNewer(release.versionName, APP_VERSION)"
]) requireToken(update, token, "estado de atualização incompleto");

for (const token of [
  "URL_PATTERN",
  "AUTH_PATTERN",
  "EMBEDDED_AUTH_PATTERN",
  "QUERY_PATTERN",
  "RP-${platformCode}"
]) requireToken(safety, token, "sanitização/código de suporte incompletos");

if (/localStorage\.clear\s*\(/.test(maintenance) || /sessionStorage\.clear\s*\(/.test(maintenance)) {
  throw new Error("LG-08: manutenção temporária não pode limpar storage inteiro.");
}
for (const token of [
  "roneca.smart-tv.cache.",
  "roneca.smart-tv.ui.",
  "roneca.smart-tv.diagnostics.",
  "roneca.smart-tv.update."
]) requireToken(maintenance, token, "escopo de cache reconstruível incompleto");

for (const token of [
  "x-device-credential",
  "constantTimeEqual",
  "device_credential_hash",
  "status: 'inactive'",
  "device_uuid: null",
  "device_credential_hash: null"
]) requireToken(unlink, token, "desvínculo seguro incompleto");
requireToken(config, "[functions.device-unlink]", "device-unlink não registrado no config.toml");
requireToken(config, "verify_jwt = false", "configuração explícita da função ausente");
requireToken(release, ".eq('published', true)", "consulta do app não está restrita a release publicada");
requireToken(diagnostics, "safeDiagnosticText", "segunda camada de sanitização do backend ausente");

if (!fs.existsSync(output)) throw new Error("LG-08: execute stage:webos/package:webos antes da validação do bundle.");
const assets = path.join(output, "assets");
const js = fs.readdirSync(assets).filter(name => name.endsWith(".js"))
  .map(name => fs.readFileSync(path.join(assets, name), "utf8")).join("\n");
for (const token of [
  "Código de suporte",
  "Limpar cache temporário",
  "Verificar atualização do aplicativo",
  "Aspecto da imagem",
  "Último failover",
  "RP-LG-"
]) requireToken(js, token, "experiência LG-08 não chegou ao bundle final");

console.log("LG-08: configurações, update Stable, diagnóstico seguro, manutenção e desvínculo validados no bundle webOS.");
