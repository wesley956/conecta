(() => {
  'use strict';
  if (window.__ronecaFinanceReadModelInstalled) return;
  window.__ronecaFinanceReadModelInstalled = true;

  const FUNCTION_NAME = 'finance-panel';
  const $ = id => document.getElementById(id);
  let data = null;

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents || 0) / 100);
  const dateOnly = value => {
    if (!value) return '—';
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
  };
  const statusLabel = status => ({ paid: 'Pago', pending: 'Pendente', overdue: 'Atrasado', cancelled: 'Cancelado' }[status] || status || '—');
  const paymentLabel = method => ({ pix: 'Pix', cash: 'Dinheiro', card: 'Cartão', bank_transfer: 'Transferência', boleto: 'Boleto', other: 'Outro' }[method] || method || '—');

  async function api(payload) {
    const config = window.RONECA_PANEL_CONFIG || {};
    const token = await window.RonecaPanelAuth?.getAccessToken?.();
    if (!config.supabaseUrl || !config.anonKey || !token) throw new Error('Sessão do painel indisponível.');
    const response = await fetch(`${String(config.supabaseUrl).replace(/\/$/, '')}/functions/v1/${FUNCTION_NAME}`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', apikey: config.anonKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload || {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || result.message || 'Falha no financeiro.');
    return result;
  }

  function monthRange() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { from: iso(first), to: iso(last) };
  }

  function installStylesheet() {
    if (document.querySelector('link[data-finance-module]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = './finance-module.css?v=1.0'; link.dataset.financeModule = 'true'; document.head.appendChild(link);
  }

  function ensureSellerSection() {
    if (!/\/seller\.html$/i.test(location.pathname)) return false;
    const dashboard = $('dashboardView'); const nav = document.querySelector('.seller-v2-nav');
    if (!dashboard || !nav) return false;
    if (!nav.querySelector('[data-seller-nav="finance"]')) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.sellerNav = 'finance'; button.textContent = 'Minhas vendas';
      button.onclick = () => window.sellerPortalNavigate?.('finance'); nav.appendChild(button);
    }
    if (!$('sellerFinanceCard')) {
      const section = document.createElement('section'); section.id = 'sellerFinanceCard'; section.className = 'card seller-portal-section finance-card';
      section.dataset.sellerSection = 'finance'; section.hidden = true; section.setAttribute('aria-hidden', 'true');
      section.innerHTML = `
        <div class="finance-card-head"><div><small>Financeiro privado</small><h2>Minhas vendas</h2><p>Recebimentos e pendências. Este módulo não ativa, renova nem troca listas.</p></div><button class="btn primary" type="button" data-fin-action="new">Registrar recebimento</button></div>
        <div class="finance-metrics"><article><small>Recebido</small><strong id="sellerFinancePaid">R$ 0,00</strong></article><article><small>Pendente</small><strong id="sellerFinancePending">R$ 0,00</strong></article><article><small>Atrasado</small><strong id="sellerFinanceOverdue">R$ 0,00</strong></article><article><small>Vendas pagas</small><strong id="sellerFinanceSales">0</strong></article><article><small>Ticket médio</small><strong id="sellerFinanceTicket">R$ 0,00</strong></article></div>
        <div class="finance-filters"><label>De<input id="sellerFinanceFrom" type="date"></label><label>Até<input id="sellerFinanceTo" type="date"></label><button class="btn" type="button" data-fin-action="refresh">Atualizar</button></div>
        <div id="sellerFinanceRecords" class="seller-finance-records"><div class="finance-empty">Carregando...</div></div>`;
      dashboard.appendChild(section);
      const range = monthRange(); $('sellerFinanceFrom').value = range.from; $('sellerFinanceTo').value = range.to;
      window.sellerPortalRefreshNavigation?.();
    }
    return true;
  }

  function ensureModal() {
    if ($('financeModal')) return;
    const modal = document.createElement('div'); modal.id = 'financeModal'; modal.className = 'finance-modal';
    modal.innerHTML = '<div class="finance-modal-card"><div class="finance-modal-head"><div><h2 id="financeModalTitle">Movimentação</h2><p id="financeModalSubtitle"></p></div><button class="btn" data-fin-action="close">Fechar</button></div><div id="financeModalBody"></div></div>';
    modal.addEventListener('click', event => { if (event.target === modal) closeModal(); }); document.body.appendChild(modal);
  }
  function openModal(title, subtitle, html) { ensureModal(); $('financeModalTitle').textContent = title; $('financeModalSubtitle').textContent = subtitle || ''; $('financeModalBody').innerHTML = html; $('financeModal').classList.add('open'); }
  function closeModal() { $('financeModal')?.classList.remove('open'); }

  function form(record = null) {
    const amount = record ? (Number(record.amountCents || 0) / 100).toFixed(2) : '';
    return `<div class="finance-form-grid"><label class="wide">Descrição<input id="financeFormDescription" value="${esc(record?.description || '')}" placeholder="Ex: Mensalidade do cliente"></label><label>Valor (R$)<input id="financeFormAmount" type="number" min="0.01" step="0.01" value="${esc(amount)}"></label><label>Status<select id="financeFormStatus"><option value="paid" ${record?.status === 'paid' ? 'selected' : ''}>Pago</option><option value="pending" ${!record || record.status === 'pending' ? 'selected' : ''}>Pendente</option><option value="overdue" ${record?.status === 'overdue' ? 'selected' : ''}>Atrasado</option><option value="cancelled" ${record?.status === 'cancelled' ? 'selected' : ''}>Cancelado</option></select></label><label>Pagamento<select id="financeFormPayment"><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card">Cartão</option><option value="bank_transfer">Transferência</option><option value="boleto">Boleto</option><option value="other">Outro</option></select></label><label>Vencimento<input id="financeFormDue" type="date" value="${esc(record?.dueDate || '')}"></label><label class="wide">Observação<textarea id="financeFormNotes" rows="3">${esc(record?.notes || '')}</textarea></label></div><div class="actions"><button class="btn primary" data-fin-action="save" data-record-id="${esc(record?.id || '')}">Salvar</button><button class="btn" data-fin-action="close">Cancelar</button></div>`;
  }

  function render() {
    if (!data) return;
    const summary = data.summary || {};
    if ($('sellerFinancePaid')) $('sellerFinancePaid').textContent = money(summary.paidIncomeCents);
    if ($('sellerFinancePending')) $('sellerFinancePending').textContent = money(summary.pendingIncomeCents);
    if ($('sellerFinanceOverdue')) $('sellerFinanceOverdue').textContent = money(summary.overdueIncomeCents);
    if ($('sellerFinanceSales')) $('sellerFinanceSales').textContent = Number(summary.paidSalesCount || 0).toLocaleString('pt-BR');
    if ($('sellerFinanceTicket')) $('sellerFinanceTicket').textContent = money(summary.ticketAverageCents);
    const host = $('sellerFinanceRecords'); if (!host) return;
    const records = data.records || [];
    host.innerHTML = records.length ? records.map(record => `<article class="seller-finance-record"><div><h3>${esc(record.description)}</h3><p>${esc(record.customerName || 'Sem cliente')} · ${esc(record.deviceCode || 'Sem aparelho')}</p><p>${dateOnly(record.referenceDate)} · ${esc(paymentLabel(record.paymentMethod))} · <span class="finance-status ${esc(record.status)}">${esc(statusLabel(record.status))}</span></p></div><div class="seller-finance-value"><div class="finance-positive">${money(record.amountCents)}</div><div class="finance-actions">${record.source === 'manual' ? `<button data-fin-action="edit" data-record-id="${esc(record.id)}">Editar</button>` : ''}${record.status !== 'paid' ? `<button data-fin-action="paid" data-record-id="${esc(record.id)}">Pago</button>` : ''}<button class="danger" data-fin-action="delete" data-record-id="${esc(record.id)}">Excluir</button></div></div></article>`).join('') : '<div class="finance-empty">Nenhuma movimentação neste período.</div>';
  }

  async function refresh() {
    if (!ensureSellerSection() || !window.RonecaPanelAuth?.hasSession?.()) return;
    const range = monthRange();
    data = await api({ action: 'dashboard', dateFrom: $('sellerFinanceFrom')?.value || range.from, dateTo: $('sellerFinanceTo')?.value || range.to });
    render();
  }

  function amountCents() {
    const value = Number(String($('financeFormAmount')?.value || '').replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) throw new Error('Informe um valor válido.');
    return Math.round(value * 100);
  }

  async function save(recordId = '') {
    const payload = recordId ? { action: 'updateRecord', id: recordId } : { action: 'createRecord', recordType: 'income', category: 'other_income', idempotencyKey: `seller-finance:${crypto.randomUUID?.() || Date.now()}` };
    Object.assign(payload, { description: $('financeFormDescription')?.value, amountCents: amountCents(), status: $('financeFormStatus')?.value, paymentMethod: $('financeFormPayment')?.value, dueDate: $('financeFormDue')?.value || null, notes: $('financeFormNotes')?.value || null });
    await api(payload); closeModal(); await refresh();
  }

  async function updateStatus(recordId, status) { await api({ action: 'updateRecord', id: recordId, status }); await refresh(); }
  async function deleteRecord(recordId) { if (!confirm('Excluir esta movimentação financeira? Nenhum crédito será devolvido.')) return; await api({ action: 'deleteRecord', id: recordId }); await refresh(); }

  async function handle(button) {
    try {
      const action = button.dataset.finAction; const id = button.dataset.recordId || '';
      if (action === 'refresh') await refresh();
      else if (action === 'new') openModal('Registrar recebimento', 'Registro financeiro manual. Não altera aparelhos ou créditos.', form());
      else if (action === 'edit') { const record = (data?.records || []).find(item => item.id === id); if (record) openModal('Editar movimentação', 'Somente registros manuais podem ter valor editado.', form(record)); }
      else if (action === 'save') await save(id);
      else if (action === 'paid') await updateStatus(id, 'paid');
      else if (action === 'delete') await deleteRecord(id);
      else if (action === 'close') closeModal();
    } catch (error) { alert(error.message || 'Falha no financeiro.'); }
  }

  function install() {
    installStylesheet(); ensureModal(); ensureSellerSection();
    if (!document.documentElement.dataset.financeReadModelDelegation) {
      document.documentElement.dataset.financeReadModelDelegation = 'true';
      document.addEventListener('click', event => { const button = event.target.closest('[data-fin-action]'); if (button) handle(button); });
    }
    if (window.RonecaPanelAuth?.hasSession?.()) refresh().catch(() => {});
  }

  window.RonecaFinanceModule = Object.freeze({ refresh });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
})();
