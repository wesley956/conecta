-- Corrige o gatilho de qualificação para INSERTs, quando o aparelho ainda não pode ser consultado na tabela.
create or replace function public.enforce_device_primary_playlist_qualification()
returns trigger language plpgsql set search_path to '' as $$
declare
  v_check boolean := false;
  v_playlist public.panel_playlists%rowtype;
  v_device_type text := lower(coalesce(new.device_type, ''));
begin
  if new.status <> 'active' or new.playlist_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_check := true;
  else
    v_check := old.status is distinct from new.status
      or old.playlist_id is distinct from new.playlist_id
      or (
        new.subscription_expires_at is not null
        and (
          old.subscription_expires_at is null
          or new.subscription_expires_at > old.subscription_expires_at
        )
      );
  end if;

  if not v_check then
    return new;
  end if;

  select p.* into v_playlist
  from public.panel_playlists p
  where p.id = new.playlist_id;

  if not found or v_playlist.active is not true then
    raise exception using errcode = 'P0001', message = 'Lista principal não existe ou está inativa.';
  end if;

  if v_playlist.playlist_qualification_status = 'ready_cache' then
    return new;
  end if;

  if v_playlist.playlist_qualification_status = 'ready_direct' then
    if v_device_type in ('android', 'androidtv') then
      return new;
    end if;
    raise exception using
      errcode = 'P0001',
      message = 'Lista principal utiliza acesso direto, que nesta etapa está homologado somente para Android.';
  end if;

  if v_playlist.playlist_qualification_status in ('validating', 'awaiting_device_test', 'retryable_error')
     and v_device_type in ('android', 'androidtv') then
    return new;
  end if;

  raise exception using
    errcode = 'P0001',
    message = coalesce(
      nullif(v_playlist.playlist_qualification_message, ''),
      'Lista principal está bloqueada ou não pode ser confirmada neste aparelho.'
    );
end;
$$;
