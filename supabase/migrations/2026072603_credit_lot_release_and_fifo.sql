create or replace function public.release_credit_order(p_order_id uuid)
returns public.panel_credit_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.panel_credit_orders%rowtype;
  v_balance integer;
begin
  select * into v_order from public.panel_credit_orders where id = p_order_id for update;
  if not found then raise exception 'Pedido de créditos não encontrado.'; end if;
  if v_order.credits_status = 'released' and v_order.released_at is not null then return v_order; end if;
  if v_order.payment_status = 'cancelled' then raise exception 'Pedido cancelado não pode liberar créditos.'; end if;

  update public.panel_sellers
     set credit_balance = credit_balance + v_order.credits_total,
         updated_at = now()
   where id = v_order.seller_id
   returning credit_balance into v_balance;

  insert into public.panel_credit_ledger (
    seller_id, amount, type, reference_id, description, balance_after,
    performed_by, idempotency_key, operation_fingerprint, seller_name_snapshot
  )
  select
    v_order.seller_id, v_order.credits_total, 'credit_purchase', v_order.id,
    format('%s pacote(s) %s — %s créditos', v_order.package_quantity, v_order.package_name_snapshot, v_order.credits_total),
    v_balance, 'admin', 'credit-order:' || v_order.id::text,
    'credit-order-v1|' || v_order.id::text, seller.name
  from public.panel_sellers seller where seller.id = v_order.seller_id
  on conflict do nothing;

  insert into public.panel_credit_lots (seller_id, order_id, credits_granted, credits_remaining, expires_at)
  values (v_order.seller_id, v_order.id, v_order.credits_total, v_order.credits_total,
          coalesce(v_order.expires_at, now() + interval '60 days'))
  on conflict do nothing;

  update public.panel_credit_orders
     set credits_status = 'released', released_at = coalesce(released_at, now()),
         expires_at = coalesce(expires_at, now() + interval '60 days'), updated_at = now()
   where id = v_order.id
   returning * into v_order;
  return v_order;
end;
$$;

revoke all on function public.release_credit_order(uuid) from public, anon, authenticated;
grant execute on function public.release_credit_order(uuid) to service_role;

create or replace function public.consume_credit_lots_from_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_needed integer;
  v_lot public.panel_credit_lots%rowtype;
  v_take integer;
begin
  if new.amount >= 0 or new.type = 'expiration' or new.seller_id is null then return new; end if;
  v_needed := abs(new.amount);
  for v_lot in
    select * from public.panel_credit_lots
     where seller_id = new.seller_id and status = 'active' and credits_remaining > 0
     order by expires_at, created_at
     for update
  loop
    exit when v_needed <= 0;
    v_take := least(v_needed, v_lot.credits_remaining);
    update public.panel_credit_lots
       set credits_remaining = credits_remaining - v_take,
           status = case when credits_remaining - v_take = 0 then 'consumed' else 'active' end,
           updated_at = now()
     where id = v_lot.id;
    v_needed := v_needed - v_take;
  end loop;
  return new;
end;
$$;

revoke all on function public.consume_credit_lots_from_ledger() from public, anon, authenticated;
grant execute on function public.consume_credit_lots_from_ledger() to service_role;

drop trigger if exists panel_credit_ledger_consume_lots on public.panel_credit_ledger;
create trigger panel_credit_ledger_consume_lots
after insert on public.panel_credit_ledger
for each row execute function public.consume_credit_lots_from_ledger();
