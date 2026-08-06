-- Permite ativação provisória em Android e separa a troca de listas da renovação.
create or replace function public.assert_playlist_commercially_usable_for_device(
  p_playlist_id uuid,
  p_device_id uuid,
  p_label text default 'Lista'
)
returns void language plpgsql security definer set search_path to '' as $$
declare
  v_playlist public.panel_playlists%rowtype;
  v_device_type text;
  v_label text := coalesce(nullif(trim(p_label), ''), 'Lista');
begin
  select p.* into v_playlist from public.panel_playlists p where p.id=p_playlist_id;
  if not found or v_playlist.active is not true then
    raise exception using errcode='P0001',message=v_label || ' não existe ou está inativa.';
  end if;
  select lower(coalesce(d.device_type,'')) into v_device_type
    from public.panel_devices d where d.id=p_device_id;
  if not found then raise exception using errcode='P0002',message='Aparelho não encontrado.'; end if;

  if v_playlist.playlist_qualification_status in ('ready_cache','ready_direct') then
    if v_playlist.playlist_qualification_status='ready_direct'
       and v_device_type not in ('android','androidtv') then
      raise exception using errcode='P0001',message=v_label || ' usa acesso direto disponível somente para Android.';
    end if;
    return;
  end if;
  if v_device_type in ('android','androidtv')
     and v_playlist.playlist_qualification_status in ('validating','awaiting_device_test','retryable_error') then
    return;
  end if;
  raise exception using errcode='P0001',message=v_label || ' está bloqueada ou não pode ser confirmada neste aparelho.';
end;$$;

create or replace function public.enforce_device_primary_playlist_qualification()
returns trigger language plpgsql set search_path to '' as $$
declare v_check boolean:=false;
begin
  if new.status<>'active' or new.playlist_id is null then return new; end if;
  if tg_op='INSERT' then v_check:=true;
  else v_check:=old.status is distinct from new.status
    or old.playlist_id is distinct from new.playlist_id
    or (new.subscription_expires_at is not null and (old.subscription_expires_at is null or new.subscription_expires_at>old.subscription_expires_at));
  end if;
  if v_check then perform public.assert_playlist_commercially_usable_for_device(new.playlist_id,new.id,'Lista principal'); end if;
  return new;
end;$$;

create or replace function public.enforce_device_assignment_playlist_qualification()
returns trigger language plpgsql set search_path to '' as $$
begin
  if new.active is true and (tg_op='INSERT' or old.active is distinct from new.active or old.playlist_id is distinct from new.playlist_id) then
    perform public.assert_playlist_commercially_usable_for_device(new.playlist_id,new.device_id,case when new.priority=2 then 'Lista reserva' else 'Lista principal' end);
  end if;
  return new;
end;$$;

create or replace function public.change_device_playlists_transaction(
  p_seller_id uuid,
  p_device_id uuid,
  p_primary_playlist_id uuid,
  p_backup_playlist_id uuid,
  p_reason text,
  p_performed_by text,
  p_idempotency_key text
)
returns table(applied boolean,primary_playlist_id uuid,backup_playlist_id uuid,confirmation_status text)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_device public.panel_devices%rowtype;
  v_existing public.panel_device_playlist_operations%rowtype;
  v_fingerprint text;
  v_primary_status text;
  v_backup_status text;
  v_old_primary uuid;
  v_old_backup uuid;
