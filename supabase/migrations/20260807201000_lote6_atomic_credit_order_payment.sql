-- Lote 6 — pagamento de pacote, financeiro e liberação de créditos
-- passam a compartilhar a mesma transação.

alter function public.release_credit_order(uuid)
  set search_path = '';

create or replace function public.update_credit_order_payment_transaction(
  p_order_id uuid,
  p_payment_status text,
  p_performed_by_user_id uuid
)
returns public.panel_credit_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.panel_credit_orders%rowtype;
  v_status text;
  v_paid_at timestamptz;
  v_previous_status text;
  v_previous_credits_status text;
begin
  if p_order_id is null then
    raise exception using errcode = '22023', message = 'Pedido é obrigatório.';
  end if;

  v_status := lower(trim(coalesce(p_payment_status, '')));
  if v_status not in ('paid', 'pending', 'overdue', 'cancelled') then
    raise exception using errcode = '22023', message = 'Status de pagamento inválido.';
  end if;

  select *
    into v_order
    from public.panel_credit_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Pedido de créditos não encontrado.';
  end if;

  if v_order.credits_status = 'released' and v_status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'Créditos já liberados não podem ser cancelados sem um estorno específico.';
  end if;

  v_previous_status := v_order.payment_status;
  v_previous_credits_status := v_order.credits_status;
  v_paid_at := case
    when v_status = 'paid' then coalesce(v_order.paid_at, now())
    else null
  end;

  update public.panel_credit_orders
     set payment_status = v_status,
         paid_at = v_paid_at,
         updated_at = now()
   where id = p_order_id
   returning * into v_order;

  update public.panel_financial_records
     set status = v_status,
         paid_at = v_paid_at,
         updated_at = now()
   where idempotency_key = 'credit-order-finance:' || p_order_id::text;

  if v_status = 'paid' and v_order.credits_status = 'waiting_payment' then
    v_order := public.release_credit_order(p_order_id);
  end if;

  if v_previous_status is distinct from v_status
     or v_previous_credits_status is distinct from v_order.credits_status then
    insert into public.panel_audit_logs(
      action,
      entity_type,
      entity_id,
      description,
      metadata,
      performed_by
    ) values (
      'credits.package_order.payment_updated',
      'credit_order',
      p_order_id,
      'Status de pagamento do pacote de créditos atualizado.',
      jsonb_build_object(
        'previousPaymentStatus', v_previous_status,
        'paymentStatus', v_status,
        'previousCreditsStatus', v_previous_credits_status,
        'creditsStatus', v_order.credits_status,
        'paidAt', v_order.paid_at,
        'performedByUserId', p_performed_by_user_id
      ),
      case
        when p_performed_by_user_id is null then 'admin'
        else 'panel-user:' || p_performed_by_user_id::text
      end
    );
  end if;

  return v_order;
end;
$$;

revoke all on function public.update_credit_order_payment_transaction(uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.update_credit_order_payment_transaction(uuid,text,uuid)
  to service_role;

comment on function public.update_credit_order_payment_transaction(uuid,text,uuid) is
  'Atualiza pedido, financeiro e eventual liberação de créditos em uma única transação.';

notify pgrst, 'reload schema';
