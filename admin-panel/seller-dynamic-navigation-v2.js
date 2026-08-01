(() => {
  'use strict';

  if (!/\/seller\.html$/i.test(location.pathname)) return;

  const primarySections = new Set(['home', 'activation', 'devices', 'lists']);
  let fallbackNavigate = null;
  let fallbackRefresh = null;
  let installed = false;

  function setHidden(element, hidden) {
    if (!element) return;
    if (element.hidden !== hidden) element.hidden = hidden;
    const ariaHidden = String(hidden);
    if (element.getAttribute('aria-hidden') !== ariaHidden) {
      element.setAttribute('aria-hidden', ariaHidden);
    }
  }

  function setActive(button, active) {
    if (!button) return;
    if (button.classList.contains('active') !== active) {
      button.classList.toggle('active', active);
    }
    if (active) {
      if (button.getAttribute('aria-current') !== 'page') button.setAttribute('aria-current', 'page');
    } else if (button.hasAttribute('aria-current')) {
      button.removeAttribute('aria-current');
    }
  }

  function ensureMoreNavigation(nav) {
    let more = nav.querySelector(':scope > .seller-v2-more');
    if (!more) {
      more = document.createElement('details');
      more.className = 'seller-v2-more';
      more.innerHTML = `
        <summary aria-label="Mais áreas do portal"><span>Mais</span></summary>
        <div class="seller-v2-more-menu"></div>
      `;
      nav.appendChild(more);
    }
    return more;
  }

  function syncCompactNavigation() {
    const nav = document.querySelector('.seller-v2-nav');
    if (!nav) return;

    const more = ensureMoreNavigation(nav);
    const menu = more.querySelector('.seller-v2-more-menu');
    const overflowButtons = [...nav.querySelectorAll(':scope > button')].filter(button => (
      !primarySections.has(button.dataset.sellerNav || '')
    ));
    const activeSections = new Set();

    overflowButtons.forEach(source => {
      const section = source.dataset.sellerNav || '';
      source.classList.add('seller-v2-overflow-source');
      let proxy = [...menu.querySelectorAll('button')].find(item => item.dataset.sellerNav === section);
      if (!proxy) {
        proxy = document.createElement('button');
        proxy.type = 'button';
        proxy.dataset.sellerNav = section;
        proxy.dataset.sellerNavProxy = 'true';
        proxy.addEventListener('click', () => proxy.__sellerNavSource?.click());
        menu.appendChild(proxy);
      }
      proxy.__sellerNavSource = source;
      proxy.textContent = source.textContent.trim();
      setActive(proxy, source.classList.contains('active'));
      activeSections.add(section);
    });

    menu.querySelectorAll('button').forEach(proxy => {
      if (!activeSections.has(proxy.dataset.sellerNav || '')) proxy.remove();
    });

    const nestedActive = menu.querySelector('button.active');
    more.classList.toggle('active', Boolean(nestedActive));
    const label = more.querySelector('summary span');
    if (label) label.textContent = 'Mais';
    more.querySelector('summary')?.setAttribute(
      'aria-label',
      nestedActive ? `Mais áreas do portal. Atual: ${nestedActive.textContent.trim()}` : 'Mais áreas do portal',
    );

    const mode = matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop';
    if (more.dataset.navigationMode !== mode) more.open = false;
    more.dataset.navigationMode = mode;
  }

  function showSection(target) {
    const normalized = String(target || 'home');
    const section = document.querySelector(`.seller-portal-section[data-seller-section="${CSS.escape(normalized)}"]`);
    if (!section) return false;

    document.querySelectorAll('.seller-portal-section').forEach(item => {
      setHidden(item, item !== section);
    });

    document.querySelectorAll('.seller-v2-nav button').forEach(button => {
      setActive(button, button.dataset.sellerNav === normalized);
    });

    const dashboard = document.getElementById('dashboardView');
    if (dashboard && dashboard.dataset.activeSection !== normalized) {
      dashboard.dataset.activeSection = normalized;
    }

    if (normalized === 'finance') window.financeLoadSeller?.().catch?.(() => {});
    if (normalized === 'credit-purchases') window.creditPackagesLoad?.().catch?.(() => {});
    if (normalized === 'customers') window.sellerCommercialRenderCustomers?.();

    syncCompactNavigation();
    if (matchMedia('(max-width: 760px)').matches) {
      document.querySelector('.seller-v2-more')?.removeAttribute('open');
    }
    return true;
  }

  function genericNavigate(target) {
    const normalized = String(target || 'home');
    if (showSection(normalized)) return;
    if (typeof fallbackNavigate === 'function' && fallbackNavigate !== genericNavigate) {
      fallbackNavigate(normalized);
    }
  }

  function refreshNavigation() {
    fallbackRefresh?.();
    const active = document.getElementById('dashboardView')?.dataset.activeSection || 'home';
    showSection(active);
    syncCompactNavigation();
  }

  function install() {
    if (!installed) {
      if (typeof window.sellerPortalNavigate !== 'function') return false;
      fallbackNavigate = window.sellerPortalNavigate;
      fallbackRefresh = window.sellerPortalRefreshNavigation;
      window.sellerPortalNavigate = genericNavigate;
      window.sellerPortalRefreshNavigation = refreshNavigation;
      installed = true;
    }
    syncCompactNavigation();
    return true;
  }

  function bootstrap() {
    install();
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      install();
      if (attempts >= 40) clearInterval(timer);
    }, 250);
    window.addEventListener('resize', syncCompactNavigation);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
