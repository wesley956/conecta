(() => {
  'use strict';

  if (!/\/seller\.html$/i.test(location.pathname)) return;

  let fallbackNavigate = null;

  function showSection(target) {
    const section = document.querySelector(`.seller-portal-section[data-seller-section="${CSS.escape(String(target || ''))}"]`);
    if (!section) return false;

    document.querySelectorAll('.seller-portal-section').forEach(item => {
      const active = item === section;
      item.hidden = !active;
      item.setAttribute('aria-hidden', String(!active));
    });

    document.querySelectorAll('.seller-v2-nav button').forEach(button => {
      const active = button.dataset.sellerNav === target;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });

    const dashboard = document.getElementById('dashboardView');
    if (dashboard) dashboard.dataset.activeSection = target;

    if (target === 'finance') window.financeLoadSeller?.().catch?.(() => {});
    if (target === 'credit-purchases') window.creditPackagesLoad?.().catch?.(() => {});
    if (target === 'customers') window.sellerCommercialRenderCustomers?.();

    dashboard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }

  function genericNavigate(target) {
    const normalized = String(target || 'home');
    if (showSection(normalized)) return;
    if (typeof fallbackNavigate === 'function' && fallbackNavigate !== genericNavigate) {
      fallbackNavigate(normalized);
    }
  }

  function install() {
    if (window.sellerPortalNavigate !== genericNavigate) {
      if (typeof window.sellerPortalNavigate === 'function') fallbackNavigate = window.sellerPortalNavigate;
      window.sellerPortalNavigate = genericNavigate;
    }
    const dashboard = document.getElementById('dashboardView');
    const active = dashboard?.dataset.activeSection || 'home';
    if (document.querySelector(`.seller-portal-section[data-seller-section="${CSS.escape(active)}"]`)) {
      showSection(active);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();

  new MutationObserver(install).observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(install, 300);
  setTimeout(install, 1000);
})();
