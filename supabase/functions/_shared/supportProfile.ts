export type SupportProfileSource = 'seller' | 'system' | 'generic';

export interface PublicSupportProfile {
  source: SupportProfileSource;
  displayName: string;
  whatsapp: string | null;
  email: string | null;
  supportText: string | null;
  businessHours: string | null;
  contactUrl: string | null;
  showInApp: boolean;
}

export interface SupportProfileInput {
  displayName: string;
  whatsapp: string | null;
  email: string | null;
  supportText: string | null;
  businessHours: string | null;
  contactUrl: string | null;
  visible: boolean;
}

const GENERIC_SUPPORT: PublicSupportProfile = Object.freeze({
  source: 'generic',
  displayName: 'Suporte',
  whatsapp: null,
  email: null,
  supportText: 'Envie este código ao seu fornecedor.',
  businessHours: null,
  contactUrl: null,
  showInApp: true,
});

function textOrNull(value: unknown, maxLength: number, label: string) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.length > maxLength) throw new Error(`${label} excede o limite permitido.`);
  return text;
}

function displayName(value: unknown) {
  const text = textOrNull(value, 120, 'Nome de exibição');
  if (!text) throw new Error('Nome de exibição é obrigatório.');
  return text;
}

function whatsapp(value: unknown) {
  const raw = textOrNull(value, 40, 'WhatsApp');
  if (!raw) return null;
  const normalized = raw.replace(/[^\d+]/g, '');
  if (!/^\+?\d{8,15}$/.test(normalized)) {
    throw new Error('WhatsApp inválido. Informe DDI, DDD e número.');
  }
  return normalized;
}

function email(value: unknown) {
  const normalized = textOrNull(value, 254, 'E-mail')?.toLowerCase() || null;
  if (!normalized) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('E-mail inválido.');
  }
  return normalized;
}

function contactUrl(value: unknown) {
  const raw = textOrNull(value, 2048, 'URL de contato');
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('URL de contato inválida.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('A URL de contato deve usar HTTPS e não pode conter credenciais.');
  }
  parsed.hash = '';
  return parsed.toString();
}

export function normalizeSupportProfileInput(
  payload: Record<string, unknown>,
  visibilityField: 'enabled' | 'showInApp',
): SupportProfileInput {
  return {
    displayName: displayName(payload.displayName),
    whatsapp: whatsapp(payload.whatsapp),
    email: email(payload.email),
    supportText: textOrNull(payload.supportText, 280, 'Texto de atendimento'),
    businessHours: textOrNull(payload.businessHours, 160, 'Horário de atendimento'),
    contactUrl: contactUrl(payload.contactUrl),
    visible: payload[visibilityField] !== false,
  };
}

function hasUsableChannel(row: any) {
  return Boolean(row?.whatsapp || row?.email || row?.contact_url);
}

function publicProfile(row: any, source: Exclude<SupportProfileSource, 'generic'>): PublicSupportProfile {
  return {
    source,
    displayName: String(row.display_name || '').trim(),
    whatsapp: row.whatsapp || null,
    email: row.email || null,
    supportText: row.support_text || null,
    businessHours: row.business_hours || null,
    contactUrl: row.contact_url || null,
    showInApp: true,
  };
}

export function genericSupportProfile(): PublicSupportProfile {
  return { ...GENERIC_SUPPORT };
}

export async function resolveSystemSupportProfile(supabase: any): Promise<PublicSupportProfile> {
  const { data, error } = await supabase
    .from('panel_system_support_profiles')
    .select('display_name,whatsapp,email,support_text,business_hours,contact_url,enabled')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw new Error('Falha ao resolver o suporte oficial.');
  if (data?.enabled === true && hasUsableChannel(data)) return publicProfile(data, 'system');
  return genericSupportProfile();
}

export async function resolveDeviceSupportProfile(
  supabase: any,
  sellerId: string | null,
): Promise<PublicSupportProfile> {
  if (sellerId) {
    const { data, error } = await supabase
      .from('panel_seller_support_profiles')
      .select('display_name,whatsapp,email,support_text,business_hours,contact_url,show_in_app')
      .eq('seller_id', sellerId)
      .maybeSingle();

    if (error) throw new Error('Falha ao resolver o suporte do responsável.');
    if (data?.show_in_app === true && hasUsableChannel(data)) return publicProfile(data, 'seller');
  }

  return await resolveSystemSupportProfile(supabase);
}
