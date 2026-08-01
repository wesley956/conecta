import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const login = read("admin-panel/index.html");
const dashboard = `${read("admin-panel/dashboard.html")}\n${read("admin-panel/dashboard.js")}`;
const panelCss = read("admin-panel/panel-redesign.css");
const tvApp = read("smart-tv/src/App.tsx");
const tvStyles = `${read("smart-tv/src/styles.css")}\n${read("smart-tv/src/experience.css")}`;
const androidColors = read("native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/components/FocusableActionCard.kt");
const androidNavigation = read("native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/navigation/MainNavigationBar.kt");
const brand = read("docs/BRAND_VISUAL_ARCHITECTURE.md");

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function luminance(hex) {
  const channels = hexToRgb(hex).map(value => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

requireCheck(login.includes('class="primary login-primary"'), "O botão Entrar precisa ser a única ação primária do login.");
requireCheck(login.includes('class="ghost" type="button"'), "A limpeza do acesso deve permanecer como ação secundária.");
requireCheck(panelCss.includes("min-height: 44px"), "Os controles web precisam preservar o alvo mínimo de 44 px.");
requireCheck(panelCss.includes("body.admin-v2.admin-login-v2 .login-primary"), "A hierarquia visual do login não está protegida.");

for (const snippet of [
  'aria-label="Nome do vendedor ${esc(seller.name)}"',
  'aria-label="WhatsApp do vendedor ${esc(seller.name)}"',
  'aria-label="Status do vendedor ${esc(seller.name)}"',
  'aria-label="Permitir saldo negativo para ${esc(seller.name)}"',
  'aria-label="Nome do plano ${esc(plan.name)}"',
  'aria-label="Duração em dias do plano ${esc(plan.name)}"',
  'aria-label="Custo em créditos do plano ${esc(plan.name)}"',
  'aria-label="Status do plano ${esc(plan.name)}"',
]) {
  requireCheck(dashboard.includes(snippet), `Rótulo comercial ausente: ${snippet}`);
}

for (const id of [
  "newSellerName",
  "newSellerWhatsapp",
  "newSellerEmail",
  "newSellerInitialCredits",
  "newSellerAccessDurationHours",
  "newSellerAutoDeleteGraceHours",
  "newPlanName",
  "newPlanDurationDays",
  "newPlanCreditCost",
  "newPlanMaxDevices",
  "sellerCreditSeller",
  "sellerCreditAmount",
  "sellerCreditDescription",
  "uxNewSellerName",
  "uxNewSellerWhatsapp",
  "uxNewSellerEmail",
  "uxNewSellerInitialCredits",
  "uxNewSellerAccessDurationHours",
  "uxNewSellerAutoDeleteGraceHours",
  "uxNewPlanName",
  "uxNewPlanDurationDays",
  "uxNewPlanCreditCost",
  "uxNewPlanMaxDevices",
  "uxSellerCreditSeller",
  "uxSellerCreditAmount",
  "uxSellerCreditDescription",
  "uxNewCustomerName",
  "uxNewCustomerWhatsapp",
]) {
  requireCheck(dashboard.includes(`<label for="${id}">`), `O controle ${id} perdeu o rótulo associado.`);
}

requireCheck(tvApp.includes('className="card-copy"'), "Os cards Explorar precisam separar rótulo e contagem.");
requireCheck(tvApp.includes('featured-media ${featuredMovie?.cover ? "" : "is-placeholder"}'), "O placeholder de filme precisa de estado visual explícito.");
requireCheck(tvApp.includes('featured-media ${featuredSeries?.cover ? "" : "is-placeholder"}'), "O placeholder de série precisa de estado visual explícito.");
requireCheck(tvStyles.includes("--muted: #a39d91"), "O texto secundário da Smart TV perdeu o token de contraste AA.");
requireCheck(tvStyles.includes("--focus: #ff3b30"), "A Smart TV perdeu o token único de foco.");
requireCheck(tvStyles.includes(".card-copy {"), "O espaçamento interno dos cards Explorar não está protegido.");
requireCheck(contrast("#a39d91", "#11100e") >= 4.5, "O texto secundário não alcança contraste AA sobre a superfície.");
requireCheck(contrast("#a39d91", "#050505") >= 4.5, "O texto secundário não alcança contraste AA sobre o fundo.");

requireCheck(androidColors.includes("val TextMuted = Color(0xFFA39D91)"), "O Android perdeu o texto secundário de alto contraste.");
requireCheck(androidColors.includes("val TextDisabled = Color(0xFF69645B)"), "Texto secundário e desabilitado precisam continuar separados.");
requireCheck(androidColors.includes("val Focus = RedStrong"), "O Android perdeu o token único de foco.");
requireCheck(androidNavigation.includes("fontSize = if (isTelevision) 11.sp else 10.sp"), "O rótulo focado da navegação ficou pequeno demais.");
requireCheck(androidNavigation.includes("fontSize = 10.sp"), "Os rótulos da navegação inferior ficaram pequenos demais.");

for (const term of ["Cruz Stars", "Roneca Player TV", "44 × 44 px", "foco"] ) {
  requireCheck(brand.includes(term), `A arquitetura visual não documenta: ${term}`);
}

console.log("✅ Fundamentos de layout validados: hierarquia, rótulos, toque, contraste, foco e marca.");
