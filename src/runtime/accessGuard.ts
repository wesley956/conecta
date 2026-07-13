import { useAppStore } from '@/stores/appStore';
import { isDevicePanelEnabled } from '@/utils/devicePanel';

function isExplicitDevelopmentDemoEnabled() {
  return import.meta.env.DEV &&
    String(import.meta.env.VITE_ALLOW_UNSAFE_DEMO_MODE ?? '').toLowerCase() === 'true';
}

/**
 * Mantém builds distribuíveis em modo fail-closed.
 *
 * O aplicativo só pode iniciar liberado sem painel durante desenvolvimento local
 * e quando VITE_ALLOW_UNSAFE_DEMO_MODE=true for configurado explicitamente.
 */
export function enforceSecureInitialAccessState() {
  if (isDevicePanelEnabled() || isExplicitDevelopmentDemoEnabled()) {
    return;
  }

  useAppStore.setState({
    deviceActivated: false,
    subscriptionActive: false,
    expiresAt: '',
    daysRemaining: 0,
    activeNotice: 'Painel de ativação não configurado neste build.',
  });
}

enforceSecureInitialAccessState();
