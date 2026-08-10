(function installMobileMoreNavigation(global) {
  'use strict';

  if (global.RonecaMobileMoreNavigation) return;

  var COMPACT_NAV_QUERY = '(max-width: 820px)';
  var MORE_SELECTOR = 'details.admin-nav-more, details.seller-v2-more';
  var OPEN_MORE_SELECTOR = 'details.admin-nav-more[open], details.seller-v2-more[open]';
  var SELLER_PRIMARY_SECTIONS = new Set(['home', 'activation', 'devices', 'lists']);
  var boundDetails = new WeakSet();
  var navigationModes = new WeakMap();
  var resizeFrame = 0;
  var sellerBridgeInstalled = false;
  var fallbackSellerNavigate = null;
  var fallbackSellerRefresh = null;

  function isCompactNavigation() {
    return global.matchMedia(COMPACT_NAV_QUERY).matches;
  }

  function setOpen(details, open) {
    details.open = Boolean(open);
    var summary = details.querySelector(':scope > summary');
    if (summary) summary.setAttribute('aria-expanded', String(details.open));
  }

  function closeOtherMenus(current) {
    document.querySelectorAll(OPEN_MORE_SELECTOR).forEach(function closeMenu(details) {
      if (details !== current) setOpen(details, false);
    });
  }

  function syncNavigationMode(details) {
    var mode = isCompactNavigation() ? 'compact' : 'wide';
    var previousMode = navigationModes.get(details);
    navigationModes.set(details, mode);

    if (previousMode === mode) return;
    setOpen(details, mode === 'wide' && details.classList.contains('admin-nav-more'));
  }

  function setSellerProxyActive(proxy, active) {
    proxy.classList.toggle('active', Boolean(active));
    if (active) proxy.setAttribute('aria-current', 'page');
    else proxy.removeAttribute('aria-current');
  }

  function ensureSellerMoreNavigation() {
    var nav = document.querySelector('.seller-v2-nav');
    if (!nav) return null;

    var more = nav.querySelector(':scope > details.seller-v2-more');
    if (!more) {
      more = document.createElement('details');
      more.className = 'seller-v2-more';
      more.innerHTML = '<summary aria-label="Mais áreas do portal" aria-expanded="false"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle></svg><span>Mais</span></summary><div class="seller-v2-more-menu"></div>';
      nav.appendChild(more);
    }

    var menu = more.querySelector('.seller-v2-more-menu');
    if (!menu) return more;

    var activeSections = new Set();
    Array.from(nav.querySelectorAll(':scope > button[data-seller-nav]')).forEach(function syncSellerSource(source) {
      var section = source.dataset.sellerNav || '';
      if (SELLER_PRIMARY_SECTIONS.has(section)) return;

      source.classList.add('seller-v2-overflow-source');
      var proxy = Array.from(menu.querySelectorAll('button[data-seller-nav]')).find(function findProxy(item) {
        return item.dataset.sellerNav === section;
      });
      if (!proxy) {
        proxy = document.createElement('button');
        proxy.type = 'button';
        proxy.dataset.sellerNav = section;
        proxy.dataset.sellerNavProxy = 'true';
        proxy.addEventListener('click', function activateSellerProxy() {
          source.click();
          setOpen(more, false);
        });
        menu.appendChild(proxy);
      }
      if (proxy.innerHTML !== source.innerHTML) proxy.innerHTML = source.innerHTML;
      setSellerProxyActive(proxy, source.classList.contains('active'));
      activeSections.add(section);
    });

    menu.querySelectorAll('button[data-seller-nav]').forEach(function removeStaleProxy(proxy) {
      if (!activeSections.has(proxy.dataset.sellerNav || '')) proxy.remove();
    });

    more.classList.toggle('active', Boolean(menu.querySelector('button.active')));
    return more;
  }

  function showSellerSection(target) {
    var normalized = String(target || 'home');
    var escaped = global.CSS && typeof global.CSS.escape === 'function' ? global.CSS.escape(normalized) : normalized.replace(/[^a-z0-9_-]/gi, '');
    var section = document.querySelector('.seller-portal-section[data-seller-section="' + escaped + '"]');
    if (!section) return false;

    document.querySelectorAll('.seller-portal-section').forEach(function toggleSellerSection(item) {
      var hidden = item !== section;
      item.hidden = hidden;
      item.setAttribute('aria-hidden', String(hidden));
    });

    document.querySelectorAll('.seller-v2-nav button[data-seller-nav]').forEach(function toggleSellerButton(button) {
      var active = button.dataset.sellerNav === normalized;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });

    var dashboard = document.getElementById('dashboardView');
    if (dashboard) dashboard.dataset.activeSection = normalized;

    if (normalized === 'finance') global.financeLoadSeller?.().catch?.(function ignoreFinanceError() {});
    if (normalized === 'credit-purchases') global.creditPackagesLoad?.().catch?.(function ignoreCreditPackageError() {});
    if (normalized === 'customers') global.sellerCommercialRenderCustomers?.();

    var more = ensureSellerMoreNavigation();
    if (more && isCompactNavigation()) setOpen(more, false);
    return true;
  }

  function sellerNavigate(target) {
    var normalized = String(target || 'home');
    if (showSellerSection(normalized)) return;
    if (typeof fallbackSellerNavigate === 'function' && fallbackSellerNavigate !== sellerNavigate) {
      fallbackSellerNavigate(normalized);
    }
  }

  function sellerRefresh() {
    if (typeof fallbackSellerRefresh === 'function' && fallbackSellerRefresh !== sellerRefresh) {
      fallbackSellerRefresh();
    }
    var active = document.getElementById('dashboardView')?.dataset.activeSection || 'home';
    showSellerSection(active);
    ensureSellerMoreNavigation();
  }

  function installSellerNavigationBridge() {
    if (sellerBridgeInstalled) return true;
    if (typeof global.sellerPortalNavigate !== 'function') return false;

    fallbackSellerNavigate = global.sellerPortalNavigate;
    fallbackSellerRefresh = global.sellerPortalRefreshNavigation;
    global.sellerPortalNavigate = sellerNavigate;
    global.sellerPortalRefreshNavigation = sellerRefresh;
    sellerBridgeInstalled = true;
    return true;
  }

  function bindDetails(details) {
    if (!(details instanceof HTMLDetailsElement) || boundDetails.has(details)) return;
    var summary = details.querySelector(':scope > summary');
    if (!summary) return;

    boundDetails.add(details);
    summary.setAttribute('aria-haspopup', 'menu');
    summary.setAttribute('aria-expanded', String(details.open));

    summary.addEventListener('click', function toggleMobileMore(event) {
      if (!isCompactNavigation()) return;
      event.preventDefault();
      var shouldOpen = !details.open;
      closeOtherMenus(details);
      setOpen(details, shouldOpen);
    });

    details.addEventListener('toggle', function announceMobileMoreState() {
      summary.setAttribute('aria-expanded', String(details.open));
    });

    syncNavigationMode(details);
  }

  function refresh(root) {
    installSellerNavigationBridge();
    ensureSellerMoreNavigation();
    var scope = root && root.querySelectorAll ? root : document;
    if (scope.matches && scope.matches(MORE_SELECTOR)) bindDetails(scope);
    scope.querySelectorAll(MORE_SELECTOR).forEach(bindDetails);
    document.querySelectorAll(MORE_SELECTOR).forEach(syncNavigationMode);
  }

  function closeFromInteraction(event) {
    if (!isCompactNavigation()) return;

    var selectedItem = event.target.closest('[data-tab], [data-seller-nav]');
    var selectedMenu = selectedItem && selectedItem.closest(MORE_SELECTOR);
    if (selectedMenu) {
      setOpen(selectedMenu, false);
      return;
    }

    document.querySelectorAll(OPEN_MORE_SELECTOR).forEach(function closeOutside(details) {
      if (!details.contains(event.target)) setOpen(details, false);
    });
  }

  function closeFromKeyboard(event) {
    if (event.key !== 'Escape' || !isCompactNavigation()) return;
    document.querySelectorAll(OPEN_MORE_SELECTOR).forEach(function closeMenu(details) {
      setOpen(details, false);
      details.querySelector(':scope > summary')?.focus();
    });
  }

  function initialize() {
    refresh(document);

    var attempts = 0;
    var bridgeTimer = global.setInterval(function retrySellerBridge() {
      attempts += 1;
      refresh(document);
      if (sellerBridgeInstalled || attempts >= 40) global.clearInterval(bridgeTimer);
    }, 250);

    new MutationObserver(function navigationChanged(mutations) {
      mutations.forEach(function inspectAddedNavigation(mutation) {
        mutation.addedNodes.forEach(function inspectNode(node) {
          if (node.nodeType === Node.ELEMENT_NODE) refresh(node);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', closeFromInteraction);
    document.addEventListener('keydown', closeFromKeyboard);
    global.addEventListener('resize', function syncOnlyAcrossBreakpoint() {
      global.cancelAnimationFrame(resizeFrame);
      resizeFrame = global.requestAnimationFrame(function syncNavigationAfterResize() {
        refresh(document);
      });
    });
  }

  global.RonecaMobileMoreNavigation = Object.freeze({
    refresh: refresh,
    showSellerSection: showSellerSection,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})(window);
