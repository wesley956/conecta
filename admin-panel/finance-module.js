(() => {
  'use strict';

  const FINANCE_FUNCTION = 'finance-panel';
  const NEW_PLAYLIST_VALUE = '__roneca_new_playlist__';
  const adminActivationAttempts = new Map();
  const sellerActivationAttempts = new Map();
  let adminFinanceData = null;
  let sellerFinanceData = null;
  let sellerRenewDeviceId = null;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function getGlobal(name, fallback = null) {
    try {
      return Function(`return typeof ${name} !== 'undefined' ? ${name} : undefined`)() ?? fallback;
    } catch {
      return fallback;
    }
  }

  function callGlobal(name, ...args) {
    const fn = getGlobal(name);
    if (typeof fn !== 'function') throw new Error(`Função ${name} indisponível.`);
    return fn(...args);
  }

  function installStylesheet() {
    if (document.querySelector('link[data-finance-module]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './finance-module.css?v=1.0';
    link.dataset.financeModule = 'true';
    document.head.appendChild(link);
  }

  async function panelApi(functionName, payload = {}) {
    const config = window.RONECA_PANEL_CONFIG || {};
    const supabaseUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
    const anonKey = String(config.anonKey || '').trim();
    if (!supabaseUrl || !anonKey) throw new Error('Configuração pública do Supabase não encontrada.');
    if (!window.RonecaPanelAuth) throw new Error('Sessão do painel não encontrada.');

    const accessToken = await window.RonecaPanelAuth.getAccessToken();
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `Falha HTTP ${response.status}.`);
    return data;
  }

  function newOperationKey(prefix) {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}:${random}`;
  }

  function money(cents) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number(cents || 0) / 100);
  }

  function amountToCents(value) {
    const normalized = String(value ?? '').trim().replace(',', '.');
    if (!normalized) return null;
    const number = Number(normalized);
    if (!Number.isFinite(number) || number <= 0) throw new Error('Informe um valor financeiro válido.');
    return Math.round(number * 100);
  }

  function dateOnly(value) {
    if (!value) return '—';
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
  }

  function dateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
  }

  function defaultMonthRange() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const local = date => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    return { from: local(first), to: local(last) };
  }

  function statusLabel(status) {
    const labels = { paid: 'Pago', pending: 'Pendente', overdue: 'Atrasado', cancelled: 'Cancelado' };
    return labels[status] || status || '—';
  }

  function paymentLabel(method) {
    const labels = {
      pix: 'Pix',
      cash: 'Dinheiro',
      card: 'Cartão',
      bank_transfer: 'Transferência',
      boleto: 'Boleto',
      other: 'Outro',
    };
    return labels[method] || method || '—';
  }

  function sourceLabel(source) {
    const labels = {
      manual: 'Manual',
      device_activation: 'Ativação',
      device_renewal: 'Renovação',
      credit_sale: 'Venda de créditos',
    };
    return labels[source] || source || '—';
  }

  function categoryOptions(selected = '', recordType = 'income') {
    const income = [
      ['subscription_sale', 'Venda/renovação de plano'],
      ['credit_sale', 'Venda de créditos'],
      ['other_income', 'Outra receita'],
    ];
    const expense = [
      ['server', 'Servidor'],
      ['supabase', 'Supabase'],
      ['hosting', 'Hospedagem'],
      ['domain', 'Domínio'],
      ['advertising', 'Publicidade'],
      ['playlist', 'Compra/renovação de listas'],
      ['support', 'Suporte técnico'],
      ['other_expense', 'Outra despesa'],
    ];
    return (recordType === 'expense' ? expense : income)
      .map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`)
      .join('');
  }

  function paymentOptions(selected = 'pix') {
    return [
      ['pix', 'Pix'],
      ['cash', 'Dinheiro'],
      ['card', 'Cartão'],
      ['bank_transfer', 'Transferência'],
      ['boleto', 'Boleto'],
      ['other', 'Outro'],
    ].map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
  }

  function statusOptions(selected = 'paid') {
    return [
      ['paid', 'Pago'],
      ['pending', 'Pendente'],
      ['overdue', 'Atrasado'],
      ['cancelled', 'Cancelado'],
    ].map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
  }

  function globalLists() {
    return {
      sellers: getGlobal('sellers', []) || [],
      customers: getGlobal('customers', []) || [],
      devices: getGlobal('devices', []) || [],
      plans: getGlobal('plans', []) || [],
      playlists: getGlobal('playlists', []) || [],
    };
  }

  function sellerPortalData() {
    return getGlobal('currentPortalData', {}) || {};
  }

  function options(items, selected, placeholder, label) {
    return `<option value="">${placeholder}</option>` + items.map(item => (
      `<option value="${esc(item.id)}" ${item.id === selected ? 'selected' : ''}>${esc(label(item))}</option>`
    )).join('');
  }

  function ensureFinanceModal() {
    if ($('financeModal')) return;
    const modal = document.createElement('div');
    modal.id = 'financeModal';
    modal.className = 'finance-modal';
    modal.addEventListener('click', event => {
      if (event.target === modal) closeFinanceModal();
    });
    modal.innerHTML = `
      <div class="finance-modal-card" onclick="event.stopPropagation()">
        <div class="finance-modal-head">
          <div><h2 id="financeModalTitle">Movimentação financeira</h2><p id="financeModalSubtitle"></p></div>
          <button class="btn" type="button" onclick="financeCloseModal()">Fechar</button>
        </div>
        <div id="financeModalBody"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function closeFinanceModal() {
    $('financeModal')?.classList.remove('open');
  }
  window.financeCloseModal = closeFinanceModal;

  function openFinanceModal(title, subtitle, html) {
    ensureFinanceModal();
    $('financeModalTitle').textContent = title;
    $('financeModalSubtitle').textContent = subtitle || '';
    $('financeModalBody').innerHTML = html;
    $('financeModal').classList.add('open');
  }

  function financeFormHtml({ role = 'admin', record = null, forcedType = null } = {}) {
    const lists = role === 'admin' ? globalLists() : sellerPortalData();
    const recordType = forcedType || record?.recordType || 'income';
    const sellerId = record?.sellerId || '';
    const customerId = record?.customerId || '';
    const deviceId = record?.deviceId || '';
    const planId = record?.planId || '';
    const amountValue = record ? (record.amountCents / 100).toFixed(2) : '';
    const referenceDate = record?.referenceDate || new Date().toISOString().slice(0, 10);

    return `
      <div class="finance-form-grid">
        ${role === 'admin' && !forcedType ? `
          <label>Tipo
            <select id="financeFormType" onchange="financeRefreshCategoryOptions()">
              <option value="income" ${recordType === 'income' ? 'selected' : ''}>Receita</option>
              <option value="expense" ${recordType === 'expense' ? 'selected' : ''}>Despesa</option>
            </select>
          </label>
        ` : `<input id="financeFormType" type="hidden" value="${recordType}">`}
        ${role === 'admin' ? `
          <label>Vendedor
            <select id="financeFormSeller">${options(lists.sellers || [], sellerId, 'Sem vendedor', item => item.name)}</select>
          </label>
        ` : ''}
        <label>Categoria
          <select id="financeFormCategory">${categoryOptions(record?.category || '', recordType)}</select>
        </label>
        <label>Valor (R$)
          <input id="financeFormAmount" type="number" min="0.01" step="0.01" value="${esc(amountValue)}" placeholder="0,00">
        </label>
        <label>Status
          <select id="financeFormStatus">${statusOptions(record?.status || 'paid')}</select>
        </label>
        <label>Forma de pagamento
          <select id="financeFormPayment">${paymentOptions(record?.paymentMethod || 'pix')}</select>
        </label>
        <label>Data de referência
          <input id="financeFormReferenceDate" type="date" value="${esc(referenceDate)}">
        </label>
        <label>Vencimento
          <input id="financeFormDueDate" type="date" value="${esc(record?.dueDate || '')}">
        </label>
        <label class="wide">Descrição
          <input id="financeFormDescription" value="${esc(record?.description || '')}" placeholder="Ex: Mensalidade do cliente João">
        </label>
        <label>Cliente
          <select id="financeFormCustomer">${options(lists.customers || [], customerId, 'Sem cliente', item => item.name || item.customerName || 'Cliente')}</select>
        </label>
        <label>Aparelho
          <select id="financeFormDevice">${options(lists.devices || [], deviceId, 'Sem aparelho', item => `${item.deviceCode || item.device_code || 'Aparelho'} · ${item.customerName || ''}`)}</select>
        </label>
        <label>Plano
          <select id="financeFormPlan">${options(lists.plans || [], planId, 'Sem plano', item => item.name)}</select>
        </label>
        <label class="wide">Observação
          <textarea id="financeFormNotes" rows="3" style="width:100%;border-radius:13px;padding:11px;background:rgba(2,8,26,.54);color:#fff;border:1px solid rgba(110,231,255,.22);">${esc(record?.notes || '')}</textarea>
        </label>
      </div>
      <div class="actions" style="margin-top:16px;">
        <button class="btn primary" type="button" onclick="financeSubmitRecord('${esc(record?.id || '')}', '${role}')">Salvar movimentação</button>
        <button class="btn" type="button" onclick="financeCloseModal()">Cancelar</button>
      </div>
    `;
  }

  window.financeRefreshCategoryOptions = function financeRefreshCategoryOptions() {
    const type = $('financeFormType')?.value || 'income';
    const select = $('financeFormCategory');
    if (select) select.innerHTML = categoryOptions('', type);
  };

  window.financeOpenRecord = function financeOpenRecord(type = 'income', role = 'admin') {
    openFinanceModal(
      type === 'expense' ? 'Registrar despesa' : 'Registrar recebimento',
      type === 'expense' ? 'Custos da operação em reais.' : 'Entrada financeira sem alterar o saldo de créditos.',
      financeFormHtml({ role, forcedType: type }),
    );
  };

  window.financeEditRecord = function financeEditRecord(id, role = 'admin') {
    const data = role === 'seller' ? sellerFinanceData : adminFinanceData;
    const record = data?.records?.find(item => item.id === id);
    if (!record) return;
    openFinanceModal('Editar movimentação', record.description, financeFormHtml({ role, record, forcedType: role === 'seller' ? 'income' : null }));
  };

  window.financeSubmitRecord = async function financeSubmitRecord(id = '', role = 'admin') {
    try {
      const payload = {
        action: id ? 'updateRecord' : 'createRecord',
        id: id || undefined,
        recordType: $('financeFormType')?.value || 'income',
        category: $('financeFormCategory')?.value,
        sellerId: $('financeFormSeller')?.value || null,
        customerId: $('financeFormCustomer')?.value || null,
        deviceId: $('financeFormDevice')?.value || null,
        planId: $('financeFormPlan')?.value || null,
        amountCents: amountToCents($('financeFormAmount')?.value),
        status: $('financeFormStatus')?.value,
        paymentMethod: $('financeFormPayment')?.value,
        referenceDate: $('financeFormReferenceDate')?.value,
        dueDate: $('financeFormDueDate')?.value || null,
        description: $('financeFormDescription')?.value.trim(),
        notes: $('financeFormNotes')?.value.trim() || null,
        idempotencyKey: id ? undefined : newOperationKey(`${role}-finance-manual`),
      };
      await panelApi(FINANCE_FUNCTION, payload);
      closeFinanceModal();
      await (role === 'seller' ? loadSellerFinance() : loadAdminFinance());
      showNotice(role, 'Movimentação financeira salva.');
    } catch (error) {
      alert(error?.message || 'Não foi possível salvar a movimentação.');
    }
  };

  window.financeUpdateStatus = async function financeUpdateStatus(id, status, role = 'admin') {
    try {
      await panelApi(FINANCE_FUNCTION, { action: 'updateRecord', id, status });
      await (role === 'seller' ? loadSellerFinance() : loadAdminFinance());
      showNotice(role, 'Status financeiro atualizado.');
    } catch (error) {
      alert(error?.message || 'Não foi possível atualizar o status.');
    }
  };

  window.financeDeleteRecord = async function financeDeleteRecord(id, role = 'admin') {
    const message = role === 'seller'
      ? 'Excluir esta venda do financeiro? Ela sairá do histórico e dos totais, mas o aparelho continuará ativo e nenhum crédito será devolvido.'
      : 'Excluir definitivamente esta movimentação financeira?';
    if (!confirm(message)) return;
    try {
      await panelApi(FINANCE_FUNCTION, { action: 'deleteRecord', id });
      await (role === 'seller' ? loadSellerFinance() : loadAdminFinance());
      showNotice(role, role === 'seller' ? 'Venda excluída do financeiro.' : 'Movimentação excluída.');
    } catch (error) {
      alert(error?.message || 'Não foi possível excluir a movimentação.');
    }
  };

  function showNotice(role, message, error = false) {
    if (role === 'admin') {
      try { callGlobal('show', message, error); } catch { /* noop */ }
      return;
    }
    const host = $('sellerFinanceMsg');
    if (!host) return;
    host.className = `seller-msg ${error ? 'err' : 'ok'}`;
    host.textContent = message;
  }

  function adminSectionHtml() {
    const range = defaultMonthRange();
    return `
      <div class="finance-section">
        <div class="finance-toolbar">
          <div class="finance-toolbar-head">
            <div><h2>Financeiro operacional</h2><p>Caixa confirmado, contas a receber e despesas, sem misturar dinheiro com créditos.</p></div>
            <div class="actions">
              <button class="btn green" type="button" onclick="financeOpenRecord('income','admin')">Nova receita</button>
              <button class="btn red" type="button" onclick="financeOpenRecord('expense','admin')">Nova despesa</button>
              <button class="btn" type="button" onclick="financeExportCsv()">Exportar CSV</button>
            </div>
          </div>
          <div class="finance-filters">
            <label>De<input id="financeDateFrom" type="date" value="${range.from}"></label>
            <label>Até<input id="financeDateTo" type="date" value="${range.to}"></label>
            <label>Tipo<select id="financeTypeFilter"><option value="">Todos</option><option value="income">Receitas</option><option value="expense">Despesas</option></select></label>
            <label>Status<select id="financeStatusFilter"><option value="">Todos</option>${statusOptions('')}</select></label>
            <label>Pagamento<select id="financePaymentFilter"><option value="">Todos</option>${paymentOptions('')}</select></label>
            <label>Vendedor<select id="financeSellerFilter"><option value="">Todos</option></select></label>
          </div>
          <div class="actions" style="margin-top:12px;"><button class="btn primary" type="button" onclick="financeLoadAdmin()">Aplicar filtros</button></div>
        </div>

        <div class="finance-metrics">
          <div class="finance-metric"><small>Recebido no período</small><strong id="financePaidIncome" class="finance-positive">R$ 0,00</strong></div>
          <div class="finance-metric"><small>Despesas pagas</small><strong id="financePaidExpenses" class="finance-negative">R$ 0,00</strong></div>
          <div class="finance-metric"><small>Resultado de caixa confirmado</small><strong id="financeProfit" class="finance-neutral">R$ 0,00</strong></div>
          <div class="finance-metric"><small>A receber</small><strong id="financePending" class="finance-warning">R$ 0,00</strong></div>
          <div class="finance-metric"><small>Em atraso</small><strong id="financeOverdue" class="finance-negative">R$ 0,00</strong></div>
          <div class="finance-metric"><small>Ticket médio</small><strong id="financeTicket" class="finance-neutral">R$ 0,00</strong></div>
        </div>

        <div class="finance-card">
          <div class="finance-card-head"><div><h2>Movimentações</h2><p id="financePeriodText">Carregando...</p></div></div>
          <div class="finance-table-wrap"><table class="finance-table"><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Vendedor/cliente</th><th>Pagamento</th><th>Status</th><th>Valor</th><th>Ações</th></tr></thead><tbody id="financeRecordsBody"></tbody></table></div>
        </div>

        <div class="finance-seller-summary">
          <div class="finance-card-head"><div><h2>Vendas por vendedor</h2><p>Valores recebidos, pendentes e atrasados. Não representa comissão.</p></div></div>
          <div id="financeSellerSummary" class="finance-seller-grid"></div>
        </div>
      </div>
    `;
  }

  function ensureAdminSection() {
    if (!/\/dashboard\.html$/i.test(location.pathname)) return false;
    const nav = document.querySelector('.tabs');
    const heading = document.querySelector('.admin-page-heading');
    if (!nav || !heading) return false;

    if (!document.querySelector('[data-tab="finance"]')) {
      const button = document.createElement('button');
      button.className = 'tab';
      button.dataset.tab = 'finance';
      button.type = 'button';
      button.title = 'Financeiro';
      button.setAttribute('aria-label', 'Financeiro');
      button.onclick = () => window.setTab?.('finance');
      button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16v12H4zM7 4h10v3M8 13h8M12 10v6"/></svg><span>Financeiro</span>';
      const playlists = nav.querySelector('[data-tab="playlists"]');
      if (playlists) playlists.insertAdjacentElement('beforebegin', button);
      else nav.appendChild(button);
    }

    if (!$('section-finance')) {
      const section = document.createElement('section');
      section.id = 'section-finance';
      section.className = 'section';
      section.innerHTML = adminSectionHtml();
      heading.insertAdjacentElement('afterend', section);
    }

    const lists = globalLists();
    const sellerFilter = $('financeSellerFilter');
    if (sellerFilter) {
      const selected = sellerFilter.value;
      sellerFilter.innerHTML = '<option value="">Todos</option>' + (lists.sellers || []).map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
      sellerFilter.value = selected;
    }

    if (!window.__financeAdminSetTabPatched && typeof window.setTab === 'function') {
      window.__financeAdminSetTabPatched = true;
      const original = window.setTab;
      window.setTab = function financeSetTab(tab) {
        original(tab);
        if (tab === 'finance') {
          if ($('adminPageEyebrow')) $('adminPageEyebrow').textContent = 'Negócio';
          if ($('adminPageTitle')) $('adminPageTitle').textContent = 'Financeiro';
          if ($('adminPageDescription')) $('adminPageDescription').textContent = 'Acompanhe dinheiro confirmado, despesas e pendências sem misturar estimativas.';
          loadAdminFinance().catch(error => showNotice('admin', error.message, true));
        }
      };
    }

    return true;
  }

  function adminFilters() {
    return {
      dateFrom: $('financeDateFrom')?.value,
      dateTo: $('financeDateTo')?.value,
      recordType: $('financeTypeFilter')?.value || null,
      status: $('financeStatusFilter')?.value || null,
      paymentMethod: $('financePaymentFilter')?.value || null,
      sellerId: $('financeSellerFilter')?.value || null,
    };
  }

  async function loadAdminFinance() {
    if (!ensureAdminSection() || !window.RonecaPanelAuth?.hasSession?.()) return;
    const data = await panelApi(FINANCE_FUNCTION, { action: 'dashboard', ...adminFilters() });
    adminFinanceData = data;
    renderAdminFinance();
  }
  window.financeLoadAdmin = loadAdminFinance;

  function recordRows(records, role) {
    return records.length ? records.map(record => `
      <tr>
        <td>${dateOnly(record.referenceDate)}<br><small>${record.paidAt ? `Pago: ${dateTime(record.paidAt)}` : `Vence: ${dateOnly(record.dueDate)}`}</small></td>
        <td><span class="finance-type ${esc(record.recordType)}">${record.recordType === 'income' ? 'Receita' : 'Despesa'}</span><br><small>${esc(sourceLabel(record.source))}</small></td>
        <td><div class="finance-record-description"><strong>${esc(record.description)}</strong><span>${esc(record.planName || record.category || '')}</span><small>${esc(record.deviceCode || '')}</small></div></td>
        <td><strong>${esc(record.sellerName || 'Sem vendedor')}</strong><br><small>${esc(record.customerName || 'Sem cliente')}</small></td>
        <td>${esc(paymentLabel(record.paymentMethod))}</td>
        <td><span class="finance-status ${esc(record.status)}">${esc(statusLabel(record.status))}</span></td>
        <td><strong class="${record.recordType === 'income' ? 'finance-positive' : 'finance-negative'}">${money(record.amountCents)}</strong></td>
        <td><div class="finance-actions">
          ${record.source === 'manual' ? `<button class="btn" onclick="financeEditRecord('${esc(record.id)}','${role}')">Editar</button>` : ''}
          ${record.status !== 'paid' ? `<button class="btn green" onclick="financeUpdateStatus('${esc(record.id)}','paid','${role}')">Marcar pago</button>` : ''}
          ${record.status !== 'cancelled' ? `<button class="btn orange" onclick="financeUpdateStatus('${esc(record.id)}','cancelled','${role}')">Cancelar</button>` : ''}
          ${role === 'admin' && record.source === 'manual' ? `<button class="btn red" onclick="financeDeleteRecord('${esc(record.id)}','admin')">Excluir</button>` : ''}
        </div></td>
      </tr>
    `).join('') : '<tr><td colspan="8" class="finance-empty">Nenhuma movimentação encontrada neste período.</td></tr>';
  }

  function renderAdminFinance() {
    if (!adminFinanceData) return;
    const summary = adminFinanceData.summary || {};
    $('financePaidIncome').textContent = money(summary.paidIncomeCents);
    $('financePaidExpenses').textContent = money(summary.paidExpensesCents);
    $('financeProfit').textContent = money(summary.confirmedCashResultCents);
    $('financeProfit').className = Number(summary.confirmedCashResultCents || 0) < 0 ? 'finance-negative' : 'finance-positive';
    $('financePending').textContent = money(summary.pendingIncomeCents);
    $('financeOverdue').textContent = money(summary.overdueIncomeCents);
    $('financeTicket').textContent = money(summary.ticketAverageCents);
    $('financePeriodText').textContent = `${dateOnly(adminFinanceData.dateFrom)} até ${dateOnly(adminFinanceData.dateTo)} · ${summary.recordsCount || 0} movimentação(ões)`;
    $('financeRecordsBody').innerHTML = recordRows(adminFinanceData.records || [], 'admin');
    $('financeSellerSummary').innerHTML = (adminFinanceData.sellerSummary || []).length
      ? adminFinanceData.sellerSummary.map(item => `
        <div class="finance-seller-item"><strong>${esc(item.sellerName)}</strong>
          <div><span>Recebido</span><b class="finance-positive">${money(item.paidCents)}</b></div>
          <div><span>Pendente</span><b class="finance-warning">${money(item.pendingCents)}</b></div>
          <div><span>Atrasado</span><b class="finance-negative">${money(item.overdueCents)}</b></div>
          <div><span>Registros</span><b>${Number(item.salesCount || 0)}</b></div>
        </div>
      `).join('')
      : '<div class="finance-empty">Nenhuma venda por vendedor no período.</div>';
  }

  window.financeExportCsv = function financeExportCsv() {
    const records = adminFinanceData?.records || [];
    const rows = [
      ['Data', 'Tipo', 'Descrição', 'Vendedor', 'Cliente', 'Aparelho', 'Plano', 'Forma', 'Status', 'Valor'],
      ...records.map(record => [
        record.referenceDate,
        record.recordType === 'income' ? 'Receita' : 'Despesa',
        record.description,
        record.sellerName || '',
        record.customerName || '',
        record.deviceCode || '',
        record.planName || '',
        paymentLabel(record.paymentMethod),
        statusLabel(record.status),
        (record.amountCents / 100).toFixed(2).replace('.', ','),
      ]),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `financeiro-${adminFinanceData?.dateFrom || 'periodo'}-${adminFinanceData?.dateTo || ''}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  function sellerSectionHtml() {
    const range = defaultMonthRange();
    return `
      <div class="finance-card-head">
        <div><h2>Meu financeiro</h2><p>Suas vendas e recebimentos. Créditos continuam em uma área separada.</p></div>
        <button class="primary" type="button" onclick="financeOpenRecord('income','seller')">Registrar recebimento</button>
      </div>
      <div class="finance-filters">
        <label>De<input id="sellerFinanceDateFrom" type="date" value="${range.from}"></label>
        <label>Até<input id="sellerFinanceDateTo" type="date" value="${range.to}"></label>
        <label>Status<select id="sellerFinanceStatus"><option value="">Todos</option>${statusOptions('')}</select></label>
        <label>Pagamento<select id="sellerFinancePayment"><option value="">Todos</option>${paymentOptions('')}</select></label>
        <div><button type="button" onclick="financeLoadSeller()">Aplicar filtros</button></div>
      </div>
      <div class="finance-metrics" style="margin-top:14px;">
        <div class="finance-metric"><small>Recebido</small><strong id="sellerFinancePaid" class="finance-positive">R$ 0,00</strong></div>
        <div class="finance-metric"><small>A receber</small><strong id="sellerFinancePending" class="finance-warning">R$ 0,00</strong></div>
        <div class="finance-metric"><small>Em atraso</small><strong id="sellerFinanceOverdue" class="finance-negative">R$ 0,00</strong></div>
        <div class="finance-metric"><small>Vendas pagas</small><strong id="sellerFinanceSales" class="finance-neutral">0</strong></div>
        <div class="finance-metric"><small>Ticket médio</small><strong id="sellerFinanceTicket" class="finance-neutral">R$ 0,00</strong></div>
      </div>
      <div id="sellerFinanceMsg" class="seller-msg"></div>
      <div id="sellerFinanceRecords" class="seller-finance-records"></div>
    `;
  }

  function ensureSellerSection() {
    if (!/\/seller\.html$/i.test(location.pathname)) return false;
    const nav = document.querySelector('.seller-v2-nav');
    const dashboard = $('dashboardView');
    if (!nav || !dashboard) return false;

    if (!nav.querySelector('[data-seller-nav="finance"]')) {
      const button = document.createElement('button');
      button.dataset.sellerNav = 'finance';
      button.type = 'button';
      button.textContent = 'Financeiro';
      button.onclick = () => {
        window.sellerPortalNavigate?.('finance');
        loadSellerFinance().catch(error => showNotice('seller', error.message, true));
      };
      const credits = nav.querySelector('[data-seller-nav="credits"]');
      nav.insertBefore(button, credits || null);
    }

    if (!$('sellerFinanceCard')) {
      const card = document.createElement('div');
      card.id = 'sellerFinanceCard';
      card.className = 'card seller-portal-section';
      card.dataset.sellerSection = 'finance';
      card.hidden = true;
      card.innerHTML = sellerSectionHtml();
      const creditsCard = $('sellerCreditsCard');
      dashboard.insertBefore(card, creditsCard || null);
      window.sellerPortalRefreshNavigation?.();
    }
    return true;
  }

  async function loadSellerFinance() {
    if (!ensureSellerSection() || !window.RonecaPanelAuth?.hasSession?.()) return;
    const data = await panelApi(FINANCE_FUNCTION, {
      action: 'dashboard',
      dateFrom: $('sellerFinanceDateFrom')?.value,
      dateTo: $('sellerFinanceDateTo')?.value,
      status: $('sellerFinanceStatus')?.value || null,
      paymentMethod: $('sellerFinancePayment')?.value || null,
    });
    sellerFinanceData = data;
    renderSellerFinance();
  }
  window.financeLoadSeller = loadSellerFinance;

  function renderSellerFinance() {
    if (!sellerFinanceData) return;
    const summary = sellerFinanceData.summary || {};
    $('sellerFinancePaid').textContent = money(summary.paidIncomeCents);
    $('sellerFinancePending').textContent = money(summary.pendingIncomeCents);
    $('sellerFinanceOverdue').textContent = money(summary.overdueIncomeCents);
    $('sellerFinanceSales').textContent = Number(summary.paidSalesCount || 0).toLocaleString('pt-BR');
    $('sellerFinanceTicket').textContent = money(summary.ticketAverageCents);
    const records = sellerFinanceData.records || [];
    $('sellerFinanceRecords').innerHTML = records.length ? records.map(record => `
      <div class="seller-finance-record">
        <div><h3>${esc(record.description)}</h3><p>${esc(record.customerName || 'Sem cliente')} · ${esc(record.deviceCode || 'Sem aparelho')}</p><p>${dateOnly(record.referenceDate)} · ${esc(paymentLabel(record.paymentMethod))} · <span class="finance-status ${esc(record.status)}">${esc(statusLabel(record.status))}</span></p></div>
        <div class="seller-finance-value"><div class="finance-positive">${money(record.amountCents)}</div><div class="finance-actions" style="margin-top:8px;">${record.source === 'manual' ? `<button onclick="financeEditRecord('${esc(record.id)}','seller')">Editar</button>` : ''}${record.status !== 'paid' ? `<button onclick="financeUpdateStatus('${esc(record.id)}','paid','seller')">Pago</button>` : ''}<button class="danger" onclick="financeDeleteRecord('${esc(record.id)}','seller')">Excluir</button></div></div>
      </div>
    `).join('') : '<div class="finance-empty">Nenhuma movimentação financeira neste período.</div>';
  }

  function financeInlineFields(prefix, title = 'Registrar venda no financeiro') {
    return `
      <div id="${prefix}" class="finance-inline">
        <div class="finance-inline-title"><strong>${title}</strong><label><input id="${prefix}-enabled" type="checkbox" checked onchange="financeToggleInline('${prefix}')"> Registrar</label></div>
        <div class="finance-inline-fields"><label>Valor cobrado (R$)<input id="${prefix}-amount" type="number" min="0.01" step="0.01" placeholder="0,00"></label></div>
        <div class="finance-inline-fields"><label>Status<select id="${prefix}-status">${statusOptions('paid')}</select></label></div>
        <div class="finance-inline-fields"><label>Pagamento<select id="${prefix}-payment">${paymentOptions('pix')}</select></label></div>
        <div class="finance-inline-fields"><label>Vencimento<input id="${prefix}-due" type="date"></label></div>
        <div class="finance-inline-fields wide"><label>Observação<input id="${prefix}-notes" placeholder="Opcional"></label></div>
      </div>
    `;
  }

  window.financeToggleInline = function financeToggleInline(prefix) {
    const host = $(prefix);
    const enabled = $(`${prefix}-enabled`)?.checked !== false;
    host?.setAttribute('aria-disabled', String(!enabled));
    host?.querySelectorAll('.finance-inline-fields input, .finance-inline-fields select').forEach(field => {
      field.disabled = !enabled;
    });
  };

  function readInlineFinance(prefix, description) {
    if (!$(`${prefix}-enabled`)?.checked) return {
      amountCents: null,
      financeStatus: null,
      paymentMethod: null,
      dueDate: null,
      financeNotes: null,
      financeDescription: null,
    };
    return {
      amountCents: amountToCents($(`${prefix}-amount`)?.value),
      financeStatus: $(`${prefix}-status`)?.value || 'paid',
      paymentMethod: $(`${prefix}-payment`)?.value || 'pix',
      dueDate: $(`${prefix}-due`)?.value || null,
      financeNotes: $(`${prefix}-notes`)?.value.trim() || null,
      financeDescription: description,
    };
  }

  function ensureAdminPendingFinance() {
    if (!/\/dashboard\.html$/i.test(location.pathname)) return;
    document.querySelectorAll('select[id^="pend-plan-"]').forEach(planSelect => {
      const id = planSelect.id.replace('pend-plan-', '');
      if ($(`finance-pending-${id}`)) return;
      const row = planSelect.closest('tr');
      const playlistCell = row?.querySelector('.inline-playlist-cell') || row?.querySelector('td:nth-child(5)');
      if (!playlistCell) return;
      playlistCell.insertAdjacentHTML('beforeend', financeInlineFields(`finance-pending-${id}`));
    });
  }

  async function resolveInlinePlaylist(role, prefix, sellerId = null) {
    const selectId = role === 'admin' ? `pend-playlist-${prefix}` : 'sellerActivationPlaylist';
    const select = $(selectId);
    if (!select || select.value !== NEW_PLAYLIST_VALUE) return select?.value || null;

    const fieldPrefix = role === 'admin' ? `pend-inline-playlist-${prefix}` : 'seller-inline-playlist';
    const name = $(`${fieldPrefix}-name`)?.value.trim();
    const playlistUrl = $(`${fieldPrefix}-url`)?.value.trim();
    const playlistType = $(`${fieldPrefix}-type`)?.value || 'm3u';
    if (!name || !playlistUrl) throw new Error('Preencha nome e URL da nova lista.');

    const result = role === 'admin'
      ? await panelApi('admin-inline-playlist', { sellerId, name, playlistUrl, playlistType })
      : await panelApi('seller-panel', { action: 'createSellerPlaylist', name, playlistUrl, playlistType });
    if (!result.cache?.ok) throw new Error(result.message || 'A lista foi criada, mas o cache ainda não ficou pronto.');
    const playlistId = result.playlistId || result.id;
    const option = document.createElement('option');
    option.value = playlistId;
    option.textContent = result.playlistName || name;
    select.appendChild(option);
    select.value = playlistId;
    return playlistId;
  }

  function ensureAttempt(store, key, input, expiryFactory) {
    const fingerprint = JSON.stringify(input);
    const current = store.get(key);
    if (current?.fingerprint === fingerprint) return current;
    const attempt = { fingerprint, idempotencyKey: newOperationKey(key), expiresAt: expiryFactory() };
    store.set(key, attempt);
    return attempt;
  }

  function calculateExpiry(planId, currentExpiresAt = null, explicitDate = '') {
    if (explicitDate) return new Date(`${explicitDate}T23:59:59.999Z`).toISOString();
    const allPlans = [...(globalLists().plans || []), ...(sellerPortalData().plans || [])];
    const plan = allPlans.find(item => item.id === planId);
    const days = Math.max(1, Number(plan?.durationDays || 30));
    const now = new Date();
    const current = currentExpiresAt ? new Date(currentExpiresAt) : null;
    const base = current && !Number.isNaN(current.getTime()) && current > now ? new Date(current) : now;
    base.setUTCDate(base.getUTCDate() + days);
    base.setUTCHours(23, 59, 59, 999);
    return base.toISOString();
  }

  function installAdminActivationFinance() {
    if (!/\/dashboard\.html$/i.test(location.pathname)) return false;
    if (typeof window.activatePending !== 'function' || typeof window.withDeviceActionLock !== 'function') return false;
    ensureAdminPendingFinance();
    if (window.__financeAdminActivationInstalled) return true;
    window.__financeAdminActivationInstalled = true;

    const originalRenderPending = window.renderPending;
    if (typeof originalRenderPending === 'function') {
      window.renderPending = function financeRenderPending() {
        const result = originalRenderPending.apply(this, arguments);
        setTimeout(ensureAdminPendingFinance, 0);
        return result;
      };
    }

    window.activatePending = async function financeActivatePending(id) {
      try {
        const sellerId = $(`pend-seller-${id}`)?.value || null;
        const planId = $(`pend-plan-${id}`)?.value || null;
        let playlistId = await resolveInlinePlaylist('admin', id, sellerId);
        const backupPlaylistId = $(`pend-backup-playlist-${id}`)?.value || null;
        const customerId = $(`pend-customer-${id}`)?.value || null;
        const expiresAtInput = $(`pend-exp-${id}`)?.value || '';
        if (playlistId && playlistId === backupPlaylistId) throw new Error('Escolha listas principal e reserva diferentes.');
        const finance = readInlineFinance(`finance-pending-${id}`, 'Venda registrada durante ativação de aparelho');

        if (!callGlobal('confirmCreditConsumption', id, sellerId, planId, 'Liberar aparelho pendente')) return;

        await callGlobal('withDeviceActionLock', id, 'activatePendingFinance', async () => {
          const input = { sellerId, planId, playlistId, backupPlaylistId, customerId, expiresAtInput, finance };
          const attempt = ensureAttempt(adminActivationAttempts, `admin-activation:${id}`, input, () => calculateExpiry(planId, null, expiresAtInput));
          await panelApi(FINANCE_FUNCTION, {
            action: 'activateDeviceWithFinance',
            deviceId: id,
            sellerId,
            customerId,
            planId,
            playlistId,
            backupPlaylistId,
            expiresAt: attempt.expiresAt,
            idempotencyKey: attempt.idempotencyKey,
            ...finance,
          });
          adminActivationAttempts.delete(`admin-activation:${id}`);
          await callGlobal('loadAll');
          await loadAdminFinance().catch(() => {});
          showNotice('admin', finance.amountCents ? 'Aparelho liberado e venda registrada.' : 'Aparelho liberado.');
        });
      } catch (error) {
        showNotice('admin', error?.message || 'Não foi possível liberar o aparelho.', true);
      }
    };
    return true;
  }

  function renewalModalHtml(device) {
    const lists = globalLists();
    const planOptionsHtml = options(lists.plans || [], device.planId, 'Escolha um plano', item => item.name);
    const playlistOptionsHtml = options(lists.playlists || [], device.playlistId, 'Escolha uma lista', item => item.name);
    const backupOptionsHtml = options(lists.playlists || [], device.backupPlaylistId, 'Sem reserva', item => item.name);
    return `
      <div class="finance-form-grid">
        <label>Plano<select id="financeAdminRenewPlan">${planOptionsHtml}</select></label>
        <label>Lista principal<select id="financeAdminRenewPlaylist">${playlistOptionsHtml}</select></label>
        <label>Lista reserva<select id="financeAdminRenewBackup">${backupOptionsHtml}</select></label>
        <label>Validade opcional<input id="financeAdminRenewExpires" type="date"></label>
      </div>
      ${financeInlineFields('finance-admin-renew', 'Registrar renovação no financeiro')}
      <div class="actions" style="margin-top:16px;"><button class="btn primary" onclick="financeSubmitAdminRenew('${esc(device.id)}')">Renovar aparelho</button><button class="btn" onclick="financeCloseModal()">Cancelar</button></div>
    `;
  }

  function installAdminRenewFinance() {
    if (!/\/dashboard\.html$/i.test(location.pathname) || typeof window.renewDevice !== 'function') return false;
    if (window.__financeAdminRenewInstalled) return true;
    window.__financeAdminRenewInstalled = true;
    window.renewDevice = function financeOpenAdminRenew(id) {
      const device = (globalLists().devices || []).find(item => item.id === id);
      if (!device) return showNotice('admin', 'Aparelho não encontrado.', true);
      window.closeDetails?.();
      openFinanceModal('Renovar aparelho', `${device.deviceCode} · ${device.customerName || 'Sem cliente'}`, renewalModalHtml(device));
    };
    return true;
  }

  window.financeSubmitAdminRenew = async function financeSubmitAdminRenew(id) {
    try {
      const device = (globalLists().devices || []).find(item => item.id === id);
      if (!device) throw new Error('Aparelho não encontrado.');
      const planId = $('financeAdminRenewPlan')?.value;
      const playlistId = $('financeAdminRenewPlaylist')?.value;
      const backupPlaylistId = $('financeAdminRenewBackup')?.value || null;
      const expiresAtInput = $('financeAdminRenewExpires')?.value || '';
      if (playlistId && playlistId === backupPlaylistId) throw new Error('Escolha listas principal e reserva diferentes.');
      const finance = readInlineFinance('finance-admin-renew', `Renovação do aparelho ${device.deviceCode}`);
      if (!callGlobal('confirmCreditConsumption', id, device.sellerId, planId, 'Renovar aparelho')) return;
      const input = { planId, playlistId, backupPlaylistId, expiresAtInput, finance };
      const attempt = ensureAttempt(adminActivationAttempts, `admin-renewal:${id}`, input, () => calculateExpiry(planId, device.expiresAt, expiresAtInput));
      await panelApi(FINANCE_FUNCTION, {
        action: 'renewDeviceWithFinance',
        deviceId: id,
        sellerId: device.sellerId,
        customerId: device.customerId,
        planId,
        playlistId,
        backupPlaylistId,
        expiresAt: attempt.expiresAt,
        idempotencyKey: attempt.idempotencyKey,
        ...finance,
      });
      adminActivationAttempts.delete(`admin-renewal:${id}`);
      closeFinanceModal();
      await callGlobal('loadAll');
      await loadAdminFinance().catch(() => {});
      showNotice('admin', finance.amountCents ? 'Aparelho renovado e recebimento registrado.' : 'Aparelho renovado.');
    } catch (error) {
      alert(error?.message || 'Não foi possível renovar o aparelho.');
    }
  };

  function ensureSellerActivationFinance() {
    const grid = $('sellerActivationForm')?.querySelector('.seller-form-grid');
    if (!grid || $('finance-seller-activation')) return false;
    grid.insertAdjacentHTML('beforeend', `<div class="wide">${financeInlineFields('finance-seller-activation')}</div>`);
    return true;
  }

  function installSellerActivationFinance() {
    if (!/\/seller\.html$/i.test(location.pathname)) return false;
    if (typeof window.sellerUxActivateDevice !== 'function') return false;
    ensureSellerActivationFinance();
    if (window.__financeSellerActivationInstalled) return true;
    window.__financeSellerActivationInstalled = true;

    const originalOpen = window.sellerUxOpenActivationForm;
    window.sellerUxOpenActivationForm = function financeSellerOpenActivation() {
      const result = originalOpen?.apply(this, arguments);
      ensureSellerActivationFinance();
      return result;
    };

    window.sellerUxActivateDevice = async function financeSellerActivateDevice() {
      try {
        const deviceCode = $('sellerDeviceCodeLookup')?.value.trim().toUpperCase();
        if (!deviceCode) throw new Error('Busque um aparelho primeiro.');
        const customerName = $('sellerActivationCustomerName')?.value.trim();
        const customerWhatsapp = $('sellerActivationCustomerWhatsapp')?.value.trim();
        const planId = $('sellerActivationPlan')?.value;
        const playlistId = await resolveInlinePlaylist('seller', deviceCode);
        const backupPlaylistId = $('sellerActivationBackupPlaylist')?.value || null;
        const expiresAtInput = $('sellerActivationExpiresAt')?.value || '';
        if (playlistId && playlistId === backupPlaylistId) throw new Error('Escolha listas principal e reserva diferentes.');
        const finance = readInlineFinance('finance-seller-activation', `Venda para ${customerName || deviceCode}`);
        const input = { deviceCode, customerName, customerWhatsapp, planId, playlistId, backupPlaylistId, expiresAtInput, finance };
        const attempt = ensureAttempt(sellerActivationAttempts, `seller-activation:${deviceCode}`, input, () => calculateExpiry(planId, null, expiresAtInput));
        showNotice('seller', 'Ativando aparelho e registrando a operação...');
        await panelApi(FINANCE_FUNCTION, {
          action: 'activateDeviceWithFinance',
          deviceCode,
          customerName,
          customerWhatsapp,
          planId,
          playlistId,
          backupPlaylistId,
          expiresAt: attempt.expiresAt,
          idempotencyKey: attempt.idempotencyKey,
          ...finance,
        });
        sellerActivationAttempts.delete(`seller-activation:${deviceCode}`);
        $('sellerActivationForm')?.classList.remove('open');
        if ($('sellerDeviceLookupResult')) $('sellerDeviceLookupResult').innerHTML = '';
        await window.loadPortal?.();
        await loadSellerFinance().catch(() => {});
        showNotice('seller', finance.amountCents ? 'Aparelho ativado e venda registrada.' : 'Aparelho ativado.', false);
      } catch (error) {
        showNotice('seller', error?.message || 'Não foi possível ativar o aparelho.', true);
      }
    };
    return true;
  }

  function ensureSellerRenewFinance() {
    const body = $('sellerUxModalBody');
    const grid = body?.querySelector('.seller-form-grid');
    if (!grid || $('finance-seller-renew')) return;
    grid.insertAdjacentHTML('afterend', financeInlineFields('finance-seller-renew', 'Registrar renovação no financeiro'));
  }

  function installSellerRenewFinance() {
    if (!/\/seller\.html$/i.test(location.pathname)) return false;
    if (typeof window.sellerUxOpenRenewModal !== 'function' || typeof window.sellerUxRenewDevice !== 'function') return false;
    if (window.__financeSellerRenewInstalled) return true;
    window.__financeSellerRenewInstalled = true;

    const originalOpen = window.sellerUxOpenRenewModal;
    window.sellerUxOpenRenewModal = function financeSellerOpenRenew(deviceId) {
      sellerRenewDeviceId = deviceId;
      const result = originalOpen.apply(this, arguments);
      setTimeout(ensureSellerRenewFinance, 0);
      return result;
    };

    window.sellerUxRenewDevice = async function financeSellerRenewDevice() {
      try {
        const device = (sellerPortalData().devices || []).find(item => item.id === sellerRenewDeviceId);
        if (!device) throw new Error('Aparelho não selecionado.');
        const planId = $('sellerRenewPlan')?.value;
        const playlistId = $('sellerRenewPlaylist')?.value;
        const backupPlaylistId = $('sellerRenewBackupPlaylist')?.value || null;
        const expiresAtInput = $('sellerRenewExpiresAt')?.value || '';
        if (playlistId && playlistId === backupPlaylistId) throw new Error('Escolha listas principal e reserva diferentes.');
        const finance = readInlineFinance('finance-seller-renew', `Renovação do aparelho ${device.deviceCode}`);
        const input = { planId, playlistId, backupPlaylistId, expiresAtInput, finance };
        const attempt = ensureAttempt(sellerActivationAttempts, `seller-renewal:${device.id}`, input, () => calculateExpiry(planId, device.expiresAt, expiresAtInput));
        await panelApi(FINANCE_FUNCTION, {
          action: 'renewDeviceWithFinance',
          deviceId: device.id,
          planId,
          playlistId,
          backupPlaylistId,
          expiresAt: attempt.expiresAt,
          idempotencyKey: attempt.idempotencyKey,
          ...finance,
        });
        sellerActivationAttempts.delete(`seller-renewal:${device.id}`);
        sellerRenewDeviceId = null;
        window.closeSellerUxModal?.();
        await window.loadPortal?.();
        await loadSellerFinance().catch(() => {});
        showNotice('seller', finance.amountCents ? 'Aparelho renovado e recebimento registrado.' : 'Aparelho renovado.');
      } catch (error) {
        alert(error?.message || 'Não foi possível renovar o aparelho.');
      }
    };
    return true;
  }

  function patchPortalRenders() {
    if (/\/dashboard\.html$/i.test(location.pathname) && typeof window.renderAll === 'function' && !window.__financeAdminRenderPatched) {
      window.__financeAdminRenderPatched = true;
      const original = window.renderAll;
      window.renderAll = function financeRenderAll() {
        const result = original.apply(this, arguments);
        ensureAdminSection();
        ensureAdminPendingFinance();
        return result;
      };
    }

    if (/\/seller\.html$/i.test(location.pathname) && typeof window.renderPortal === 'function' && !window.__financeSellerRenderPatched) {
      window.__financeSellerRenderPatched = true;
      const original = window.renderPortal;
      window.renderPortal = function financeRenderPortal(data) {
        const result = original.apply(this, arguments);
        ensureSellerSection();
        ensureSellerActivationFinance();
        return result;
      };
    }
  }

  function install() {
    installStylesheet();
    ensureFinanceModal();
    patchPortalRenders();

    if (/\/dashboard\.html$/i.test(location.pathname)) {
      const ready = ensureAdminSection() && installAdminActivationFinance() && installAdminRenewFinance();
      ensureAdminPendingFinance();
      if (!ready) setTimeout(install, 220);
    }

    if (/\/seller\.html$/i.test(location.pathname)) {
      const ready = ensureSellerSection() && installSellerActivationFinance() && installSellerRenewFinance();
      ensureSellerActivationFinance();
      if (!ready) setTimeout(install, 220);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
