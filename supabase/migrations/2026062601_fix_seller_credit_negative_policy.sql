-- Corrige a regra de saldo dos vendedores.
-- Antes: credit_balance >= 0 sempre.
-- Agora: saldo negativo só é permitido quando can_go_negative = true.
-- Esta migration é idempotente e remove constraints antigas equivalentes.

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select
      c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'panel_sellers'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%credit_balance%'
      and pg_get_constraintdef(c.oid) ilike '%>= 0%'
  loop
    execute format(
      'alter table public.panel_sellers drop constraint if exists %I',
      constraint_record.conname
    );
  end loop;
end $$;

alter table public.panel_sellers
  drop constraint if exists panel_sellers_credit_balance_policy;

alter table public.panel_sellers
  add constraint panel_sellers_credit_balance_policy
  check (
    credit_balance >= 0
    or coalesce(can_go_negative, false) = true
  );

comment on constraint panel_sellers_credit_balance_policy on public.panel_sellers
  is 'Permite saldo negativo somente para vendedores com can_go_negative=true.';
