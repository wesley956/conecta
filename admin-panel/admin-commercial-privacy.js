(() => {
  'use strict';

  if (!/\/dashboard\.html$/i.test(location.pathname)) return;

  function cleanPrivateSellerFinance() {
    document.querySelectorAll('.tab[data-tab="finance"]').forEach(item => item.remove());
    document.getElementById('section-finance')?.remove();

    document.querySelectorAll('.finance-inline').forEach(host => {
      const id = String(host.id || '');
      if (id.startsWith('finance-pending-') || id === 'finance-admin-renew') host.remove();
    });

    document.querySelectorAll('[id^="finance-pending-"]').forEach(item => item.remove());
    document.getElementById('finance-admin-renew')?.remove();
  }

  function renameManualAdjustmentUi() {
    const modalSection = document.querySelector('[data-ux-form="credits"]');
    if (modalSection) {
      const description = document.getElementById('uxSellerCreditDescription');
      const button = modalSection.querySelector('button');
      if (description) {
        description.required = true;
        description.placeholder = 'Motivo obrigatório: cortesia, bônus, correção ou estorno';
      }
      if (button) button.textContent = 'Registrar ajuste';
    }
  }

  function installManualAdjustmentGuards() {
    if (!window.__manualCreditAdjustmentGuard && typeof window.addSellerCredits === 'function') {
      window.__manualCreditAdjustmentGuard = true;
      const original = window.addSellerCredits;
      window.addSellerCredits = function guardedAddSellerCredits() {
        const description = String(document.getElementById('sellerCreditDescription')?.value || '').trim();
        if (!description) {
          window.show?.('Informe o motivo do ajuste manual de créditos.', true);
          document.getElementById('sellerCreditDescription')?.focus();
          return;
        }
        return original.apply(this, arguments);
      };
    }

    if (!window.__modalCreditAdjustmentGuard && typeof window.submitCommercialCredits === 'function') {
      window.__modalCreditAdjustmentGuard = true;
      const original = window.submitCommercialCredits;
      window.submitCommercialCredits = function guardedSubmitCommercialCredits() {
        const description = String(document.getElementById('uxSellerCreditDescription')?.value || '').trim();
        if (!description) {
          window.show?.('Informe o motivo do ajuste manual de créditos.', true);
          document.getElementById('uxSellerCreditDescription')?.focus();
          return;
        }
        return original.apply(this, arguments);
      };
    }
  }

  function applyGuards() {
    cleanPrivateSellerFinance();
    renameManualAdjustmentUi();
    installManualAdjustmentGuards();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyGuards, { once: true });
  } else {
    applyGuards();
  }

  new MutationObserver(applyGuards).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  setTimeout(applyGuards, 300);
  setTimeout(applyGuards, 1000);
})();
