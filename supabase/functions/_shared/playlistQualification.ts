export type PlaylistQualificationStatus =
  | 'validating'
  | 'ready_cache'
  | 'awaiting_device_test'
  | 'ready_direct'
  | 'retryable_error'
  | 'blocked';

export type PlaylistLifecycleStatus =
  | 'saving'
  | 'generating_cache'
  | 'ready_cache'
  | 'awaiting_device_confirmation'
  | 'confirmed_by_device'
  | 'device_failed'
  | 'blocked'
  | 'archived';

export type PlaylistPlatformStatus = 'available' | 'provisional' | 'available_by_cache' | 'unavailable' | 'blocked';

export type PlaylistPlatformCapabilities = {
  android: PlaylistPlatformStatus;
  lg: PlaylistPlatformStatus;
  samsung: PlaylistPlatformStatus;
};

export type PlaylistCommercialDecision = {
  status: PlaylistQualificationStatus;
  lifecycleStatus: PlaylistLifecycleStatus;
  commerciallyUsable: boolean;
  androidActivationAllowed: boolean;
  label: string;
  message: string;
  recommendedAction: 'wait' | 'activate' | 'activate_on_android' | 'review_or_retry' | 'retry_cache' | 'edit_source' | 'none';
  canRetryCache: boolean;
  requiresDeviceTest: boolean;
  adminDiagnosticRecommended: boolean;
  platformCapabilities: PlaylistPlatformCapabilities;
  qualifiedAt: string | null;
  directConfirmedAt: string | null;
};

export const PLAYLIST_QUALIFICATION_FIELDS = `
  playlist_qualification_status,
  playlist_qualification_code,
  playlist_qualification_message,
  playlist_qualification_updated_at,
  playlist_qualified_at,
  playlist_direct_confirmed_at,
  playlist_direct_confirmed_device_id,
  archived_at
`;

const allowedStatuses = new Set<PlaylistQualificationStatus>([
  'validating',
  'ready_cache',
  'awaiting_device_test',
  'ready_direct',
  'retryable_error',
  'blocked',
]);

function statusOf(value: unknown): PlaylistQualificationStatus {
  const status = String(value ?? '').trim() as PlaylistQualificationStatus;
  return allowedStatuses.has(status) ? status : 'validating';
}

function cacheReady(row: Record<string, unknown>) {
  return String(row.playlist_cache_status || '') === 'ready'
    && Number(row.playlist_cache_item_count || 0) > 0;
}

function archived(row: Record<string, unknown>) {
  return Boolean(row.archived_at) || row.active === false;
}

function lifecycleOf(row: Record<string, unknown>): PlaylistLifecycleStatus {
  const status = statusOf(row.playlist_qualification_status);
  const code = String(row.playlist_qualification_code || '');
  const cacheStatus = String(row.playlist_cache_status || 'missing');
  if (archived(row)) return 'archived';
  if (status === 'blocked') return 'blocked';
  if (cacheReady(row) || status === 'ready_cache') return 'ready_cache';
  if (status === 'ready_direct' && row.playlist_direct_confirmed_at) return 'confirmed_by_device';
  if (code === 'DEVICE_TEST_FAILED') return 'device_failed';
  if (status === 'awaiting_device_test' || status === 'retryable_error') return 'awaiting_device_confirmation';
  if (status === 'validating' && cacheStatus === 'missing') return 'saving';
  return 'generating_cache';
}

function platformCapabilities(row: Record<string, unknown>, lifecycle: PlaylistLifecycleStatus): PlaylistPlatformCapabilities {
  if (lifecycle === 'archived' || lifecycle === 'blocked' || lifecycle === 'device_failed') {
    return { android: 'blocked', lg: 'unavailable', samsung: 'unavailable' };
  }
  const hasCache = cacheReady(row) || lifecycle === 'ready_cache';
  return {
    android: lifecycle === 'ready_cache' || lifecycle === 'confirmed_by_device' ? 'available' : 'provisional',
    lg: hasCache ? 'available_by_cache' : 'unavailable',
    samsung: hasCache ? 'available_by_cache' : 'unavailable',
  };
}

function presentation(lifecycle: PlaylistLifecycleStatus, row: Record<string, unknown>) {
  switch (lifecycle) {
    case 'ready_cache':
      return {
        label: 'Pronta com cache',
        message: 'O cache foi gerado e a lista está pronta nas plataformas compatíveis.',
        recommendedAction: 'activate' as const,
      };
    case 'awaiting_device_confirmation':
      return {
        label: 'Aguardando confirmação no aparelho',
        message: 'O servidor não conseguiu confirmar a origem. No Android, ela pode ser ativada provisoriamente e o próprio aparelho confirmará o resultado.',
        recommendedAction: 'activate_on_android' as const,
      };
    case 'confirmed_by_device':
      return {
        label: 'Confirmada pelo aparelho',
        message: 'Um aparelho Android abriu o conteúdo e confirmou esta lista.',
        recommendedAction: 'activate' as const,
      };
    case 'device_failed':
      return {
        label: 'Falhou no aparelho',
        message: 'O aparelho tentou esta lista e não conseguiu confirmar o acesso. Revise os dados ou tente novamente antes de uma nova ativação.',
        recommendedAction: 'review_or_retry' as const,
      };
    case 'blocked':
      return {
        label: 'Bloqueada',
        message: String(row.playlist_qualification_message || 'A origem foi bloqueada e precisa ser corrigida antes de uma nova ativação.'),
        recommendedAction: 'edit_source' as const,
      };
    case 'archived':
      return {
        label: 'Arquivada',
        message: 'A lista foi arquivada e não aparece em novas ativações.',
        recommendedAction: 'none' as const,
      };
    case 'saving':
      return {
        label: 'Salvando',
        message: 'O cadastro da lista ainda está sendo processado.',
        recommendedAction: 'wait' as const,
      };
    default:
      return {
        label: 'Gerando cache',
        message: 'O servidor está tentando autenticar a origem e gerar o cache.',
        recommendedAction: 'wait' as const,
      };
  }
}

