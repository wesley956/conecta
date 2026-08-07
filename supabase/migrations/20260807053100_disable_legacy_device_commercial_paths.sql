-- Lote 2: preserva os núcleos SQL históricos para composição interna, migrações
-- e pgTAP, mas impede que Edge Functions antigas continuem sendo portas
-- comerciais independentes. seller-device-flow é a única Edge autorizada a
-- alcançar o núcleo de ativação/renovação.

alter function public.apply_device_subscription_transaction(
  uuid,uuid,uuid,uuid,timestamptz,text,text,text,uuid,text,boolean
) rename to apply_device_subscription_transaction_legacy_core;

create or replace function public.apply_device_subscription_transaction(
  p_seller_id uuid,
  p_device_id uuid,
  p_plan_id uuid,
  p_playlist_id uuid,
  p_expires_at timestamptz,
  p_operation_type text,
  p_performed_by text,
  p_idempotency_key text,
  p_customer_id uuid default null,
  p_client_name text default null,
  p_enforce_seller_ownership boolean default true
)
returns table(
  applied boolean,
  ledger_id uuid,
  balance_before integer,
  balance_after integer,
  device_status text,
  subscription_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_role text := coalesce(
    pg_catalog.current_setting('request.jwt.claim.role', true),
    nullif((coalesce(pg_catalog.current_setting('request.jwt.claims', true), '{}'))::jsonb ->> 'role', ''),
    ''
  );
begin
  if v_request_role = 'service_role'
     and coalesce(p_performed_by, '') not like 'seller-device-flow:%' then
    raise exception using errcode = 'P0001',
      message = 'Operação comercial antiga desativada. Use seller-device-flow.';
  end if;

  return query
  select * from public.apply_device_subscription_transaction_legacy_core(
    p_seller_id,
    p_device_id,
    p_plan_id,
    p_playlist_id,
    p_expires_at,
    p_operation_type,
    p_performed_by,
    p_idempotency_key,
    p_customer_id,
    p_client_name,
    p_enforce_seller_ownership
  );
end;
$$;

revoke all on function public.apply_device_subscription_transaction(
  uuid,uuid,uuid,uuid,timestamptz,text,text,text,uuid,text,boolean
) from public, anon, authenticated;
grant execute on function public.apply_device_subscription_transaction(
  uuid,uuid,uuid,uuid,timestamptz,text,text,text,uuid,text,boolean
) to service_role;
revoke all on function public.apply_device_subscription_transaction_legacy_core(
  uuid,uuid,uuid,uuid,timestamptz,text,text,text,uuid,text,boolean
) from public, anon, authenticated;
grant execute on function public.apply_device_subscription_transaction_legacy_core(
  uuid,uuid,uuid,uuid,timestamptz,text,text,text,uuid,text,boolean
) to service_role;

alter function public.change_device_playlists_transaction(
  uuid,uuid,uuid,uuid,text,text,text
) rename to change_device_playlists_transaction_legacy_core;

create or replace function public.change_device_playlists_transaction(
  p_seller_id uuid,
  p_device_id uuid,
  p_primary_playlist_id uuid,
  p_backup_playlist_id uuid,
  p_reason text,
  p_performed_by text,
  p_idempotency_key text
)
returns table(
  applied boolean,
  primary_playlist_id uuid,
  backup_playlist_id uuid,
  confirmation_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_role text := coalesce(
    pg_catalog.current_setting('request.jwt.claim.role', true),
    nullif((coalesce(pg_catalog.current_setting('request.jwt.claims', true), '{}'))::jsonb ->> 'role', ''),
    ''
  );
begin
  if v_request_role = 'service_role' then
    raise exception using errcode = 'P0001',
      message = 'Troca comercial antiga desativada. Use seller-device-flow.';
  end if;

  return query
  select * from public.change_device_playlists_transaction_legacy_core(
    p_seller_id,
    p_device_id,
    p_primary_playlist_id,
    p_backup_playlist_id,
    p_reason,
    p_performed_by,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.change_device_playlists_transaction(
  uuid,uuid,uuid,uuid,text,text,text
) from public, anon, authenticated;
grant execute on function public.change_device_playlists_transaction(
  uuid,uuid,uuid,uuid,text,text,text
) to service_role;
revoke all on function public.change_device_playlists_transaction_legacy_core(
  uuid,uuid,uuid,uuid,text,text,text
) from public, anon, authenticated;
grant execute on function public.change_device_playlists_transaction_legacy_core(
  uuid,uuid,uuid,uuid,text,text,text
) to service_role;

-- O editor avulso de aparelho permanece executável dentro do banco para testes
-- e compatibilidade histórica, mas não por uma Edge Function antiga.
alter function public.replace_device_playlist_transaction(
  uuid,smallint,uuid,text,text,uuid,text
) rename to replace_device_playlist_transaction_legacy_core;

create or replace function public.replace_device_playlist_transaction(
  p_device_id uuid,
  p_priority smallint,
  p_candidate_playlist_id uuid,
  p_reason text,
  p_performed_by text,
  p_performed_by_user_id uuid,
  p_idempotency_key text
)
returns table(
  applied boolean,
  old_playlist_id uuid,
  new_playlist_id uuid,
  playlist_priority smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_role text := coalesce(
    pg_catalog.current_setting('request.jwt.claim.role', true),
    nullif((coalesce(pg_catalog.current_setting('request.jwt.claims', true), '{}'))::jsonb ->> 'role', ''),
    ''
  );
begin
  if v_request_role = 'service_role' then
    raise exception using errcode = 'P0001',
      message = 'Edição comercial antiga de lista desativada. Use seller-device-flow.';
  end if;

  return query
  select * from public.replace_device_playlist_transaction_legacy_core(
    p_device_id,
    p_priority,
    p_candidate_playlist_id,
    p_reason,
    p_performed_by,
    p_performed_by_user_id,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.replace_device_playlist_transaction(
  uuid,smallint,uuid,text,text,uuid,text
) from public, anon, authenticated;
grant execute on function public.replace_device_playlist_transaction(
  uuid,smallint,uuid,text,text,uuid,text
) to service_role;
revoke all on function public.replace_device_playlist_transaction_legacy_core(
  uuid,smallint,uuid,text,text,uuid,text
) from public, anon, authenticated;
grant execute on function public.replace_device_playlist_transaction_legacy_core(
  uuid,smallint,uuid,text,text,uuid,text
) to service_role;

-- O domínio de assinaturas pode não existir em instalações antigas, por isso a
-- proteção equivalente é criada condicionalmente.
do $guard$
begin
  if to_regprocedure('public.replace_subscription_playlist_transaction(uuid,smallint,uuid,text,text,uuid,text)') is not null then
    alter function public.replace_subscription_playlist_transaction(
      uuid,smallint,uuid,text,text,uuid,text
    ) rename to replace_subscription_playlist_transaction_legacy_core;
  end if;
end;
$guard$;

do $guard$
begin
  if to_regprocedure('public.replace_subscription_playlist_transaction_legacy_core(uuid,smallint,uuid,text,text,uuid,text)') is not null then
    execute $ddl$
      create function public.replace_subscription_playlist_transaction(
        p_subscription_id uuid,
        p_priority smallint,
        p_candidate_playlist_id uuid,
        p_reason text,
        p_performed_by text,
        p_performed_by_user_id uuid,
        p_idempotency_key text
      )
      returns table(
        applied boolean,
        old_playlist_id uuid,
        new_playlist_id uuid,
        priority smallint,
        active_devices integer
      )
      language plpgsql
      security definer
      set search_path = ''
      as $function$
      declare
        v_request_role text := coalesce(
          pg_catalog.current_setting('request.jwt.claim.role', true),
          nullif((coalesce(pg_catalog.current_setting('request.jwt.claims', true), '{}'))::jsonb ->> 'role', ''),
          ''
        );
      begin
        if v_request_role = 'service_role' then
          raise exception using errcode = 'P0001',
            message = 'Edição comercial antiga de assinatura desativada. Use seller-device-flow.';
        end if;

        return query
        select * from public.replace_subscription_playlist_transaction_legacy_core(
          p_subscription_id,
          p_priority,
          p_candidate_playlist_id,
          p_reason,
          p_performed_by,
          p_performed_by_user_id,
          p_idempotency_key
        );
      end;
      $function$;
    $ddl$;

    execute 'revoke all on function public.replace_subscription_playlist_transaction(uuid,smallint,uuid,text,text,uuid,text) from public, anon, authenticated';
    execute 'grant execute on function public.replace_subscription_playlist_transaction(uuid,smallint,uuid,text,text,uuid,text) to service_role';
    execute 'revoke all on function public.replace_subscription_playlist_transaction_legacy_core(uuid,smallint,uuid,text,text,uuid,text) from public, anon, authenticated';
    execute 'grant execute on function public.replace_subscription_playlist_transaction_legacy_core(uuid,smallint,uuid,text,text,uuid,text) to service_role';
  end if;
end;
$guard$;
