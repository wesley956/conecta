export type PwaUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'deferred_playback'
  | 'applying'
  | 'failed';

export type PwaUpdateSnapshot = {
  supported: boolean;
  status: PwaUpdateStatus;
  error: string | null;
};

type Listener = (snapshot: PwaUpdateSnapshot) => void;

const listeners = new Set<Listener>();
let registrationRef: ServiceWorkerRegistration | null = null;
let waitingWorkerRef: ServiceWorker | null = null;
let playerActive = false;
let reloadTimer: number | null = null;
let snapshot: PwaUpdateSnapshot = {
  supported: 'serviceWorker' in navigator && window.isSecureContext,
  status: 'idle',
  error: null,
};

function emit(next: Partial<PwaUpdateSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener(snapshot);
}

function updateWaitingWorker(worker: ServiceWorker | null) {
  waitingWorkerRef = worker;
  if (!worker) return;
  emit({
    status: playerActive ? 'deferred_playback' : 'available',
    error: null,
  });
}

export function getPwaUpdateSnapshot() {
  return snapshot;
}

export function subscribePwaUpdates(listener: Listener) {
  listeners.add(listener);
  listener(snapshot);
  return () => listeners.delete(listener);
}

export function setPwaPlaybackActive(active: boolean) {
  playerActive = active;
  if (active && snapshot.status === 'available') {
    emit({ status: 'deferred_playback' });
    return;
  }
  if (!active && snapshot.status === 'deferred_playback') {
    emit({ status: 'available' });
  }
}

export function deferPwaUpdate() {
  if (snapshot.status === 'failed') {
    emit({ status: waitingWorkerRef ? (playerActive ? 'deferred_playback' : 'available') : 'idle', error: null });
  }
}

export async function applyPwaUpdate() {
  if (playerActive) {
    emit({ status: 'deferred_playback' });
    return false;
  }

  const worker = waitingWorkerRef || registrationRef?.waiting || null;
  if (!worker) {
    emit({ status: 'failed', error: 'A nova versão ainda não está pronta para instalação.' });
    return false;
  }

  waitingWorkerRef = worker;
  emit({ status: 'applying', error: null });
  worker.postMessage({ type: 'SKIP_WAITING' });

  if (reloadTimer) window.clearTimeout(reloadTimer);
  reloadTimer = window.setTimeout(() => {
    reloadTimer = null;
    if (snapshot.status === 'applying') {
      emit({ status: 'failed', error: 'Não foi possível concluir a atualização agora.' });
    }
  }, 12_000);
  return true;
}

export async function checkForPwaUpdate() {
  if (!registrationRef) return false;
  emit({ status: snapshot.status === 'idle' ? 'checking' : snapshot.status, error: null });
  try {
    await registrationRef.update();
    if (registrationRef.waiting) updateWaitingWorker(registrationRef.waiting);
    else if (snapshot.status === 'checking') emit({ status: 'idle' });
    return true;
  } catch {
    if (snapshot.status === 'checking') emit({ status: 'failed', error: 'Não foi possível verificar atualizações.' });
    return false;
  }
}

export async function registerPwa() {
  if (!snapshot.supported) return;
  try {
    const registration = await navigator.serviceWorker.register('/web/sw.js', {
      scope: '/web/',
      updateViaCache: 'none',
    });
    registrationRef = registration;

    if (registration.waiting) updateWaitingWorker(registration.waiting);

    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state !== 'installed' || !navigator.serviceWorker.controller) return;
        updateWaitingWorker(registration.waiting || worker);
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (snapshot.status !== 'applying') return;
      if (reloadTimer) window.clearTimeout(reloadTimer);
      reloadTimer = null;
      window.location.reload();
    });

    await checkForPwaUpdate();
  } catch {
    emit({ status: 'failed', error: 'Atualizações do aplicativo estão temporariamente indisponíveis.' });
  }
}

export function clearPwaPrivateState() {
  navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_PRIVATE_STATE' });
}
