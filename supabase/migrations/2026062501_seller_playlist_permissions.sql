create table if not exists public.panel_seller_playlists (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.panel_sellers(id) on delete cascade,
  playlist_id uuid not null references public.panel_playlists(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, playlist_id)
);

create index if not exists panel_seller_playlists_seller_idx
  on public.panel_seller_playlists(seller_id, active);

create index if not exists panel_seller_playlists_playlist_idx
  on public.panel_seller_playlists(playlist_id, active);

alter table public.panel_seller_playlists enable row level security;

-- Migração segura: mantém o comportamento atual, liberando as listas existentes
-- para os vendedores existentes. Depois o admin pode restringir por vendedor.
insert into public.panel_seller_playlists (seller_id, playlist_id, active)
select sellers.id, playlists.id, true
from public.panel_sellers sellers
cross join public.panel_playlists playlists
on conflict (seller_id, playlist_id) do nothing;
