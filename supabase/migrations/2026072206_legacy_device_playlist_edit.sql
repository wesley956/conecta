-- Compatibilidade de edição segura para aparelhos cadastrados antes da assinatura central.
-- A troca acontece somente após a Edge Function validar a origem e gerar o cache.

alter table public.panel_plans
  add column if not exists simultaneous_connections integer not null default 1;

alter table public.panel_plans
  drop constraint if exists panel_plans_simultaneous_connections_check;
alter table public.panel_plans
  add constraint panel_plans_simultaneous_connections_check
  check (
    simultaneous_connections between 1 and 5
    and simultaneous_connections <= least(5, greatest(1, max_devices))
  );

alter table public.panel_playlists
  add column if not exists max_connections integer not null default 1,
  add column if not exists source_fingerprint text,
  add column if not exists archived_at timestamptz;

alter table public.panel_playlists
  drop constraint if exists panel_playlists_max_connections_check;
alter table public.panel_playlists
  add constraint panel_playlists_max_connections_check
  check (max_connections between 1 and 50);

create unique index if not exists panel_playlists_source_fingerprint_uidx
  on public.panel_playlists(source_fingerprint)
  where source_fingerprint is not null and active is true;

create table if not exists public.panel_device_playlist_operations (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.panel_sellers(id) on delete restrict,
  device_id uuid not null references public.panel_devices(id) on delete cascade,
  operation_type text not null check (operation_type = 'replace_playlist'),
  idempotency_key text not null,
  operation_fingerprint text not null,
  result jsonb not null default '{}'::jsonb,
  performed_by text not null,
  created_at timestamptz not null default now(),
  unique (seller_id, idempotency_key)
);

create index if not exists panel_device_playlist_operations_device_idx
  on public.panel_device_playlist_operations(device_id, created_at desc);

create table if not exists public.panel_device_playlist_revisions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.panel_devices(id) on delete cascade,
  seller_id uuid not null references public.panel_sellers(id) on delete restrict,
  priority smallint not null check (priority in (1, 2)),
  previous_playlist_id uuid references public.panel_playlists(id) on delete set null,
  new_playlist_id uuid not null references public.panel_playlists(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 3 and 500),
  performed_by text not null,
  performed_by_user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists panel_device_playlist_revisions_device_idx
  on public.panel_device_playlist_revisions(device_id, created_at desc);

alter table public.panel_device_playlist_operations enable row level security;
alter table public.panel_device_playlist_operations force row level security;
alter table public.panel_device_playlist_revisions enable row level security;
alter table public.panel_device_playlist_revisions force row level security;

revoke all on table public.panel_device_playlist_operations from public, anon, authenticated;
revoke all on table public.panel_device_playlist_revisions from public, anon, authenticated;
grant all on table public.panel_device_playlist_operations to service_role;
grant all on table public.panel_device_playlist_revisions to service_role;

