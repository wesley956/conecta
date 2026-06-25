alter table public.panel_sellers
  add column if not exists public_code text;

update public.panel_sellers
set public_code = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substring(coalesce(access_token, encode(extensions.gen_random_bytes(12), 'hex')) from 1 for 6)
where public_code is null or length(trim(public_code)) = 0;

create unique index if not exists panel_sellers_public_code_idx
  on public.panel_sellers(public_code)
  where public_code is not null;
