import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = relative => {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`LG-10: arquivo obrigatório ausente: ${relative}`);
  return fs.readFileSync(file, "utf8");
};
const requireToken = (source, token, message) => {
  if (!source.includes(token)) throw new Error(`LG-10: ${message}: ${token}`);
};

const packageJson = JSON.parse(read("package.json"));
const metadataPath = path.join(root, "artifacts", "webos-release-metadata.json");
if (!fs.existsSync(metadataPath)) throw new Error("LG-10: metadata do candidate não foi gerada.");
const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
const workflow = read("../.github/workflows/build-lg-webos-installer.yml");
const runbook = read("docs/LG-10-HOMOLOGATION.md");
const matrix = read("docs/LG-10-PARITY-MATRIX.md");

if (metadata.platform !== "webos") throw new Error("LG-10: metadata não representa webOS.");
if (metadata.appId !== "com.ronecaplaytv.app") throw new Error(`LG-10: App ID inesperado: ${metadata.appId}`);
if (metadata.version !== packageJson.version) throw new Error("LG-10: versão do candidate diverge do package.json.");
if (metadata.baselineAndroid !== "2.9.8") throw new Error("LG-10: baseline Android deve continuar 2.9.8.");
if (metadata.status !== "CANDIDATE") throw new Error(`LG-10: candidate técnico precisa chegar como CANDIDATE, recebido ${metadata.status}.`);
if (!/^[a-f0-9]{64}$/i.test(metadata.sha256 || "")) throw new Error("LG-10: SHA-256 do IPK inválido.");
if (!Number.isFinite(metadata.sizeBytes) || metadata.sizeBytes <= 0) throw new Error("LG-10: tamanho do IPK inválido.");
if (!metadata.artifact || !metadata.artifact.endsWith("_all.ipk")) throw new Error("LG-10: nome do IPK inválido.");

const verified = packageJson.scripts?.["package:webos:verified"] || "";
for (const gate of [
  "validate:webos-package",
  "validate:lg-branding",
  "validate:lg-navigation",
  "validate:lg-content",
  "validate:lg-vod",
  "validate:lg-player",
  "validate:lg-resilience",
  "validate:lg-operations",
  "validate:lg-performance",
  "validate:lg-2.9.8-pack",
  "validate:lg-2.9.8-pack-2",
  "validate:lg-homologation"
]) requireToken(verified, gate, "cadeia cumulativa de homologação incompleta");

for (const forbidden of ["SUPABASE_SERVICE_ROLE_KEY", "storage/v1/object/app-releases", "published: true"]) {
  if (workflow.includes(forbidden)) throw new Error(`LG-10: build comum não pode publicar/promover Stable: ${forbidden}`);
}

for (const token of [
  "BUILD ONCE → TEST EXACT ARTIFACT → PROMOTE SAME ARTIFACT",
  "ares-install",
  "ares-launch",
  "N→N+1",
  "30 minutos",
  "20 ciclos",
  "não reconstruir",
  "SHA-256"
]) requireToken(runbook, token, "runbook físico incompleto");

for (const token of [
  "Splash/abertura",
  "Ativação",
  "Home",
  "Busca",
  "Canais",
  "Filmes",
  "Detalhe de filme",
  "Séries",
  "Detalhe de série/temporadas/episódios",
  "Player ao vivo",
  "Player VOD",
  "Áudio/legendas",
  "Aspecto da imagem",
  "Configurações",
  "Diagnóstico",
  "Failover/recovery",
  "A — praticamente idêntico",
  "B — equivalente",
  "C — divergente",
  "N/A — não aplicável"
]) requireToken(matrix, token, "matriz APK × IPK incompleta");

const manifest = {
  schemaVersion: 1,
  phase: "LG-10",
  state: "RC_PENDING_PHYSICAL",
  platform: metadata.platform,
  appId: metadata.appId,
  version: metadata.version,
  sourceCommit: metadata.gitCommit || process.env.GITHUB_SHA || null,
  baselineAndroid: metadata.baselineAndroid,
  artifact: metadata.artifact,
  sha256: metadata.sha256,
  sizeBytes: metadata.sizeBytes,
  builtAt: metadata.builtAt,
  automatedGateChain: ["LG-01", "LG-02", "LG-03", "LG-04", "LG-05", "LG-06", "LG-07", "LG-08", "LG-09", "LG-10"],
  physicalApproval: false,
  parityApproved: false,
  stableEligible: false,
  exactArtifactRequired: true,
  physicalEvidenceRequired: [
    "clean-install",
    "second-launch",
    "tv-reboot-reopen",
    "upgrade-n-to-n-plus-1",
    "identity-and-user-state-preservation",
    "android-vs-lg-parity",
    "live-vod-tracks-aspect-epg",
    "network-recovery-source-switch-failover",
    "standby-resume",
    "30-minute-performance-run",
    "20-player-cycles"
  ],
  releaseRule: "BUILD ONCE → TEST EXACT ARTIFACT → PROMOTE SAME ARTIFACT. Stable requires explicit physical approval and LG-P07 promotion."
};

fs.writeFileSync(path.join(root, "artifacts", "lg10-homologation-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`LG-10: RC ${manifest.artifact} / ${manifest.sha256} preparado para homologação física; Stable continua bloqueado.`);
