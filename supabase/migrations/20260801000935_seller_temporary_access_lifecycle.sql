-- Contas temporárias de vendedor com bloqueio e exclusão segura automáticos.
-- A exclusão é lógica para preservar créditos, vendas, aparelhos, clientes e auditoria.

alter table public.panel_sellers
  add column if not exists access_expires_at timestamptz,
  add column if not exists auto_delete_after_expiry boolean not null default false,
  add column if not exists auto_delete_grace_hours integer not null default 36,
  add column if not exists blocked_at timestamptz,
  add column if not exists scheduled_deletion_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_reason text;

alter table public.panel_sellers
  drop constraint if exists panel_sellers_auto_delete_grace_hours_check;
alter table public.panel_sellers
  add constraint panel_sellers_auto_delete_grace_hours_check
  check (auto_delete_grace_hours between 1 and 720);

alter table public.panel_sellers
  drop constraint if exists panel_sellers_temporary_access_consistency_check;
alter table public.panel_sellers
  add constraint panel_sellers_temporary_access_consistency_check check (
    (access_expires_at is not null or auto_delete_after_expiry is false)
    and (scheduled_deletion_at is null or auto_delete_after_expiry is true)
    and (deleted_at is null or status = 'inactive')
  ) not valid;
alter table public.panel_sellers
  validate constraint panel_sellers_temporary_access_consistency_check;

create index if not exists panel_sellers_access_expiry_idx
  on public.panel_sellers(access_expires_at)
  where deleted_at is null and access_expires_at is not null;

create index if not exists panel_sellers_scheduled_deletion_idx
  on public.panel_sellers(scheduled_deletion_at)
  where deleted_at is null and scheduled_deletion_at is not null;

