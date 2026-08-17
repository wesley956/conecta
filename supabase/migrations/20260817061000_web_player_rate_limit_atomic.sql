-- WEB-13 — quota atômica por bucket+sujeito.
-- Evita que requests concorrentes façam count+insert simultaneamente e ultrapassem o teto.

create or replace function public.web_player_take_rate_limit(
  p_bucket text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_lock_key bigint;
begin
  if p_bucket not in ('refresh', 'catalog', 'playback', 'diagnostic', 'panel') then
    raise exception 'WEB_RATE_BUCKET_INVALID';
  end if;
  if p_subject_hash is null or p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'WEB_RATE_SUBJECT_INVALID';
  end if;
  if p_limit < 1 or p_limit > 1000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'WEB_RATE_POLICY_INVALID';
  end if;

  v_lock_key := hashtextextended(p_bucket || ':' || p_subject_hash, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  select count(*)::integer
  into v_count
  from public.web_player_rate_events
  where bucket = p_bucket
    and subject_hash = p_subject_hash
    and occurred_at >= now() - make_interval(secs => p_window_seconds);

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.web_player_rate_events(subject_hash, bucket)
  values (p_subject_hash, p_bucket);

  -- Limpeza oportunística e limitada ao mesmo sujeito. Mantém a tabela operacional
  -- sem adicionar custo em cada segmento de mídia (segmentos não usam esta RPC).
  if mod(v_count, 16) = 0 then
    delete from public.web_player_rate_events
    where bucket = p_bucket
      and subject_hash = p_subject_hash
      and occurred_at < now() - interval '24 hours';
  end if;

  return true;
end;
$$;

revoke all on function public.web_player_take_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.web_player_take_rate_limit(text, text, integer, integer) to service_role;

comment on function public.web_player_take_rate_limit(text, text, integer, integer) is
  'Adquire atomicamente uma unidade de rate limit por bucket e sujeito hash; service-role only.';