begin
  if p_seller_id is null or p_device_id is null or p_primary_playlist_id is null then raise exception using errcode='22023',message='Vendedor, aparelho e lista principal são obrigatórios.'; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then raise exception using errcode='22023',message='Chave de idempotência é obrigatória.'; end if;
  if p_backup_playlist_id=p_primary_playlist_id then raise exception using errcode='22023',message='A lista reserva deve ser diferente da principal.'; end if;
  select d.* into v_device from public.panel_devices d where d.id=p_device_id for update;
  if not found then raise exception using errcode='P0002',message='Aparelho não encontrado.'; end if;
  if v_device.seller_id<>p_seller_id then raise exception using errcode='P0001',message='Este aparelho não pertence ao vendedor.'; end if;
  if v_device.status in ('blocked','inactive') then raise exception using errcode='P0001',message='O aparelho precisa estar ativo ou pendente para trocar as listas.'; end if;
  if not exists(select 1 from public.panel_seller_playlists s where s.seller_id=p_seller_id and s.playlist_id=p_primary_playlist_id and s.active=true) then raise exception using errcode='P0001',message='Lista principal não liberada para este vendedor.'; end if;
  if p_backup_playlist_id is not null and not exists(select 1 from public.panel_seller_playlists s where s.seller_id=p_seller_id and s.playlist_id=p_backup_playlist_id and s.active=true) then raise exception using errcode='P0001',message='Lista reserva não liberada para este vendedor.'; end if;
  perform public.assert_playlist_commercially_usable_for_device(p_primary_playlist_id,p_device_id,'Lista principal');
  if p_backup_playlist_id is not null then perform public.assert_playlist_commercially_usable_for_device(p_backup_playlist_id,p_device_id,'Lista reserva'); end if;

  v_fingerprint:=concat_ws('|','change-device-playlists-v1',p_device_id,p_primary_playlist_id,p_backup_playlist_id);
  select o.* into v_existing from public.panel_device_playlist_operations o where o.seller_id=p_seller_id and o.idempotency_key=p_idempotency_key limit 1;
  if found then
    if v_existing.operation_fingerprint<>v_fingerprint then raise exception using errcode='23505',message='Chave de idempotência usada em outra operação.'; end if;
    return query select false,p_primary_playlist_id,p_backup_playlist_id,coalesce(v_existing.result->>'confirmation_status','awaiting_app_confirmation'); return;
  end if;

  select playlist_id into v_old_primary from public.panel_device_playlists where device_id=p_device_id and priority=1;
  select playlist_id into v_old_backup from public.panel_device_playlists where device_id=p_device_id and priority=2;
  update public.panel_devices set playlist_id=p_primary_playlist_id,updated_at=now() where id=p_device_id;
  insert into public.panel_device_playlists(device_id,playlist_id,priority,active,consecutive_failures,last_success_at,last_failure_at,cooldown_until,last_error,updated_at)
  values(p_device_id,p_primary_playlist_id,1,true,0,null,null,null,null,now())
  on conflict on constraint panel_device_playlists_device_id_priority_key do update set playlist_id=excluded.playlist_id,active=true,consecutive_failures=0,last_success_at=null,last_failure_at=null,cooldown_until=null,last_error=null,updated_at=now();
  if p_backup_playlist_id is null then delete from public.panel_device_playlists where device_id=p_device_id and priority=2;
  else insert into public.panel_device_playlists(device_id,playlist_id,priority,active,consecutive_failures,last_success_at,last_failure_at,cooldown_until,last_error,updated_at)
    values(p_device_id,p_backup_playlist_id,2,true,0,null,null,null,null,now())
    on conflict on constraint panel_device_playlists_device_id_priority_key do update set playlist_id=excluded.playlist_id,active=true,consecutive_failures=0,last_success_at=null,last_failure_at=null,cooldown_until=null,last_error=null,updated_at=now(); end if;

  select playlist_qualification_status into v_primary_status from public.panel_playlists where id=p_primary_playlist_id;
  if p_backup_playlist_id is not null then select playlist_qualification_status into v_backup_status from public.panel_playlists where id=p_backup_playlist_id; end if;
  insert into public.panel_device_playlist_operations(seller_id,device_id,operation_type,idempotency_key,operation_fingerprint,result,performed_by)
  values(p_seller_id,p_device_id,'change_playlists',p_idempotency_key,v_fingerprint,jsonb_build_object('primary_playlist_id',p_primary_playlist_id,'backup_playlist_id',p_backup_playlist_id,'confirmation_status',case when v_primary_status in ('ready_cache','ready_direct') and coalesce(v_backup_status,'ready_cache') in ('ready_cache','ready_direct') then 'confirmed' else 'awaiting_app_confirmation' end),p_performed_by);
  insert into public.panel_audit_logs(action,entity_type,entity_id,description,metadata) values('device.playlists_changed_without_renewal','device',p_device_id,'Listas alteradas sem renovar validade e sem consumir crédito.',jsonb_build_object('oldPrimaryPlaylistId',v_old_primary,'newPrimaryPlaylistId',p_primary_playlist_id,'oldBackupPlaylistId',v_old_backup,'newBackupPlaylistId',p_backup_playlist_id));
  return query select true,p_primary_playlist_id,p_backup_playlist_id,case when v_primary_status in ('ready_cache','ready_direct') and coalesce(v_backup_status,'ready_cache') in ('ready_cache','ready_direct') then 'confirmed'::text else 'awaiting_app_confirmation'::text end;
end;$$;

revoke all on function public.change_device_playlists_transaction(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.change_device_playlists_transaction(uuid,uuid,uuid,uuid,text,text,text) to service_role;
