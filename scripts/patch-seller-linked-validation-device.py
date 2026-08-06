from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "admin-panel/playlist-commercial-qualification.js",
    """      return (result.devices || []).filter(device =>
        device.status === 'pending'
        && !device.sellerId
        && !device.customerId
        && !device.playlistId
        && !device.planId
      );""",
    """      return (result.devices || []).filter(device =>
        device.status === 'pending'
        && !device.customerId
        && !device.playlistId
        && !device.planId
      );""",
)

replace_once(
    "admin-panel/playlist-commercial-qualification.js",
    """${esc(device.deviceCode || device.id)}${device.clientName ? ` — ${esc(device.clientName)}` : ''}${device.marked ? ' — preparado' : ''}""",
    """${esc(device.deviceCode || device.id)}${device.clientName ? ` — ${esc(device.clientName)}` : ''}${device.sellerId ? ' — vendedor vinculado' : ''}${device.marked ? ' — preparado' : ''}""",
)

replace_once(
    "supabase/functions/playlist-validation/index.ts",
    """async function requireDedicatedValidationDevice(supabase: any, deviceId: string) {""",
    """async function requireDedicatedValidationDevice(
  supabase: any,
  deviceId: string,
  playlistId: string | null = null,
) {""",
)

replace_once(
    "supabase/functions/playlist-validation/index.ts",
    """  if (data.status !== 'pending'
      || data.seller_id
      || data.customer_id
      || data.playlist_id
      || data.plan_id
      || data.subscription_expires_at) {
    throw new Error('Use um aparelho pendente e sem qualquer vínculo comercial para a validação.');
  }""",
    """  if (data.status !== 'pending'
      || data.customer_id
      || data.playlist_id
      || data.plan_id
      || data.subscription_expires_at) {
    throw new Error('Use um aparelho pendente e sem cliente, plano, lista ou validade comercial para a validação.');
  }""",
)

replace_once(
    "supabase/functions/playlist-validation/index.ts",
    """  if (!['android', 'androidtv'].includes(String(data.device_type || '').toLowerCase())) {
    throw new Error('A homologação direta exige um aparelho Android nesta etapa.');
  }
  return data;""",
    """  if (!['android', 'androidtv'].includes(String(data.device_type || '').toLowerCase())) {
    throw new Error('A homologação direta exige um aparelho Android nesta etapa.');
  }
  if (playlistId && data.seller_id) {
    const { data: permission, error: permissionError } = await supabase
      .from('panel_seller_playlists')
      .select('id')
      .eq('seller_id', data.seller_id)
      .eq('playlist_id', playlistId)
      .eq('active', true)
      .maybeSingle();
    if (permissionError || !permission) {
      throw new Error('A lista não pertence ao vendedor vinculado ao aparelho.');
    }
  }
  return data;""",
)

replace_once(
    "supabase/functions/playlist-validation/index.ts",
    """      const playlistId = requiredUuid(body.playlistId, 'Lista');
      const deviceId = requiredUuid(body.deviceId, 'Aparelho');
      await requireDedicatedValidationDevice(supabase, deviceId);""",
    """      const playlistId = requiredUuid(body.playlistId, 'Lista');
      const deviceId = requiredUuid(body.deviceId, 'Aparelho');
      await requireDedicatedValidationDevice(supabase, deviceId, playlistId);""",
)
