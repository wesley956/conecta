alter table public.panel_sellers
  add column if not exists access_token text;

update public.panel_sellers
set access_token = encode(gen_random_bytes(24), 'hex')
where access_token is null or length(trim(access_token)) = 0;

create unique index if not exists panel_sellers_access_token_idx
  on public.panel_sellers(access_token)
  where access_token is not null;
