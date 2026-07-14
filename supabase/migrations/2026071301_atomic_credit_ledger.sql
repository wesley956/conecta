alter table public.panel_credit_ledger
  add column if not exists idempotency_key text;

drop index if exists public.panel_credit_ledger_idempotency_key_uidx;

create unique index if not exists panel_credit_ledger_idempotency_key_uidx
  on public.panel_credit_ledger(seller_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.apply_seller_credit_transaction(
  p_seller_id uuid,
  p_amount integer,
  p_type text,
  p_reference_id uuid default null,
  p_description text default null,
  p_performed_by text default null,
  p_idempotency_key text default null
)
returns table (
  applied boolean,
  ledger_id uuid,
  balance_before integer,
  balance_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller public.panel_sellers%rowtype;
  v_existing public.panel_credit_ledger%rowtype;
  v_ledger_id uuid;
  v_balance_before integer;
  v_balance_after integer;
  v_idempotency_key text;
begin
  if p_seller_id is null then
    raise exception using
      errcode = '22023',
      message = 'seller_id é obrigatório.';
  end if;

  if p_amount is null or p_amount = 0 then
    raise exception using
      errcode = '22023',
      message = 'O valor da movimentação deve ser diferente de zero.';
  end if;

  if p_type not in (
    'purchase',
    'activation',
    'renewal',
    'refund',
    'manual_add',
    'manual_remove'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Tipo de movimentação de crédito inválido.';
  end if;

  v_idempotency_key := nullif(trim(coalesce(p_idempotency_key, '')), '');

  if v_idempotency_key is not null and length(v_idempotency_key) > 200 then
    raise exception using
      errcode = '22023',
      message = 'A chave de idempotência excede 200 caracteres.';
  end if;

  select *
    into v_seller
    from public.panel_sellers
   where id = p_seller_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Vendedor não encontrado.';
  end if;

  if v_seller.status <> 'active' then
    raise exception using
      errcode = 'P0001',
      message = 'Vendedor bloqueado ou inativo.';
  end if;

  if v_idempotency_key is not null then
    select *
      into v_existing
      from public.panel_credit_ledger
     where seller_id = p_seller_id
       and idempotency_key = v_idempotency_key
     limit 1;

    if found then
      return query
      select
        false,
        v_existing.id,
        v_seller.credit_balance,
        v_seller.credit_balance;
      return;
    end if;
  end if;

  v_balance_before := coalesce(v_seller.credit_balance, 0);
  v_balance_after := v_balance_before + p_amount;

  if v_balance_after < 0 and coalesce(v_seller.can_go_negative, false) = false then
    raise exception using
      errcode = 'P0001',
      message = format(
        'Saldo insuficiente. Saldo atual: %s. Movimentação: %s.',
        v_balance_before,
        p_amount
      );
  end if;

  update public.panel_sellers
     set credit_balance = v_balance_after,
         updated_at = now()
   where id = p_seller_id;

  insert into public.panel_credit_ledger (
    seller_id,
    amount,
    type,
    reference_id,
    description,
    balance_after,
    performed_by,
    idempotency_key
  ) values (
    p_seller_id,
    p_amount,
    p_type,
    p_reference_id,
    p_description,
    v_balance_after,
    p_performed_by,
    v_idempotency_key
  )
  returning id into v_ledger_id;

  return query
  select
    true,
    v_ledger_id,
    v_balance_before,
    v_balance_after;
end;
$$;

revoke all on function public.apply_seller_credit_transaction(
  uuid,
  integer,
  text,
  uuid,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.apply_seller_credit_transaction(
  uuid,
  integer,
  text,
  uuid,
  text,
  text,
  text
) to service_role;

comment on function public.apply_seller_credit_transaction(
  uuid,
  integer,
  text,
  uuid,
  text,
  text,
  text
) is 'Atualiza saldo e extrato do vendedor atomicamente, com bloqueio de concorrência e idempotência isolada por vendedor.';
