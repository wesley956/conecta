-- Classifica o estado inicial antes do sincronizador geral. Triggers do mesmo
-- evento são executados em ordem alfabética, por isso o prefixo aaa.

create or replace function public.seed_playlist_qualification_on_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.playlist_cache_status = 'ready'
     and coalesce(new.playlist_cache_item_count, 0) > 0 then
    new.playlist_qualification_status := 'ready_cache';
    new.playlist_qualification_code := 'CACHE_READY';
    new.playlist_qualification_message := 'A lista está pronta para ativação pelo cache protegido.';
    new.playlist_qualified_at := coalesce(new.playlist_cache_updated_at, now());
  elsif new.playlist_access_mode = 'direct' then
    new.playlist_qualification_status := 'awaiting_device_test';
    new.playlist_qualification_code := coalesce(
      new.playlist_cache_error_code,
      'DIRECT_TEST_REQUIRED'
    );
    new.playlist_qualification_message := 'O provedor exige confirmação em aparelho antes de liberar novas ativações.';
    new.playlist_qualified_at := null;
  elsif new.playlist_cache_status = 'error'
        and new.playlist_cache_error_code in (
          'INVALID_OR_BLOCKED_URL',
          'INVALID_CREDENTIALS',
          'INVALID_PLAYLIST_CONTENT',
          'XTREAM_AUTH_INVALID',
          'XTREAM_AUTH_EXPIRED'
        ) then
    new.playlist_qualification_status := 'blocked';
    new.playlist_qualification_code := new.playlist_cache_error_code;
    new.playlist_qualification_message := coalesce(
      public.safe_playlist_qualification_message(new.playlist_cache_error),
      'A lista não pôde ser homologada.'
    );
    new.playlist_qualified_at := null;
  elsif new.playlist_cache_status = 'error' then
    new.playlist_qualification_status := 'retryable_error';
    new.playlist_qualification_code := coalesce(
      new.playlist_cache_error_code,
      'VALIDATION_RETRY_REQUIRED'
    );
    new.playlist_qualification_message := coalesce(
      public.safe_playlist_qualification_message(new.playlist_cache_error),
      'A validação foi interrompida e pode ser tentada novamente.'
    );
    new.playlist_qualified_at := null;
  else
    new.playlist_qualification_status := coalesce(
      nullif(new.playlist_qualification_status, ''),
      'validating'
    );
    new.playlist_qualification_code := coalesce(
      nullif(new.playlist_qualification_code, ''),
      'VALIDATION_PENDING'
    );
    new.playlist_qualification_message := coalesce(
      public.safe_playlist_qualification_message(new.playlist_qualification_message),
      'A lista foi salva e está sendo validada.'
    );
  end if;

  new.playlist_qualification_updated_at := now();
  return new;
end;
$$;

drop trigger if exists aaa_panel_playlists_insert_qualification_seed
  on public.panel_playlists;
create trigger aaa_panel_playlists_insert_qualification_seed
before insert on public.panel_playlists
for each row execute function public.seed_playlist_qualification_on_insert();

create or replace function public.assert_playlist_commercially_usable(
  p_playlist_id uuid,
  p_label text default 'Lista'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_playlist public.panel_playlists%rowtype;
  v_label text := left(coalesce(nullif(trim(p_label), ''), 'Lista'), 80);
begin
  if p_playlist_id is null then
    raise exception using errcode = '22023', message = v_label || ' é obrigatória.';
  end if;

  select *
  into v_playlist
  from public.panel_playlists playlist
  where playlist.id = p_playlist_id
  for share;

  if not found or v_playlist.active is not true then
    raise exception using errcode = 'P0001', message = v_label || ' inexistente ou inativa.';
  end if;

  if v_playlist.playlist_qualification_status not in ('ready_cache', 'ready_direct') then
    if v_label = 'A nova lista'
       and v_playlist.playlist_qualification_status = 'retryable_error' then
      raise exception using
        errcode = 'P0001',
        message = 'A nova lista ainda não possui cache válido.';
    end if;

    raise exception using
      errcode = 'P0001',
      message = format(
        '%s ainda não está homologada para ativação. Estado: %s.',
        v_label,
        case v_playlist.playlist_qualification_status
          when 'validating' then 'validando lista'
          when 'awaiting_device_test' then 'aguardando teste no aparelho'
          when 'retryable_error' then 'falha temporária'
          when 'blocked' then 'lista bloqueada'
          else v_playlist.playlist_qualification_status
        end
      );
  end if;
end;
$$;

revoke all on function public.assert_playlist_commercially_usable(uuid, text)
  from public, anon, authenticated;
grant execute on function public.assert_playlist_commercially_usable(uuid, text)
  to service_role;
