(() => {
  'use strict';

  if (!/\/seller\.html$/i.test(location.pathname)) return;

  let fallbackNavigate = null;
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
    if (installed && window.sellerPortalNavigate === genericNavigate) return true;
    if (typeof window.sellerPortalNavigate !== 'function') return false;

    fallbackNavigate = window.sellerPortalNavigate;
    window.sellerPortalNavigate = genericNavigate;
    installed = true;
    return true;
  }

  function bootstrap() {
    install();
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 40) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