create or replace function public.configure_seller_temporary_access(
  p_seller_id uuid,
  p_duration_hours integer,
  p_auto_delete boolean default false,
  p_grace_hours integer default 36
)
returns table (
  seller_id uuid,
  seller_status text,
  access_expires_at timestamptz,
  auto_delete_after_expiry boolean,
  auto_delete_grace_hours integer,
  scheduled_deletion_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_seller public.panel_sellers%rowtype;
  v_expires_at timestamptz;
begin
  if p_seller_id is null then
    raise exception using errcode = '22023', message = 'Vendedor é obrigatório.';
  end if;
  if p_duration_hours is not null and p_duration_hours not between 1 and 8760 then
    raise exception using errcode = '22023', message = 'A validade deve ficar entre 1 hora e 1 ano.';
  end if;
  if p_grace_hours is null or p_grace_hours not between 1 and 720 then
    raise exception using errcode = '22023', message = 'A tolerância deve ficar entre 1 e 720 horas.';
  end if;
  if p_duration_hours is null and coalesce(p_auto_delete, false) then
    raise exception using errcode = '22023', message = 'Conta sem vencimento não pode ser excluída automaticamente.';
  end if;

  select *
  into v_seller
  from public.panel_sellers
  where id = p_seller_id
  for update;

  if not found or v_seller.deleted_at is not null then
    raise exception using errcode = 'P0002', message = 'Vendedor não encontrado ou já excluído.';
  end if;

  v_expires_at := case
    when p_duration_hours is null then null
    else now() + make_interval(hours => p_duration_hours)
  end;

  update public.panel_sellers
  set
    status = 'active',
    access_expires_at = v_expires_at,
    auto_delete_after_expiry = coalesce(p_auto_delete, false) and v_expires_at is not null,
    auto_delete_grace_hours = p_grace_hours,
    blocked_at = null,
    scheduled_deletion_at = null,
    deletion_reason = null,
    updated_at = now()
  where id = p_seller_id;

  update public.panel_user_roles
  set active = true, updated_at = now()
  where seller_id = p_seller_id and role = 'seller';

  return query
  select
    seller.id,
    seller.status,
    seller.access_expires_at,
    seller.auto_delete_after_expiry,
    seller.auto_delete_grace_hours,
    seller.scheduled_deletion_at
  from public.panel_sellers seller
  where seller.id = p_seller_id;
end;
$$;

revoke all on function public.configure_seller_temporary_access(uuid, integer, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.configure_seller_temporary_access(uuid, integer, boolean, integer)
  to service_role;

create or replace function public.process_seller_temporary_access_lifecycle()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_blocked integer := 0;
  v_deleted integer := 0;
begin
  with expired as (
    update public.panel_sellers seller
    set
      status = 'blocked',
      blocked_at = coalesce(seller.blocked_at, seller.access_expires_at, now()),
      scheduled_deletion_at = case
        when seller.auto_delete_after_expiry then
          coalesce(
            seller.scheduled_deletion_at,
            seller.access_expires_at + make_interval(hours => seller.auto_delete_grace_hours)
          )
        else null
      end,
      updated_at = now()
    where seller.deleted_at is null
      and seller.status = 'active'
      and seller.access_expires_at is not null
      and seller.access_expires_at <= now()
    returning seller.id, seller.name, seller.access_expires_at, seller.scheduled_deletion_at
  ), audited as (
    insert into public.panel_audit_logs (
      action, entity_type, entity_id, description, metadata, performed_by
    )
    select
      'seller.temporary_access_expired',
      'seller',
      expired.id,
      'Acesso temporário do vendedor bloqueado automaticamente',
      jsonb_build_object(
        'accessExpiredAt', expired.access_expires_at,
        'scheduledDeletionAt', expired.scheduled_deletion_at
      ),
      'system'
    from expired
    returning 1
  )
  select count(*) into v_blocked from audited;

  update public.panel_user_roles role_record
  set active = false, updated_at = now()
  from public.panel_sellers seller
  where role_record.seller_id = seller.id
    and role_record.role = 'seller'
    and role_record.active is true
    and seller.deleted_at is null
    and seller.access_expires_at is not null
    and seller.access_expires_at <= now();

  with due_for_deletion as (
    update public.panel_sellers seller
    set
      status = 'inactive',
      deleted_at = now(),
      deletion_reason = 'temporary_access_not_renewed',
      access_token = null,
      public_code = null,
      scheduled_deletion_at = null,
      updated_at = now()
    where seller.deleted_at is null
      and seller.status = 'blocked'
      and seller.auto_delete_after_expiry is true
      and seller.scheduled_deletion_at is not null
      and seller.scheduled_deletion_at <= now()
    returning seller.id, seller.name, seller.blocked_at
  ), audited as (
    insert into public.panel_audit_logs (
      action, entity_type, entity_id, description, metadata, performed_by
    )
    select
      'seller.auto_deleted_after_expiry',
      'seller',
      due.id,
      'Conta temporária do vendedor excluída automaticamente por falta de renovação',
      jsonb_build_object('blockedAt', due.blocked_at, 'preservedHistory', true),
      'system'
    from due_for_deletion due
    returning 1
  )
  select count(*) into v_deleted from audited;

  return jsonb_build_object(
    'blocked', v_blocked,
    'deleted', v_deleted,
    'processedAt', now()
  );
end;
$$;

revoke all on function public.process_seller_temporary_access_lifecycle()
  from public, anon, authenticated;
grant execute on function public.process_seller_temporary_access_lifecycle()
  to service_role;

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'seller-temporary-access-lifecycle'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'seller-temporary-access-lifecycle',
    '*/5 * * * *',
    'select public.process_seller_temporary_access_lifecycle();'
  );
end;
$$;

comment on column public.panel_sellers.access_expires_at is
  'Fim do acesso do vendedor; nulo significa conta sem vencimento.';
comment on column public.panel_sellers.scheduled_deletion_at is
  'Momento da exclusão lógica automática se a conta não for renovada.';
comment on function public.process_seller_temporary_access_lifecycle() is
  'Bloqueia contas vencidas e exclui logicamente contas temporárias não renovadas.';
