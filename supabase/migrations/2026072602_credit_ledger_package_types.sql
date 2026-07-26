alter table public.panel_credit_ledger
  drop constraint if exists panel_credit_ledger_type_check;

alter table public.panel_credit_ledger
  add constraint panel_credit_ledger_type_check
  check (type in (
    'purchase', 'activation', 'renewal', 'refund', 'manual_add', 'manual_remove',
    'credit_purchase', 'expiration'
  ));

create unique index if not exists panel_credit_lots_order_uidx
  on public.panel_credit_lots(order_id)
  where order_id is not null;
