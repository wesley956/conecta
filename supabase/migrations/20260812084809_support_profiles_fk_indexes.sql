create index if not exists panel_system_support_profiles_updated_by_idx
  on public.panel_system_support_profiles(updated_by);

create index if not exists panel_seller_support_profiles_updated_by_idx
  on public.panel_seller_support_profiles(updated_by);
