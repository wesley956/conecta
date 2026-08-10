(function installRonecaPanelPremium(global) {
  'use strict';

  if (global.__ronecaPanelPremiumInstalled) return;
  global.__ronecaPanelPremiumInstalled = true;

  const navigationIcons = {
    dashboard: '<path d="M4 4h6v6H4zM14 4h6v10h-6zM4 14h6v6H4zM14 18h6v2h-6z"/>',
    home: '<path d="M4 4h6v6H4zM14 4h6v10h-6zM4 14h6v6H4zM14 18h6v2h-6z"/>',
    pending: '<path d="M12 3 2.8 19h18.4L12 3zM12 9v4M12 17h.01"/>',
    activation: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M9 7h6M9 12h6M12 17h.01"/>',
    devices: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
    commercial: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
    customers: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 7h5M18.5 4.5v5"/>',
    playlists: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    lists: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    audit: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
    credits: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/>',
    'credit-purchases': '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/>',
    finance: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
    'company-finance': '<path d="M4 7h15a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12v3"/><path d="M16 12h5v4h-5a2 2 0 1 1 0-4z"/>',
    diagnostics: '<path d="M4 18h3l2-5 3 7 3-10 2 8h3M4 4h16v16H4z"/>',
    app: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  };

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  function ensureSellerBrandHotfix() {
    if (!document.body?.classList.contains('seller-v2')) return;
    if (document.querySelector('link[data-roneca-seller-brand-hotfix]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './seller-brand-hotfix.css?v=20260810-brand-v5';
    link.dataset.ronecaSellerBrandHotfix = 'true';
    document.head.appendChild(link);
  }

  function normalizeBrandLayout(root) {
    const scope = root || document;
    scope.querySelectorAll('.login-brand-lockup, .seller-login-brand').forEach(lockup => {
      const directLogos = Array.from(lockup.children).filter(child => child.classList?.contains('logo'));
      directLogos.slice(1).forEach(duplicate => duplicate.remove());
    });
    scope.querySelectorAll('.logo').forEach(logo => {
      const directImages = Array.from(logo.children).filter(child => child.tagName === 'IMG');
      directImages.slice(1).forEach(duplicate => duplicate.remove());
      if (document.body?.classList.contains('seller-v2')) {
        logo.style.overflow = 'hidden';
        const image = directImages[0];
        if (image) {
          image.style.display = 'block';
          image.style.width = '100%';
          image.style.height = '100%';
          image.style.maxWidth = '100%';
          image.style.maxHeight = '100%';
          image.style.objectFit = 'contain';
          image.style.objectPosition = 'center';
        }
      } else {
        logo.style.overflow = 'visible';
      }
    });
  }

  function applyTableLabels(root) {
    (root || document).querySelectorAll('.tablewrap table').forEach(table => {
      const headers = Array.from(table.querySelectorAll('thead th')).map(item => item.textContent.trim());
      if (!headers.length) return;
      table.querySelectorAll('tbody tr').forEach(row => {
        Array.from(row.children).forEach((cell, index) => {
          if (cell.tagName === 'TD' && headers[index]) cell.dataset.label = headers[index];
        });
      });
    });
  }

  function ensureNavigationIcons(root) {
    (root || document).querySelectorAll('[data-tab], [data-seller-nav]').forEach(button => {
      const key = button.dataset.tab || button.dataset.sellerNav;
      const paths = navigationIcons[key];
      if (!paths || button.querySelector('svg')) return;

      if (!button.querySelector('span')) {
        const label = document.createElement('span');
        label.textContent = button.textContent.trim();
        button.textContent = '';
        button.appendChild(label);
      }
      button.insertAdjacentHTML('afterbegin', `<svg aria-hidden="true" viewBox="0 0 24 24">${paths}</svg>`);
    });
  }

  function routeAdminSearch(rawValue) {
    const value = String(rawValue || '').trim();
    const query = normalize(value);
    if (!query || typeof global.setTab !== 'function') return;

    const routes = [
      { terms: ['inicio', 'visao geral', 'resumo', 'dashboard'], tab: 'dashboard' },
      { terms: ['pendencia', 'pendencias', 'ativar', 'ativacao'], tab: 'pending' },
      { terms: ['cliente', 'clientes'], tab: 'customers', input: 'customerSearch', render: 'renderCustomers' },
      { terms: ['lista', 'listas', 'playlist'], tab: 'playlists', input: 'playlistSearch', render: 'renderPlaylists' },
      { terms: ['vendedor', 'vendedores', 'credito', 'plano', 'comercial'], tab: 'commercial' },
      { terms: ['historico', 'auditoria', 'registro'], tab: 'audit', input: 'auditSearch', render: 'renderAuditLogs' },
      { terms: ['aplicativo', 'apk', 'download', 'baixar'], tab: 'app' },
      { terms: ['aparelho', 'aparelhos', 'dispositivo', 'tv'], tab: 'devices', input: 'deviceSearch', render: 'renderDevices' },
    ];

    const directRoute = routes.find(route => route.terms.includes(query));
    const route = directRoute || { tab: 'devices', input: 'deviceSearch', render: 'renderDevices' };
    global.setTab(route.tab);

    if (!directRoute && route.input) {
      const input = document.getElementById(route.input);
      if (input) input.value = value;
      if (typeof global[route.render] === 'function') global[route.render]();
    }
  }

  function routeSellerSearch(rawValue) {
    const value = String(rawValue || '').trim();
    const query = normalize(value);
    if (!query || typeof global.sellerPortalNavigate !== 'function') return;

    const routes = [
      { terms: ['inicio', 'resumo', 'dashboard'], section: 'home' },
      { terms: ['ativar', 'ativacao', 'novo aparelho'], section: 'activation' },
      { terms: ['lista', 'listas', 'playlist'], section: 'lists' },
      { terms: ['credito', 'creditos', 'extrato'], section: 'credits' },
      { terms: ['aplicativo', 'apk', 'download', 'baixar'], section: 'app' },
      { terms: ['aparelho', 'aparelhos', 'dispositivo', 'tv'], section: 'devices' },
    ];

    const directRoute = routes.find(route => route.terms.includes(query));
    global.sellerPortalNavigate(directRoute?.section || 'devices');

    if (!directRoute) {
      const input = document.getElementById('deviceSearch');
      if (input) input.value = value;
      if (typeof global.renderDevicesTable === 'function') global.renderDevicesTable();
    }
  }

  function updatePendingCount() {
    const source = document.getElementById('stPending');
    const target = document.getElementById('adminPendingCount');
    if (!source || !target) return;
    const amount = Number.parseInt(source.textContent || '0', 10) || 0;
    target.textContent = amount > 99 ? '99+' : String(amount);
    target.hidden = amount === 0;
  }

  function syncMoreNavigation() {
    const more = document.querySelector('.seller-v2-more');
    if (!more) return;
    more.classList.toggle('active', Boolean(more.querySelector('button.active')));
  }

  function bindSearch(input, handler) {
    if (!input) return;
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      handler(input.value);
    });
  }

  function initialize() {
    ensureSellerBrandHotfix();
    normalizeBrandLayout(document);
    const adminSearch = document.getElementById('adminGlobalSearch');
    const sellerSearch = document.getElementById('sellerGlobalSearch');
    bindSearch(adminSearch, routeAdminSearch);
    bindSearch(sellerSearch, routeSellerSearch);

    document.getElementById('adminPendingShortcut')?.addEventListener('click', () => {
      if (typeof global.setTab === 'function') global.setTab('pending');
    });

    document.addEventListener('keydown', event => {
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      if (event.key === '/' && !typing) {
        const search = adminSearch || sellerSearch;
        if (search) {
          event.preventDefault();
          search.focus();
        }
      }
    });

    applyTableLabels(document);
    ensureNavigationIcons(document);
    updatePendingCount();
    syncMoreNavigation();

    const observer = new MutationObserver(mutations => {
      let tableChanged = false;
      let pendingChanged = false;
      let navigationChanged = false;
      let brandChanged = false;

      mutations.forEach(mutation => {
        const element = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
        if (!element) return;
        if (element.id === 'stPending' || element.closest?.('#stPending')) pendingChanged = true;
        if (element.matches?.('.tabs, .tabs *, .seller-v2-nav, .seller-v2-nav *')) navigationChanged = true;
        if (element.matches?.('.login-brand-lockup, .seller-login-brand, .logo') || Array.from(mutation.addedNodes).some(node => node.nodeType === Node.ELEMENT_NODE && node.querySelector?.('.logo'))) brandChanged = true;
        if (element.matches?.('.tablewrap, .tablewrap *') || Array.from(mutation.addedNodes).some(node => node.nodeType === Node.ELEMENT_NODE && (node.matches?.('.tablewrap, tr, td') || node.querySelector?.('.tablewrap, tr, td')))) tableChanged = true;
      });

      if (tableChanged) applyTableLabels(document);
      if (pendingChanged) updatePendingCount();
      if (brandChanged) normalizeBrandLayout(document);
      if (navigationChanged) {
        ensureNavigationIcons(document);
        syncMoreNavigation();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})(window);
