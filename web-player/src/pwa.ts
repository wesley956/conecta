function showUpdatePrompt(registration: ServiceWorkerRegistration) {
  if (document.getElementById('roneca-pwa-update')) return;
  const container = document.createElement('div');
  container.id = 'roneca-pwa-update';
  container.className = 'pwa-update';
  container.setAttribute('role', 'status');
  container.innerHTML = '<span>Uma nova versão do RonecaPlayTV está pronta.</span><button type="button">Atualizar agora</button>';
  container.querySelector('button')?.addEventListener('click', () => {
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
  });
  document.body.appendChild(container);
}

export async function registerPwa() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    const registration = await navigator.serviceWorker.register('/web/sw.js', { scope: '/web/' });
    if (registration.waiting) showUpdatePrompt(registration);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdatePrompt(registration);
      });
    });
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  } catch {
    // PWA é progressiva; falha no SW não bloqueia o player Web.
  }
}

export function clearPwaPrivateState() {
  navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_PRIVATE_STATE' });
}
