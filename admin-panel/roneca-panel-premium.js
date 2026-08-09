(function installRonecaPanelPremium(global) {
  'use strict';

  if (global.__ronecaPanelPremiumInstalled) return;
  global.__ronecaPanelPremiumInstalled = true;

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
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

  function closeNavigationMenus(event) {
    const button = event.target.closest('[data-tab], [data-seller-nav]');
    if (!button) return;
    button.closest('details')?.removeAttribute('open');
    global.setTimeout(syncMoreNavigation, 0);
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
    const adminSearch = document.getElementById('adminGlobalSearch');
    const sellerSearch = document.getElementById('sellerGlobalSearch');
    bindSearch(adminSearch, routeAdminSearch);
    bindSearch(sellerSearch, routeSellerSearch);

    document.getElementById('adminPendingShortcut')?.addEventListener('click', () => {
      if (typeof global.setTab === 'function') global.setTab('pending');
    });

    document.addEventListener('click', closeNavigationMenus);
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
      if (event.key === 'Escape') {
        document.querySelectorAll('details[open].admin-nav-more, details[open].seller-v2-more').forEach(item => item.removeAttribute('open'));
      }
    });

    applyTableLabels(document);
    updatePendingCount();
    syncMoreNavigation();

    const observer = new MutationObserver(mutations => {
      let tableChanged = false;
      let pendingChanged = false;
      let navigationChanged = false;

      mutations.forEach(mutation => {
        const element = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
        if (!element) return;
        if (element.id === 'stPending' || element.closest?.('#stPending')) pendingChanged = true;
        if (element.matches?.('.seller-v2-nav, .seller-v2-nav *')) navigationChanged = true;
        if (element.matches?.('.tablewrap, .tablewrap *') || Array.from(mutation.addedNodes).some(node => node.nodeType === Node.ELEMENT_NODE && (node.matches?.('.tablewrap, tr, td') || node.querySelector?.('.tablewrap, tr, td')))) tableChanged = true;
      });

      if (tableChanged) applyTableLabels(document);
      if (pendingChanged) updatePendingCount();
      if (navigationChanged) syncMoreNavigation();
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})(window);
