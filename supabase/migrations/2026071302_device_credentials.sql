alter table public.panel_devices
  add column if not exists device_credential_hash text,
  add column if not exists credential_issued_at timestamptz,
  add column if not exists credential_rotated_at timestamptz;

create unique index if not exists panel_devices_device_credential_hash_uidx
  on public.panel_devices(device_credential_hash)
  where device_credential_hash is not null;

comment on column public.panel_devices.device_credential_hash is
  'SHA-256 hexadecimal da credencial secreta emitida para a instalação. O segredo original nunca é armazenado.';

comment on column public.panel_devices.credential_issued_at is
  'Momento em que a primeira credencial secreta da instalação foi emitida.';

comment on column public.panel_devices.credential_rotated_at is
  'Momento da última rotação administrativa da credencial da instalação.';

create or replace function public.clear_device_credential(
  p_device_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.panel_devices
     set device_credential_hash = null,
         credential_issued_at = null,
         credential_rotated_at = now(),
         updated_at = now()
   where id = p_device_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Aparelho não encontrado.';
  end if;
end;
$$;

revoke all on function public.clear_device_credential(uuid)
  from public, anon, authenticated;

grant execute on function public.clear_device_credential(uuid)
  to service_role;

comment on function public.clear_device_credential(uuid) is
  'Revoga a credencial da instalação. O aparelho emitirá uma nova credencial no próximo fluxo autorizado de ativação.';
