(() => {
  'use strict';

  if (!/\/dashboard\.html$/i.test(location.pathname)) return;

  function setText(element, text) {
    if (element && element.textContent !== text) element.textContent = text;
  }

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
    if (!modalSection) return;

    const description = document.getElementById('uxSellerCreditDescription');
    const button = modalSection.querySelector('button');
    if (description) {
      description.required = true;
      const placeholder = 'Motivo obrigatório: cortesia, bônus, correção ou estorno';
      if (description.placeholder !== placeholder) description.placeholder = placeholder;
    }
    setText(button, 'Registrar ajuste');
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

  function bootstrap() {
    applyGuards();
    let attempts = 0;
    const timer = setInterval(() => {
      applyGuards();
      attempts += 1;
      if (attempts >= 20) clearInterval(timer);
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
