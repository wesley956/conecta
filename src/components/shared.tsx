import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { ArrowLeft, Home, Tv, Film, Library, Settings } from 'lucide-react';

// ===== LAYOUT COMPONENTS =====

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { uiMode, activeNotice } = useAppStore();

  return (
    <div className={`roneca-app-shell h-full w-full premium-bg overflow-hidden flex flex-col ${uiMode === 'tv' ? 'tv-safe' : 'mobile-safe'}`}>
      {activeNotice && (
        <div className="roneca-notice animate-fade-in">
          <div className="roneca-notice-inner">
            <span>{activeNotice}</span>
            <button
              type="button"
              onClick={() => useAppStore.getState().setActiveNotice(null)}
              className="roneca-notice-close"
              aria-label="Fechar aviso"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="roneca-app-content flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

// ===== HEADER =====

export function Header({ title, showBack, onBack, showSearch, showUser }: {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  showSearch?: boolean;
  showUser?: boolean;
}) {
  const { setScreen, uiMode } = useAppStore();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <header className={`roneca-header mb-6 flex items-center justify-between gap-4 ${uiMode === 'tv' ? 'mb-8' : 'mb-4'}`}>
      <div className="flex min-w-0 items-center gap-4">
        {showBack && (
          <button
            type="button"
            onClick={onBack || (() => setScreen('home'))}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-text-gray transition-all hover:border-neon-orange hover:text-neon-orange"
            aria-label="Voltar"
          >
            <ArrowLeft aria-hidden="true" size={22} strokeWidth={2.4} />
          </button>
        )}

        {title ? (
          <div className="min-w-0">
            <h1 className={`${uiMode === 'tv' ? 'text-3xl' : 'text-xl'} truncate font-black text-text-white`}>{title}</h1>
            <p className="truncate text-xs uppercase tracking-[0.28em] text-text-gray/70">RonecaPlayTV</p>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-neon-orange to-neon-cyan text-2xl font-black text-bg-primary">R</div>
            <div className="truncate text-2xl font-black">
              <span className="text-text-white">Roneca</span><span className="font-medium text-text-white/90">PlayTV</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {showSearch && (
          <button
            type="button"
            onClick={() => setScreen('search')}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-text-gray transition-all hover:border-neon-cyan hover:text-neon-cyan"
            aria-label="Buscar"
          >
            🔍
          </button>
        )}

        <span className="hidden text-active-green md:inline">●</span>
        <span className={`${uiMode === 'tv' ? 'text-2xl' : 'text-base'} font-light text-text-white`}>{formatTime(time)}</span>

        {showUser && (
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-lg">
            👤
          </div>
        )}
      </div>
    </header>
  );
}

// ===== NEON CARD =====

export function NeonCard({ children, selected, onClick, className, glowColor = 'orange' }: {
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  glowColor?: 'orange' | 'cyan' | 'green';
}) {
  const glowClasses = {
    orange: selected ? 'border-neon-orange glow-orange' : 'border-white/10',
    cyan: selected ? 'border-neon-cyan glow-cyan' : 'border-white/10',
    green: selected ? 'border-active-green' : 'border-white/10',
  };
  
  return (
    <div
      onClick={onClick}
      className={`
        premium-card rounded-xl border-2 transition-all duration-300 cursor-pointer
        hover:border-neon-orange/50 hover:bg-white/[0.06]
        ${glowClasses[glowColor]}
        ${selected ? 'scale-[1.02]' : ''}
        ${className || ''}
      `}
      tabIndex={0}
      role={onClick ? 'button' : undefined}
    >
      {children}
    </div>
  );
}

// ===== STATUS BADGE =====

export function StatusBadge({ status }: { status: 'active' | 'expired' | 'blocked' | 'inactive' | 'pending' | 'error' }) {
  const styles: Record<string, string> = {
    active: 'bg-active-green/20 text-active-green border-active-green/30',
    expired: 'bg-alert-yellow/20 text-alert-yellow border-alert-yellow/30',
    blocked: 'bg-error-red/20 text-error-red border-error-red/30',
    inactive: 'bg-text-gray/20 text-text-gray border-text-gray/30',
    pending: 'bg-neon-orange/20 text-neon-orange border-neon-orange/30',
    error: 'bg-error-red/20 text-error-red border-error-red/30',
  };
  
  const labels: Record<string, string> = {
    active: 'Ativo',
    expired: 'Vencido',
    blocked: 'Bloqueado',
    inactive: 'Inativo',
    pending: 'Pendente',
    error: 'Erro',
  };
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.inactive}`}>
      {labels[status] || status}
    </span>
  );
}

// ===== PROGRESS BAR =====

export function ProgressBar({ progress, className }: { progress: number; className?: string }) {
  return (
    <div className={`h-1 bg-border rounded-full overflow-hidden ${className || ''}`}>
      <div className="h-full bg-neon-orange rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
    </div>
  );
}

// ===== SECTION TITLE =====

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { uiMode } = useAppStore();
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 className={`${uiMode === 'tv' ? 'text-xl' : 'text-base'} min-w-0 truncate font-bold text-text-white`}>{title}</h2>
      {action && (
        <button type="button" onClick={onAction} className="shrink-0 text-neon-orange text-sm hover:text-neon-cyan transition-colors">
          {action} →
        </button>
      )}
    </div>
  );
}

// ===== EMPTY STATE =====

export function EmptyState({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center animate-fade-in">
      <span className="text-5xl mb-4">{icon}</span>
      <h3 className="text-lg font-bold text-text-white mb-2">{title}</h3>
      <p className="text-text-gray text-sm max-w-md">{description}</p>
    </div>
  );
}

// ===== BOTTOM NAV / SIDE NAV =====

export function BottomNav() {
  const store = useAppStore() as any;
  const activeScreen = store.screen ?? store.currentScreen ?? store.activeScreen ?? 'home';
  const setScreen = store.setScreen as (screen: string) => void;

  const items = [
    { id: 'home', icon: <Home aria-hidden="true" size={22} strokeWidth={2.4} />, label: 'Início', action: () => setScreen('home'), active: ['home'].includes(activeScreen) },
    { id: 'channels', icon: <Tv aria-hidden="true" size={22} strokeWidth={2.4} />, label: 'TV ao vivo', action: () => setScreen('channels'), active: ['channels'].includes(activeScreen) },
    { id: 'movies', icon: <Film aria-hidden="true" size={22} strokeWidth={2.4} />, label: 'Filmes', action: () => setScreen('movies'), active: ['movies'].includes(activeScreen) },
    { id: 'series', icon: <Library aria-hidden="true" size={22} strokeWidth={2.4} />, label: 'Séries', action: () => setScreen('series'), active: ['series'].includes(activeScreen) },
    { id: 'settings', icon: <Settings aria-hidden="true" size={22} strokeWidth={2.4} />, label: 'Config', action: () => setScreen('settings'), active: ['settings', 'favorites', 'search'].includes(activeScreen) },
  ];

  return (
    <aside className="clean-tv-sidebar roneca-side-menu fixed bottom-0 left-0 top-0 z-50 flex flex-col" aria-label="Navegação principal">
      <div className="roneca-side-logo">
        <span className="roneca-side-logo-mark">RP</span>
        <span className="roneca-side-logo-text">Roneca</span>
      </div>

      <nav className="flex w-full flex-1 flex-col gap-2 px-3 py-2">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={item.action}
            title={item.label}
            aria-current={item.active ? 'page' : undefined}
            className={`clean-tv-sidebar-button roneca-side-button ${item.active ? 'active' : ''}`}
          >
            <span className="roneca-side-icon">{item.icon}</span>
            <span className="roneca-side-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
