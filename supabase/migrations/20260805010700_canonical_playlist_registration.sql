-- Cadastro canônico e atômico. Reutiliza tanto fingerprints novos quanto URLs
-- exatas de registros legados, sem alterar vínculo, prioridade ou saldo.

create or replace function public.register_playlist_source_transaction(
  p_name text,
  p_playlist_url text,
  p_playlist_type text,
  p_max_connections integer,
  p_source_fingerprint text,
  p_seller_id uuid default null
)
returns table (
  playlist_id uuid,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_playlist public.panel_playlists%rowtype;
  v_now timestamptz := now();
  v_name text := left(trim(coalesce(p_name, '')), 180);
  v_url text := trim(coalesce(p_playlist_url, ''));
  v_type text := lower(trim(coalesce(p_playlist_type, 'm3u')));
  v_fingerprint text := lower(trim(coalesce(p_source_fingerprint, '')));
begin
  if char_length(v_name) < 1 then
    raise exception using errcode = '22023', message = 'Nome da lista é obrigatório.';
  end if;
  if char_length(v_url) < 8 or char_length(v_url) > 4096 then
    raise exception using errcode = '22023', message = 'URL da lista inválida.';
  end if;
  if v_type not in ('m3u', 'xtream', 'stalker') then
    raise exception using errcode = '22023', message = 'Tipo de lista inválido.';
  end if;
  if p_max_connections is null or p_max_connections not between 1 and 50 then
    raise exception using errcode = '22023', message = 'Conexões suportadas devem estar entre 1 e 50.';
  end if;
  if v_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Fingerprint da origem inválido.';
  end if;

  if p_seller_id is not null and not exists (
    select 1
    from public.panel_sellers seller
    where seller.id = p_seller_id
      and seller.status = 'active'
      and seller.deleted_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'Vendedor ativo não encontrado.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('playlist-source:' || v_fingerprint, 0)
  );

  select playlist.*
  into v_playlist
  from public.panel_playlists playlist
  where playlist.active is true
    and (
      playlist.source_fingerprint = v_fingerprint
      or playlist.playlist_url = v_url
    )
  order by
    case when playlist.source_fingerprint = v_fingerprint then 0 else 1 end,
    playlist.created_at asc
  limit 1
  for update;

  if found then
    if v_playlist.source_fingerprint is null then
      update public.panel_playlists playlist
      set source_fingerprint = v_fingerprint
      where playlist.id = v_playlist.id;
    end if;

    if p_seller_id is not null then
      insert into public.panel_seller_playlists (
        seller_id,
        playlist_id,
        active,
        created_at,
        updated_at
      ) values (
        p_seller_id,
        v_playlist.id,
        true,
        v_now,
        v_now
      )
      on conflict (seller_id, playlist_id) do update
      set active = true,
          updated_at = excluded.updated_at;
    end if;

    return query select v_playlist.id, false;
    return;
  end if;

  insert into public.panel_playlists (
    name,
    playlist_url,
    playlist_type,
    active,
    max_connections,
    source_fingerprint,
    playlist_updated_at,
    playlist_cache_status,
    playlist_cache_error,
    playlist_cache_error_code,
    playlist_cache_attempts,
    playlist_access_mode,
    playlist_qualification_status,
    playlist_qualification_code,
    playlist_qualification_message,
    playlist_qualification_updated_at
  ) values (
    v_name,
    v_url,
    v_type,
    true,
    p_max_connections,
    v_fingerprint,
    v_now,
    'missing',
    null,
    null,
    '[]'::jsonb,
    'server_cache',
    'validating',
    'REGISTRATION_CREATED',
    'A lista foi salva e está sendo validada.',
    v_now
  )
  returning * into v_playlist;

  if p_seller_id is not null then
    insert into public.panel_seller_playlists (
      seller_id,
      playlist_id,
      active,
      created_at,
      updated_at
    ) values (
      p_seller_id,
      v_playlist.id,
      true,
      v_now,
      v_now
    )
    on conflict (seller_id, playlist_id) do update
    set active = true,
        updated_at = excluded.updated_at;
  end if;

  return query select v_playlist.id, true;
end;
$$;

revoke all on function public.register_playlist_source_transaction(
  text, text, text, integer, text, uuid
) from public, anon, authenticated;
grant execute on function public.register_playlist_source_transaction(
  text, text, text, integer, text, uuid
) to service_role;

comment on function public.register_playlist_source_transaction(
  text, text, text, integer, text, uuid
) is 'Reutiliza origem ativa por fingerprint ou URL exata e cria apenas quando necessário.';
