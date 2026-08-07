-- Lote 2: os núcleos SQL históricos permanecem disponíveis para composição
-- interna, migrações e testes. A consolidação comercial acontece nas Edge
-- Functions: seller-device-flow é a única porta externa de ativação, renovação
-- e troca de listas. Aqui apenas impedimos execução direta pelos papéis do cliente.

revoke all on function public.apply_device_subscription_transaction(
  uuid,uuid,uuid,uuid,timestamptz,text,text,text,uuid,text,boolean
) from public, anon, authenticated;
grant execute on function public.apply_device_subscription_transaction(
  uuid,uuid,uuid,uuid,timestamptz,text,text,text,uuid,text,boolean
) to service_role;

revoke all on function public.change_device_playlists_transaction(
  uuid,uuid,uuid,uuid,text,text,text
) from public, anon, authenticated;
grant execute on function public.change_device_playlists_transaction(
  uuid,uuid,uuid,uuid,text,text,text
) to service_role;

-- A RPC de edição individual de lista é mantida por compatibilidade com o
-- histórico de assinaturas, mas também não pode ser chamada diretamente por
-- anon/authenticated.
do $guard$
begin
  if to_regprocedure('public.replace_device_playlist_transaction(uuid,smallint,uuid,text,text,uuid,text)') is not null then
    execute 'revoke all on function public.replace_device_playlist_transaction(uuid,smallint,uuid,text,text,uuid,text) from public, anon, authenticated';
    execute 'grant execute on function public.replace_device_playlist_transaction(uuid,smallint,uuid,text,text,uuid,text) to service_role';
  end if;
end;
$guard$;
