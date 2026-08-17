import { useCallback, useEffect, useState } from 'react';
import {
  fetchSession,
  login as loginRequest,
  logout as logoutRequest,
  readStoredRefreshToken,
  refreshSession,
  storeRefreshToken,
} from './api';
import { clearLocalLibrary } from './library';
import { clearPwaPrivateState } from './pwa';
import type { SessionInfo } from './types';

type AuthState = {
  booting: boolean;
  accessToken: string | null;
  session: SessionInfo | null;
  error: string | null;
};

const initialState: AuthState = { booting: true, accessToken: null, session: null, error: null };

function clearPrivateClientState() {
  storeRefreshToken(null);
  clearLocalLibrary();
  clearPwaPrivateState();
}

export function useWebAuth() {
  const [state, setState] = useState<AuthState>(initialState);

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = readStoredRefreshToken();
      if (!stored) {
        if (active) setState(current => ({ ...current, booting: false }));
        return;
      }
      try {
        const refreshed = await refreshSession(stored);
        if (!active || !refreshed) return;
        const session = await fetchSession(refreshed.accessToken);
        if (active) setState({ booting: false, accessToken: refreshed.accessToken, session, error: null });
      } catch {
        clearPrivateClientState();
        if (active) setState({ booting: false, accessToken: null, session: null, error: null });
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onInvalid = () => {
      clearPrivateClientState();
      setState({
        booting: false,
        accessToken: null,
        session: null,
        error: 'Sua sessão terminou ou o aparelho deixou de estar autorizado. Entre novamente.',
      });
    };
    window.addEventListener('roneca:web-session-invalid', onInvalid);
    return () => window.removeEventListener('roneca:web-session-invalid', onInvalid);
  }, []);

  const login = useCallback(async (deviceCode: string, pin: string) => {
    setState(current => ({ ...current, error: null }));
    try {
      const result = await loginRequest(deviceCode, pin);
      const session = await fetchSession(result.accessToken);
      setState({ booting: false, accessToken: result.accessToken, session, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível entrar.';
      setState(current => ({ ...current, error: message }));
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    const token = state.accessToken;
    clearPrivateClientState();
    setState({ booting: false, accessToken: null, session: null, error: null });
    await logoutRequest(token).catch(() => undefined);
  }, [state.accessToken]);

  const invalidate = useCallback(() => {
    clearPrivateClientState();
    setState({ booting: false, accessToken: null, session: null, error: null });
  }, []);

  return { ...state, login, logout, invalidate };
}
