import { DEMO_PLAYLIST_NAME, DEMO_PLAYLIST_URL, ensureDemoCache } from './catalog.ts';

export type ReviewAccount = {
  id: string;
  auth_user_id: string;
  name: string;
  active: boolean;
  expires_at: string;
  max_devices: number;
  seller_id: string | null;
  customer_id: string | null;
  plan_id: string | null;
  playlist_id: string | null;
};

async function firstOrCreate(
  supabase: any,
  table: string,
  match: Record<string, unknown>,
  insert: Record<string, unknown>,
) {
  let query = supabase.from(table).select('*');
  for (const [key, value] of Object.entries(match)) query = query.eq(key, value);
  const { data: existing, error: lookupError } = await query.limit(1).maybeSingle();
  if (lookupError) throw new Error(`Falha ao consultar ${table}: ${lookupError.message}`);
  if (existing) return existing;

  const { data, error } = await supabase.from(table).insert(insert).select('*').single();
  if (error || !data) throw new Error(`Falha ao criar ${table}: ${error?.message || 'sem retorno'}`);
  return data;
}

export async function ensureInfrastructure(supabase: any, account: ReviewAccount): Promise<ReviewAccount> {
  const now = new Date().toISOString();
  const maxDevices = Math.max(1, Math.min(10, Number(account.max_devices || 5)));

  const seller = account.seller_id
    ? { id: account.seller_id }
    : await firstOrCreate(supabase, 'panel_sellers', { name: 'LG App Review' }, {
        name: 'LG App Review',
        whatsapp: '+5500000000000',
        email: 'lg-review-system@ronecaplaytv.invalid',
        status: 'active',
        credit_balance: 0,
        can_go_negative: false,
        financial_credit_limit_cents: 0,
        allow_credit_purchases_on_terms: false,
        updated_at: now,
      });

  const customer = account.customer_id
    ? { id: account.customer_id }
    : await firstOrCreate(supabase, 'panel_customers', {
        seller_id: seller.id,
        whatsapp: '+5500000000000',
      }, {
        name: 'LG Quality Assurance',
        whatsapp: '+5500000000000',
        seller_id: seller.id,
        status: 'active',
        updated_at: now,
      });

  const plan = account.plan_id
    ? { id: account.plan_id }
    : await firstOrCreate(supabase, 'panel_plans', { name: 'LG Review — 90 days' }, {
        name: 'LG Review — 90 days',
        duration_days: 90,
        credit_cost: 1,
        max_devices: maxDevices,
        simultaneous_connections: 1,
        status: 'active',
        updated_at: now,
      });

  const playlist = account.playlist_id
    ? { id: account.playlist_id }
    : await firstOrCreate(supabase, 'panel_playlists', { name: DEMO_PLAYLIST_NAME }, {
        name: DEMO_PLAYLIST_NAME,
        playlist_url: DEMO_PLAYLIST_URL,
        playlist_type: 'local',
        active: true,
        playlist_updated_at: now,
        playlist_cache_status: 'building',
        playlist_cache_item_count: 0,
        playlist_cache_size_bytes: 0,
        max_connections: maxDevices,
      });

  await ensureDemoCache(supabase, playlist.id);

  const linked: ReviewAccount = {
    ...account,
    seller_id: seller.id,
    customer_id: customer.id,
    plan_id: plan.id,
    playlist_id: playlist.id,
  };

  const { error: accountError } = await supabase.from('panel_review_accounts').update({
    seller_id: seller.id,
    customer_id: customer.id,
    plan_id: plan.id,
    playlist_id: playlist.id,
    updated_at: now,
  }).eq('id', account.id);
  if (accountError) throw new Error(`Falha ao vincular infraestrutura de avaliação: ${accountError.message}`);

  const { error: sellerPlaylistError } = await supabase.from('panel_seller_playlists').upsert({
    seller_id: seller.id,
    playlist_id: playlist.id,
    active: true,
    updated_at: now,
  }, { onConflict: 'seller_id,playlist_id' });
  if (sellerPlaylistError) throw new Error(`Falha ao vincular catálogo de avaliação: ${sellerPlaylistError.message}`);

  return linked;
}
