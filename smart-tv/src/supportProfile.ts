export type SupportProfileSource = "seller" | "system" | "generic";

export interface SupportProfile {
  source: SupportProfileSource;
  displayName: string;
  whatsapp: string | null;
  email: string | null;
  supportText: string | null;
  businessHours: string | null;
  contactUrl: string | null;
  showInApp: boolean;
  primaryContactUri: string | null;
  contactLabel: string | null;
}

export function genericSupportProfile(): SupportProfile {
  return {
    source: "generic",
    displayName: "Suporte",
    whatsapp: null,
    email: null,
    supportText: "Envie este código ao seu fornecedor.",
    businessHours: null,
    contactUrl: null,
    showInApp: true,
    primaryContactUri: null,
    contactLabel: null
  };
}

function safeString(value: unknown, limit: number): string | null {
  const text = String(value ?? "").trim();
  return text && text.length <= limit ? text : null;
}

function safeHttps(value: unknown): string | null {
  const raw = safeString(value, 2048);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch { return null; }
}

function safeWhatsapp(value: unknown): { display: string; uri: string } | null {
  const raw = safeString(value, 40);
  if (!raw) return null;
  const normalized = raw.replace(/[^\d+]/g, "");
  if (!/^\+?\d{8,15}$/.test(normalized)) return null;
  return { display: raw, uri: `https://wa.me/${normalized.replace(/\D/g, "")}` };
}

function safeEmail(value: unknown): { display: string; uri: string } | null {
  const raw = safeString(value, 254)?.toLowerCase();
  if (!raw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return null;
  return { display: raw, uri: `mailto:${raw}` };
}

export function normalizeSupportProfile(value: unknown): SupportProfile {
  if (!value || typeof value !== "object") return genericSupportProfile();
  const raw = value as Record<string, unknown>;
  if (raw.showInApp === false) return genericSupportProfile();
  const https = safeHttps(raw.contactUrl);
  const whatsapp = safeWhatsapp(raw.whatsapp);
  const email = safeEmail(raw.email);
  const primaryContactUri = https || whatsapp?.uri || email?.uri || null;
  const source = raw.source === "seller" || raw.source === "system" ? raw.source : "generic";
  return {
    source,
    displayName: safeString(raw.displayName, 120) || "Suporte",
    whatsapp: whatsapp?.display || null,
    email: email?.display || null,
    supportText: safeString(raw.supportText, 280),
    businessHours: safeString(raw.businessHours, 160),
    contactUrl: https,
    showInApp: true,
    primaryContactUri,
    contactLabel: https ? "Abrir atendimento" : whatsapp ? "Abrir WhatsApp" : email ? "Enviar e-mail" : null
  };
}
