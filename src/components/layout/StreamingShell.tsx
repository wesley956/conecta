import type { ReactNode } from 'react';
import {
  Bookmark,
  Film,
  Home,
  Library,
  Settings,
  Tv,
  X,
} from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import type { AppState } from '@/types';
import '@/styles/streaming.css';
import '@/styles/preferences.css';

type NavItem = {
  id: AppState;
  label: string;
  icon: ReactNode;
};

const primaryItems: NavItem[] = [
  { id: 'home', label: 'Início', icon: <Home aria-hidden="true" /> },
  { id: 'channels', label: 'TV ao vivo', icon: <Tv aria-hidden="true" /> },
  { id: 'movies', label: 'Filmes', icon: <Film aria-hidden="true" /> },
  { id: 'series', label: 'Séries', icon: <Library aria-hidden="true" /> },
  { id: 'favorites', label: 'Minha Lista', icon: <Bookmark aria-hidden="true" /> },
];

const footerItems: NavItem[] = [
  { id: 'settings', label: 'Configurações', icon: <Settings aria-hidden="true" /> },
];

function SidebarItem({ item }: { item: NavItem }) {
  const currentScreen = useAppStore(state => state.currentScreen);
  const setScreen = useAppStore(state => state.setScreen);
  const active = currentScreen === item.id;

  return (
    <button
      type="button"
      className={`stream-nav-item ${active ? 'is-active' : ''}`}
      onClick={() => setScreen(item.id)}
      aria-current={active ? 'page' : undefined}
      title={item.label}
    >
      {item.icon}
      <span className="stream-nav-label">{item.label}</span>
    </button>
  );
}

export function StreamingShell({ children }: { children: ReactNode }) {
  const activeNotice = useAppStore(state => state.activeNotice);
  const setActiveNotice = useAppStore(state => state.setActiveNotice);
  const cardSize = useAppStore(state => state.settings.cardSize ?? 'medium');
  const animationsEnabled = useAppStore(state => state.settings.animationsEnabled ?? true);

  return (
    <div
      className="stream-shell"
      data-card-size={cardSize}
      data-animations={animationsEnabled ? 'on' : 'off'}
    >
      <aside className="stream-sidebar" aria-label="Navegação principal">
        <div className="stream-brand">
          <span className="stream-brand-mark">RP</span>
          <span className="stream-brand-copy">
            <span className="stream-brand-name">RonecaPlayTV</span>
            <span className="stream-brand-subtitle">Streaming</span>
          </span>
        </div>

        <nav className="stream-sidebar-nav">
          <div className="stream-sidebar-primary">
            {primaryItems.map(item => (
              <SidebarItem key={item.id} item={item} />
            ))}
          </div>

          <div className="stream-sidebar-footer">
            {footerItems.map(item => (
              <SidebarItem key={item.id} item={item} />
            ))}
          </div>
        </nav>
      </aside>

      <main className="stream-main">{children}</main>

      {activeNotice && (
        <div className="stream-notice" role="status">
          <span>{activeNotice}</span>
          <button
            type="button"
            onClick={() => setActiveNotice(null)}
            aria-label="Fechar aviso"
          >
            <X aria-hidden="true" size={16} strokeWidth={2.4} />
          </button>
        </div>
      )}
    </div>
  );
}
