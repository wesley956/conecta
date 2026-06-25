do $$
begin
  alter table public.panel_sellers
    drop constraint if exists panel_sellers_credit_balance_check;
end $$;

alter table public.panel_sellers
  alter column credit_balance set default 0;
