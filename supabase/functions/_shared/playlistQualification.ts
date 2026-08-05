export type PlaylistQualificationStatus =
  | 'validating'
  | 'ready_cache'
  | 'awaiting_device_test'
  | 'ready_direct'
  | 'retryable_error'
  | 'blocked';

export type PlaylistCommercialDecision = {
  status: PlaylistQualificationStatus;
  commerciallyUsable: boolean;
  label: string;
  message: string;
  recommendedAction: 'wait' | 'activate' | 'test_on_device' | 'retry_cache' | 'edit_source';
  canRetryCache: boolean;
  requiresDeviceTest: boolean;
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
  playlist_direct_confirmed_device_id
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

function fallback(status: PlaylistQualificationStatus) {
  switch (status) {
    case 'ready_cache':
      return {
        label: 'Cache pronto',
        message: 'A lista está pronta para ativação pelo cache protegido.',
        recommendedAction: 'activate' as const,
      };
    case 'awaiting_device_test':
      return {
        label: 'Aguardando teste no aparelho',
        message: 'O provedor exige uma confirmação real em aparelho antes da ativação.',
        recommendedAction: 'test_on_device' as const,
      };
    case 'ready_direct':
      return {
        label: 'Acesso direto homologado',
        message: 'A lista foi confirmada em aparelho e está pronta para ativação direta.',
        recommendedAction: 'activate' as const,
      };
    case 'retryable_error':
      return {
        label: 'Falha temporária',
        message: 'A validação foi interrompida e pode ser tentada novamente.',
        recommendedAction: 'retry_cache' as const,
      };
    case 'blocked':
      return {
        label: 'Lista bloqueada',
        message: 'A lista não está liberada para novas ativações.',
        recommendedAction: 'edit_source' as const,
      };
    default:
      return {
        label: 'Validando lista',
        message: 'A lista foi salva e está sendo validada.',
        recommendedAction: 'wait' as const,
      };
  }
}

export function mapPlaylistCommercialDecision(row: Record<string, unknown>): PlaylistCommercialDecision {
  const status = statusOf(row.playlist_qualification_status);
  const defaults = fallback(status);
  return {
    status,
    commerciallyUsable: row.active !== false && (status === 'ready_cache' || status === 'ready_direct'),
    label: defaults.label,
    message: String(row.playlist_qualification_message || defaults.message).slice(0, 500),
    recommendedAction: defaults.recommendedAction,
    canRetryCache: status === 'validating' || status === 'retryable_error',
    requiresDeviceTest: status === 'awaiting_device_test',
    qualifiedAt: row.playlist_qualified_at ? String(row.playlist_qualified_at) : null,
    directConfirmedAt: row.playlist_direct_confirmed_at
      ? String(row.playlist_direct_confirmed_at)
      : null,
  };
}

export function playlistQualificationPayload(row: Record<string, unknown>) {
  const decision = mapPlaylistCommercialDecision(row);
  return {
    qualificationStatus: decision.status,
    commerciallyUsable: decision.commerciallyUsable,
    qualificationLabel: decision.label,
    qualificationMessage: decision.message,
    recommendedAction: decision.recommendedAction,
    canRetryCache: decision.canRetryCache,
    requiresDeviceTest: decision.requiresDeviceTest,
    qualifiedAt: decision.qualifiedAt,
    directConfirmedAt: decision.directConfirmedAt,
  };
}

export async function getPlaylistCommercialDecision(
  supabase: any,
  playlistId: string,
): Promise<PlaylistCommercialDecision> {
  const { data, error } = await supabase.rpc('get_playlist_commercial_decision', {
    p_playlist_id: playlistId,
  });
  if (error) throw new Error('Não foi possível consultar a qualificação da lista.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Lista não encontrada.');
  return {
    status: statusOf(row.qualification_status),
    commerciallyUsable: row.commercially_usable === true,
    label: String(row.qualification_label || fallback(statusOf(row.qualification_status)).label),
    message: String(row.qualification_message || fallback(statusOf(row.qualification_status)).message).slice(0, 500),
    recommendedAction: String(
      row.recommended_action || fallback(statusOf(row.qualification_status)).recommendedAction,
    ) as PlaylistCommercialDecision['recommendedAction'],
    canRetryCache: row.can_retry_cache === true,
    requiresDeviceTest: row.requires_device_test === true,
    qualifiedAt: row.qualified_at ? String(row.qualified_at) : null,
    directConfirmedAt: row.direct_confirmed_at ? String(row.direct_confirmed_at) : null,
  };
}

export async function requireCommerciallyUsablePlaylist(
  supabase: any,
  playlistId: string,
  label = 'Lista',
) {
  const decision = await getPlaylistCommercialDecision(supabase, playlistId);
  if (!decision.commerciallyUsable) {
    throw new Error(`${label} ainda não está homologada. ${decision.message}`);
  }
  return decision;
}
