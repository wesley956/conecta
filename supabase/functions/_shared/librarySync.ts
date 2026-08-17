import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export type LibraryContentType = 'channel' | 'movie' | 'series' | 'episode';

export function validContentKey(value: unknown) {
  const result = String(value || '').trim();
  if (result.length < 3 || result.length > 500) return null;
  if (!/^(channel|movie|series|episode):[a-z0-9:-]+$/.test(result)) return null;
  return result;
}

export function validContentType(value: unknown): LibraryContentType | null {
  const type = String(value || '');
  return ['channel','movie','series','episode'].includes(type) ? type as LibraryContentType : null;
}

export async function librarySnapshot(supabase: SupabaseClient, scopeKey: string) {
  const [favoritesResult, progressResult, preferencesResult] = await Promise.all([
    supabase.from('web_player_library_favorites')
      .select('content_key, content_type, active, version, updated_at')
      .eq('scope_key', scopeKey)
      .eq('active', true)
      .order('updated_at', { ascending: false })
      .limit(500),
    supabase.from('web_player_library_progress')
      .select('content_key, content_type, position_ms, duration_ms, completed, version, updated_at')
      .eq('scope_key', scopeKey)
      .eq('completed', false)
      .order('updated_at', { ascending: false })
      .limit(200),
    supabase.from('web_player_library_preferences')
      .select('aspect_mode, language, subtitle_language, version, updated_at')
      .eq('scope_key', scopeKey)
      .maybeSingle(),
  ]);

  if (favoritesResult.error || progressResult.error || preferencesResult.error) {
    throw new Error('LIBRARY_SYNC_UNAVAILABLE');
  }

  return {
    favorites: (favoritesResult.data || []).map(row => ({
      contentKey: row.content_key,
      contentType: row.content_type,
      version: Number(row.version || 1),
      updatedAt: row.updated_at,
    })),
    progress: (progressResult.data || []).map(row => ({
      contentKey: row.content_key,
      contentType: row.content_type,
      positionMs: Number(row.position_ms || 0),
      durationMs: Number(row.duration_ms || 0),
      version: Number(row.version || 1),
      updatedAt: row.updated_at,
    })),
    preferences: preferencesResult.data ? {
      aspectMode: preferencesResult.data.aspect_mode || null,
      language: preferencesResult.data.language || null,
      subtitleLanguage: preferencesResult.data.subtitle_language || null,
      version: Number(preferencesResult.data.version || 1),
      updatedAt: preferencesResult.data.updated_at,
    } : null,
  };
}

export async function setFavorite(
  supabase: SupabaseClient,
  scopeKey: string,
  contentKey: string,
  contentType: LibraryContentType,
  active: boolean,
) {
  if (!['channel','movie','series'].includes(contentType)) throw new Error('LIBRARY_FAVORITE_TYPE_INVALID');
  const { data, error } = await supabase.rpc('web_player_set_favorite', {
    p_scope_key: scopeKey,
    p_content_key: contentKey,
    p_content_type: contentType,
    p_active: active,
  });
  if (error) throw new Error('LIBRARY_FAVORITE_WRITE_FAILED');
  const row = Array.isArray(data) ? data[0] : data;
  return {
    contentKey,
    active: Boolean(row?.active),
    version: Number(row?.version || 1),
    updatedAt: row?.updated_at || new Date().toISOString(),
  };
}

export async function setProgress(
  supabase: SupabaseClient,
  scopeKey: string,
  contentKey: string,
  contentType: LibraryContentType,
  positionMs: number,
  durationMs: number,
) {
  if (!['movie','episode'].includes(contentType)) throw new Error('LIBRARY_PROGRESS_TYPE_INVALID');
  if (!Number.isFinite(positionMs) || !Number.isFinite(durationMs) || durationMs <= 0 || positionMs < 0) {
    throw new Error('LIBRARY_PROGRESS_INVALID');
  }
  const { data, error } = await supabase.rpc('web_player_set_progress', {
    p_scope_key: scopeKey,
    p_content_key: contentKey,
    p_content_type: contentType,
    p_position_ms: Math.round(positionMs),
    p_duration_ms: Math.round(durationMs),
  });
  if (error) throw new Error('LIBRARY_PROGRESS_WRITE_FAILED');
  const row = Array.isArray(data) ? data[0] : data;
  return {
    contentKey,
    positionMs: Number(row?.position_ms || 0),
    durationMs: Number(row?.duration_ms || durationMs),
    completed: Boolean(row?.completed),
    version: Number(row?.version || 1),
    updatedAt: row?.updated_at || new Date().toISOString(),
  };
}

export async function resetProgress(supabase: SupabaseClient, scopeKey: string, contentKey: string) {
  const { error } = await supabase.from('web_player_library_progress')
    .delete()
    .eq('scope_key', scopeKey)
    .eq('content_key', contentKey);
  if (error) throw new Error('LIBRARY_PROGRESS_RESET_FAILED');
  return { contentKey, reset: true };
}

export async function setPreferences(
  supabase: SupabaseClient,
  scopeKey: string,
  value: { aspectMode?: unknown; language?: unknown; subtitleLanguage?: unknown },
) {
  const aspectMode = value.aspectMode == null ? null : String(value.aspectMode);
  if (aspectMode && !['contain','cover','fill'].includes(aspectMode)) throw new Error('LIBRARY_PREFERENCES_INVALID');
  const language = value.language == null ? null : String(value.language).trim().slice(0, 40) || null;
  const subtitleLanguage = value.subtitleLanguage == null ? null : String(value.subtitleLanguage).trim().slice(0, 40) || null;

  const { data: current } = await supabase.from('web_player_library_preferences')
    .select('version')
    .eq('scope_key', scopeKey)
    .maybeSingle();
  const { data, error } = await supabase.from('web_player_library_preferences').upsert({
    scope_key: scopeKey,
    aspect_mode: aspectMode,
    language,
    subtitle_language: subtitleLanguage,
    version: Number(current?.version || 0) + 1,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'scope_key' }).select('aspect_mode, language, subtitle_language, version, updated_at').single();
  if (error || !data) throw new Error('LIBRARY_PREFERENCES_WRITE_FAILED');
  return {
    aspectMode: data.aspect_mode,
    language: data.language,
    subtitleLanguage: data.subtitle_language,
    version: Number(data.version || 1),
    updatedAt: data.updated_at,
  };
}
