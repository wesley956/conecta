-- Edição segura de listas vinculadas à assinatura.
-- A nova origem precisa ter cache pronto antes da troca; a lista antiga só é
-- arquivada depois que todos os vínculos da assinatura forem atualizados.

alter table public.panel_subscription_operations
  drop constraint if exists panel_subscription_operations_operation_type_check;

alter table public.panel_subscription_operations
  add constraint panel_subscription_operations_operation_type_check
  check (operation_type in (
    'add_device',
    'replace_device',
    'upgrade',
    'schedule_downgrade',
    'renewal',
    'replace_playlist'
  ));

create table if not exists public.panel_playlist_revisions (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.panel_subscriptions(id) on delete cascade,
  priority smallint not null check (priority in (1, 2)),
  previous_playlist_id uuid references public.panel_playlists(id) on delete set null,
  new_playlist_id uuid not null references public.panel_playlists(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 3 and 500),
  performed_by text not null,
  performed_by_user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists panel_playlist_revisions_subscription_idx
  on public.panel_playlist_revisions(subscription_id, created_at desc);

alter table public.panel_playlist_revisions enable row level security;
alter table public.panel_playlist_revisions force row level security;
revoke all on table public.panel_playlist_revisions from public, anon, authenticated;
grant all on table public.panel_playlist_revisions to service_role;

create or replace function public.replace_subscription_playlist_transaction(
  p_subscription_id uuid,
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
  priority smallint,
  active_devices integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.panel_subscriptions%rowtype;
  v_candidate public.panel_playlists%rowtype;
  v_old_assignment public.panel_subscription_playlists%rowtype;
  v_old_playlist_id uuid;
  v_device_count integer;
  v_fingerprint text;
  v_existing public.panel_subscription_operations%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if p_priority not in (1, 2) then
    raise exception using errcode = '22023', message = 'A prioridade da lista precisa ser principal ou reserva.';
  end if;

  if length(v_reason) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'Informe um motivo de três a quinhentos caracteres.';
  end if;

  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'Chave de idempotência é obrigatória.';
  end if;

  select subscription_record.*
  into v_subscription
  from public.panel_subscriptions subscription_record
  where subscription_record.id = p_subscription_id
  for update;

  if not found or v_subscription.status in ('cancelled', 'needs_review') then
    raise exception using errcode = 'P0001', message = 'A assinatura não permite editar listas neste estado.';
  end if;

  v_fingerprint := concat_ws(
    '|',
    'replace-playlist-v1',
    p_subscription_id,
    p_priority,
    p_candidate_playlist_id
  );

  select operation_record.*
  into v_existing
  from public.panel_subscription_operations operation_record
  where operation_record.seller_id = v_subscription.seller_id
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
      coalesce((v_existing.result->>'priority')::smallint, p_priority),
      coalesce((v_existing.result->>'active_devices')::integer, 0);
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

  if v_candidate.max_connections < v_subscription.simultaneous_connections_snapshot then
    raise exception using errcode = 'P0001', message = 'A nova lista não suporta as conexões simultâneas do plano.';
  end if;

  if not exists (
    select 1
    from public.panel_seller_playlists seller_playlist
    where seller_playlist.seller_id = v_subscription.seller_id
      and seller_playlist.playlist_id = p_candidate_playlist_id
      and seller_playlist.active is true
  ) then
    raise exception using errcode = 'P0001', message = 'A nova lista não está liberada para o vendedor da assinatura.';
  end if;

  if exists (
    select 1
    from public.panel_subscription_playlists other_assignment
    where other_assignment.playlist_id = p_candidate_playlist_id
      and other_assignment.active is true
      and other_assignment.subscription_id <> p_subscription_id
  ) then
    raise exception using errcode = '23505', message = 'A nova lista já pertence a outra assinatura.';
  end if;

  select assignment_record.*
  into v_old_assignment
  from public.panel_subscription_playlists assignment_record
  where assignment_record.subscription_id = p_subscription_id
    and assignment_record.priority = p_priority
    and assignment_record.active is true
  for update;

  if p_priority = 1 and not found then
    raise exception using errcode = 'P0001', message = 'A assinatura não possui lista principal exclusiva para editar.';
  end if;

  v_old_playlist_id := case when found then v_old_assignment.playlist_id else null end;

  if v_old_playlist_id = p_candidate_playlist_id then
    raise exception using errcode = 'P0001', message = 'A nova lista precisa ser diferente da lista atual.';
  end if;

  if v_old_playlist_id is not null then
    update public.panel_subscription_playlists assignment_record
    set active = false,
        archived_at = now(),
        archived_reason = v_reason,
        updated_at = now()
    where assignment_record.id = v_old_assignment.id;
  end if;

  insert into public.panel_subscription_playlists (
    subscription_id,
    playlist_id,
    priority,
    active,
    assigned_at
  ) values (
    p_subscription_id,
    p_candidate_playlist_id,
    p_priority,
    true,
    now()
  );

  select count(*)
  into v_device_count
  from public.panel_subscription_devices subscription_device
  where subscription_device.subscription_id = p_subscription_id
    and subscription_device.status = 'active';

  if p_priority = 1 then
    update public.panel_devices device_record
    set playlist_id = p_candidate_playlist_id,
        updated_at = now()
    where device_record.id in (
      select subscription_device.device_id
      from public.panel_subscription_devices subscription_device
      where subscription_device.subscription_id = p_subscription_id
        and subscription_device.status = 'active'
    );
  else
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
    )
    select
      subscription_device.device_id,
      p_candidate_playlist_id,
      2,
      true,
      0,
      null,
      null,
      null,
      null,
      now()
    from public.panel_subscription_devices subscription_device
    where subscription_device.subscription_id = p_subscription_id
      and subscription_device.status = 'active'
    on conflict (device_id, priority) do update
    set playlist_id = excluded.playlist_id,
        active = true,
        consecutive_failures = 0,
        last_success_at = null,
        last_failure_at = null,
        cooldown_until = null,
        last_error = null,
        updated_at = now();
  end if;

  if v_old_playlist_id is not null
     and not exists (
       select 1
       from public.panel_subscription_playlists subscription_playlist
       where subscription_playlist.playlist_id = v_old_playlist_id
         and subscription_playlist.active is true
     )
     and not exists (
       select 1
       from public.panel_device_playlists device_playlist
       where device_playlist.playlist_id = v_old_playlist_id
         and device_playlist.active is true
     ) then
    update public.panel_playlists playlist_record
    set active = false,
        archived_at = coalesce(playlist_record.archived_at, now())
    where playlist_record.id = v_old_playlist_id;
  end if;

  insert into public.panel_playlist_revisions (
    subscription_id,
    priority,
    previous_playlist_id,
    new_playlist_id,
    reason,
    performed_by,
    performed_by_user_id
  ) values (
    p_subscription_id,
    p_priority,
    v_old_playlist_id,
    p_candidate_playlist_id,
    v_reason,
    p_performed_by,
    p_performed_by_user_id
  );

  insert into public.panel_subscription_operations (
    seller_id,
    subscription_id,
    operation_type,
    idempotency_key,
    operation_fingerprint,
    result,
    performed_by
  ) values (
    v_subscription.seller_id,
    p_subscription_id,
    'replace_playlist',
    p_idempotency_key,
    v_fingerprint,
    jsonb_build_object(
      'old_playlist_id', v_old_playlist_id,
      'new_playlist_id', p_candidate_playlist_id,
      'priority', p_priority,
      'active_devices', v_device_count
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
    'subscription.playlist_replaced',
    'subscription',
    p_subscription_id,
    format(
      'Lista %s da assinatura substituída com validação prévia de cache.',
      case when p_priority = 1 then 'principal' else 'reserva' end
    ),
    jsonb_build_object(
      'priority', p_priority,
      'oldPlaylistId', v_old_playlist_id,
      'newPlaylistId', p_candidate_playlist_id,
      'reason', v_reason,
      'performedByUserId', p_performed_by_user_id,
      'activeDevices', v_device_count
    )
  );

  return query
  select true, v_old_playlist_id, p_candidate_playlist_id, p_priority, v_device_count;
end;
$$;

revoke all on function public.replace_subscription_playlist_transaction(
  uuid, smallint, uuid, text, text, uuid, text
) from public, anon, authenticated;

grant execute on function public.replace_subscription_playlist_transaction(
  uuid, smallint, uuid, text, text, uuid, text
) to service_role;

comment on table public.panel_playlist_revisions is
  'Histórico das trocas de lista da assinatura sem duplicar credenciais em logs ou metadados.';
