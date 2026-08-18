import { useEffect, useState } from 'react';
import {
  applyPwaUpdate,
  checkForPwaUpdate,
  deferPwaUpdate,
  getPwaUpdateSnapshot,
  subscribePwaUpdates,
  type PwaUpdateSnapshot,
} from './pwa';

export function PwaUpdatePrompt() {
  const [snapshot, setSnapshot] = useState<PwaUpdateSnapshot>(() => getPwaUpdateSnapshot());
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribePwaUpdates(setSnapshot);
    return () => { unsubscribe(); };
  }, []);

  useEffect(() => {
    if (snapshot.status !== 'available' && snapshot.status !== 'failed') setDismissed(false);
  }, [snapshot.status]);

  if (dismissed || snapshot.status === 'idle' || snapshot.status === 'checking' || snapshot.status === 'deferred_playback') return null;

  if (snapshot.status === 'applying') {
    return (
      <div className="pwa-update controlled" role="status" aria-live="polite">
        <span>Aplicando nova versão do RonecaPlayTV…</span>
      </div>
    );
  }

  if (snapshot.status === 'failed') {
    return (
      <div className="pwa-update controlled error" role="status" aria-live="polite">
        <span>{snapshot.error || 'Não foi possível atualizar agora.'}</span>
        <button type="button" onClick={() => void checkForPwaUpdate()}>Tentar novamente</button>
        <button type="button" className="quiet" onClick={() => { deferPwaUpdate(); setDismissed(true); }}>Depois</button>
      </div>
    );
  }

  return (
    <div className="pwa-update controlled" role="status" aria-live="polite">
      <span>Nova versão do RonecaPlayTV disponível.</span>
      <button type="button" className="quiet" onClick={() => setDismissed(true)}>Depois</button>
      <button type="button" onClick={() => void applyPwaUpdate()}>Atualizar agora</button>
    </div>
  );
}
