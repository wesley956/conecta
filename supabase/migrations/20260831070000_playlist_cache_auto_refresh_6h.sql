-- Renova automaticamente caches de playlists que já passaram de 6 horas.
-- O cron roda a cada 15 minutos apenas para localizar caches elegíveis; a
-- Edge Function playlist-cache-auto aplica a janela real de 6 horas e o
-- cooldown entre tentativas, então a origem não é consultada a cada execução.

create schema if not exists extensions;
create schema if not exists vault;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create extension if not exists supabase_vault with schema vault;

do $$
begin
  if not exists (
    select 1
    from vault.secrets
    where name = 'roneca_playlist_cache_scheduler_token'
  ) then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '')
        || replace(gen_random_uuid()::text, '-', '')
        || replace(gen_random_uuid()::text, '-', ''),
      'roneca_playlist_cache_scheduler_token',
      'Token interno do cron de renovação automática de cache das playlists'
    );
  end if;

  if not exists (
    select 1
    from vault.secrets
    where name = 'roneca_project_url'
  ) then
    perform vault.create_secret(
      'https://awauvkjkucjqulkklmuo.supabase.co',
      'roneca_project_url',
      'URL do projeto de produção usada pelos jobs internos do RonecaPlayerTV'
    );
  end if;
end
$$;

create or replace function public.verify_playlist_cache_scheduler_token(p_token text)
returns boolean
language sql
security definer
set search_path = public, vault
as $$
  select
    p_token is not null
    and length(p_token) between 64 and 512
    and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'roneca_playlist_cache_scheduler_token'
        and decrypted_secret = p_token
    );
$$;

revoke all on function public.verify_playlist_cache_scheduler_token(text) from public;
revoke all on function public.verify_playlist_cache_scheduler_token(text) from anon;
revoke all on function public.verify_playlist_cache_scheduler_token(text) from authenticated;
grant execute on function public.verify_playlist_cache_scheduler_token(text) to service_role;

select cron.schedule(
  'roneca-playlist-cache-refresh-6h',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'roneca_project_url'
        limit 1
      ) || '/functions/v1/playlist-cache-auto',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-scheduler-token', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'roneca_playlist_cache_scheduler_token'
          limit 1
        )
      ),
      body := jsonb_build_object('source', 'pg_cron'),
      timeout_milliseconds := 10000
    ) as request_id;
  $cron$
);
