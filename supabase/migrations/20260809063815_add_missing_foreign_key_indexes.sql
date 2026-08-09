-- Índices aditivos para as FKs sinalizadas pelo Database Linter.
-- Cada comando é idempotente e não altera as constraints existentes.

create index if not exists panel_credit_orders_package_id_idx
  on public.panel_credit_orders (package_id);

create index if not exists panel_device_playlist_revisions_new_playlist_id_idx
  on public.panel_device_playlist_revisions (new_playlist_id);
create index if not exists panel_device_playlist_revisions_previous_playlist_id_idx
  on public.panel_device_playlist_revisions (previous_playlist_id);
create index if not exists panel_device_playlist_revisions_seller_id_idx
  on public.panel_device_playlist_revisions (seller_id);

create index if not exists panel_financial_records_device_id_idx
  on public.panel_financial_records (device_id);
create index if not exists panel_financial_records_plan_id_idx
  on public.panel_financial_records (plan_id);

create index if not exists panel_playback_diagnostics_resolved_by_idx
  on public.panel_playback_diagnostics (resolved_by);

create index if not exists panel_playlist_server_profiles_last_playlist_id_idx
  on public.panel_playlist_server_profiles (last_playlist_id);

create index if not exists panel_playlists_cache_active_attempt_id_idx
  on public.panel_playlists (playlist_cache_active_attempt_id);
create index if not exists panel_playlists_primary_endpoint_id_idx
  on public.panel_playlists (primary_endpoint_id);

create index if not exists panel_review_accounts_customer_id_idx
  on public.panel_review_accounts (customer_id);
create index if not exists panel_review_accounts_plan_id_idx
  on public.panel_review_accounts (plan_id);
create index if not exists panel_review_accounts_playlist_id_idx
  on public.panel_review_accounts (playlist_id);
create index if not exists panel_review_accounts_seller_id_idx
  on public.panel_review_accounts (seller_id);

create index if not exists panel_seller_plan_prices_plan_id_idx
  on public.panel_seller_plan_prices (plan_id);

create index if not exists playlist_cache_generation_lock_playlist_id_idx
  on public.playlist_cache_generation_lock (playlist_id);

create index if not exists playlist_provider_attempts_assignment_id_idx
  on public.playlist_provider_attempts (assignment_id);