export function mapPlaylistCommercialDecision(row: Record<string, unknown>): PlaylistCommercialDecision {
  const status = statusOf(row.playlist_qualification_status);
  const lifecycleStatus = lifecycleOf(row);
  const defaults = presentation(lifecycleStatus, row);
  const platforms = platformCapabilities(row, lifecycleStatus);
  const adminDiagnosticRecommended = lifecycleStatus === 'awaiting_device_confirmation'
    || lifecycleStatus === 'device_failed';
  return {
    status,
    lifecycleStatus,
    commerciallyUsable: !archived(row) && (lifecycleStatus === 'ready_cache' || lifecycleStatus === 'confirmed_by_device'),
    androidActivationAllowed: platforms.android === 'available' || platforms.android === 'provisional',
    label: defaults.label,
    message: defaults.message.slice(0, 500),
    recommendedAction: defaults.recommendedAction,
    canRetryCache: status === 'validating' || status === 'retryable_error' || lifecycleStatus === 'device_failed',
    requiresDeviceTest: adminDiagnosticRecommended,
    adminDiagnosticRecommended,
    platformCapabilities: platforms,
    qualifiedAt: row.playlist_qualified_at ? String(row.playlist_qualified_at) : null,
    directConfirmedAt: row.playlist_direct_confirmed_at ? String(row.playlist_direct_confirmed_at) : null,
  };
}

export function playlistQualificationPayload(row: Record<string, unknown>) {
  const decision = mapPlaylistCommercialDecision(row);
  return {
    qualificationStatus: decision.status,
    lifecycleStatus: decision.lifecycleStatus,
    commerciallyUsable: decision.commerciallyUsable,
    androidActivationAllowed: decision.androidActivationAllowed,
    qualificationLabel: decision.label,
    lifecycleLabel: decision.label,
    qualificationMessage: decision.message,
    lifecycleMessage: decision.message,
    recommendedAction: decision.recommendedAction,
    canRetryCache: decision.canRetryCache,
    requiresDeviceTest: decision.requiresDeviceTest,
    adminDiagnosticRecommended: decision.adminDiagnosticRecommended,
    platformCapabilities: decision.platformCapabilities,
    qualifiedAt: decision.qualifiedAt,
    directConfirmedAt: decision.directConfirmedAt,
  };
}

export async function getPlaylistCommercialDecision(
  supabase: any,
  playlistId: string,
): Promise<PlaylistCommercialDecision> {
  const { data, error } = await supabase.rpc('get_playlist_lifecycle_decision', {
    p_playlist_id: playlistId,
  });
  if (error) throw new Error('Não foi possível consultar o estado da lista.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Lista não encontrada.');

  const lifecycleStatus = String(row.lifecycle_status || 'generating_cache') as PlaylistLifecycleStatus;
  const status = statusOf(row.technical_status);
  const platforms: PlaylistPlatformCapabilities = {
    android: String(row.android_status || 'blocked') as PlaylistPlatformStatus,
    lg: String(row.lg_status || 'unavailable') as PlaylistPlatformStatus,
    samsung: String(row.samsung_status || 'unavailable') as PlaylistPlatformStatus,
  };
  return {
    status,
    lifecycleStatus,
    commerciallyUsable: row.cache_ready === true || row.confirmed_by_device === true,
    androidActivationAllowed: platforms.android === 'available' || platforms.android === 'provisional',
    label: String(row.lifecycle_label || 'Gerando cache'),
    message: String(row.lifecycle_message || 'O servidor está processando esta lista.').slice(0, 500),
    recommendedAction: String(row.recommended_action || 'wait') as PlaylistCommercialDecision['recommendedAction'],
    canRetryCache: row.can_retry_cache === true,
    requiresDeviceTest: row.admin_diagnostic_recommended === true,
    adminDiagnosticRecommended: row.admin_diagnostic_recommended === true,
    platformCapabilities: platforms,
    qualifiedAt: null,
    directConfirmedAt: null,
  };
}

export async function requireCommerciallyUsablePlaylist(
  supabase: any,
  playlistId: string,
  label = 'Lista',
) {
  const decision = await getPlaylistCommercialDecision(supabase, playlistId);
  if (!decision.commerciallyUsable) {
    throw new Error(`${label} ainda não foi confirmada para este fluxo. ${decision.message}`);
  }
  return decision;
}
