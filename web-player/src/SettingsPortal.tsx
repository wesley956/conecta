import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchLibrary, getActiveAccessToken, writePreferences } from './api';
import {
  applyPwaUpdate,
  getPwaUpdateSnapshot,
  subscribePwaUpdates,
  type PwaUpdateSnapshot,
} from './pwa';
import {
  patchLocalWebSettings,
  readLocalWebSettings,
  type LocalWebSettings,
  type ReducedMotionPreference,
} from './settingsModel';
import type { CanonicalPreferences } from './types';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const DEFAULT_CANONICAL: CanonicalPreferences = {
  aspectMode: 'contain',
  language: null,
  subtitleLanguage: null,
  version: 1,
  updatedAt: '',
};

export function SettingsPortal() {
  const [desktopHost, setDesktopHost] = useState<Element | null>(null);
  const [mobileHost, setMobileHost] = useState<Element | null>(null);
  const [open, setOpen] = useState(false);
  const [canonical, setCanonical] = useState<CanonicalPreferences>(DEFAULT_CANONICAL);
  const [local, setLocal] = useState<LocalWebSettings>(() => readLocalWebSettings());
  const [pwa, setPwa] = useState<PwaUpdateSnapshot>(() => getPwaUpdateSnapshot());
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const syncHosts = () => {
      setDesktopHost(document.querySelector('.nav-account'));
      setMobileHost(document.querySelector('.mobile-topbar'));
    };
    syncHosts();
    const observer = new MutationObserver(syncHosts);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribePwaUpdates(setPwa);
    return () => { unsubscribe(); };
  }, []);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const token = getActiveAccessToken();
    if (!token) return;
    setLoading(true);
    void fetchLibrary(token)
      .then(snapshot => {
        setCanonical(snapshot.preferences || DEFAULT_CANONICAL);
        setMessage(null);
      })
      .catch(() => setMessage('Não foi possível carregar todas as preferências agora.'))
      .finally(() => setLoading(false));
  }, [open]);

  const version = useMemo(() => import.meta.env.VITE_APP_VERSION || '0.2.0', []);

  const saveCanonical = async (patch: Partial<CanonicalPreferences>) => {
    const token = getActiveAccessToken();
    if (!token) {
      setMessage('Sua sessão terminou. Entre novamente para alterar preferências.');
      return;
    }
    setCanonical(current => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
    try {
      const result = await writePreferences(token, patch);
      setCanonical(result.preferences);
      setMessage('Preferência salva.');
    } catch {
      setMessage('Não foi possível salvar essa preferência agora.');
    }
  };

  const saveLocal = (patch: Partial<LocalWebSettings>) => {
    setLocal(current => patchLocalWebSettings(current, patch));
    setMessage('Preferência salva neste navegador.');
  };

  const requestInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setInstallPrompt(null);
  };

  const logout = () => {
    const button = document.querySelector<HTMLButtonElement>('.nav-account button:not(.settings-launcher)');
    setOpen(false);
    button?.click();
  };

  const launcher = (mobile = false) => (
    <button
      type="button"
      className={`settings-launcher ${mobile ? 'mobile' : ''}`}
      onClick={() => setOpen(true)}
      aria-label="Abrir configurações"
    >
      <span aria-hidden="true">⚙</span>{mobile ? null : <b>Configurações</b>}
    </button>
  );

  const dialog = open ? createPortal(
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Configurações do RonecaPlayTV" onMouseDown={event => {
      if (event.target === event.currentTarget) setOpen(false);
    }}>
      <section className="settings-panel">
        <header className="settings-header">
          <div><span className="eyebrow">RONECAPLAYTV WEB</span><h2>Configurações</h2></div>
          <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Fechar configurações">✕</button>
        </header>

        {message ? <div className="settings-message" role="status">{message}</div> : null}
        {loading ? <div className="loading-inline">Carregando preferências…</div> : null}

        <div className="settings-group">
          <h3>Reprodução</h3>
          <label className="settings-row"><span><strong>Aspecto padrão</strong><small>Aplicado ao iniciar uma nova reprodução.</small></span><select value={canonical.aspectMode || 'contain'} onChange={event => void saveCanonical({ aspectMode: event.target.value as CanonicalPreferences['aspectMode'] })}><option value="contain">Original</option><option value="cover">Preencher</option><option value="fill">Estender</option></select></label>
          <label className="settings-row"><span><strong>Idioma de áudio</strong><small>Usa a faixa disponível mais próxima da preferência.</small></span><select value={canonical.language || ''} onChange={event => void saveCanonical({ language: event.target.value || null })}><option value="">Automático</option><option value="pt-BR">Português</option><option value="en">Inglês</option><option value="es">Espanhol</option></select></label>
          <label className="settings-row"><span><strong>Legenda</strong><small>Desativada quando a faixa escolhida não existir.</small></span><select value={canonical.subtitleLanguage || ''} onChange={event => void saveCanonical({ subtitleLanguage: event.target.value || null })}><option value="">Desativada</option><option value="pt-BR">Português</option><option value="en">Inglês</option><option value="es">Espanhol</option></select></label>
          <label className="settings-row toggle"><span><strong>Próximo episódio automático</strong><small>Começa desativado e pode ser cancelado antes da troca.</small></span><input type="checkbox" checked={local.autoplayNextEpisode} onChange={event => saveLocal({ autoplayNextEpisode: event.target.checked })} /></label>
        </div>

        <div className="settings-group">
          <h3>Acessibilidade</h3>
          <label className="settings-row"><span><strong>Reduzir animações</strong><small>Por padrão respeita a preferência do sistema.</small></span><select value={local.reducedMotion} onChange={event => saveLocal({ reducedMotion: event.target.value as ReducedMotionPreference })}><option value="system">Sistema</option><option value="reduce">Reduzir</option><option value="allow">Permitir</option></select></label>
        </div>

        <div className="settings-group">
          <h3>Aplicativo</h3>
          <div className="settings-row"><span><strong>Instalação</strong><small>{installed ? 'RonecaPlayTV está instalado como aplicativo.' : 'Use o Web Player como aplicativo quando o navegador permitir.'}</small></span>{installed ? <span className="settings-state ok">Instalado</span> : installPrompt ? <button type="button" onClick={() => void requestInstall()}>Instalar</button> : <span className="settings-state">Navegador</span>}</div>
          <div className="settings-row"><span><strong>Atualização</strong><small>{pwa.status === 'available' ? 'Nova versão disponível.' : pwa.status === 'deferred_playback' ? 'Nova versão aguardando o fim da reprodução.' : pwa.status === 'applying' ? 'Atualizando…' : pwa.status === 'failed' ? pwa.error || 'Falha ao atualizar.' : 'Você está usando a versão atual.'}</small></span>{pwa.status === 'available' ? <button type="button" onClick={() => void applyPwaUpdate()}>Atualizar agora</button> : <span className={`settings-state ${pwa.status === 'idle' ? 'ok' : ''}`}>{pwa.status === 'idle' ? 'Atualizado' : 'Aguardando'}</span>}</div>
          <div className="settings-row"><span><strong>Versão Web Player</strong><small>Informe este número ao suporte quando necessário.</small></span><span className="settings-state">{version}</span></div>
        </div>

        <div className="settings-group">
          <h3>Conta e acesso</h3>
          <div className="settings-row"><span><strong>Sessão Web</strong><small>Nenhuma credencial técnica é exibida nesta tela.</small></span><span className="settings-state ok">Ativa</span></div>
          <div className="settings-row danger"><span><strong>Sair deste navegador</strong><small>Encerra a sessão Web atual.</small></span><button type="button" onClick={logout}>Sair</button></div>
        </div>
      </section>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      {desktopHost ? createPortal(launcher(false), desktopHost) : null}
      {mobileHost ? createPortal(launcher(true), mobileHost) : null}
      {dialog}
    </>
  );
}
