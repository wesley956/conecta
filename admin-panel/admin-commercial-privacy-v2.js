(() => {
  'use strict';

  if (!/\/dashboard\.html$/i.test(location.pathname)) return;

  let pendingCreditAttempt = null;

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

  function makeOperationKey() {
    const random = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `admin-credit-adjust:${random}`;
  }

  function ensureCreditAttempt(sellerId, amount, description) {
    const fingerprint = JSON.stringify([sellerId, amount, description]);
    if (pendingCreditAttempt?.fingerprint === fingerprint) return pendingCreditAttempt;

    pendingCreditAttempt = {
      fingerprint,
      idempotencyKey: makeOperationKey(),
    };
    return pendingCreditAttempt;
  }

  async function callAtomicCreditAdjustment(payload) {
    if (!window.RonecaPanelAuth) throw new Error('Sessão do painel não foi carregada. Entre novamente.');

    const response = await window.fetch(window.RonecaPanelAuth.getFunctionUrl('admin-credit-adjust'), {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || 'Não foi possível registrar o ajuste de créditos.');
    return data;
  }

  async function canonicalAddSellerCredits() {
    try {
      const sellerId = String(document.getElementById('sellerCreditSeller')?.value || '').trim();
      const amount = Number(document.getElementById('sellerCreditAmount')?.value || 0);
      const description = String(document.getElementById('sellerCreditDescription')?.value || '').trim();

      if (!sellerId) throw new Error('Escolha um vendedor.');
      if (!Number.isInteger(amount) || amount < 1) throw new Error('Informe uma quantidade válida de créditos.');
      if (!description) {
        document.getElementById('sellerCreditDescription')?.focus();
        throw new Error('Informe o motivo do ajuste manual de créditos.');
      }

      const attempt = ensureCreditAttempt(sellerId, amount, description);
      window.show?.('Registrando ajuste de créditos...');
      const result = await callAtomicCreditAdjustment({
        sellerId,
        amount,
        description,
        idempotencyKey: attempt.idempotencyKey,
      });

      pendingCreditAttempt = null;
      const amountField = document.getElementById('sellerCreditAmount');
      const descriptionField = document.getElementById('sellerCreditDescription');
      if (amountField) amountField.value = '1';
      if (descriptionField) descriptionField.value = '';

      if (typeof window.loadAll === 'function') await window.loadAll();
      window.show?.(result.message || 'Ajuste de créditos registrado.');
      return true;
    } catch (error) {
      window.show?.(error?.message || 'Falha ao registrar o ajuste de créditos.', true);
      return false;
    }
  }

  async function canonicalSubmitCommercialCredits() {
    const sellerTarget = document.getElementById('sellerCreditSeller');
    const amountTarget = document.getElementById('sellerCreditAmount');
    const descriptionTarget = document.getElementById('sellerCreditDescription');
    const sellerSource = document.getElementById('uxSellerCreditSeller');
    const amountSource = document.getElementById('uxSellerCreditAmount');
    const descriptionSource = document.getElementById('uxSellerCreditDescription');

    if (sellerTarget && sellerSource) sellerTarget.value = sellerSource.value;
    if (amountTarget && amountSource) amountTarget.value = amountSource.value || '1';
    if (descriptionTarget && descriptionSource) descriptionTarget.value = descriptionSource.value;

    const ok = await canonicalAddSellerCredits();
    if (ok && typeof window.closeCommercialActionModal === 'function') window.closeCommercialActionModal();
    return ok;
  }

  function installAtomicManualAdjustment() {
    if (window.__atomicManualCreditAdjustmentInstalled) return;
    if (typeof window.addSellerCredits !== 'function' || typeof window.submitCommercialCredits !== 'function') return;

    window.__atomicManualCreditAdjustmentInstalled = true;
    window.addSellerCredits = canonicalAddSellerCredits;
    window.submitCommercialCredits = canonicalSubmitCommercialCredits;
  }

  function applyGuards() {
    cleanPrivateSellerFinance();
    renameManualAdjustmentUi();
    installAtomicManualAdjustment();
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
