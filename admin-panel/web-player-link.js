(() => {
  'use strict';
  if (window.__ronecaWebPlayerLinkInstalled) return;
  window.__ronecaWebPlayerLinkInstalled = true;

  const playerUrl = () => new URL('/web/', window.location.origin).toString();

  function notify(message, error = false) {
    if (typeof window.show === 'function') window.show(message, error);
    else if (error) alert(message);
  }

  async function copyLink() {
    const url = playerUrl();
    try {
      await navigator.clipboard.writeText(url);
      notify('Link do Web Player copiado.');
      return;
    } catch {
      const input = document.createElement('input');
      input.value = url;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand('copy');
      input.remove();
      if (ok) notify('Link do Web Player copiado.');
      else notify('Não foi possível copiar o link automaticamente.', true);
    }
  }

  function inject() {
    const body = document.querySelector('#webAccessModal #wamBody');
    if (!body || body.querySelector('[data-web-player-link-section]')) return;

    const pinSection = body.querySelector('.wam-section');
    if (!pinSection) return;

    const section = document.createElement('section');
    section.className = 'wam-section';
    section.dataset.webPlayerLinkSection = '1';
    section.innerHTML = `
      <h3>Web Player</h3>
      <p>Abra o player no navegador e entre com o código do aparelho + PIN Web.</p>
      <div class="wam-row">
        <button type="button" class="btn primary" data-open-web-player>Abrir Web Player</button>
        <button type="button" class="btn" data-copy-web-player>Copiar link</button>
      </div>`;

    pinSection.insertAdjacentElement('afterend', section);
    section.querySelector('[data-open-web-player]')?.addEventListener('click', () => {
      window.open(playerUrl(), '_blank', 'noopener,noreferrer');
    });
    section.querySelector('[data-copy-web-player]')?.addEventListener('click', () => void copyLink());
  }

  const observer = new MutationObserver(inject);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', inject);
  window.setTimeout(inject, 800);
})();
