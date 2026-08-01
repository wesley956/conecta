export type LabPlaylistAssignment = {
  playlist_id: string;
  priority: number;
  active: boolean;
  consecutive_failures: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  cooldown_until: string | null;
  last_error: string | null;
  playlist: Record<string, unknown>;
};

export type ActiveLabContext = {
  sessionId: string;
  sourceSubscriptionId: string;
  sourceDeviceId: string | null;
  expiresAt: string;
  reason: string;
  assignments: LabPlaylistAssignment[];
};

const PLAYLIST_SELECT = `
  id,
  name,
  playlist_url,
  playlist_type,
  active,
  playlist_updated_at,
  playlist_cache_status,
  playlist_cache_path,
  playlist_cache_manifest_path,
  playlist_cache_channels_path,
  playlist_cache_movies_path,
  playlist_cache_series_path,
  playlist_cache_version,
  playlist_cache_updated_at,
  playlist_cache_item_count,
  playlist_cache_size_bytes,
  playlist_cache_manifest_sha256,
  playlist_cache_manifest_size_bytes,
  playlist_cache_error
`;

function unwrap(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeAssignment(assignment: any): LabPlaylistAssignment | null {
  const playlist = unwrap(assignment?.playlist);
  if (!playlist || playlist.active === false) return null;
  return {
    playlist_id: assignment.playlist_id || playlist.id,
    priority: Number(assignment.priority || 1),
    active: assignment.active !== false,
    consecutive_failures: 0,
    last_success_at: null,
    last_failure_at: null,
    cooldown_until: null,
    last_error: null,
    playlist,
  };
}

async function expireSession(supabase: any, sessionId: string) {
  await supabase
    .from('panel_lab_sessions')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('status', 'active');
}

export async function resolveActiveLabSession(
  supabase: any,
  labDeviceId: string,
): Promise<ActiveLabContext | null> {
  const now = new Date();
  const { data: session, error } = await supabase
    .from('panel_lab_sessions')
    .select('id, source_subscription_id, source_device_id, lab_device_id, status, reason, expires_at')
    .eq('lab_device_id', labDeviceId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Falha ao consultar sessão de laboratório.', { code: error.code || null });
    return null;
  }
  if (!session) return null;

  const expiresAt = new Date(session.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
    await expireSession(supabase, session.id);
    return null;
  }

  const { data: subscriptionAssignments, error: subscriptionError } = await supabase
    .from('panel_subscription_playlists')
    .select(`
      playlist_id,
      priority,
      active,
      playlist:panel_playlists(${PLAYLIST_SELECT})
    `)
    .eq('subscription_id', session.source_subscription_id)
    .eq('active', true)
    .order('priority');

  if (subscriptionError) {
    console.error('Falha ao consultar listas da assinatura no laboratório.', {
      code: subscriptionError.code || null,
    });
  }

  let assignments = (subscriptionAssignments || [])
    .map(normalizeAssignment)
    .filter(Boolean) as LabPlaylistAssignment[];

  // Migração conservadora: assinaturas antigas com lista compartilhada continuam
  // na tabela legada e são acessadas somente pela sessão temporária do owner.
  if (!assignments.length && session.source_device_id) {
    const { data: legacyAssignments, error: legacyError } = await supabase
      .from('panel_device_playlists')
      .select(`
        playlist_id,
        priority,
        active,
        playlist:panel_playlists(${PLAYLIST_SELECT})
      `)
      .eq('device_id', session.source_device_id)
      .eq('active', true)
      .order('priority');

    if (legacyError) {
      console.error('Falha ao consultar lista antiga no laboratório.', {
        code: legacyError.code || null,
      });
    }

    assignments = (legacyAssignments || [])
      .map(normalizeAssignment)
      .filter(Boolean) as LabPlaylistAssignment[];

    if (!assignments.length) {
      const { data: sourceDevice } = await supabase
        .from('panel_devices')
        .select(`
          playlist_id,
          playlist:panel_playlists(${PLAYLIST_SELECT})
        `)
        .eq('id', session.source_device_id)
        .maybeSingle();
      const normalized = normalizeAssignment({
        playlist_id: sourceDevice?.playlist_id,
        priority: 1,
        active: true,
        playlist: sourceDevice?.playlist,
      });
      if (normalized) assignments = [normalized];
    }
  }

  return {
    sessionId: session.id,
    sourceSubscriptionId: session.source_subscription_id,
    sourceDeviceId: session.source_device_id || null,
    expiresAt: expiresAt.toISOString(),
    reason: String(session.reason || ''),
    assignments,
  };
}
