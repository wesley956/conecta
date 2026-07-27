(() => {
  'use strict';

  if (!/\/dashboard\.html$/i.test(location.pathname)) return;

  const FUNCTION_NAME = 'admin-operations-panel';
  const $ = id => document.getElementById(id);
  const state = {
    installed: false,
    operations: null,
    operationsLoading: false,
    customerSellerKey: null,
    customerPage: 1,
    customerPageSize: 12,
    playlistSellerKey: null,
    playlistPage: 1,
    playlistPageSize: 10,
    historyPage: 1,
    historyPageSize: 20,
    originals: {},
    historyItems: new Map(),
  };

  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const normalized = value => String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const money = cents => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(cents || 0) / 100);

  const dateTime = value => {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('pt-BR');
  };

  const dateOnly = value => {
    if (!value) return '—';
    const raw = String(value);
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('pt-BR');
  };

  async function operationsApi(payload = { action: 'dashboard' }) {
    const config = window.RONECA_PANEL_CONFIG || {};
    const accessToken = await window.RonecaPanelAuth?.getAccessToken?.();
    if (!config.supabaseUrl || !config.anonKey || !accessToken) {
      throw new Error('Sessão administrativa indisponível.');
    }

    const response = await fetch(`${String(config.supabaseUrl).replace(/\/$/, '')}/functions/v1/${FUNCTION_NAME}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível carregar a organização administrativa.');
    return result;
  }

  async function loadOperations(force = false) {
    if (state.operationsLoading) return state.operations;
    if (state.operations && !force) return state.operations;

    state.operationsLoading = true;
    try {
      state.operations = await operationsApi({ action: 'dashboard' });
      applyPlaylistAccess();
      renderCompanyFinance();
      return state.operations;
    } finally {
      state.operationsLoading = false;
    }
  }

  function applyPlaylistAccess() {
    if (!state.operations || typeof playlists === 'undefined') return;
    const accessByPlaylist = new Map(
      (state.operations.playlistAccess || []).map(row => [row.playlistId, row])
    );
    playlists.forEach(playlist => {
      const access = accessByPlaylist.get(playlist.id);
      playlist.sellerIds = access?.sellerIds || [];
      playlist.sellerNames = access?.sellerNames || [];
    });
  }

  function sellerByKey(key) {
    return sellers.find(seller => seller.id === key) || null;
  }

  function statusBadge(status) {
    if (typeof badge === 'function') return badge(status);
    return `<span class="badge ${escapeHtml(status)}">${escapeHtml(status)}</span>`;
  }

  function pagination(total, page, pageSize, changeFunction) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(Math.max(1, page), pages);
    return `
      <div class="admin-ops-pagination">
        <button class="btn" type="button" onclick="${changeFunction}(${Math.max(1, current - 1)})" ${current <= 1 ? 'disabled' : ''}>Anterior</button>
        <span>Página <strong>${current}</strong> de <strong>${pages}</strong> · ${total} registro(s)</span>
        <button class="btn" type="button" onclick="${changeFunction}(${Math.min(pages, current + 1)})" ${current >= pages ? 'disabled' : ''}>Próxima</button>
      </div>`;
  }

  function ensurePendingLayout() {
    const section = $('section-pending');
    if (!section || $('adminPendingCards')) return;
    const card = section.querySelector('.card');
    if (!card) return;
    card.innerHTML = `
      <div class="admin-ops-section-head">
        <div><span class="admin-ops-kicker">Fila de liberação</span><h2>Aparelhos pendentes</h2><p>Confira o aparelho e abra a liberação somente quando for preencher os dados.</p></div>
        <button class="btn" type="button" onclick="loadAll()">Atualizar fila</button>
      </div>
      <div id="adminPendingCards" class="admin-pending-grid"></div>`;
    ensurePendingModal();
  }

  function ensurePendingModal() {
    if ($('adminPendingActivationModal')) return;
    const modal = document.createElement('div');
    modal.id = 'adminPendingActivationModal';
    modal.className = 'admin-ops-modal';
    modal.innerHTML = `
      <div class="admin-ops-modal-card" role="dialog" aria-modal="true" aria-labelledby="adminPendingModalTitle">
        <div class="admin-ops-modal-head">
          <div><span class="admin-ops-kicker">Liberar aparelho</span><h2 id="adminPendingModalTitle">Ativação pendente</h2><p id="adminPendingModalSubtitle">Preencha os dados necessários para concluir.</p></div>
          <button class="admin-ops-modal-close" type="button" onclick="adminOpsClosePending()" aria-label="Fechar">×</button>
        </div>
        <div id="adminPendingModalBody"></div>
      </div>`;
    modal.addEventListener('click', event => {
      if (event.target === modal) window.adminOpsClosePending();
    });
    document.body.appendChild(modal);
  }

  function renderPendingCards() {
    ensurePendingLayout();
    const target = $('adminPendingCards');
    if (!target) return;
    const pending = devices.filter(device => device.status === 'pending');
    target.innerHTML = pending.length ? pending.map(device => `
      <article class="admin-pending-card">
        <div class="admin-pending-card-head">
          <div><small>Código do aparelho</small><strong class="mono">${escapeHtml(device.deviceCode)}</strong></div>
          ${statusBadge(device.status)}
        </div>
        <div class="admin-pending-card-meta">
          <span><small>Plataforma</small><strong>${escapeHtml(device.deviceType || 'androidtv')}</strong></span>
          <span><small>Versão</small><strong>${escapeHtml(device.appVersion || 'Não informada')}</strong></span>
          <span><small>Solicitado</small><strong>${dateTime(device.createdAt)}</strong></span>
          <span><small>Último contato</small><strong>${dateTime(device.lastSeenAt)}</strong></span>
        </div>
        <button class="btn primary" type="button" onclick="adminOpsOpenPending('${escapeHtml(device.id)}')">Liberar aparelho</button>
      </article>`).join('') : '<div class="admin-ops-empty">Nenhum aparelho aguardando liberação.</div>';
  }

  function pendingSummary(device) {
    const sellerId = $(`pend-seller-${device.id}`)?.value || '';
    const planId = $(`pend-plan-${device.id}`)?.value || '';
    const playlistId = $(`pend-playlist-${device.id}`)?.value || '';
    const customerId = $(`pend-customer-${device.id}`)?.value || '';
    const seller = sellers.find(item => item.id === sellerId);
    const plan = plans.find(item => item.id === planId);
    const playlist = playlists.find(item => item.id === playlistId);
    const customer = customers.find(item => item.id === customerId);
    const summary = $('adminPendingModalSummary');
    if (!summary) return;
    const cost = Number(plan?.creditCost || 0);
    const balance = Number(seller?.creditBalance || 0);
    summary.innerHTML = `
      <div><small>Cliente</small><strong>${escapeHtml(customer?.name || 'Não selecionado')}</strong></div>
      <div><small>Vendedor</small><strong>${escapeHtml(seller?.name || 'Não selecionado')}</strong></div>
      <div><small>Plano</small><strong>${escapeHtml(plan?.name || 'Não selecionado')}</strong></div>
      <div><small>Lista principal</small><strong>${escapeHtml(playlist?.name || 'Não selecionada')}</strong></div>
      <div><small>Custo</small><strong>${cost ? `${cost} crédito(s)` : '—'}</strong></div>
      <div><small>Saldo após</small><strong>${seller && plan ? `${balance - cost} crédito(s)` : '—'}</strong></div>`;
  }

  window.adminOpsOpenPending = deviceId => {
    const device = devices.find(item => item.id === deviceId);
    if (!device) return show?.('Aparelho pendente não encontrado.', true);
    ensurePendingModal();
    $('adminPendingModalTitle').textContent = `Liberar ${device.deviceCode}`;
    $('adminPendingModalSubtitle').textContent = `${device.deviceType || 'androidtv'} · ${device.appVersion || 'versão não informada'}`;
    $('adminPendingModalBody').innerHTML = `
      <div class="admin-pending-form-grid">
        <label>Cliente<select id="pend-customer-${escapeHtml(device.id)}">${customerOptions(device.customerId)}</select></label>
        <label>Vendedor<select id="pend-seller-${escapeHtml(device.id)}">${sellerOptions(device.sellerId)}</select></label>
        <label>Plano<select id="pend-plan-${escapeHtml(device.id)}">${planOptions(device.planId)}</select></label>
        <label>Lista principal<select id="pend-playlist-${escapeHtml(device.id)}">${playlistOptions(device.playlistId)}</select></label>
        <label>Lista reserva<select id="pend-backup-playlist-${escapeHtml(device.id)}">${playlistOptions(device.backupPlaylistId)}</select></label>
        <label>Validade<input id="pend-exp-${escapeHtml(device.id)}" type="date" value="${thirtyDaysDate()}"></label>
      </div>
      <div id="adminPendingModalSummary" class="admin-pending-summary"></div>
      <div class="admin-ops-modal-actions">
        <button class="btn primary" type="button" onclick="adminOpsConfirmPending('${escapeHtml(device.id)}')">Confirmar liberação</button>
        <button class="btn" type="button" onclick="adminOpsClosePending()">Cancelar</button>
      </div>`;
    ['customer', 'seller', 'plan', 'playlist'].forEach(field => {
      $(`pend-${field}-${device.id}`)?.addEventListener('change', () => pendingSummary(device));
    });
    pendingSummary(device);
    $('adminPendingActivationModal').classList.add('open');
  };

  window.adminOpsClosePending = () => $('adminPendingActivationModal')?.classList.remove('open');

  window.adminOpsConfirmPending = async deviceId => {
    const button = $('adminPendingModalBody')?.querySelector('.btn.primary');
    if (button) button.disabled = true;
    try {
      await window.activatePending?.(deviceId);
      const stillPending = devices.some(item => item.id === deviceId && item.status === 'pending');
      if (!stillPending) window.adminOpsClosePending();
    } finally {
      if (button) button.disabled = false;
    }
  };

  function compactDeviceCard(device) {
    const left = typeof daysLeft === 'function' ? daysLeft(device.expiresAt) : null;
    const validity = left === null ? 'Sem vencimento' : (left < 0 ? `Vencido há ${Math.abs(left)} dia(s)` : `${left} dia(s) restantes`);
    const backup = device.backupPlaylistId ? 'Reserva configurada' : 'Sem lista reserva';
    return `
      <article class="admin-device-card admin-device-card-compact" data-status="${escapeHtml(device.status)}">
        <div class="admin-device-head">
          <div><div class="mono admin-device-code">${escapeHtml(device.deviceCode)}</div><strong>${escapeHtml(device.customerName || 'Sem cliente')}</strong></div>
          ${statusBadge(device.status)}
        </div>
        <div class="admin-device-compact-meta">
          <span><small>Vendedor</small><strong>${escapeHtml(device.sellerName || 'Sem vendedor')}</strong></span>
          <span><small>Plano</small><strong>${escapeHtml(device.planName || 'Sem plano')}</strong></span>
          <span><small>Validade</small><strong>${dateOnly(device.expiresAt)}</strong><em>${escapeHtml(validity)}</em></span>
          <span><small>Listas</small><strong>${escapeHtml(device.playlistName || 'Sem principal')}</strong><em>${escapeHtml(backup)}</em></span>
        </div>
        <button class="btn primary" type="button" onclick="showDeviceDetails('${escapeHtml(device.id)}')">Abrir aparelho</button>
        <div hidden aria-hidden="true">
          <select id="dev-customer-${escapeHtml(device.id)}">${customerOptions(device.customerId)}</select>
          <select id="dev-seller-${escapeHtml(device.id)}">${sellerOptions(device.sellerId)}</select>
          <select id="dev-plan-${escapeHtml(device.id)}">${planOptions(device.planId)}</select>
          <select id="dev-status-${escapeHtml(device.id)}">${statusOptions(device.status)}</select>
          <select id="dev-playlist-${escapeHtml(device.id)}">${playlistOptions(device.playlistId)}</select>
          <select id="dev-backup-playlist-${escapeHtml(device.id)}">${playlistOptions(device.backupPlaylistId)}</select>
          <input id="dev-exp-${escapeHtml(device.id)}" type="date" value="${dateInput(device.expiresAt)}">
        </div>
      </article>`;
  }

  function ensureCustomerWorkspace() {
    const section = $('section-customers');
    const primary = section?.querySelector('.entity-primary-card');
    if (!primary || $('adminCustomerWorkspace')) return;
    primary.innerHTML = `
      <div id="adminCustomerWorkspace">
        <div class="admin-ops-section-head">
          <div><span class="admin-ops-kicker">Carteira por vendedor</span><h2 id="adminCustomerWorkspaceTitle">Clientes</h2><p id="adminCustomerWorkspaceSubtitle">Escolha um vendedor para consultar sua carteira.</p></div>
          <div class="actions"><button id="adminCustomerBack" class="btn" type="button" onclick="adminOpsBackCustomers()" hidden>Voltar aos vendedores</button><button class="btn primary" type="button" onclick="openCustomerActionModal()">Novo cliente</button></div>
        </div>
        <div class="admin-ops-searchbar"><input id="customerSearch" placeholder="Buscar vendedor, cliente ou WhatsApp" oninput="adminOpsCustomerSearch()"><button class="btn" type="button" onclick="adminOpsClearCustomerSearch()">Limpar</button></div>
        <div id="adminCustomerContent"></div>
      </div>`;
  }

  function customerGroup(customer) {
    return customer.sellerId || 'unassigned';
  }

  function renderCustomerSellerCards() {
    const target = $('adminCustomerContent');
    if (!target) return;
    const term = normalized($('customerSearch')?.value || '');
    const groups = sellers.map(seller => {
      const rows = customers.filter(customer => customer.sellerId === seller.id);
      return { key: seller.id, seller, rows };
    });
    const unassigned = customers.filter(customer => !customer.sellerId);
    if (unassigned.length) groups.push({ key: 'unassigned', seller: null, rows: unassigned });
    const filtered = groups.filter(group => {
      const haystack = normalized(`${group.seller?.name || 'sem vendedor'} ${group.rows.map(row => `${row.name} ${row.whatsapp}`).join(' ')}`);
      return !term || haystack.includes(term);
    });

    target.innerHTML = filtered.length ? `<div class="admin-seller-group-grid">${filtered.map(group => {
      const customerIds = new Set(group.rows.map(row => row.id));
      const linked = devices.filter(device => customerIds.has(device.customerId));
      const active = linked.filter(device => device.status === 'active').length;
      const expiring = linked.filter(device => typeof isExpiringSoon === 'function' && isExpiringSoon(device)).length;
      return `<button class="admin-seller-group-card" type="button" onclick="adminOpsOpenCustomerSeller('${escapeHtml(group.key)}')">
        <div><small>${group.seller ? 'Vendedor' : 'Organização'}</small><strong>${escapeHtml(group.seller?.name || 'Clientes sem vendedor')}</strong><span>${escapeHtml(group.seller?.whatsapp || 'Cadastros administrativos ou antigos')}</span></div>
        <div class="admin-seller-group-metrics"><span><b>${group.rows.length}</b> clientes</span><span><b>${linked.length}</b> aparelhos</span><span><b>${active}</b> ativos</span><span><b>${expiring}</b> vencendo</span></div>
        <em>Ver clientes →</em>
      </button>`;
    }).join('')}</div>` : '<div class="admin-ops-empty">Nenhum vendedor ou cliente encontrado.</div>';
  }

  function selectedCustomerRows() {
    const key = state.customerSellerKey;
    const term = normalized($('customerSearch')?.value || '');
    return customers.filter(customer => customerGroup(customer) === key).filter(customer => {
      const haystack = normalized(`${customer.name} ${customer.whatsapp}`);
      return !term || haystack.includes(term);
    });
  }

  function renderCustomerList() {
    const target = $('adminCustomerContent');
    if (!target) return;
    const rows = selectedCustomerRows();
    const pages = Math.max(1, Math.ceil(rows.length / state.customerPageSize));
    state.customerPage = Math.min(state.customerPage, pages);
    const start = (state.customerPage - 1) * state.customerPageSize;
    const pageRows = rows.slice(start, start + state.customerPageSize);
    target.innerHTML = pageRows.length ? `
      <div class="admin-customer-card-grid">${pageRows.map(customer => {
        const wa = typeof whatsappUrl === 'function' ? whatsappUrl(customer.whatsapp) : '';
        return `<article class="admin-customer-card">
          <div class="admin-customer-card-head"><div><input id="cust-name-${escapeHtml(customer.id)}" value="${escapeHtml(customer.name)}"><input id="cust-whats-${escapeHtml(customer.id)}" value="${escapeHtml(customer.whatsapp)}"></div><span class="badge active">${Number(customer.devicesCount || 0)} aparelho(s)</span></div>
          <div class="admin-customer-card-meta"><span>Cadastrado em ${dateOnly(customer.createdAt)}</span>${wa ? `<a href="${wa}" target="_blank" rel="noreferrer">Abrir WhatsApp</a>` : ''}</div>
          <div class="actions"><button class="btn" type="button" onclick="showCustomerDetails('${escapeHtml(customer.id)}')">Detalhes</button><button class="btn green" type="button" onclick="updateCustomer('${escapeHtml(customer.id)}')">Salvar</button><button class="btn red" type="button" onclick="deleteCustomer('${escapeHtml(customer.id)}')">Excluir</button></div>
        </article>`;
      }).join('')}</div>${pagination(rows.length, state.customerPage, state.customerPageSize, 'adminOpsCustomerPage')}` : '<div class="admin-ops-empty">Nenhum cliente encontrado neste vendedor.</div>';
  }

  function renderCustomersOrganized() {
    ensureCustomerWorkspace();
    const title = $('adminCustomerWorkspaceTitle');
    const subtitle = $('adminCustomerWorkspaceSubtitle');
    const back = $('adminCustomerBack');
    if (!state.customerSellerKey) {
      if (title) title.textContent = 'Clientes por vendedor';
      if (subtitle) subtitle.textContent = 'Abra um vendedor para consultar os clientes em páginas menores.';
      if (back) back.hidden = true;
      renderCustomerSellerCards();
      return;
    }
    const seller = sellerByKey(state.customerSellerKey);
    if (title) title.textContent = seller?.name || 'Clientes sem vendedor';
    if (subtitle) subtitle.textContent = 'Clientes paginados, com edição, WhatsApp e detalhes do vínculo.';
    if (back) back.hidden = false;
    renderCustomerList();
  }

  window.adminOpsOpenCustomerSeller = key => { state.customerSellerKey = key; state.customerPage = 1; if ($('customerSearch')) $('customerSearch').value = ''; renderCustomersOrganized(); };
  window.adminOpsBackCustomers = () => { state.customerSellerKey = null; state.customerPage = 1; if ($('customerSearch')) $('customerSearch').value = ''; renderCustomersOrganized(); };
  window.adminOpsCustomerPage = page => { state.customerPage = Math.max(1, Number(page || 1)); renderCustomerList(); };
  window.adminOpsCustomerSearch = () => { state.customerPage = 1; renderCustomersOrganized(); };
  window.adminOpsClearCustomerSearch = () => { if ($('customerSearch')) $('customerSearch').value = ''; state.customerPage = 1; renderCustomersOrganized(); };

  function ensurePlaylistWorkspace() {
    const section = $('section-playlists');
    const primary = section?.querySelector('.entity-primary-card');
    if (!primary || $('adminPlaylistWorkspace')) return;
    primary.innerHTML = `
      <div id="adminPlaylistWorkspace">
        <div class="admin-ops-section-head">
          <div><span class="admin-ops-kicker">Biblioteca por vendedor</span><h2 id="adminPlaylistWorkspaceTitle">Listas</h2><p id="adminPlaylistWorkspaceSubtitle">Escolha um vendedor para ver as listas liberadas para ele.</p></div>
          <div class="actions"><button id="adminPlaylistBack" class="btn" type="button" onclick="adminOpsBackPlaylists()" hidden>Voltar aos vendedores</button><button class="btn primary" type="button" onclick="openPlaylistActionModal()">Nova lista</button></div>
        </div>
        <div class="admin-ops-searchbar"><input id="playlistSearch" placeholder="Buscar vendedor, lista ou URL" oninput="adminOpsPlaylistSearch()"><select id="playlistActiveFilter" onchange="adminOpsPlaylistSearch()"><option value="">Todas</option><option value="active">Ativas</option><option value="inactive">Inativas</option><option value="error">Com erro</option></select><button class="btn" type="button" onclick="adminOpsClearPlaylistSearch()">Limpar</button></div>
        <div id="adminPlaylistContent"></div>
      </div>`;
  }

  function playlistBelongsTo(playlist, key) {
    const sellerIds = Array.isArray(playlist.sellerIds) ? playlist.sellerIds : [];
    if (key === 'unassigned') return sellerIds.length === 0;
    return sellerIds.includes(key);
  }

  function playlistMatches(playlist) {
    const term = normalized($('playlistSearch')?.value || '');
    const filter = $('playlistActiveFilter')?.value || '';
    const termMatch = !term || normalized(`${playlist.name} ${playlist.playlistUrl} ${(playlist.sellerNames || []).join(' ')}`).includes(term);
    const statusMatch = !filter || (filter === 'active' && playlist.active) || (filter === 'inactive' && !playlist.active) || (filter === 'error' && playlist.cacheStatus === 'error');
    return termMatch && statusMatch;
  }

  function renderPlaylistSellerCards() {
    const target = $('adminPlaylistContent');
    if (!target) return;
    const groups = sellers.map(seller => ({ key: seller.id, seller, rows: playlists.filter(playlist => playlistBelongsTo(playlist, seller.id) && playlistMatches(playlist)) }));
    const unassigned = playlists.filter(playlist => playlistBelongsTo(playlist, 'unassigned') && playlistMatches(playlist));
    if (unassigned.length) groups.push({ key: 'unassigned', seller: null, rows: unassigned });
    const visible = groups.filter(group => group.rows.length || !normalized($('playlistSearch')?.value || ''));
    target.innerHTML = visible.length ? `<div class="admin-seller-group-grid">${visible.map(group => {
      const deviceIds = new Set();
      group.rows.forEach(playlist => devices.filter(device => device.playlistId === playlist.id || device.backupPlaylistId === playlist.id).forEach(device => deviceIds.add(device.id)));
      const errors = group.rows.filter(playlist => playlist.cacheStatus === 'error').length;
      return `<button class="admin-seller-group-card" type="button" onclick="adminOpsOpenPlaylistSeller('${escapeHtml(group.key)}')">
        <div><small>${group.seller ? 'Vendedor' : 'Organização'}</small><strong>${escapeHtml(group.seller?.name || 'Listas administrativas')}</strong><span>${escapeHtml(group.seller?.whatsapp || 'Sem vendedor associado')}</span></div>
        <div class="admin-seller-group-metrics"><span><b>${group.rows.length}</b> listas</span><span><b>${deviceIds.size}</b> aparelhos</span><span><b>${errors}</b> com erro</span></div><em>Ver listas →</em>
      </button>`;
    }).join('')}</div>` : '<div class="admin-ops-empty">Nenhum grupo de listas encontrado.</div>';
  }

  function selectedPlaylistRows() {
    return playlists.filter(playlist => playlistBelongsTo(playlist, state.playlistSellerKey) && playlistMatches(playlist));
  }

  function renderPlaylistList() {
    const target = $('adminPlaylistContent');
    if (!target) return;
    const rows = selectedPlaylistRows();
    const pages = Math.max(1, Math.ceil(rows.length / state.playlistPageSize));
    state.playlistPage = Math.min(state.playlistPage, pages);
    const start = (state.playlistPage - 1) * state.playlistPageSize;
    const pageRows = rows.slice(start, start + state.playlistPageSize);
    target.innerHTML = pageRows.length ? `
      <div class="admin-playlist-card-grid">${pageRows.map(playlist => `
        <article class="admin-playlist-card">
          <div class="admin-playlist-card-head"><div><input id="pl-name-${escapeHtml(playlist.id)}" value="${escapeHtml(playlist.name)}"><span>${escapeHtml(playlist.playlistType || 'm3u')} · ${Number(playlist.devicesCount || 0)} aparelho(s)</span></div>${typeof playlistCacheBadge === 'function' ? playlistCacheBadge(playlist) : ''}</div>
          <input id="pl-url-${escapeHtml(playlist.id)}" value="${escapeHtml(playlist.playlistUrl)}" aria-label="URL da lista">
          <div class="admin-playlist-controls"><select id="pl-type-${escapeHtml(playlist.id)}"><option value="m3u" ${playlist.playlistType === 'm3u' ? 'selected' : ''}>M3U</option><option value="xtream" ${playlist.playlistType === 'xtream' ? 'selected' : ''}>Xtream</option><option value="stalker" ${playlist.playlistType === 'stalker' ? 'selected' : ''}>Stalker</option></select><select id="pl-active-${escapeHtml(playlist.id)}"><option value="true" ${playlist.active ? 'selected' : ''}>Ativa</option><option value="false" ${!playlist.active ? 'selected' : ''}>Inativa</option></select></div>
          <div class="actions"><button class="btn" type="button" onclick="showPlaylistDetails('${escapeHtml(playlist.id)}')">Detalhes</button><button class="btn orange" type="button" onclick="refreshPlaylistCache('${escapeHtml(playlist.id)}')">Gerar cache</button><button class="btn green" type="button" onclick="updatePlaylist('${escapeHtml(playlist.id)}')">Salvar</button><button class="btn red" type="button" onclick="deletePlaylist('${escapeHtml(playlist.id)}')">Excluir</button></div>
        </article>`).join('')}</div>${pagination(rows.length, state.playlistPage, state.playlistPageSize, 'adminOpsPlaylistPage')}` : '<div class="admin-ops-empty">Nenhuma lista encontrada neste vendedor.</div>';
  }

  function renderPlaylistsOrganized() {
    ensurePlaylistWorkspace();
    const title = $('adminPlaylistWorkspaceTitle');
    const subtitle = $('adminPlaylistWorkspaceSubtitle');
    const back = $('adminPlaylistBack');
    if (!state.playlistSellerKey) {
      if (title) title.textContent = 'Listas por vendedor';
      if (subtitle) subtitle.textContent = 'Os cards usam as permissões reais cadastradas para cada vendedor.';
      if (back) back.hidden = true;
      renderPlaylistSellerCards();
      return;
    }
    const seller = sellerByKey(state.playlistSellerKey);
    if (title) title.textContent = seller?.name || 'Listas administrativas';
    if (subtitle) subtitle.textContent = 'Edite, gere cache ou abra os detalhes sem misturar listas de outros vendedores.';
    if (back) back.hidden = false;
    renderPlaylistList();
  }

  window.adminOpsOpenPlaylistSeller = key => { state.playlistSellerKey = key; state.playlistPage = 1; if ($('playlistSearch')) $('playlistSearch').value = ''; renderPlaylistsOrganized(); };
  window.adminOpsBackPlaylists = () => { state.playlistSellerKey = null; state.playlistPage = 1; if ($('playlistSearch')) $('playlistSearch').value = ''; renderPlaylistsOrganized(); };
  window.adminOpsPlaylistPage = page => { state.playlistPage = Math.max(1, Number(page || 1)); renderPlaylistList(); };
  window.adminOpsPlaylistSearch = () => { state.playlistPage = 1; renderPlaylistsOrganized(); };
  window.adminOpsClearPlaylistSearch = () => { if ($('playlistSearch')) $('playlistSearch').value = ''; if ($('playlistActiveFilter')) $('playlistActiveFilter').value = ''; state.playlistPage = 1; renderPlaylistsOrganized(); };

  function ensureHistoryWorkspace() {
    const section = $('section-audit');
    const card = section?.querySelector('.card');
    if (!card || $('adminHistoryWorkspace')) return;
    card.innerHTML = `
      <div id="adminHistoryWorkspace">
        <div class="admin-ops-section-head"><div><span class="admin-ops-kicker">Auditoria completa</span><h2>Histórico e extrato de créditos</h2><p>Ações do painel e movimentações de créditos reunidas em uma única linha do tempo.</p></div><button class="btn" type="button" onclick="loadAll()">Atualizar</button></div>
        <div class="admin-history-filters">
          <input id="auditSearch" placeholder="Buscar ação, vendedor, cliente, aparelho, código ou descrição" oninput="adminOpsHistoryFilter()">
          <select id="adminHistoryType" onchange="adminOpsHistoryFilter()"><option value="">Todos os eventos</option><option value="credit">Créditos</option><option value="device">Aparelhos</option><option value="customer">Clientes</option><option value="playlist">Listas</option><option value="seller">Vendedores</option><option value="security">Segurança e administração</option></select>
          <select id="adminHistorySeller" onchange="adminOpsHistoryFilter()"></select>
          <select id="adminHistoryDirection" onchange="adminOpsHistoryFilter()"><option value="">Entradas e saídas</option><option value="positive">Entradas de crédito</option><option value="negative">Saídas de crédito</option></select>
          <input id="adminHistoryStart" type="date" aria-label="Data inicial" onchange="adminOpsHistoryFilter()">
          <input id="adminHistoryEnd" type="date" aria-label="Data final" onchange="adminOpsHistoryFilter()">
          <button class="btn" type="button" onclick="adminOpsClearHistory()">Limpar filtros</button>
        </div>
        <div id="adminHistoryTimeline" class="admin-history-timeline"></div>
      </div>`;
  }

  function historyCategory(item) {
    if (item.kind === 'credit') return 'credit';
    const action = String(item.action || '');
    const entity = String(item.entityType || '');
    if (action.startsWith('device.') || entity === 'device') return 'device';
    if (action.startsWith('customer.') || entity === 'customer') return 'customer';
    if (action.startsWith('playlist.') || entity === 'playlist') return 'playlist';
    if (action.startsWith('seller.') || entity === 'seller') return 'seller';
    return 'security';
  }

  function combinedHistory() {
    const audits = auditLogs.map(log => ({ ...log, kind: 'audit', createdAt: log.createdAt }));
    const credits = creditLedger.map(entry => ({ ...entry, kind: 'credit', createdAt: entry.createdAt }));
    return [...audits, ...credits].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
  }

  function filteredHistory() {
    const term = normalized($('auditSearch')?.value || '');
    const type = $('adminHistoryType')?.value || '';
    const sellerId = $('adminHistorySeller')?.value || '';
    const direction = $('adminHistoryDirection')?.value || '';
    const start = $('adminHistoryStart')?.value ? new Date(`${$('adminHistoryStart').value}T00:00:00`) : null;
    const end = $('adminHistoryEnd')?.value ? new Date(`${$('adminHistoryEnd').value}T23:59:59.999`) : null;
    return combinedHistory().filter(item => {
      const category = historyCategory(item);
      const amount = Number(item.amount || 0);
      const date = new Date(item.createdAt || 0);
      const itemSellerId = item.sellerId || item.metadata?.sellerId || (item.entityType === 'seller' ? item.entityId : '');
      const text = normalized(JSON.stringify(item));
      return (!type || category === type)
        && (!sellerId || itemSellerId === sellerId)
        && (!direction || (direction === 'positive' ? amount > 0 : amount < 0))
        && (!start || date >= start)
        && (!end || date <= end)
        && (!term || text.includes(term));
    });
  }

  function renderHistory() {
    ensureHistoryWorkspace();
    const sellerFilter = $('adminHistorySeller');
    if (sellerFilter) {
      const selected = sellerFilter.value;
      sellerFilter.innerHTML = '<option value="">Todos os vendedores</option>' + sellers.map(seller => `<option value="${escapeHtml(seller.id)}">${escapeHtml(seller.name)}</option>`).join('');
      sellerFilter.value = selected;
    }
    const target = $('adminHistoryTimeline');
    if (!target) return;
    const rows = filteredHistory();
    const pages = Math.max(1, Math.ceil(rows.length / state.historyPageSize));
    state.historyPage = Math.min(state.historyPage, pages);
    const start = (state.historyPage - 1) * state.historyPageSize;
    const pageRows = rows.slice(start, start + state.historyPageSize);
    state.historyItems.clear();
    target.innerHTML = pageRows.length ? `${pageRows.map((item, index) => {
      const key = `${item.kind}:${item.id || item.entityId || index}`;
      state.historyItems.set(key, item);
      if (item.kind === 'credit') {
        const amount = Number(item.amount || 0);
        return `<article class="admin-history-item credit"><div class="admin-history-marker">CR</div><div><div class="admin-history-title"><strong>${escapeHtml(typeof ledgerTypeLabel === 'function' ? ledgerTypeLabel(item.type) : item.type)}</strong><span class="${amount >= 0 ? 'ok-text' : 'danger-text'}">${amount > 0 ? '+' : ''}${amount} crédito(s)</span></div><p>${escapeHtml(item.description || 'Movimentação de créditos')}</p><div class="admin-history-meta"><span>${escapeHtml(item.sellerName || 'Vendedor não informado')}</span><span>Saldo após: ${Number(item.balanceAfter || 0)}</span><span>${dateTime(item.createdAt)}</span></div></div><button class="btn" type="button" onclick="adminOpsHistoryDetailsByKey('${escapeHtml(key)}')">Detalhes</button></article>`;
      }
      return `<article class="admin-history-item"><div class="admin-history-marker">${escapeHtml(historyCategory(item).slice(0, 2).toUpperCase())}</div><div><div class="admin-history-title"><strong>${escapeHtml(typeof actionLabel === 'function' ? actionLabel(item.action) : item.action)}</strong><span>${escapeHtml(typeof entityLabel === 'function' ? entityLabel(item.entityType) : item.entityType || 'Sistema')}</span></div><p>${escapeHtml(item.description || 'Ação administrativa')}</p><div class="admin-history-meta"><span>${dateTime(item.createdAt)}</span><span class="mono">${escapeHtml(item.entityId || '')}</span></div></div><button class="btn" type="button" onclick="adminOpsHistoryDetailsByKey('${escapeHtml(key)}')">Detalhes</button></article>`;
    }).join('')}${pagination(rows.length, state.historyPage, state.historyPageSize, 'adminOpsHistoryPage')}` : '<div class="admin-ops-empty">Nenhum registro corresponde aos filtros.</div>';
  }

  window.adminOpsHistoryFilter = () => { state.historyPage = 1; renderHistory(); };
  window.adminOpsHistoryPage = page => { state.historyPage = Math.max(1, Number(page || 1)); renderHistory(); };
  window.adminOpsClearHistory = () => { ['auditSearch', 'adminHistoryType', 'adminHistorySeller', 'adminHistoryDirection', 'adminHistoryStart', 'adminHistoryEnd'].forEach(id => { if ($(id)) $(id).value = ''; }); state.historyPage = 1; renderHistory(); };
  window.adminOpsHistoryDetailsByKey = key => {
    const item = state.historyItems.get(String(key || ''));
    if (!item) return;
    const title = item.kind === 'credit' ? 'Movimentação de créditos' : 'Evento do histórico';
    const subtitle = `<span class="mono">${escapeHtml(item.id || item.entityId || 'registro')}</span>`;
    const html = `<div class="detail-grid"><div class="detail-box half"><small>Data</small><strong>${dateTime(item.createdAt)}</strong></div><div class="detail-box half"><small>Categoria</small><strong>${escapeHtml(historyCategory(item))}</strong></div><div class="detail-box wide"><small>Descrição</small><strong>${escapeHtml(item.description || '—')}</strong></div><div class="detail-box wide"><small>Dados completos</small><pre class="admin-history-json">${escapeHtml(JSON.stringify(item, null, 2))}</pre></div></div>`;
    if (typeof openDetails === 'function') openDetails(title, subtitle, html);
  };

  function ensureCommercialCleanup() {
    const ledgerCard = document.querySelector('#section-commercial .commercial-ledger-card');
    if (ledgerCard) ledgerCard.hidden = true;
    const commercial = $('section-commercial');
    if (commercial && !commercial.querySelector('.admin-commercial-history-link')) {
      const link = document.createElement('div');
      link.className = 'admin-commercial-history-link';
      link.innerHTML = '<div><strong>Extrato completo movido para Histórico</strong><span>Use os filtros avançados para pesquisar créditos, aparelhos, clientes, listas e vendedores.</span></div><button class="btn" type="button" onclick="setTab(\'audit\')">Abrir Histórico</button>';
      commercial.querySelector('.grid')?.appendChild(link);
    }
  }

  function ensureCompanyFinance() {
    const nav = document.querySelector('.tabs');
    const commercialTab = nav?.querySelector('[data-tab="commercial"]');
    const heading = document.querySelector('.admin-page-heading');
    if (!nav || !heading) return;
    if (!nav.querySelector('[data-tab="company-finance"]')) {
      const button = document.createElement('button');
      button.className = 'tab';
      button.dataset.tab = 'company-finance';
      button.type = 'button';
      button.title = 'Financeiro da empresa';
      button.innerHTML = '<span>Financeiro</span>';
      button.onclick = () => window.setTab?.('company-finance');
      commercialTab?.insertAdjacentElement('afterend', button);
    }
    if (!$('section-company-finance')) {
      const section = document.createElement('section');
      section.id = 'section-company-finance';
      section.className = 'section';
      section.innerHTML = `
        <div class="admin-company-finance">
          <div class="admin-finance-privacy-note"><div><span class="admin-ops-kicker">Financeiro da empresa</span><h2>Recebimentos, pendências e despesas próprias</h2><p>Esta área mostra somente dinheiro da Cruz Stars. Os valores que cada vendedor cobra de seus clientes permanecem privados.</p></div><button class="btn" type="button" onclick="adminOpsRefreshFinance()">Atualizar</button></div>
          <div class="admin-finance-metrics"><article><span>Recebido em pacotes</span><strong id="adminCompanyReceived">R$ 0,00</strong></article><article><span>A receber</span><strong id="adminCompanyPending">R$ 0,00</strong></article><article><span>Em atraso</span><strong id="adminCompanyOverdue">R$ 0,00</strong></article><article><span>Despesas pagas</span><strong id="adminCompanyExpenses">R$ 0,00</strong></article><article><span>Resultado pago</span><strong id="adminCompanyResult">R$ 0,00</strong></article></div>
          <div class="card"><div class="admin-ops-section-head"><div><h2>Compras de créditos dos vendedores</h2><p>Pacotes vendidos, pagamentos e liberação de créditos.</p></div><button class="btn primary" type="button" onclick="creditPackagesOpenSale()">Nova venda</button></div><div class="tablewrap"><table><thead><tr><th>Data</th><th>Vendedor</th><th>Pacote</th><th>Créditos</th><th>Pagamento</th><th>Liberação</th><th>Validade</th><th>Valor</th><th>Ação</th></tr></thead><tbody id="adminCompanyOrders"><tr><td colspan="9" class="muted">Carregando...</td></tr></tbody></table></div></div>
          <div class="card"><div class="admin-ops-section-head"><div><h2>Outras receitas e despesas</h2><p>Registros próprios da empresa; nunca vendas particulares dos vendedores.</p></div></div><div id="adminCompanyRecords" class="admin-company-records"></div></div>
        </div>`;
      heading.insertAdjacentElement('afterend', section);
    }
  }

  function syncPackageFinance() {
    const received = $('cpReceived')?.textContent || 'R$ 0,00';
    const pending = $('cpPending')?.textContent || 'R$ 0,00';
    const overdue = $('cpOverdue')?.textContent || 'R$ 0,00';
    if ($('adminCompanyReceived')) $('adminCompanyReceived').textContent = received;
    if ($('adminCompanyPending')) $('adminCompanyPending').textContent = pending;
    if ($('adminCompanyOverdue')) $('adminCompanyOverdue').textContent = overdue;
    const source = $('cpOrders');
    const target = $('adminCompanyOrders');
    if (source && target) target.innerHTML = source.innerHTML;
  }

  function renderCompanyFinance() {
    ensureCompanyFinance();
    const finance = state.operations?.companyFinance || {};
    if ($('adminCompanyExpenses')) $('adminCompanyExpenses').textContent = money(finance.summary?.paidExpensesCents || 0);
    if ($('adminCompanyResult')) $('adminCompanyResult').textContent = money(finance.summary?.paidResultCents || 0);
    const records = finance.records || [];
    const target = $('adminCompanyRecords');
    if (target) target.innerHTML = records.length ? records.map(record => `<article><div><span class="badge ${record.recordType === 'expense' ? 'blocked' : 'active'}">${record.recordType === 'expense' ? 'Despesa' : 'Receita'}</span><strong>${escapeHtml(record.description)}</strong><small>${escapeHtml(record.category || 'Sem categoria')} · ${dateOnly(record.referenceDate)} · ${escapeHtml(record.status)}</small></div><b class="${record.recordType === 'expense' ? 'danger-text' : 'ok-text'}">${record.recordType === 'expense' ? '-' : '+'}${money(record.amountCents)}</b></article>`).join('') : '<div class="admin-ops-empty">Nenhuma receita ou despesa própria cadastrada ainda.</div>';
    syncPackageFinance();
  }

  window.adminOpsRefreshFinance = async () => {
    try {
      await Promise.all([loadOperations(true), window.creditPackagesLoad?.()]);
      syncPackageFinance();
      show?.('Financeiro da empresa atualizado.');
    } catch (error) {
      show?.(error.message, true);
    }
  };

  function patchSetTab() {
    if (state.originals.setTab || typeof window.setTab !== 'function') return;
    state.originals.setTab = window.setTab;
    window.setTab = function adminOperationsTab(tab) {
      state.originals.setTab.call(this, tab);
      if (tab === 'company-finance') {
        if ($('adminPageEyebrow')) $('adminPageEyebrow').textContent = 'Negócio';
        if ($('adminPageTitle')) $('adminPageTitle').textContent = 'Financeiro da empresa';
        if ($('adminPageDescription')) $('adminPageDescription').textContent = 'Recebimentos e despesas da Cruz Stars, sem acessar o financeiro particular dos vendedores.';
        window.adminOpsRefreshFinance();
      }
      if (tab === 'audit') renderHistory();
      if (tab === 'customers') renderCustomersOrganized();
      if (tab === 'playlists') renderPlaylistsOrganized();
    };
  }

  function patchCreditPackagesLoad() {
    if (state.originals.creditPackagesLoad || typeof window.creditPackagesLoad !== 'function') return;
    state.originals.creditPackagesLoad = window.creditPackagesLoad;
    window.creditPackagesLoad = async function adminOperationsCreditPackages() {
      const result = await state.originals.creditPackagesLoad.apply(this, arguments);
      syncPackageFinance();
      return result;
    };
  }

  function patchRenderers() {
    if (state.originals.renderPending || typeof window.renderPending !== 'function') return false;
    state.originals.renderPending = window.renderPending;
    state.originals.renderCustomers = window.renderCustomers;
    state.originals.renderPlaylists = window.renderPlaylists;
    state.originals.renderAuditLogs = window.renderAuditLogs;
    state.originals.deviceRow = window.deviceRow;
    state.originals.loadAll = window.loadAll;

    window.renderPending = renderPendingCards;
    window.renderCustomers = renderCustomersOrganized;
    window.renderPlaylists = renderPlaylistsOrganized;
    window.renderAuditLogs = renderHistory;
    window.deviceRow = compactDeviceCard;
    window.loadAll = async function adminOperationsLoadAll() {
      const result = await state.originals.loadAll.apply(this, arguments);
      try {
        await loadOperations(true);
      } catch (error) {
        console.error('Falha ao carregar organização administrativa:', error);
      }
      renderPendingCards();
      renderCustomersOrganized();
      renderPlaylistsOrganized();
      if (typeof window.renderDevices === 'function') window.renderDevices();
      renderHistory();
      renderCompanyFinance();
      ensureCommercialCleanup();
      return result;
    };
    return true;
  }

  function wireLateModules() {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      patchCreditPackagesLoad();
      syncPackageFinance();
      if (state.originals.creditPackagesLoad || attempts >= 40) clearInterval(timer);
    }, 250);
  }

  async function install() {
    if (state.installed) {
      patchCreditPackagesLoad();
      return true;
    }
    if (typeof window.renderPending !== 'function' || typeof window.setTab !== 'function') return false;
    ensurePendingLayout();
    ensureCustomerWorkspace();
    ensurePlaylistWorkspace();
    ensureHistoryWorkspace();
    ensureCompanyFinance();
    ensureCommercialCleanup();
    patchRenderers();
    patchSetTab();
    patchCreditPackagesLoad();
    state.installed = true;
    wireLateModules();
    try {
      await loadOperations(true);
    } catch (error) {
      console.error('Falha ao carregar dados complementares:', error);
    }
    renderPendingCards();
    renderCustomersOrganized();
    renderPlaylistsOrganized();
    window.renderDevices?.();
    renderHistory();
    renderCompanyFinance();
    return true;
  }

  function bootstrap() {
    let attempts = 0;
    const run = async () => {
      attempts += 1;
      const ready = await install();
      if (!ready && attempts < 40) setTimeout(run, 250);
    };
    run();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  else bootstrap();
})();