create or replace function public.replace_device_playlist_transaction(
  p_device_id uuid,
  p_priority smallint,
  p_candidate_playlist_id uuid,
  p_reason text,
  p_performed_by text,
  p_performed_by_user_id uuid,
  p_idempotency_key text
)
returns table (
  applied boolean,
  old_playlist_id uuid,
  new_playlist_id uuid,
  playlist_priority smallint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.panel_devices%rowtype;
  v_plan public.panel_plans%rowtype;
  v_candidate public.panel_playlists%rowtype;
  v_old_assignment public.panel_device_playlists%rowtype;
  v_old_playlist_id uuid;
  v_reason text := trim(coalesce(p_reason, ''));
  v_fingerprint text;
  v_existing public.panel_device_playlist_operations%rowtype;
begin
  if p_priority not in (1, 2) then
    raise exception using errcode = '22023', message = 'A posição da lista precisa ser principal ou reserva.';
  end if;

  if length(v_reason) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'Informe um motivo de três a quinhentos caracteres.';
  end if;

  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'Chave de idempotência é obrigatória.';
  end if;

  select device_record.*
  into v_device
  from public.panel_devices device_record
  where device_record.id = p_device_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Aparelho não encontrado.';
  end if;

  if v_device.seller_id is null then
    raise exception using errcode = 'P0001', message = 'O aparelho não possui vendedor responsável.';
  end if;

  if v_device.status in ('blocked', 'inactive') then
    raise exception using errcode = 'P0001', message = 'O aparelho precisa estar ativo ou pendente para editar a lista.';
  end if;

  v_fingerprint := concat_ws(
    '|',
    'replace-device-playlist-v1',
    p_device_id,
    p_priority,
    p_candidate_playlist_id
  );

  select operation_record.*
  into v_existing
  from public.panel_device_playlist_operations operation_record
  where operation_record.seller_id = v_device.seller_id
    and operation_record.idempotency_key = p_idempotency_key
  limit 1;

  if found then
    if v_existing.operation_fingerprint <> v_fingerprint then
      raise exception using errcode = '23505', message = 'Chave de idempotência usada em outra operação.';
    end if;

    return query
    select
      false,
      nullif(v_existing.result->>'old_playlist_id', '')::uuid,
      nullif(v_existing.result->>'new_playlist_id', '')::uuid,
      coalesce((v_existing.result->>'priority')::smallint, p_priority);
    return;
  end if;

  select playlist_record.*
  into v_candidate
  from public.panel_playlists playlist_record
  where playlist_record.id = p_candidate_playlist_id
  for update;

  if not found or v_candidate.active is not true then
    raise exception using errcode = 'P0001', message = 'A nova lista não existe ou está inativa.';
  end if;

  if v_candidate.playlist_cache_status <> 'ready' then
    raise exception using errcode = 'P0001', message = 'A nova lista ainda não possui cache válido.';
  end if;

  if v_device.plan_id is not null then
    select plan_record.*
    into v_plan
    from public.panel_plans plan_record
    where plan_record.id = v_device.plan_id;

    if found and v_candidate.max_connections < greatest(1, v_plan.simultaneous_connections) then
      raise exception using errcode = 'P0001', message = 'A nova lista não suporta as conexões simultâneas do plano.';
    end if;
  end if;

  if not exists (
    select 1
    from public.panel_seller_playlists seller_playlist
    where seller_playlist.seller_id = v_device.seller_id
      and seller_playlist.playlist_id = p_candidate_playlist_id
      and seller_playlist.active is true
  ) then
    raise exception using errcode = 'P0001', message = 'A nova lista não está liberada para o vendedor deste aparelho.';
  end if;

  select assignment_record.*
  into v_old_assignment
  from public.panel_device_playlists assignment_record
  where assignment_record.device_id = p_device_id
    and assignment_record.priority = p_priority
  for update;

  if found then
    v_old_playlist_id := v_old_assignment.playlist_id;
  elsif p_priority = 1 then
    v_old_playlist_id := v_device.playlist_id;
  else
    v_old_playlist_id := null;
  end if;

  if v_old_playlist_id = p_candidate_playlist_id then
    raise exception using errcode = 'P0001', message = 'A nova lista precisa ser diferente da lista atual.';
  end if;

  insert into public.panel_device_playlists (
    device_id,
    playlist_id,
    priority,
    active,
    consecutive_failures,
    last_success_at,
    last_failure_at,
    cooldown_until,
    last_error,
    updated_at
  ) values (
    p_device_id,
    p_candidate_playlist_id,
    p_priority,
    true,
    0,
    null,
    null,
    null,
    null,
    now()
  )
  on conflict on constraint panel_device_playlists_device_id_priority_key do update
  set playlist_id = excluded.playlist_id,
      active = true,
      consecutive_failures = 0,
      last_success_at = null,
      last_failure_at = null,
      cooldown_until = null,
      last_error = null,
      updated_at = now();

  if p_priority = 1 then
    update public.panel_devices device_record
    set playlist_id = p_candidate_playlist_id,
        updated_at = now()
    where device_record.id = p_device_id;
  end if;

  insert into public.panel_device_playlist_revisions (
    device_id,
    seller_id,
    priority,
    previous_playlist_id,
    new_playlist_id,
    reason,
    performed_by,
    performed_by_user_id
  ) values (
    p_device_id,
    v_device.seller_id,
    p_priority,
    v_old_playlist_id,
    p_candidate_playlist_id,
    v_reason,
    p_performed_by,
    p_performed_by_user_id
  );

  insert into public.panel_device_playlist_operations (
    seller_id,
    device_id,
    operation_type,
    idempotency_key,
    operation_fingerprint,
    result,
    performed_by
  ) values (
    v_device.seller_id,
    p_device_id,
    'replace_playlist',
    p_idempotency_key,
    v_fingerprint,
    jsonb_build_object(
      'old_playlist_id', v_old_playlist_id,
      'new_playlist_id', p_candidate_playlist_id,
      'priority', p_priority
    ),
    p_performed_by
  );

  insert into public.panel_audit_logs (
    action,
    entity_type,
    entity_id,
    description,
    metadata
  ) values (
    'device.playlist_replaced',
    'device',
    p_device_id,
    format(
      'Lista %s do aparelho substituída após validação do cache.',
      case when p_priority = 1 then 'principal' else 'reserva' end
    ),
    jsonb_build_object(
      'priority', p_priority,
      'oldPlaylistId', v_old_playlist_id,
      'newPlaylistId', p_candidate_playlist_id,
      'reason', v_reason,
      'performedByUserId', p_performed_by_user_id
    )
  );

  if v_old_playlist_id is not null
     and not exists (
       select 1
       from public.panel_device_playlists device_playlist
       where device_playlist.playlist_id = v_old_playlist_id
         and device_playlist.active is true
     )
     and not exists (
       select 1
       from public.panel_devices device_record
       where device_record.playlist_id = v_old_playlist_id
     ) then
    update public.panel_playlists playlist_record
    set active = false,
        archived_at = coalesce(playlist_record.archived_at, now())
    where playlist_record.id = v_old_playlist_id;
  end if;

  return query
  select true, v_old_playlist_id, p_candidate_playlist_id, p_priority;
end;
$$;

revoke all on function public.replace_device_playlist_transaction(
  uuid, smallint, uuid, text, text, uuid, text
) from public, anon, authenticated;

grant execute on function public.replace_device_playlist_transaction(
  uuid, smallint, uuid, text, text, uuid, text
) to service_role;

comment on table public.panel_device_playlist_revisions is
  'Histórico das trocas seguras de lista nos aparelhos legados, sem credenciais nos logs.';
