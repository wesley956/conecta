import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const requireToken = (source, token, message) => {
  if (!source.includes(token)) throw new Error(`LG-2.9.8 pack 3: ${message}: ${token}`);
};

const visual = read("docs/LG-2.9.8-VISUAL-AUDIT.md");
for (const token of ["#080809", "#E3262E", "#FF454C", "Splash", "Ativação", "Home", "Busca", "Canais", "Filmes", "Séries", "Configurações", "Player", "QR Code local"] ) requireToken(visual, token, "auditoria visual incompleta");

const shell = read("src/content/MainShell.tsx");
for (const token of ["Perfil atual", "Decodificação", "Inicialização do catálogo", "Exibição das categorias", "Verificar atualização do aplicativo", "Limpar cache temporário", "Desvincular aparelho"]) requireToken(shell, token, "Configurações incompletas");

const catalog = read("src/catalog.ts");
for (const token of ["restoredFromSnapshot", "snapshotSavedAt"]) requireToken(catalog, token, "diagnóstico de snapshot incompleto");

const homologation = read("scripts/check-lg-homologation.mjs");
for (const token of ["LG-2.9.8-PACK-3", "launch-video-crossfade", "support-profile-and-local-qr", "physicalApproval: false", "stableEligible: false"]) requireToken(homologation, token, "manifesto físico incompleto");

console.log("LG-2.9.8 pack 3: visual, Configurações e preparação física validados.");
