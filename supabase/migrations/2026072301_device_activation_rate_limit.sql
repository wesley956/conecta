create table if not exists public.device_activation_rate_limits (
  key_hash text primary key,
  request_count integer not null default 0 check (request_count >= 0),
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.device_activation_rate_limits enable row level security;

revoke all on table public.device_activation_rate_limits from anon, authenticated;
grant select, insert, update, delete on table public.device_activation_rate_limits to service_role;

create or replace function public.consume_device_activation_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer default 3600,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
  window_age interval;
  allowed boolean;
begin
  if length(coalesce(p_key_hash, '')) <> 64
     or p_limit < 1
     or p_window_seconds < 60 then
    raise exception 'Parâmetros de limitação inválidos';
  end if;

  insert into public.device_activation_rate_limits (
    key_hash,
    request_count,
    window_started_at,
    updated_at
  ) values (
    p_key_hash,
    1,
    now(),
    now()
  )
  on conflict (key_hash) do update
  set
    request_count = case
      when now() - device_activation_rate_limits.window_started_at
        >= make_interval(secs => p_window_seconds)
        then 1
      else device_activation_rate_limits.request_count + 1
    end,
    window_started_at = case
      when now() - device_activation_rate_limits.window_started_at
        >= make_interval(secs => p_window_seconds)
        then now()
      else device_activation_rate_limits.window_started_at
    end,
    updated_at = now()
  returning
    request_count,
    now() - window_started_at
  into current_count, window_age;

  allowed := current_count <= p_limit;

  if not allowed then
    insert into public.panel_audit_logs (
      action,
      entity_type,
      description,
      metadata
    ) values (
      'device.activation.rate_limited',
      'device_activation',
      'Tentativa pública de ativação limitada',
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'keyHash', p_key_hash,
        'requestCount', current_count,
        'windowAgeSeconds', extract(epoch from window_age)::integer
      )
    );
  end if;

  return allowed;
end;
$$;

revoke all on function public.consume_device_activation_rate_limit(text, integer, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.consume_device_activation_rate_limit(text, integer, integer, jsonb)
  to service_role;

