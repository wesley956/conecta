import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const requireToken = (source, token, message) => {
  if (!source.includes(token)) throw new Error(`LG-2.9.8 pack 2: ${message}: ${token}`);
};

const session = read("src/deviceSession.ts");
const support = read("src/supportProfile.ts");
const app = read("src/App.tsx");
for (const token of ["supportProfile", "normalizeSupportProfile", "genericSupportProfile"]) requireToken(session, token, "perfil de suporte não integrado");
for (const token of ["safeHttps", "safeWhatsapp", "safeEmail", "primaryContactUri", "showInApp"]) requireToken(support, token, "política segura de suporte incompleta");
for (const token of ["PRECISA DE AJUDA?", "activation-support-card", "support.businessHours", "support.primaryContactUri"]) requireToken(app, token, "ativação responsiva incompleta");

const settings = read("src/playerSettings.ts");
const shell = read("src/content/MainShell.tsx");
for (const token of ["categoryDisplayMode", '"Clássica"', '"Painel lateral"']) requireToken(settings, token, "preferência de categorias incompleta");
for (const token of ["CategorySidePanel", "category-side-mode", "mainMenuOpen", "onExitToMenu", "ArrowLeft", "ArrowRight"]) requireToken(shell, token, "painel lateral/navegação incompleto");

const player = read("src/player/PlayerScreen.tsx");
for (const token of ["trackName", "Desativadas", "selectedTextTrack", "ATIVA", "setTrackPanel(false)"]) requireToken(player, token, "seletor de legendas incompleto");

console.log("LG-2.9.8 pack 2: suporte, categorias e legendas validados no código.");
