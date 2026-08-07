-- Lote 6 — financeiro, atomicidade e integração.
-- O ajuste manual do ADM passa a executar saldo + ledger + auditoria
-- na mesma transação e reaproveita a trava/idempotência já consolidada.

alter function public.apply_seller_credit_transaction(
  uuid, integer, text, uuid, text, text, text
) set search_path = '';

create or replace function public.admin_adjust_seller_credit_transaction(
  p_seller_id uuid,
  p_amount integer,
  p_description text,
  p_performed_by_user_id uuid,
  p_idempotency_key text
)
returns table (
  applied boolean,
  ledger_id uuid,
  balance_before integer,
  balance_after integer,
  movement_type text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_description text;
  v_idempotency_key text;
  v_type text;
  v_result record;
begin
  if p_seller_id is null then
    raise exception using errcode = '22023', message = 'Vendedor é obrigatório.';
  end if;

  if p_amount is null or p_amount = 0 then
    raise exception using errcode = '22023', message = 'O ajuste precisa ser diferente de zero.';
  end if;

  if abs(p_amount) > 1000000 then
    raise exception using errcode = '22023', message = 'O ajuste excede o limite permitido.';
  end if;

  v_description := nullif(trim(coalesce(p_description, '')), '');
  if v_description is null then
    raise exception using errcode = '22023', message = 'Informe o motivo do ajuste manual.';
  end if;
  if length(v_description) > 500 then
    raise exception using errcode = '22023', message = 'O motivo do ajuste excede 500 caracteres.';
  end if;

  v_idempotency_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
  if v_idempotency_key is null then
    raise exception using errcode = '22023', message = 'Chave de idempotência é obrigatória.';
  end if;
  if length(v_idempotency_key) > 200 then
    raise exception using errcode = '22023', message = 'A chave de idempotência excede 200 caracteres.';
  end if;

  v_type := case when p_amount > 0 then 'manual_add' else 'manual_remove' end;

  select *
    into v_result
    from public.apply_seller_credit_transaction(
      p_seller_id,
      p_amount,
      v_type,
      null,
      v_description,
      case
        when p_performed_by_user_id is null then 'admin'
        else 'panel-user:' || p_performed_by_user_id::text
      end,
      v_idempotency_key
    );

  if coalesce(v_result.applied, false) then
    insert into public.panel_audit_logs(
      action,
      entity_type,
      entity_id,
      description,
      metadata,
      performed_by
    ) values (
      case when p_amount > 0 then 'credit.added' else 'credit.removed' end,
      'seller',
      p_seller_id,
      case
        when p_amount > 0 then format('%s crédito(s) adicionados manualmente.', p_amount)
        else format('%s crédito(s) removidos manualmente.', abs(p_amount))
      end,
      jsonb_build_object(
        'amount', p_amount,
        'balanceBefore', v_result.balance_before,
        'balanceAfter', v_result.balance_after,
        'ledgerId', v_result.ledger_id,
        'idempotencyKey', v_idempotency_key,
        'reason', v_description,
        'performedByUserId', p_performed_by_user_id
      ),
      case
        when p_performed_by_user_id is null then 'admin'
        else 'panel-user:' || p_performed_by_user_id::text
      end
    );
  end if;

  return query
  select
    coalesce(v_result.applied, false),
    v_result.ledger_id,
    v_result.balance_before,
    v_result.balance_after,
    v_type;
end;
$$;

revoke all on function public.admin_adjust_seller_credit_transaction(
  uuid, integer, text, uuid, text
) from public, anon, authenticated;

grant execute on function public.admin_adjust_seller_credit_transaction(
  uuid, integer, text, uuid, text
) to service_role;

comment on function public.admin_adjust_seller_credit_transaction(
  uuid, integer, text, uuid, text
) is 'Ajuste manual administrativo de créditos: saldo, ledger e auditoria atômicos e idempotentes.';

notify pgrst, 'reload schema';
