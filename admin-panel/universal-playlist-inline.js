(() => {
  'use strict';
  if (window.__ronecaUniversalPlaylistInlineInstalled) return;
  window.__ronecaUniversalPlaylistInlineInstalled = true;

  let inline = null;

  function install() {
    const api = window.RonecaUniversalPlaylists;
    if (!api || api.__inlineEnabled) return false;

    const originalOpen = api.open.bind(api);
    const originalClose = api.close.bind(api);
    const originalSave = api.save.bind(api);

    function restore({ notify = true } = {}) {
      if (!inline) return;
      const current = inline;
      inline = null;
      if (current.card && current.modal) {
        current.card.classList.remove('upl-inline-card');
        current.modal.appendChild(current.card);
        current.modal.classList.remove('open');
        current.modal.setAttribute('aria-hidden', 'true');
      }
      if (current.host) {
        current.host.classList.remove('upl-inline-host-active');
        current.host.replaceChildren();
      }
      if (notify) current.options?.onClose?.();
      const returnFocus = current.options?.returnFocusSelector
        ? document.querySelector(current.options.returnFocusSelector)
        : current.returnFocus;
      if (returnFocus instanceof HTMLElement && returnFocus.isConnected) {
        returnFocus.focus({ preventScroll: true });
      }
    }

    async function openInline(host, options = {}) {
      if (!(host instanceof HTMLElement)) throw new Error('Área de cadastro inline indisponível.');
      if (inline) restore({ notify: false });
      const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      originalOpen();
      await Promise.resolve();
      const modal = document.getElementById('uplModal');
      const card = modal?.querySelector('.upl-modal-card');
      if (!modal || !card) throw new Error('Cadastro universal ainda está carregando.');
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      host.replaceChildren();
      host.classList.add('upl-inline-host-active');
      card.classList.add('upl-inline-card');
      host.appendChild(card);
      inline = { host, modal, card, options, returnFocus };
      card.querySelector('input, textarea, select, button')?.focus({ preventScroll: true });
      return true;
    }

    async function saveInline() {
      if (!inline) return originalSave();
      const current = inline;
      const nativeFetch = window.fetch;
      let savedResult = null;
      window.fetch = async function capturedFetch(input, init) {
        const response = await nativeFetch.call(this, input, init);
        try {
          const url = typeof input === 'string' ? input : input?.url || '';
          const body = JSON.parse(String(init?.body || '{}'));
          if (url.includes('/playlist-source-manager') && body.action === 'save') {
            const payload = await response.clone().json().catch(() => null);
            if (response.ok && payload?.playlistId) savedResult = payload;
          }
        } catch { /* captura é apenas integração de UI */ }
        return response;
      };
      try {
        await originalSave();
      } finally {
        window.fetch = nativeFetch;
      }
      if (!savedResult?.playlistId || inline !== current) return;
      try {
        await current.options?.onSaved?.(savedResult);
      } finally {
        restore({ notify: false });
      }
    }

    function closeWrapped() {
      if (inline) return restore();
      return originalClose();
    }

    window.RonecaUniversalPlaylists = {
      ...api,
      openInline,
      save: saveInline,
      close: closeWrapped,
      __inlineEnabled: true,
    };
    return true;
  }

  if (!install()) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 40) clearInterval(timer);
    }, 100);
  }
})();
