import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import '@/styles/player.css';

export function AppLayout({ children }: { children: ReactNode }) {
  const activeNotice = useAppStore(state => state.activeNotice);
  const setActiveNotice = useAppStore(state => state.setActiveNotice);

  return (
    <div className="player-app-frame">
      <div className="player-app-content">{children}</div>

      {activeNotice ? (
        <div className="player-app-notice" role="status">
          <span>{activeNotice}</span>
          <button
            type="button"
            onClick={() => setActiveNotice(null)}
            aria-label="Fechar aviso"
          >
            <X aria-hidden="true" size={16} strokeWidth={2.4} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
