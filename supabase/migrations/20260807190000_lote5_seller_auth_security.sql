-- Lote 5 — Vendedores, autenticação e segurança.
-- Remove a utilidade comercial das credenciais legadas sem apagar histórico,
-- unifica a exclusão manual em uma transação lógica e fecha avisos reais do linter.

-- 5.1 / 5.2 / 5.3: credenciais legadas deixam de existir como mecanismo de acesso.
update public.panel_sellers
set access_token = null,
    public_code = null,
    updated_at = now()
where access_token is not null
   or public_code is not null;

alter table public.panel_sellers
  drop constraint if exists panel_sellers_legacy_access_token_retired_check;
alter table public.panel_sellers
  add constraint panel_sellers_legacy_access_token_retired_check
  check (access_token is null) not valid;
alter table public.panel_sellers
  validate constraint panel_sellers_legacy_access_token_retired_check;

alter table public.panel_sellers
  drop constraint if exists panel_sellers_public_code_retired_check;
alter table public.panel_sellers
  add constraint panel_sellers_public_code_retired_check
  check (public_code is null) not valid;
alter table public.panel_sellers
  validate constraint panel_sellers_public_code_retired_check;

comment on column public.panel_sellers.access_token is
  'Campo legado aposentado no Lote 5. Deve permanecer nulo; autenticação do vendedor usa Supabase Auth.';
comment on column public.panel_sellers.public_code is
  'Campo legado aposentado no Lote 5. Deve permanecer nulo; aparelhos são vinculados pelo código RPTV no painel.';

-- 5.4: exclusão manual segue o mesmo princípio da exclusão automática:
-- bloqueio imediato, exclusão lógica, preservação integral de histórico e
-- liberação de vínculos operacionais. A Edge Function remove o usuário Auth
-- depois que esta transação revoga o papel local.
create or replace function public.delete_seller_account_transaction(
  p_seller_id uuid,
  p_performed_by_user_id uuid,
  p_reason text default 'manual_admin_delete'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller public.panel_sellers%rowtype;
  v_auth_user_id uuid;
  v_devices integer := 0;
  v_customers integer := 0;
  v_playlists integer := 0;
  v_prices integer := 0;
  v_roles integer := 0;
  v_deleted_at timestamptz := now();
begin
  if p_seller_id is null then
    raise exception using errcode = '22023', message = 'Vendedor é obrigatório.';
  end if;

  select seller.*
    into v_seller
    from public.panel_sellers seller
   where seller.id = p_seller_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Vendedor não encontrado.';
  end if;
  if v_seller.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'Vendedor já foi excluído.';
  end if;

  select role_record.user_id
    into v_auth_user_id
    from public.panel_user_roles role_record
   where role_record.seller_id = p_seller_id
     and role_record.role = 'seller'
   limit 1;

  update public.panel_user_roles role_record
     set active = false,
         updated_at = v_deleted_at
   where role_record.seller_id = p_seller_id
     and role_record.role = 'seller'
     and role_record.active is true;
  get diagnostics v_roles = row_count;

  update public.panel_devices device
     set seller_id = null,
         updated_at = v_deleted_at
   where device.seller_id = p_seller_id;
  get diagnostics v_devices = row_count;

  update public.panel_customers customer
     set seller_id = null,
         updated_at = v_deleted_at
   where customer.seller_id = p_seller_id;
  get diagnostics v_customers = row_count;

  update public.panel_seller_playlists permission
     set active = false,
         updated_at = v_deleted_at
   where permission.seller_id = p_seller_id
     and permission.active is true;
  get diagnostics v_playlists = row_count;

  update public.panel_seller_plan_prices price
     set active = false,
         updated_at = v_deleted_at
   where price.seller_id = p_seller_id
     and price.active is true;
  get diagnostics v_prices = row_count;

  update public.panel_sellers seller
     set status = 'inactive',
         blocked_at = coalesce(seller.blocked_at, v_deleted_at),
         deleted_at = v_deleted_at,
         deletion_reason = coalesce(nullif(trim(p_reason), ''), 'manual_admin_delete'),
         access_expires_at = null,
         auto_delete_after_expiry = false,
         scheduled_deletion_at = null,
         access_token = null,
         public_code = null,
         updated_at = v_deleted_at
   where seller.id = p_seller_id;

  insert into public.panel_audit_logs(
    action, entity_type, entity_id, description, metadata, performed_by
  ) values (
    'seller.deleted_logically',
    'seller',
    p_seller_id,
    'Vendedor bloqueado e excluído logicamente; histórico preservado.',
    jsonb_build_object(
      'authUserId', v_auth_user_id,
      'unlinkedDevices', v_devices,
      'unlinkedCustomers', v_customers,
      'disabledPlaylistLinks', v_playlists,
      'disabledPlanPrices', v_prices,
      'disabledRoles', v_roles,
      'preservedHistory', true,
      'reason', coalesce(nullif(trim(p_reason), ''), 'manual_admin_delete'),
      'performedByUserId', p_performed_by_user_id,
      'deletedAt', v_deleted_at
    ),
    case
      when p_performed_by_user_id is null then 'system'
      else 'panel-user:' || p_performed_by_user_id::text
    end
  );

  return jsonb_build_object(
    'sellerId', p_seller_id,
    'authUserId', v_auth_user_id,
    'unlinkedDevices', v_devices,
    'unlinkedCustomers', v_customers,
    'disabledPlaylistLinks', v_playlists,
    'disabledPlanPrices', v_prices,
    'disabledRoles', v_roles,
    'deletedAt', v_deleted_at,
    'preservedHistory', true
  );
end;
$$;

revoke all on function public.delete_seller_account_transaction(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.delete_seller_account_transaction(uuid,uuid,text)
  to service_role;

-- 5.6: a produção histórica ainda pode conter este helper, enquanto uma
-- reconstrução limpa já pode não criá-lo. Corrigimos somente quando existir.
do $hardening$
begin
  if to_regprocedure('public.panel_finance_scope_for_role(text)') is not null then
    alter function public.panel_finance_scope_for_role(text)
      set search_path = '';
  end if;
end;
$hardening$;

-- Funções abaixo existem exclusivamente como trigger/helper interno do servidor.
-- Não devem aparecer como RPC executável para anon ou usuário autenticado.
revoke all on function public.apply_known_playlist_server_profile_after_primary_change()
  from public, anon, authenticated;
revoke all on function public.apply_known_playlist_server_profile_after_profile_insert()
  from public, anon, authenticated;
revoke all on function public.learn_playlist_server_profile()
  from public, anon, authenticated;

grant execute on function public.apply_known_playlist_server_profile_after_primary_change()
  to service_role;
grant execute on function public.apply_known_playlist_server_profile_after_profile_insert()
  to service_role;
grant execute on function public.learn_playlist_server_profile()
  to service_role;

notify pgrst, 'reload schema';
