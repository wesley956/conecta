/* Núcleo do dashboard administrativo. Mantido como script clássico para preservar os contratos globais dos módulos do painel. */
const API = 'https://awauvkjkucjqulkklmuo.supabase.co/functions/v1/admin-panel';
let customers = [];
let playlists = [];
let devices = [];
let sellers = [];
let plans = [];
let creditLedger = [];
const deviceActionLocks = new Set();
const deviceCommercialAttempts = new Map();

function newDeviceOperationKey(prefix) {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${random}`;
}

function selectedAdminPlan(planId) {
  return plans.find(plan => plan.id === planId) || null;
}

function explicitExpiry(dateValue) {
  if (!dateValue) return null;
  const date = new Date(`${dateValue}T23:59:59.999Z`);
  if (Number.isNaN(date.getTime())) throw new Error('Data de validade inválida.');
  return date.toISOString();
}

function calculatedExpiry(planId, currentExpiresAt = null, fallbackDays = null) {
  const plan = selectedAdminPlan(planId);
  const durationDays = Math.max(1, Number(fallbackDays || plan?.durationDays || 30));
  const now = new Date();
  const current = currentExpiresAt ? new Date(currentExpiresAt) : null;
  const base = current && !Number.isNaN(current.getTime()) && current > now
    ? new Date(current)
    : now;

  base.setUTCDate(base.getUTCDate() + durationDays);
  base.setUTCHours(23, 59, 59, 999);
  return base.toISOString();
}

function ensureDeviceCommercialAttempt(deviceId, operationType, input, expiryFactory) {
  const mapKey = `${operationType}:${deviceId}`;
  const fingerprint = JSON.stringify(input);
  const current = deviceCommercialAttempts.get(mapKey);

  if (current && current.fingerprint === fingerprint) return current;

  const attempt = {
    fingerprint,
    idempotencyKey: newDeviceOperationKey(`admin-${operationType}`),
    expiresAt: expiryFactory(),
  };
  deviceCommercialAttempts.set(mapKey, attempt);
  return attempt;
}

function clearDeviceCommercialAttempt(deviceId, operationType) {
  deviceCommercialAttempts.delete(`${operationType}:${deviceId}`);
}

let auditLogs = [];

const $ = id => document.getElementById(id);

function token() {
  return RonecaPanelAuth.hasSession() ? 'authenticated-session' : '';
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;');
}

function show(text, error = false) {
  const el = $('msg');
  clearTimeout(show.hideTimer);
  el.textContent = text;
  el.className = error ? 'msg err visible' : 'msg visible';
  el.setAttribute('role', error ? 'alert' : 'status');
  show.hideTimer = setTimeout(() => el.classList.remove('visible'), error ? 7000 : 3200);
}

function setTab(tab) {
  const pages = {
    dashboard: ['Hoje · operação', 'Bom dia. Vamos resolver o que importa.', 'Uma visão direta das decisões que precisam ser tomadas agora.'],
    pending: ['Operação', 'Pendências', 'Libere novos aparelhos com o mínimo de passos possível.'],
    devices: ['Operação', 'Aparelhos', 'Encontre rapidamente qualquer informação sem abrir uma tabela extensa.'],
    customers: ['Operação', 'Clientes', 'Encontre clientes e acompanhe todos os seus vínculos.'],
    commercial: ['Negócio', 'Comercial', 'Vendedores, planos e créditos em uma área dedicada.'],
    playlists: ['Negócio', 'Listas', 'Organize as listas e entenda onde cada uma está em uso.'],
    audit: ['Controle', 'Histórico', 'Consulte alterações importantes sem misturar auditoria com a rotina.'],
    app: ['Distribuição', 'Aplicativo', 'Baixe o APK ou gere um link temporário para o Downloader.'],
  };

  document.querySelectorAll('.tab').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });
  document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
  $('section-' + tab).classList.add('active');

  const page = pages[tab] || pages.dashboard;
  if ($('adminPageEyebrow')) $('adminPageEyebrow').textContent = page[0];
  if ($('adminPageTitle')) $('adminPageTitle').textContent = page[1];
  if ($('adminPageDescription')) $('adminPageDescription').textContent = page[2];
  const navMore = $('adminNavMore');
  const overflowTabs = new Set(['customers', 'playlists', 'audit', 'app']);
  if (navMore) {
    navMore.classList.toggle('active', overflowTabs.has(tab));
    const summaryLabel = navMore.querySelector('summary span');
    if (summaryLabel) summaryLabel.textContent = 'Mais';
    navMore.querySelector('summary')?.setAttribute(
      'aria-label',
      overflowTabs.has(tab) ? `Mais áreas do painel. Atual: ${page[1]}` : 'Mais áreas do painel',
    );
    if (window.matchMedia('(max-width: 820px)').matches) navMore.open = false;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function normalize(value) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function daysLeft(value) {
  if (!value) return null;
  const end = new Date(value);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  const diff = end.getTime() - today.getTime();
  return Math.ceil(diff / 86400000);
}

function isExpiringSoon(device) {
  if (device.status !== 'active') return false;
  const left = daysLeft(device.expiresAt);
  return left !== null && left >= 0 && left <= 7;
}

function validityLabel(value) {
  const left = daysLeft(value);

  if (left === null) {
    return '<div class="validity-note warn-text">Sem vencimento</div>';
  }

  if (left < 0) {
    return '<div class="validity-note danger-text">Vencido há ' + Math.abs(left) + ' dia(s)</div>';
  }

  if (left <= 7) {
    return '<div class="validity-note warn-text">Vence em ' + left + ' dia(s)</div>';
  }

  return '<div class="validity-note ok-text">Faltam ' + left + ' dia(s)</div>';
}

function whatsappUrl(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  const phone = digits.startsWith('55') ? digits : '55' + digits;
  return 'https://wa.me/' + phone;
}

function filteredCustomers() {
  const term = normalize($('customerSearch')?.value || '');

  if (!term) return customers;

  return customers.filter(c =>
    normalize(c.name).includes(term) ||
    normalize(c.whatsapp).includes(term)
  );
}

function filteredPlaylists() {
  const term = normalize($('playlistSearch')?.value || '');
  const active = $('playlistActiveFilter')?.value || '';

  return playlists.filter(p => {
    const matchTerm = !term ||
      normalize(p.name).includes(term) ||
      normalize(p.playlistUrl).includes(term);

    const matchActive = !active ||
      (active === 'active' && p.active) ||
      (active === 'inactive' && !p.active);

    return matchTerm && matchActive;
  });
}

function filteredDevices() {
  const term = normalize($('deviceSearch')?.value || '');
  const status = $('deviceStatusFilter')?.value || '';
  const customerId = $('deviceCustomerFilter')?.value || '';
  const sellerId = $('deviceSellerFilter')?.value || '';
  const planId = $('devicePlanFilter')?.value || '';
  const playlistId = $('devicePlaylistFilter')?.value || '';

  return devices.filter(d => {
    const matchTerm = !term ||
      normalize(d.deviceCode).includes(term) ||
      normalize(d.customerName).includes(term) ||
      normalize(d.customerWhatsapp).includes(term) ||
      normalize(d.sellerName).includes(term) ||
      normalize(d.planName).includes(term) ||
      normalize(d.playlistName).includes(term) ||
      normalize(d.deviceUuid).includes(term);

    const matchStatus = !status || d.status === status;
    const matchCustomer = !customerId || d.customerId === customerId;
    const matchSeller = !sellerId || d.sellerId === sellerId;
    const matchPlan = !planId || d.planId === planId;
    const matchPlaylist = !playlistId || d.playlistId === playlistId;

    return matchTerm && matchStatus && matchCustomer && matchSeller && matchPlan && matchPlaylist;
  });
}

function clearDeviceFilters() {
  $('deviceSearch').value = '';
  $('deviceStatusFilter').value = '';
  $('deviceCustomerFilter').value = '';
  $('deviceSellerFilter').value = '';
  $('devicePlanFilter').value = '';
  $('devicePlaylistFilter').value = '';
  renderDevices();
}

function clearPlaylistFilters() {
  $('playlistSearch').value = '';
  $('playlistActiveFilter').value = '';
  renderPlaylists();
}

function renderFilters() {
  const customerFilter = $('deviceCustomerFilter');
  const sellerFilter = $('deviceSellerFilter');
  const planFilter = $('devicePlanFilter');
  const playlistFilter = $('devicePlaylistFilter');

  if (!customerFilter || !sellerFilter || !planFilter || !playlistFilter) return;

  const selectedCustomer = customerFilter.value;
  const selectedSeller = sellerFilter.value;
  const selectedPlan = planFilter.value;
  const selectedPlaylist = playlistFilter.value;

  customerFilter.innerHTML = '<option value="">Todos os clientes</option>' +
    customers.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');

  sellerFilter.innerHTML = '<option value="">Todos os vendedores</option>' +
    sellers.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');

  planFilter.innerHTML = '<option value="">Todos os planos</option>' +
    plans.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');

  playlistFilter.innerHTML = '<option value="">Todas as listas</option>' +
    playlists.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');

  customerFilter.value = selectedCustomer;
  sellerFilter.value = selectedSeller;
  planFilter.value = selectedPlan;
  playlistFilter.value = selectedPlaylist;
}

async function api(action, payload = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ action, ...payload })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || data.message || 'Erro no painel.');
  }

  return data;
}

async function loadAll() {
  if (!token()) {
    window.location.href = './index.html';
    return;
  }

  document.body.classList.add('panel-loading');

  try {
    const results = await Promise.allSettled([
      api('listCustomers'),
      api('listPlaylists'),
      api('listDevices'),
      api('listCommercialData'),
      api('listAuditLogs', { limit: 200 })
    ]);

    const [customersRes, playlistsRes, devicesRes, commercialRes, auditRes] = results;
    const failures = [];

    if (customersRes.status === 'fulfilled') customers = customersRes.value?.customers || [];
    else failures.push('clientes');

    if (playlistsRes.status === 'fulfilled') playlists = playlistsRes.value?.playlists || [];
    else failures.push('listas');

    if (devicesRes.status === 'fulfilled') devices = devicesRes.value?.devices || [];
    else failures.push('aparelhos');

    if (commercialRes.status === 'fulfilled') {
      sellers = commercialRes.value?.sellers || [];
      plans = commercialRes.value?.plans || [];
      creditLedger = commercialRes.value?.creditLedger || [];
    } else {
      failures.push('comercial');
    }

    if (auditRes.status === 'fulfilled') auditLogs = auditRes.value?.logs || [];
    else failures.push('histórico');

    failures.push(...renderAll());

    if (failures.length) {
      show(`Painel carregado parcialmente. Não foi possível atualizar: ${failures.join(', ')}.`, true);
    } else {
      show('Painel atualizado.');
    }
  } catch (err) {
    show(err.message || 'Erro ao carregar painel.', true);
  } finally {
    document.body.classList.remove('panel-loading');
  }
}

function renderAll() {
  const renderers = [
    ['resumo', renderStats],
    ['filtros', renderFilters],
    ['visão geral', renderDashboard],
    ['comercial', renderCommercial],
    ['clientes', renderCustomers],
    ['listas', renderPlaylists],
    ['aparelhos', renderDevices],
    ['pendências', renderPending],
    ['histórico', renderAuditLogs],
  ];
  const failures = [];

  renderers.forEach(([label, renderer]) => {
    try {
      renderer();
    } catch (error) {
      failures.push(label);
      console.error(`Falha ao renderizar ${label}:`, error);
    }
  });

  return failures;
}

function renderStats() {
  $('stCustomers').textContent = customers.length;
  $('stDevices').textContent = devices.length;
  $('stActive').textContent = devices.filter(d => d.status === 'active').length;
  $('stPending').textContent = devices.filter(d => d.status === 'pending').length;
  $('stExpiring').textContent = devices.filter(isExpiringSoon).length;
  $('stPlaylists').textContent = playlists.length;
  if ($('stActiveMirror')) $('stActiveMirror').textContent = devices.filter(d => d.status === 'active').length;
  if ($('stPendingMirror')) $('stPendingMirror').textContent = devices.filter(d => d.status === 'pending').length;
}

function customerOptions(selectedId) {
  return ['<option value="">Sem cliente</option>']
    .concat(customers.map(c => `<option value="${esc(c.id)}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.name)} — ${esc(c.whatsapp)}</option>`))
    .join('');
}

function playlistOptions(selectedId) {
  return ['<option value="">Sem lista</option>']
    .concat(playlists.map(p => `<option value="${esc(p.id)}" ${p.id === selectedId ? 'selected' : ''}>${esc(p.name)}</option>`))
    .join('');
}

function sellerOptions(selectedId) {
  return ['<option value="">Sem vendedor</option>']
    .concat(sellers.map(s => `<option value="${esc(s.id)}" ${s.id === selectedId ? 'selected' : ''}>${esc(s.name)} — ${Number(s.creditBalance || 0)} crédito(s)</option>`))
    .join('');
}

function planOptions(selectedId) {
  return ['<option value="">Sem plano</option>']
    .concat(plans.map(p => `<option value="${esc(p.id)}" ${p.id === selectedId ? 'selected' : ''}>${esc(p.name)} — ${Number(p.creditCost || 1)} crédito(s)</option>`))
    .join('');
}

function dateTimeForCreditCheck(value) {
  if (!value) return 0;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function confirmCreditConsumption(deviceId, sellerId, planId, actionLabel) {
  const device = devices.find(d => d.id === deviceId);
  const seller = sellers.find(s => s.id === sellerId);
  const plan = plans.find(p => p.id === planId);

  if (!sellerId || !seller) {
    show('Escolha um vendedor antes de consumir créditos.', true);
    return false;
  }

  if (!planId || !plan) {
    show('Escolha um plano antes de consumir créditos.', true);
    return false;
  }

  const cost = Math.max(1, Number(plan.creditCost || 1));
  const balance = Number(seller.creditBalance || 0);
  const after = balance - cost;
  const canNegative = seller.canGoNegative === true;

  const deviceCode = device?.deviceCode || deviceId;
  const customerName = device?.customerName || device?.clientName || 'Sem cliente';
  const negativeText = after < 0
    ? (canNegative
      ? `\n\nAtenção: o saldo ficará negativo: ${after} crédito(s).`
      : `\n\nAtenção: o saldo é insuficiente. A operação será bloqueada pelo servidor.`)
    : '';

  return confirm(
    `${actionLabel}\n\n` +
    `Aparelho: ${deviceCode}\n` +
    `Cliente: ${customerName}\n` +
    `Vendedor: ${seller.name}\n` +
    `Plano: ${plan.name}\n` +
    `Custo: ${cost} crédito(s)\n` +
    `Saldo atual: ${balance}\n` +
    `Saldo após operação: ${after}` +
    negativeText +
    `\n\nDeseja continuar?`
  );
}

function statusOptions(selectedStatus) {
  const labels = { pending: 'Pendente', active: 'Ativo', blocked: 'Bloqueado', expired: 'Vencido', inactive: 'Inativo' };
  return ['pending','active','blocked','expired','inactive']
    .map(s => `<option value="${s}" ${s === selectedStatus ? 'selected' : ''}>${labels[s]}</option>`)
    .join('');
}

function badge(status) {
  const labels = { pending: 'Pendente', active: 'Ativo', blocked: 'Bloqueado', expired: 'Vencido', inactive: 'Inativo' };
  return `<span class="badge ${esc(status)}">${esc(labels[status] || status)}</span>`;
}

function playlistCacheBadge(playlist) {
  if (playlist?.accessMode === 'direct') {
    return '<span class="badge active">Acesso direto</span>';
  }
  if (playlist?.accessMode === 'blocked') {
    return '<span class="badge blocked">Lista bloqueada</span>';
  }
  const status = String(playlist?.cacheStatus || 'missing');
  const labels = {
    ready: 'Cache pronto',
    building: 'Gerando cache',
    processing: 'Processando',
    error: 'Erro no cache',
    missing: 'Sem cache'
  };
  const tone = status === 'ready' ? 'active' : (status === 'error' ? 'blocked' : 'pending');
  return `<span class="badge ${tone}">${esc(labels[status] || status)}</span>`;
}

function playlistCacheAttempts(playlist) {
  const attempts = Array.isArray(playlist?.cacheAttempts) ? playlist.cacheAttempts : [];
  const failures = attempts.filter(attempt => attempt?.status === 'error' && attempt?.error);
  if (!failures.length) return '';

  return failures.map(attempt => {
    const label = attempt.method === 'xtream' ? 'Xtream' : 'M3U';
    return `<div class="small muted" style="margin-top:4px;">${label}: ${esc(attempt.error)}</div>`;
  }).join('');
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return '0 B';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10);
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function thirtyDaysDate() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0,10);
}

function renderDashboard() {
  const pending = devices.filter(d => d.status === 'pending').slice(0, 6);
  const expiring = devices.filter(isExpiringSoon).slice(0, 6);

  $('pendingQuick').innerHTML = pending.length
    ? pending.map(d => `
      <div class="quick-item">
        <div>
          <div class="mono">${esc(d.deviceCode)}</div>
          <div class="small muted">${esc(d.deviceType || 'androidtv')} · ${esc(d.appVersion || '')}</div>
        </div>
        <button class="btn orange" onclick="setTab('pending')">Liberar</button>
      </div>
    `).join('')
    : '<div class="quick-item muted">Nenhum aparelho pendente agora.</div>';

  $('expiringQuick').innerHTML = expiring.length
    ? expiring.map(d => `
      <div class="quick-item">
        <div>
          <div class="mono">${esc(d.deviceCode)}</div>
          <div class="small">${esc(d.customerName || 'Sem cliente')}</div>
          <div class="small warn-text">Vence em ${daysLeft(d.expiresAt)} dia(s)</div>
        </div>
        <button class="btn orange" onclick="setTab('devices')">Ver</button>
      </div>
    `).join('')
    : '<div class="quick-item muted">Nenhum aparelho vencendo nos próximos 7 dias.</div>';
}

function renderCustomers() {
  const list = filteredCustomers();

  $('customersBody').innerHTML = list.length
    ? list.map(c => {
      const wa = whatsappUrl(c.whatsapp);
      return `
      <tr>
        <td><input class="table-input" id="cust-name-${esc(c.id)}" value="${esc(c.name)}"></td>
        <td>
          <input class="table-input" id="cust-whats-${esc(c.id)}" value="${esc(c.whatsapp)}">
          ${wa ? `<a class="whats-link" href="${wa}" target="_blank" rel="noreferrer">Abrir WhatsApp</a>` : ''}
        </td>
        <td>${esc(c.devicesCount || 0)}</td>
        <td class="muted">${fmtDate(c.createdAt)}</td>
        <td>
          <div class="actions">
            <button class="btn" onclick="showCustomerDetails('${esc(c.id)}')">Detalhes</button>
            <button class="btn green" onclick="updateCustomer('${esc(c.id)}')">Salvar</button>
            <button class="btn red" onclick="deleteCustomer('${esc(c.id)}')">Excluir</button>
          </div>
        </td>
      </tr>
    `;
    }).join('')
    : '<tr><td colspan="5" class="muted">Nenhum cliente encontrado.</td></tr>';
}

function renderPlaylists() {
  const list = filteredPlaylists();

  $('playlistsBody').innerHTML = list.length
    ? list.map(p => `
      <tr>
        <td><input class="table-input" id="pl-name-${esc(p.id)}" value="${esc(p.name)}"></td>
        <td><input class="table-input" id="pl-url-${esc(p.id)}" value="${esc(p.playlistUrl)}" oninput="syncPlaylistType('pl-url-${esc(p.id)}', 'pl-type-${esc(p.id)}')"></td>
        <td>
          <select class="table-select" id="pl-type-${esc(p.id)}">
            <option value="m3u" ${p.playlistType === 'm3u' ? 'selected' : ''}>M3U</option>
            <option value="xtream" ${p.playlistType === 'xtream' ? 'selected' : ''}>Xtream</option>
            <option value="stalker" ${p.playlistType === 'stalker' ? 'selected' : ''}>Stalker</option>
          </select>
        </td>
        <td>
          <select class="table-select" id="pl-active-${esc(p.id)}">
            <option value="true" ${p.active ? 'selected' : ''}>Ativa</option>
            <option value="false" ${!p.active ? 'selected' : ''}>Inativa</option>
          </select>
        </td>
        <td>
          ${playlistCacheBadge(p)}
          <div class="small muted" style="margin-top:6px;">${Number(p.cacheItemCount || 0).toLocaleString('pt-BR')} itens · ${formatBytes(p.cacheSizeBytes)}</div>
          ${p.accessMode === 'direct'
            ? '<div class="small" style="margin-top:5px;">O aplicativo baixará esta lista diretamente no aparelho.</div>'
            : (p.cacheError ? `<div class="small danger-text" style="margin-top:5px;">${esc(p.cacheError)}</div>` : '')}
          ${playlistCacheAttempts(p)}
        </td>
        <td>${esc(p.devicesCount || 0)}</td>
        <td>
          <div class="actions">
            <button class="btn" onclick="showPlaylistDetails('${esc(p.id)}')">Detalhes</button>
            <button class="btn orange" onclick="refreshPlaylistCache('${esc(p.id)}')">Gerar cache</button>
            <button class="btn green" onclick="updatePlaylist('${esc(p.id)}')">Salvar</button>
            <button class="btn red" onclick="deletePlaylist('${esc(p.id)}')">Excluir</button>
          </div>
        </td>
      </tr>
    `).join('')
    : '<tr><td colspan="7" class="muted">Nenhuma lista encontrada.</td></tr>';
}

function renderDevices() {
  const list = filteredDevices();

  $('devicesBody').innerHTML = list.length
    ? list.map(d => deviceRow(d, false)).join('')
    : '<div class="admin-device-empty muted">Nenhum aparelho encontrado com esses filtros.</div>';
}

function renderPending() {
  const pending = devices.filter(d => d.status === 'pending');

  $('pendingBody').innerHTML = pending.length
    ? pending.map(d => pendingRow(d)).join('')
    : '<tr><td colspan="7" class="muted">Nenhum aparelho pendente.</td></tr>';
}

function deviceRow(d) {
  const wa = whatsappUrl(d.customerWhatsapp);

  return `
    <article class="admin-device-card" data-status="${esc(d.status)}">
      <div class="admin-device-head">
        <div>
          <div class="mono admin-device-code">${esc(d.deviceCode)}</div>
          <strong>${esc(d.customerName || 'Sem cliente')}</strong>
          <div class="small muted">${esc(d.customerWhatsapp || d.deviceUuid || 'Contato não informado')}</div>
        </div>
        ${badge(d.status)}
      </div>

      <div class="admin-device-meta">
        <div><small>Vendedor</small><span>${esc(d.sellerName || 'Sem vendedor')}</span></div>
        <div><small>Plano</small><span>${esc(d.planName || 'Sem plano')}</span></div>
        <div><small>Lista principal</small><span>${esc(d.playlistName || 'Sem lista')}</span></div>
        <div><small>Lista reserva</small><span>${esc(d.backupPlaylistName || 'Sem reserva')}</span></div>
        <div><small>Validade</small><span>${fmtDate(d.expiresAt)}</span>${validityLabel(d.expiresAt)}</div>
        <div><small>Último acesso</small><span>${fmtDate(d.lastSeenAt)}</span></div>
        <div><small>Identificador</small><span class="mono">${esc(d.deviceUuid || '—')}</span></div>
      </div>

      <div class="admin-device-actions">
        <button class="btn primary" onclick="showDeviceDetails('${esc(d.id)}')">Abrir aparelho</button>
        ${wa ? `<a class="btn" href="${wa}" target="_blank" rel="noreferrer">WhatsApp</a>` : ''}
        <button class="btn orange" onclick="renewDevice('${esc(d.id)}')">Renovar 30 dias</button>
      </div>

      <details class="admin-device-editor">
        <summary>Editar dados e ações administrativas</summary>
        <div class="admin-device-editor-grid">
          <label>Cliente<select class="table-select" id="dev-customer-${esc(d.id)}">${customerOptions(d.customerId)}</select></label>
          <label>Vendedor<select class="table-select" id="dev-seller-${esc(d.id)}">${sellerOptions(d.sellerId)}</select></label>
          <label>Plano<select class="table-select" id="dev-plan-${esc(d.id)}">${planOptions(d.planId)}</select></label>
          <label>Status<select class="table-select" id="dev-status-${esc(d.id)}">${statusOptions(d.status)}</select></label>
          <label>Lista principal<select class="table-select" id="dev-playlist-${esc(d.id)}">${playlistOptions(d.playlistId)}</select></label>
          <label>Lista reserva<select class="table-select" id="dev-backup-playlist-${esc(d.id)}">${playlistOptions(d.backupPlaylistId)}</select></label>
          <label>Validade<input class="table-input" id="dev-exp-${esc(d.id)}" type="date" value="${dateInput(d.expiresAt)}"></label>
        </div>
        <div class="admin-device-danger-actions">
          <button class="btn green" onclick="saveDevice('${esc(d.id)}')">Salvar alterações</button>
          <button class="btn red" onclick="blockDevice('${esc(d.id)}')">Bloquear</button>
          <button class="btn red" onclick="deleteDevice('${esc(d.id)}')">Excluir</button>
        </div>
      </details>
    </article>
  `;
}

function pendingRow(d) {
  return `
    <tr>
      <td>
        <span class="mono">${esc(d.deviceCode)}</span><br>
        <span class="small muted">${esc(d.deviceUuid || '')}</span>
      </td>
      <td><select class="table-select" id="pend-customer-${esc(d.id)}">${customerOptions(d.customerId)}</select></td>
      <td><select class="table-select" id="pend-seller-${esc(d.id)}">${sellerOptions(d.sellerId)}</select></td>
      <td><select class="table-select" id="pend-plan-${esc(d.id)}">${planOptions(d.planId)}</select></td>
      <td>
        <label class="small">Principal<select class="table-select" id="pend-playlist-${esc(d.id)}">${playlistOptions(d.playlistId)}</select></label>
        <label class="small">Reserva<select class="table-select" id="pend-backup-playlist-${esc(d.id)}">${playlistOptions(d.backupPlaylistId)}</select></label>
      </td>
      <td><input class="table-input" id="pend-exp-${esc(d.id)}" type="date" value="${thirtyDaysDate()}"></td>
      <td>
        <button class="btn primary icon-btn icon-wide" title="Liberar aparelho" aria-label="Liberar aparelho" onclick="activatePending('${esc(d.id)}')">✅ Liberar</button>
      </td>
    </tr>
  `;
}

async function createCustomer() {
  try {
    await api('createCustomer', {
      name: $('newCustomerName').value.trim(),
      whatsapp: $('newCustomerWhatsapp').value.trim()
    });

    $('newCustomerName').value = '';
    $('newCustomerWhatsapp').value = '';

    await loadAll();
    show('Cliente cadastrado.');
  } catch (err) {
    show(err.message, true);
  }
}

async function updateCustomer(id) {
  try {
    await api('updateCustomer', {
      id,
      name: $('cust-name-' + id).value.trim(),
      whatsapp: $('cust-whats-' + id).value.trim()
    });

    await loadAll();
    show('Cliente atualizado.');
  } catch (err) {
    show(err.message, true);
  }
}

async function deleteCustomer(id) {
  if (!confirm('Excluir este cliente? Os aparelhos não serão apagados, apenas ficarão sem cliente.')) return;

  try {
    await api('deleteCustomer', { id });
    await loadAll();
    show('Cliente excluído.');
  } catch (err) {
    show(err.message, true);
  }
}

function inferPlaylistTypeFromUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || '').trim());
    const path = url.pathname.toLowerCase().replace(/\/+$/, '');
    const hasCredentials = Boolean(
      url.searchParams.get('username') && url.searchParams.get('password')
    );
    return hasCredentials && (path.endsWith('/get.php') || path.endsWith('/player_api.php'))
      ? 'xtream'
      : null;
  } catch {
    return null;
  }
}

function syncPlaylistType(urlInputId, typeSelectId) {
  const detected = inferPlaylistTypeFromUrl($(urlInputId)?.value);
  if (detected && $(typeSelectId)) {
    $(typeSelectId).value = detected;
  }
}

async function createPlaylist() {
  try {
    const playlistUrl = $('newPlaylistUrl').value.trim();
    const result = await api('createPlaylist', {
      name: $('newPlaylistName').value.trim(),
      playlistUrl,
      playlistType: inferPlaylistTypeFromUrl(playlistUrl) || $('newPlaylistType').value,
      active: true
    });

    $('newPlaylistName').value = '';
    $('newPlaylistUrl').value = '';
    $('newPlaylistType').value = 'm3u';

    await loadAll();
    show(result.message || 'Lista salva na biblioteca e cache solicitado.');
  } catch (err) {
    show(err.message, true);
  }
}

async function updatePlaylist(id) {
  try {
    const playlistUrl = $('pl-url-' + id).value.trim();
    const result = await api('updatePlaylist', {
      id,
      name: $('pl-name-' + id).value.trim(),
      playlistUrl,
      playlistType: inferPlaylistTypeFromUrl(playlistUrl) || $('pl-type-' + id).value,
      active: $('pl-active-' + id).value === 'true'
    });

    await loadAll();
    show(result.message || 'Lista atualizada e cache solicitado.');
  } catch (err) {
    show(err.message, true);
  }
}

async function refreshPlaylistCache(id) {
  try {
    show('Gerando cache da lista...');
    const result = await api('refreshPlaylistCache', { id });
    await loadAll();
    show(result.message || 'Cache atualizado.');
  } catch (err) {
    await loadAll();
    show(err.message || 'Não foi possível gerar o cache.', true);
  }
}

async function deletePlaylist(id) {
  if (!confirm('Excluir esta lista? Nos aparelhos em que ela for principal, a reserva será promovida automaticamente.')) return;

  try {
    await api('deletePlaylist', { id });
    await loadAll();
    show('Lista excluída.');
  } catch (err) {
    show(err.message, true);
  }
}


function setDeviceActionButtonsDisabled(id, disabled) {
  document.querySelectorAll('button').forEach(button => {
    const action = button.getAttribute('onclick') || '';
    if (action.includes("'" + id + "'") || action.includes('"' + id + '"')) {
      button.disabled = disabled;
      button.classList.toggle('loading', disabled);
    }
  });
}

async function withDeviceActionLock(id, actionName, runner) {
  const key = `${actionName}:${id}`;

  if (deviceActionLocks.has(key)) {
    show('Operação já em andamento. Aguarde finalizar.', true);
    return;
  }

  deviceActionLocks.add(key);
  setDeviceActionButtonsDisabled(id, true);

  try {
    return await runner();
  } finally {
    deviceActionLocks.delete(key);
    setDeviceActionButtonsDisabled(id, false);
  }
}

async function saveDevice(id) {
  try {
    const device = devices.find(d => d.id === id);
    if (!device) throw new Error('Aparelho não encontrado.');

    const nextCustomerId = $('dev-customer-' + id).value || null;
    const nextSellerId = $('dev-seller-' + id).value || null;
    const nextPlanId = $('dev-plan-' + id).value || null;
    const nextStatus = $('dev-status-' + id).value;
    const nextPlaylistId = $('dev-playlist-' + id).value || null;
    const nextBackupPlaylistId = $('dev-backup-playlist-' + id).value || null;
    if (nextPlaylistId && nextBackupPlaylistId && nextPlaylistId === nextBackupPlaylistId) {
      throw new Error('Escolha uma lista reserva diferente da principal.');
    }
    const expiresAtInput = $('dev-exp-' + id).value || '';
    const currentExpiryInput = dateInput(device.expiresAt);
    const normalizedExpiresAt = explicitExpiry(expiresAtInput);
    const expiryChanged = expiresAtInput !== currentExpiryInput;
    const isActivation = device.status !== 'active' && nextStatus === 'active';
    const isRenewal =
      device.status === 'active' &&
      nextStatus === 'active' &&
      expiryChanged &&
      dateTimeForCreditCheck(normalizedExpiresAt) > dateTimeForCreditCheck(device.expiresAt);
    const operationType = isActivation ? 'activation' : (isRenewal ? 'renewal' : null);

    if (operationType && !confirmCreditConsumption(
      id,
      nextSellerId,
      nextPlanId,
      operationType === 'activation' ? 'Ativar aparelho' : 'Renovar aparelho'
    )) {
      return;
    }

    await withDeviceActionLock(id, 'saveDevice', async () => {
      const payload = {
        id,
        customerId: nextCustomerId,
        sellerId: nextSellerId,
        planId: nextPlanId,
        status: nextStatus,
        playlistId: nextPlaylistId,
        backupPlaylistId: nextBackupPlaylistId
      };

      if (expiryChanged) {
        payload.expiresAt = normalizedExpiresAt;
      }

      if (operationType) {
        const input = {
          customerId: nextCustomerId,
          sellerId: nextSellerId,
          planId: nextPlanId,
          status: nextStatus,
          playlistId: nextPlaylistId,
          backupPlaylistId: nextBackupPlaylistId,
          expiresAtInput
        };
        const attempt = ensureDeviceCommercialAttempt(
          id,
          operationType,
          input,
          () => explicitExpiry(expiresAtInput) || calculatedExpiry(nextPlanId, operationType === 'renewal' ? device.expiresAt : null)
        );
        payload.expiresAt = attempt.expiresAt;
        payload.operationType = operationType;
        payload.idempotencyKey = attempt.idempotencyKey;
      }

      await api('updateDevice', payload);

      if (operationType) clearDeviceCommercialAttempt(id, operationType);
      await loadAll();
      show(operationType === 'activation'
        ? 'Aparelho ativado.'
        : (operationType === 'renewal' ? 'Aparelho renovado.' : 'Aparelho salvo.'));
    });
  } catch (err) {
    show(err.message, true);
  }
}

async function renewDevice(id) {
  try {
    const device = devices.find(d => d.id === id);
    if (!device) throw new Error('Aparelho não encontrado.');

    const sellerId = device.sellerId || null;
    const planId = device.planId || null;
    const playlistId = device.playlistId || null;

    if (!confirmCreditConsumption(id, sellerId, planId, 'Renovar aparelho por 30 dias')) {
      return;
    }

    await withDeviceActionLock(id, 'renewDevice', async () => {
      const input = { sellerId, planId, playlistId, currentExpiresAt: device.expiresAt || null, days: 30 };
      const attempt = ensureDeviceCommercialAttempt(
        id,
        'renewal',
        input,
        () => calculatedExpiry(planId, device.expiresAt, 30)
      );

      await api('updateDevice', {
        id,
        sellerId,
        planId,
        playlistId,
        status: 'active',
        expiresAt: attempt.expiresAt,
        operationType: 'renewal',
        idempotencyKey: attempt.idempotencyKey
      });

      clearDeviceCommercialAttempt(id, 'renewal');
      await loadAll();
      show('Aparelho renovado por 30 dias.');
    });
  } catch (err) {
    show(err.message, true);
  }
}

async function blockDevice(id) {
  try {
    await api('updateDevice', { id, status: 'blocked' });
    await loadAll();
    show('Aparelho bloqueado.');
  } catch (err) {
    show(err.message, true);
  }
}

async function activatePending(id) {
  try {
    const sellerId = $('pend-seller-' + id).value || null;
    const planId = $('pend-plan-' + id).value || null;
    const playlistId = $('pend-playlist-' + id).value || null;
    const backupPlaylistId = $('pend-backup-playlist-' + id).value || null;
    if (playlistId && backupPlaylistId && playlistId === backupPlaylistId) {
      throw new Error('Escolha uma lista reserva diferente da principal.');
    }
    const customerId = $('pend-customer-' + id).value || null;
    const expiresAtInput = $('pend-exp-' + id).value || '';

    if (!confirmCreditConsumption(id, sellerId, planId, 'Liberar aparelho pendente')) {
      return;
    }

    await withDeviceActionLock(id, 'activatePending', async () => {
      const input = { customerId, sellerId, planId, playlistId, backupPlaylistId, expiresAtInput };
      const attempt = ensureDeviceCommercialAttempt(
        id,
        'activation',
        input,
        () => explicitExpiry(expiresAtInput) || calculatedExpiry(planId)
      );

      await api('updateDevice', {
        id,
        customerId,
        sellerId,
        planId,
        playlistId,
        backupPlaylistId,
        status: 'active',
        expiresAt: attempt.expiresAt,
        operationType: 'activation',
        idempotencyKey: attempt.idempotencyKey
      });

      clearDeviceCommercialAttempt(id, 'activation');
      await loadAll();
      show('Aparelho liberado.');
    });
  } catch (err) {
    show(err.message, true);
  }
}

function openDetails(title, subtitle, html) {
  $('modalTitle').textContent = title;
  $('modalSubtitle').innerHTML = subtitle || '—';
  $('modalContent').innerHTML = html;
  $('detailsModal').classList.add('open');
}

function closeDetails() {
  $('detailsModal').classList.remove('open');
}

function modalBackdropClose(event) {
  if (event.target && event.target.id === 'detailsModal') {
    closeDetails();
  }
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeDetails();
});

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.focus();
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    show('Conteúdo copiado.');
  } catch {
    show('Não consegui copiar automaticamente.', true);
  }
}

async function copyPlaylistUrl(id) {
  const playlist = playlists.find(item => item.id === id);
  if (!playlist?.playlistUrl) {
    show('Lista não encontrada.', true);
    return;
  }
  await copyText(playlist.playlistUrl);
}

function deviceMiniRows(list) {
  if (!list.length) {
    return '<p class="muted">Nenhum aparelho vinculado.</p>';
  }

  return `
    <div class="tablewrap">
      <table class="detail-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Status</th>
            <th>Cliente</th>
            <th>Vendedor</th>
            <th>Plano</th>
            <th>Lista</th>
            <th>Validade</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(d => `
            <tr>
              <td><span class="mono">${esc(d.deviceCode)}</span></td>
              <td>${badge(d.status)}</td>
              <td>${esc(d.customerName || 'Sem cliente')}</td>
              <td>${esc(d.sellerName || 'Sem vendedor')}</td>
              <td>${esc(d.planName || 'Sem plano')}</td>
              <td>${esc(d.playlistName || 'Sem lista')}</td>
              <td>${fmtDate(d.expiresAt)} ${validityLabel(d.expiresAt)}</td>
              <td>
                <div class="actions">
                  <button class="btn" onclick="copyText('${esc(d.deviceCode)}')">Copiar</button>
                  <button class="btn orange" onclick="renewDevice('${esc(d.id)}')">Renovar</button>
                  <button class="btn" onclick="showDeviceDetails('${esc(d.id)}')">Abrir</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function showCustomerDetails(id) {
  const customer = customers.find(c => c.id === id);
  if (!customer) {
    show('Cliente não encontrado.', true);
    return;
  }

  const linkedDevices = devices.filter(d => d.customerId === id);
  const wa = whatsappUrl(customer.whatsapp);

  openDetails(
    'Cliente',
    `<span class="mono">${esc(customer.name)}</span>`,
    `
      <div class="detail-grid">
        <div class="detail-box">
          <small>Nome</small>
          <strong>${esc(customer.name)}</strong>
        </div>
        <div class="detail-box">
          <small>WhatsApp</small>
          <strong>${esc(customer.whatsapp)}</strong>
          ${wa ? `<a class="whats-link" href="${wa}" target="_blank" rel="noreferrer">Abrir WhatsApp</a>` : ''}
        </div>
        <div class="detail-box">
          <small>Aparelhos vinculados</small>
          <strong>${linkedDevices.length}</strong>
        </div>
        <div class="detail-box">
          <small>Cadastrado em</small>
          <strong>${fmtDate(customer.createdAt)}</strong>
        </div>
        <div class="detail-box">
          <small>Atualizado em</small>
          <strong>${fmtDate(customer.updatedAt)}</strong>
        </div>
        <div class="detail-box">
          <small>Status comercial</small>
          <strong>${linkedDevices.some(d => d.status === 'active') ? 'Cliente ativo' : 'Sem aparelho ativo'}</strong>
        </div>
        <div class="detail-box wide">
          <small>Aparelhos desse cliente</small>
          ${deviceMiniRows(linkedDevices)}
        </div>
      </div>

      <div class="detail-actions">
        ${wa ? `<a class="btn green" href="${wa}" target="_blank" rel="noreferrer">Abrir WhatsApp</a>` : ''}
        <button class="btn" onclick="setTab('devices'); closeDetails()">Ver aparelhos</button>
        <button class="btn" onclick="setTab('customers'); closeDetails()">Editar na tabela</button>
      </div>
    `
  );
}

function showPlaylistDetails(id) {
  const playlist = playlists.find(p => p.id === id);
  if (!playlist) {
    show('Lista não encontrada.', true);
    return;
  }

  const linkedDevices = devices.filter(d => d.playlistId === id || d.backupPlaylistId === id);

  openDetails(
    'Lista',
    `<span class="mono">${esc(playlist.name)}</span>`,
    `
      <div class="detail-grid">
        <div class="detail-box">
          <small>Nome</small>
          <strong>${esc(playlist.name)}</strong>
        </div>
        <div class="detail-box">
          <small>Tipo</small>
          <strong>${esc(playlist.playlistType || 'm3u')}</strong>
        </div>
        <div class="detail-box">
          <small>Status</small>
          <strong>${playlist.active ? 'Ativa' : 'Inativa'}</strong>
        </div>
        <div class="detail-box">
          <small>Aparelhos usando</small>
          <strong>${linkedDevices.length}</strong>
        </div>
        <div class="detail-box">
          <small>Saúde do cache</small>
          <strong>${playlistCacheBadge(playlist)}</strong>
          <div class="small muted">${Number(playlist.cacheItemCount || 0).toLocaleString('pt-BR')} itens · ${formatBytes(playlist.cacheSizeBytes)}</div>
          ${playlist.accessMode === 'direct'
            ? '<div class="small">O provedor bloqueia o servidor; o acesso será feito pela internet do aparelho.</div>'
            : (playlist.cacheError ? `<div class="small danger-text">${esc(playlist.cacheError)}</div>` : '')}
          ${playlistCacheAttempts(playlist)}
        </div>
        <div class="detail-box half">
          <small>Atualizada em</small>
          <strong>${fmtDate(playlist.playlistUpdatedAt)}</strong>
        </div>
        <div class="detail-box half">
          <small>Cadastrada em</small>
          <strong>${fmtDate(playlist.createdAt)}</strong>
        </div>
        <div class="detail-box wide">
          <small>URL da lista</small>
          <strong class="mono">${esc(playlist.playlistUrl)}</strong>
        </div>
        <div class="detail-box wide">
          <small>Aparelhos vinculados a esta lista</small>
          ${deviceMiniRows(linkedDevices)}
        </div>
      </div>

      <div class="detail-actions">
        <button class="btn" onclick="copyPlaylistUrl('${esc(playlist.id)}')">Copiar URL</button>
        <button class="btn orange" onclick="closeDetails(); refreshPlaylistCache('${esc(playlist.id)}')">Gerar cache</button>
        <button class="btn" onclick="setTab('playlists'); closeDetails()">Editar na tabela</button>
        <button class="btn" onclick="setTab('devices'); closeDetails()">Ver aparelhos</button>
      </div>
    `
  );
}

function showDeviceDetails(id) {
  const device = devices.find(d => d.id === id);
  if (!device) {
    show('Aparelho não encontrado.', true);
    return;
  }

  const wa = whatsappUrl(device.customerWhatsapp);

  openDetails(
    'Aparelho',
    `<span class="mono">${esc(device.deviceCode)}</span> · ${badge(device.status)}`,
    `
      <div class="detail-grid">
        <div class="detail-box">
          <small>Código</small>
          <strong class="mono">${esc(device.deviceCode)}</strong>
        </div>
        <div class="detail-box">
          <small>Status</small>
          <strong>${badge(device.status)}</strong>
        </div>
        <div class="detail-box">
          <small>Validade</small>
          <strong>${fmtDate(device.expiresAt)}</strong>
          ${validityLabel(device.expiresAt)}
        </div>

        <div class="detail-box">
          <small>Cliente</small>
          <strong>${esc(device.customerName || 'Sem cliente')}</strong>
          ${device.customerWhatsapp ? `<div class="small muted">${esc(device.customerWhatsapp)}</div>` : ''}
          ${wa ? `<a class="whats-link" href="${wa}" target="_blank" rel="noreferrer">WhatsApp</a>` : ''}
        </div>
        <div class="detail-box">
          <small>Lista principal</small>
          <strong>${esc(device.playlistName || 'Sem lista')}</strong>
        </div>
        <div class="detail-box">
          <small>Lista reserva</small>
          <strong>${esc(device.backupPlaylistName || 'Sem reserva')}</strong>
        </div>
        <div class="detail-box">
          <small>Tipo / App</small>
          <strong>${esc(device.deviceType || 'androidtv')}</strong>
          <div class="small muted">${esc(device.appVersion || 'Sem versão')}</div>
        </div>

        <div class="detail-box half">
          <small>UUID</small>
          <strong class="mono">${esc(device.deviceUuid || '—')}</strong>
        </div>
        <div class="detail-box half">
          <small>Último IP</small>
          <strong>${esc(device.ip || '—')}</strong>
        </div>
        <div class="detail-box half">
          <small>Criado em</small>
          <strong>${fmtDate(device.createdAt)}</strong>
        </div>
        <div class="detail-box half">
          <small>Último acesso</small>
          <strong>${fmtDate(device.lastSeenAt)}</strong>
        </div>
      </div>

      <div class="detail-actions">
        <button class="btn" onclick="copyText('${esc(device.deviceCode)}')">Copiar código</button>
        <button class="btn orange" onclick="renewDevice('${esc(device.id)}')">Renovar 30 dias</button>
        <button class="btn green" onclick="setDeviceStatus('${esc(device.id)}', 'active')">Ativar</button>
        <button class="btn red" onclick="setDeviceStatus('${esc(device.id)}', 'blocked')">Bloquear</button>
        <button class="btn red" onclick="deleteDevice('${esc(device.id)}')">Excluir aparelho</button>
        <button class="btn orange" onclick="setDeviceStatus('${esc(device.id)}', 'expired')">Marcar vencido</button>
        <button class="btn" onclick="setTab('devices'); closeDetails()">Voltar aos aparelhos</button>
      </div>
    `
  );
}

async function setDeviceStatus(id, status) {
  try {
    if (status === 'active') {
      const statusSelect = $('dev-status-' + id);
      if (!statusSelect) throw new Error('Abra a tabela de aparelhos para ativar este dispositivo.');
      statusSelect.value = 'active';
      closeDetails();
      await saveDevice(id);
      return;
    }

    await api('updateDevice', { id, status });
    await loadAll();
    show('Status do aparelho atualizado.');
    showDeviceDetails(id);
  } catch (err) {
    show(err.message, true);
  }
}


async function deleteDevice(id) {
  const device = devices.find(d => d.id === id);
  const code = device?.deviceCode || id;

  if (!confirm(`Excluir o aparelho ${code}?`)) return;
  if (!confirm('Tem certeza absoluta? Essa ação apaga o aparelho do banco e não é igual a bloquear.')) return;

  try {
    await api('deleteDevice', { id });
    await loadAll();

    if (typeof closeDetails === 'function') {
      closeDetails();
    }

    show('Aparelho excluído.');
  } catch (err) {
    show(err.message || 'Erro ao excluir aparelho.', true);
  }
}


function actionLabel(action) {
  const map = {
    'customer.created': 'Cliente criado',
    'customer.updated': 'Cliente editado',
    'customer.deleted': 'Cliente excluído',
    'playlist.created': 'Lista criada',
    'playlist.updated': 'Lista editada',
    'playlist.deleted': 'Lista excluída',
    'device.updated': 'Aparelho editado',
    'device.deleted': 'Aparelho excluído',
  };

  return map[action] || action || 'Ação';
}

function entityLabel(value) {
  const map = {
    customer: 'Cliente',
    playlist: 'Lista',
    device: 'Aparelho',
  };

  return map[value] || value || '—';
}

function metadataPreview(metadata) {
  if (!metadata || typeof metadata !== 'object') return '—';

  const text = JSON.stringify(metadata);

  if (text === '{}' || text === 'null') return '—';

  return text.length > 150 ? text.slice(0, 150) + '...' : text;
}

function filteredAuditLogs() {
  const term = normalize($('auditSearch')?.value || '');
  const group = $('auditActionFilter')?.value || '';

  return auditLogs.filter(log => {
    const action = String(log.action || '');
    const matchGroup = !group || action.startsWith(group + '.');

    const text = normalize([
      log.action,
      log.description,
      log.entityType,
      log.entityId,
      JSON.stringify(log.metadata || {})
    ].join(' '));

    const matchTerm = !term || text.includes(term);

    return matchGroup && matchTerm;
  });
}

function renderAuditLogs() {
  const body = $('auditBody');
  if (!body) return;

  const list = filteredAuditLogs();

  body.innerHTML = list.length
    ? list.map(log => `
      <tr>
        <td class="muted">${fmtDate(log.createdAt)}</td>
        <td><span class="badge active">${esc(actionLabel(log.action))}</span></td>
        <td>${esc(entityLabel(log.entityType))}<br><span class="small muted mono">${esc(log.entityId || '')}</span></td>
        <td>${esc(log.description || '—')}</td>
        <td><span class="small mono">${esc(metadataPreview(log.metadata))}</span></td>
      </tr>
    `).join('')
    : '<tr><td colspan="5" class="muted">Nenhum registro encontrado.</td></tr>';
}

function clearAuditFilters() {
  $('auditSearch').value = '';
  $('auditActionFilter').value = '';
  renderAuditLogs();
}


function sellerStatusOptions(value) {
  return `
    <option value="active" ${value === 'active' ? 'selected' : ''}>Ativo</option>
    <option value="blocked" ${value === 'blocked' ? 'selected' : ''}>Bloqueado</option>
    <option value="inactive" ${value === 'inactive' ? 'selected' : ''}>Inativo</option>
  `;
}

function planStatusOptions(value) {
  return `
    <option value="active" ${value === 'active' ? 'selected' : ''}>Ativo</option>
    <option value="inactive" ${value === 'inactive' ? 'selected' : ''}>Inativo</option>
  `;
}

function ledgerTypeLabel(type) {
  const map = {
    purchase: 'Compra',
    activation: 'Ativação',
    renewal: 'Renovação',
    refund: 'Estorno',
    manual_add: 'Entrada manual',
    manual_remove: 'Saída manual'
  };

  return map[type] || type || '—';
}

function renderCommercial() {
  const totalCredits = sellers.reduce((sum, seller) => sum + Number(seller.creditBalance || 0), 0);

  if ($('stSellers')) $('stSellers').textContent = sellers.length;
  if ($('stCredits')) $('stCredits').textContent = totalCredits;
  if ($('stPlans')) $('stPlans').textContent = plans.length;
  if ($('stLedger')) $('stLedger').textContent = creditLedger.length;
  if ($('stActiveSellers')) $('stActiveSellers').textContent = sellers.filter(s => s.status === 'active').length;
  if ($('stBlockedSellers')) $('stBlockedSellers').textContent = sellers.filter(s => s.status === 'blocked').length;

  const sellerCreditSelect = $('sellerCreditSeller');
  if (sellerCreditSelect) {
    const selected = sellerCreditSelect.value;
    sellerCreditSelect.innerHTML = '<option value="">Escolha um vendedor</option>' +
      sellers.map(s => `<option value="${esc(s.id)}">${esc(s.name)} — ${Number(s.creditBalance || 0)} crédito(s)</option>`).join('');
    sellerCreditSelect.value = selected;
  }

  const sellersBody = $('sellersBody');
  if (sellersBody) {
    sellersBody.innerHTML = sellers.length
      ? sellers.map(seller => `
        <tr>
          <td>
            <input id="seller-name-${esc(seller.id)}" aria-label="Nome do vendedor ${esc(seller.name)}" value="${esc(seller.name)}" />
            <div class="small muted">${esc(seller.email || 'Sem e-mail')}</div>
          </td>
          <td><input id="seller-whats-${esc(seller.id)}" aria-label="WhatsApp do vendedor ${esc(seller.name)}" value="${esc(seller.whatsapp)}" /></td>
          <td><strong>${Number(seller.creditBalance || 0)}</strong><br><span class="small muted">crédito(s)</span></td>
          <td>
            <select id="seller-status-${esc(seller.id)}" aria-label="Status do vendedor ${esc(seller.name)}">
              ${sellerStatusOptions(seller.status)}
            </select>
          </td>
          <td>
            <label class="small">
              <input id="seller-negative-${esc(seller.id)}" type="checkbox" aria-label="Permitir saldo negativo para ${esc(seller.name)}" ${seller.canGoNegative ? 'checked' : ''} />
              permitir
            </label>
          </td>
          <td>
            <div class="seller-inline-actions">
              <button class="btn" onclick="showSellerDetails('${esc(seller.id)}')">Detalhes</button>
              <button class="btn green" onclick="updateSeller('${esc(seller.id)}')">Salvar</button>
              <button class="btn red" onclick="deleteSellerAccount('${esc(seller.id)}')">Excluir</button>
            </div>
          </td>
        </tr>
      `).join('')
      : '<tr><td colspan="6" class="muted">Nenhum vendedor cadastrado.</td></tr>';
  }

  const plansBody = $('plansBody');
  if (plansBody) {
    plansBody.innerHTML = plans.length
      ? plans.map(plan => `
        <tr>
          <td><input id="plan-name-${esc(plan.id)}" aria-label="Nome do plano ${esc(plan.name)}" value="${esc(plan.name)}" /></td>
          <td><input id="plan-days-${esc(plan.id)}" aria-label="Duração em dias do plano ${esc(plan.name)}" type="number" min="1" value="${Number(plan.durationDays || 30)}" /></td>
          <td><input id="plan-cost-${esc(plan.id)}" aria-label="Custo em créditos do plano ${esc(plan.name)}" type="number" min="1" value="${Number(plan.creditCost || 1)}" /></td>
          <td>
            <select id="plan-status-${esc(plan.id)}" aria-label="Status do plano ${esc(plan.name)}">
              ${planStatusOptions(plan.status)}
            </select>
          </td>
          <td>
            <button class="btn" onclick="updatePlan('${esc(plan.id)}')">Salvar</button>
          </td>
        </tr>
      `).join('')
      : '<tr><td colspan="5" class="muted">Nenhum plano cadastrado.</td></tr>';
  }

  const ledgerBody = $('creditLedgerBody');
  if (ledgerBody) {
    ledgerBody.innerHTML = creditLedger.length
      ? creditLedger.map(entry => {
        const positive = Number(entry.amount || 0) >= 0;
        return `
          <tr>
            <td class="muted">${fmtDate(entry.createdAt)}</td>
            <td>${esc(entry.sellerName || '—')}<br><span class="small muted mono">${esc(entry.sellerId || '')}</span></td>
            <td><span class="badge ${positive ? 'active' : 'blocked'}">${esc(ledgerTypeLabel(entry.type))}</span></td>
            <td><strong class="${positive ? 'ok-text' : 'danger-text'}">${positive ? '+' : ''}${Number(entry.amount || 0)}</strong></td>
            <td>${Number(entry.balanceAfter || 0)}</td>
            <td>${esc(entry.description || '—')}</td>
          </tr>
        `;
      }).join('')
      : '<tr><td colspan="6" class="muted">Nenhuma movimentação de crédito.</td></tr>';
  }
}


function ledgerTypeText(type) {
  const map = {
    purchase: 'Compra',
    activation: 'Ativação',
    renewal: 'Renovação',
    refund: 'Estorno',
    manual_add: 'Crédito manual',
    manual_remove: 'Remoção manual'
  };

  return map[type] || type || 'Movimento';
}

function reportNumber(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function sellerDevices(sellerId) {
  return devices.filter(d => d.sellerId === sellerId);
}

function sellerLedger(sellerId) {
  return creditLedger.filter(entry => entry.sellerId === sellerId);
}

function openSellerDeviceFilter(sellerId) {
  setTab('devices');

  setTimeout(() => {
    const filter = $('deviceSellerFilter');
    if (filter) {
      filter.value = sellerId;
      renderDevices();
    }
  }, 0);
}

function renderSellerReports() {
  const grid = $('sellerReportsGrid');
  if (!grid) return;

  if (!sellers.length) {
    grid.innerHTML = '<div class="muted">Nenhum vendedor cadastrado ainda.</div>';
    return;
  }

  grid.innerHTML = sellers.map(seller => {
    const linkedDevices = sellerDevices(seller.id);
    const ledger = sellerLedger(seller.id);

    const active = linkedDevices.filter(d => d.status === 'active').length;
    const pending = linkedDevices.filter(d => d.status === 'pending').length;
    const blocked = linkedDevices.filter(d => d.status === 'blocked').length;
    const expired = linkedDevices.filter(d => d.status === 'expired' || daysLeft(d.expiresAt) < 0).length;
    const expiring = linkedDevices.filter(isExpiringSoon).length;

    const creditsAdded = ledger
      .filter(entry => Number(entry.amount || 0) > 0)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

    const creditsConsumed = Math.abs(
      ledger
        .filter(entry => Number(entry.amount || 0) < 0)
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
    );

    const balance = Number(seller.creditBalance || 0);
    const balanceClass = balance < 0 ? 'negative' : 'positive';

    const recentLedger = ledger.slice(0, 5).map(entry => {
      const amount = Number(entry.amount || 0);
      const amountClass = amount >= 0 ? 'positive' : 'negative';

      return `
        <div class="seller-ledger-item">
          <div>
            <strong>${esc(ledgerTypeText(entry.type))}</strong>
            <span class="amount ${amountClass}">${amount > 0 ? '+' : ''}${reportNumber(amount)}</span>
          </div>
          <div class="small muted">${esc(entry.description || 'Sem descrição')}</div>
          <div class="small muted">${fmtDate(entry.createdAt)}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="seller-report-card">
        <div class="seller-report-head">
          <div>
            <strong>${esc(seller.name)}</strong>
            <div class="small muted">${esc(seller.whatsapp || '')}</div>
            ${seller.email ? `<div class="small muted">${esc(seller.email)}</div>` : ''}
          </div>
          ${badge(seller.status || 'active')}
        </div>

        <div class="small muted">Saldo atual</div>
        <div class="seller-balance ${balanceClass}">${reportNumber(balance)} crédito(s)</div>

        <div class="seller-metrics">
          <div class="seller-metric">
            <small>Aparelhos ativos</small>
            <strong>${active}</strong>
          </div>
          <div class="seller-metric">
            <small>Pendentes</small>
            <strong>${pending}</strong>
          </div>
          <div class="seller-metric">
            <small>Vencidos</small>
            <strong>${expired}</strong>
          </div>
          <div class="seller-metric">
            <small>Vencendo 7 dias</small>
            <strong>${expiring}</strong>
          </div>
          <div class="seller-metric">
            <small>Bloqueados</small>
            <strong>${blocked}</strong>
          </div>
          <div class="seller-metric">
            <small>Total aparelhos</small>
            <strong>${linkedDevices.length}</strong>
          </div>
          <div class="seller-metric">
            <small>Créditos adicionados</small>
            <strong>${reportNumber(creditsAdded)}</strong>
          </div>
          <div class="seller-metric">
            <small>Créditos consumidos</small>
            <strong>${reportNumber(creditsConsumed)}</strong>
          </div>
        </div>

        <div style="margin:14px 0;">
          <label for="seller-public-code-${esc(seller.id)}">Código público do vendedor para o APK</label>
          <input class="table-input" id="seller-public-code-${esc(seller.id)}" value="${esc(seller.publicCode || '')}" placeholder="Ex: ronaldo-123456">
          <p class="muted" style="margin-top:6px;">Esse é o código que o cliente digita no APK. Não é a senha do portal.</p>
        </div>

        <div style="margin:14px 0;">
          <label for="seller-token-${esc(seller.id)}">Token privado do vendedor para o portal</label>
          <input class="table-input" id="seller-token-${esc(seller.id)}" value="${esc(seller.accessToken || '')}" placeholder="Defina um token de acesso">
        </div>

        <div class="actions">
          <button class="btn" onclick="openSellerDeviceFilter('${esc(seller.id)}')">Ver aparelhos</button>
          <button class="btn green" onclick="saveSellerPublicCode('${esc(seller.id)}')">Salvar código público</button>
          <button class="btn" onclick="copyText($('seller-public-code-${esc(seller.id)}').value)">Copiar código público</button>
          <button class="btn green" onclick="saveSellerToken('${esc(seller.id)}')">Salvar token</button>
          <button class="btn" onclick="copyText($('seller-token-${esc(seller.id)}').value)">Copiar token</button>
          <a class="btn" href="./seller.html" target="_blank" rel="noreferrer">Portal vendedor</a>
          <button class="btn green" onclick="$('sellerCreditSeller').value='${esc(seller.id)}'; $('sellerCreditAmount').focus();">Adicionar créditos</button>
        </div>

        <h3 style="margin:16px 0 8px;">Últimas movimentações</h3>
        <div class="seller-ledger-list">
          ${recentLedger || '<div class="muted">Nenhuma movimentação recente.</div>'}
        </div>
      </div>
    `;
  }).join('');
}




async function saveSellerPublicCode(id) {
  try {
    const publicCode = $('seller-public-code-' + id).value.trim();

    if (!publicCode) {
      throw new Error('Digite um código público para o vendedor.');
    }

    await api('updateSeller', {
      id,
      publicCode
    });

    await loadAll();
    show('Código público do vendedor salvo.');
  } catch (err) {
    show(err.message, true);
  }
}

async function saveSellerToken(id) {
  try {
    const accessToken = $('seller-token-' + id).value.trim();

    if (!accessToken) {
      throw new Error('Digite um token para o vendedor.');
    }

    await api('updateSeller', {
      id,
      accessToken
    });

    await loadAll();
    show('Token do vendedor salvo.');
  } catch (err) {
    show(err.message, true);
  }
}



function openCustomerActionModal() {
  $('customerActionModal').classList.add('open');
  setTimeout(() => $('uxNewCustomerName')?.focus(), 0);
}

function closeCustomerActionModal() {
  $('customerActionModal').classList.remove('open');
}

function customerActionBackdropClose(event) {
  if (event.target && event.target.id === 'customerActionModal') {
    closeCustomerActionModal();
  }
}

async function submitCustomerModal() {
  $('newCustomerName').value = $('uxNewCustomerName').value;
  $('newCustomerWhatsapp').value = $('uxNewCustomerWhatsapp').value;

  await createCustomer();
  closeCustomerActionModal();
}

function openPlaylistActionModal() {
  $('playlistActionModal').classList.add('open');
  setTimeout(() => $('uxNewPlaylistName')?.focus(), 0);
}

function closePlaylistActionModal() {
  $('playlistActionModal').classList.remove('open');
}

function playlistActionBackdropClose(event) {
  if (event.target && event.target.id === 'playlistActionModal') {
    closePlaylistActionModal();
  }
}

async function submitPlaylistModal() {
  $('newPlaylistName').value = $('uxNewPlaylistName').value;
  $('newPlaylistUrl').value = $('uxNewPlaylistUrl').value;
  $('newPlaylistType').value = $('uxNewPlaylistType').value;

  await createPlaylist();
  closePlaylistActionModal();
}


function fillUxSellerSelect(selectedId = '') {
  const select = $('uxSellerCreditSeller');
  if (!select) return;

  select.innerHTML = '<option value="">Escolha um vendedor</option>' +
    sellers.map(seller => `<option value="${esc(seller.id)}">${esc(seller.name)} — ${Number(seller.creditBalance || 0)} crédito(s)</option>`).join('');

  select.value = selectedId;
}

function openCommercialActionModal(type = 'seller', sellerId = '') {
  fillUxSellerSelect(sellerId);
  setCommercialActionType(type);
  $('commercialActionModal').classList.add('open');
}

function closeCommercialActionModal() {
  $('commercialActionModal').classList.remove('open');
}

function commercialActionBackdropClose(event) {
  if (event.target && event.target.id === 'commercialActionModal') {
    closeCommercialActionModal();
  }
}

function setCommercialActionType(type) {
  document.querySelectorAll('.panel-ux-tab').forEach(button => {
    button.classList.toggle('active', button.dataset.uxAction === type);
  });

  document.querySelectorAll('.panel-ux-form').forEach(form => {
    form.classList.toggle('active', form.dataset.uxForm === type);
  });
}

async function submitCommercialSeller() {
  $('newSellerName').value = $('uxNewSellerName').value;
  $('newSellerWhatsapp').value = $('uxNewSellerWhatsapp').value;
  $('newSellerEmail').value = $('uxNewSellerEmail').value;
  $('newSellerInitialCredits').value = $('uxNewSellerInitialCredits').value || '0';
  $('newSellerCanGoNegative').checked = $('uxNewSellerCanGoNegative').checked;

  await createSeller();
  closeCommercialActionModal();
}

async function submitCommercialPlan() {
  $('newPlanName').value = $('uxNewPlanName').value;
  $('newPlanDurationDays').value = $('uxNewPlanDurationDays').value || '30';
  $('newPlanCreditCost').value = $('uxNewPlanCreditCost').value || '1';
  $('newPlanMaxDevices').value = $('uxNewPlanMaxDevices').value || '1';

  await createPlan();
  closeCommercialActionModal();
}

async function submitCommercialCredits() {
  $('sellerCreditSeller').value = $('uxSellerCreditSeller').value;
  $('sellerCreditAmount').value = $('uxSellerCreditAmount').value || '1';
  $('sellerCreditDescription').value = $('uxSellerCreditDescription').value;

  await addSellerCredits();
  closeCommercialActionModal();
}

function showSellerDetails(id) {
  const seller = sellers.find(item => item.id === id);
  if (!seller) {
    show('Vendedor não encontrado.', true);
    return;
  }

  const linkedDevices = sellerDevices(id);
  const ledger = sellerLedger(id);

  const active = linkedDevices.filter(d => d.status === 'active').length;
  const pending = linkedDevices.filter(d => d.status === 'pending').length;
  const blocked = linkedDevices.filter(d => d.status === 'blocked').length;
  const expired = linkedDevices.filter(d => d.status === 'expired' || daysLeft(d.expiresAt) < 0).length;
  const expiring = linkedDevices.filter(isExpiringSoon).length;

  const creditsAdded = ledger
    .filter(entry => Number(entry.amount || 0) > 0)
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const creditsConsumed = Math.abs(
    ledger
      .filter(entry => Number(entry.amount || 0) < 0)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
  );

  const balance = Number(seller.creditBalance || 0);
  const accessExpiry = seller.accessExpiresAt ? fmtDate(seller.accessExpiresAt) : 'Sem vencimento';
  const scheduledDeletion = seller.scheduledDeletionAt ? fmtDate(seller.scheduledDeletionAt) : 'Não agendada';
  const recentLedger = ledger.slice(0, 8).map(entry => {
    const amount = Number(entry.amount || 0);
    const amountClass = amount >= 0 ? 'positive' : 'negative';

    return `
      <div class="seller-ledger-item">
        <div>
          <strong>${esc(ledgerTypeText(entry.type))}</strong>
          <span class="amount ${amountClass}">${amount > 0 ? '+' : ''}${reportNumber(amount)}</span>
        </div>
        <div class="small muted">${esc(entry.description || 'Sem descrição')}</div>
        <div class="small muted">${fmtDate(entry.createdAt)}</div>
      </div>
    `;
  }).join('');

  openDetails(
    'Vendedor',
    `<span class="mono">${esc(seller.name)}</span> · ${badge(seller.status || 'active')}`,
    `
      <div class="seller-detail-report">
        <div class="seller-detail-hero">
          <div class="seller-detail-balance">
            <small>Saldo atual</small>
            <strong class="${balance < 0 ? 'negative' : 'positive'}">${reportNumber(balance)}</strong>
            <div class="small muted">crédito(s)</div>
          </div>

          <div class="seller-detail-section">
            <h3>${esc(seller.name)}</h3>
            <div class="small muted">${esc(seller.whatsapp || 'Sem WhatsApp')}</div>
            ${seller.email ? `<div class="small muted">${esc(seller.email)}</div>` : ''}
            <div style="margin-top:10px;">${badge(seller.status || 'active')}</div>
          </div>
        </div>

        <div class="seller-detail-grid">
          <div class="seller-detail-metric"><small>Ativos</small><strong>${active}</strong></div>
          <div class="seller-detail-metric"><small>Pendentes</small><strong>${pending}</strong></div>
          <div class="seller-detail-metric"><small>Vencidos</small><strong>${expired}</strong></div>
          <div class="seller-detail-metric"><small>Vencendo 7d</small><strong>${expiring}</strong></div>
          <div class="seller-detail-metric"><small>Bloqueados</small><strong>${blocked}</strong></div>
          <div class="seller-detail-metric"><small>Total aparelhos</small><strong>${linkedDevices.length}</strong></div>
          <div class="seller-detail-metric"><small>Créditos adicionados</small><strong>${reportNumber(creditsAdded)}</strong></div>
          <div class="seller-detail-metric"><small>Créditos consumidos</small><strong>${reportNumber(creditsConsumed)}</strong></div>
        </div>

        <div class="seller-detail-section">
          <h3>Códigos de acesso</h3>

          <label for="seller-public-code-${esc(seller.id)}">Código público do vendedor para o APK</label>
          <input class="table-input" id="seller-public-code-${esc(seller.id)}" value="${esc(seller.publicCode || '')}" placeholder="Ex: ronaldo-123456">
          <p class="muted" style="margin-top:6px;">Esse é o código que o cliente digita no APK. Não é a senha do portal.</p>

          <label for="seller-token-${esc(seller.id)}" style="margin-top:14px;">Token privado do vendedor para o portal</label>
          <input class="table-input" id="seller-token-${esc(seller.id)}" value="${esc(seller.accessToken || '')}" placeholder="Defina um token de acesso">
        </div>

        <div class="seller-detail-section">
          <h3>Validade da conta</h3>
          <p class="muted">Vencimento atual: <strong>${esc(accessExpiry)}</strong></p>
          <p class="muted">Exclusão automática: <strong>${seller.autoDeleteAfterExpiry ? 'Ativada' : 'Desativada'}</strong> · ${esc(scheduledDeletion)}</p>
          <label for="seller-access-duration-${esc(seller.id)}">Nova validade a partir de agora (horas)</label>
          <input class="table-input" id="seller-access-duration-${esc(seller.id)}" type="number" min="0" max="8760" value="${seller.accessExpiresAt ? '24' : '0'}">
          <p class="muted small" style="margin-top:6px;">Use 24 para renovar por 24 horas ou 0 para liberar sem vencimento.</p>
          <label class="ux-check-row" style="margin-top:12px;">
            <input id="seller-access-auto-delete-${esc(seller.id)}" type="checkbox" ${seller.autoDeleteAfterExpiry ? 'checked' : ''}>
            Excluir automaticamente se não renovar
          </label>
          <label for="seller-access-grace-${esc(seller.id)}" style="margin-top:12px;">Tolerância depois do bloqueio (horas)</label>
          <input class="table-input" id="seller-access-grace-${esc(seller.id)}" type="number" min="1" max="720" value="${Number(seller.autoDeleteGraceHours || 36)}">
          <div class="actions" style="margin-top:12px;">
            <button class="btn green" onclick="configureSellerTemporaryAccess('${esc(seller.id)}')">Salvar validade / renovar</button>
          </div>
        </div>

        <div class="seller-detail-section">
          <h3>Ações</h3>
          <div class="actions">
            <button class="btn" onclick="openSellerDeviceFilter('${esc(seller.id)}'); closeDetails();">Ver aparelhos</button>
            <button class="btn green" onclick="saveSellerPublicCode('${esc(seller.id)}')">Salvar código público</button>
            <button class="btn" onclick="copyText($('seller-public-code-${esc(seller.id)}').value)">Copiar código público</button>
            <button class="btn green" onclick="saveSellerToken('${esc(seller.id)}')">Salvar token</button>
            <button class="btn" onclick="copyText($('seller-token-${esc(seller.id)}').value)">Copiar token</button>
            <a class="btn" href="./seller.html" target="_blank" rel="noreferrer">Portal vendedor</a>
            <button class="btn green" onclick="closeDetails(); openCommercialActionModal('credits', '${esc(seller.id)}')">Adicionar créditos</button>
            <button class="btn red" onclick="deleteSellerAccount('${esc(seller.id)}')">Excluir vendedor</button>
          </div>
        </div>

        <div class="seller-detail-section">
          <h3>Últimas movimentações</h3>
          <div class="seller-ledger-list">
            ${recentLedger || '<div class="muted">Nenhuma movimentação recente.</div>'}
          </div>
        </div>
      </div>
    `
  );
}

async function createSeller() {
  try {
    await api('createSeller', {
      name: $('newSellerName').value.trim(),
      whatsapp: $('newSellerWhatsapp').value.trim(),
      email: $('newSellerEmail').value.trim() || null,
      initialCredits: Number($('newSellerInitialCredits').value || 0),
      canGoNegative: $('newSellerCanGoNegative').checked,
      status: 'active'
    });

    $('newSellerName').value = '';
    $('newSellerWhatsapp').value = '';
    $('newSellerEmail').value = '';
    $('newSellerInitialCredits').value = '0';
    $('newSellerCanGoNegative').checked = false;

    await loadAll();
    show('Vendedor cadastrado.');
  } catch (err) {
    show(err.message, true);
  }
}

async function updateSeller(id) {
  try {
    await api('updateSeller', {
      id,
      name: $('seller-name-' + id).value.trim(),
      whatsapp: $('seller-whats-' + id).value.trim(),
      status: $('seller-status-' + id).value,
      canGoNegative: $('seller-negative-' + id).checked
    });

    await loadAll();
    show('Vendedor atualizado.');
  } catch (err) {
    show(err.message, true);
  }
}

async function addSellerCredits() {
  try {
    const sellerId = $('sellerCreditSeller').value;
    const amount = Number($('sellerCreditAmount').value || 0);

    if (!sellerId) throw new Error('Escolha um vendedor.');
    if (!amount || amount < 1) throw new Error('Informe uma quantidade válida de créditos.');

    await api('addSellerCredits', {
      sellerId,
      amount,
      description: $('sellerCreditDescription').value.trim() || 'Crédito adicionado manualmente'
    });

    $('sellerCreditAmount').value = '1';
    $('sellerCreditDescription').value = '';

    await loadAll();
    show('Créditos adicionados.');
  } catch (err) {
    show(err.message, true);
  }
}

async function createPlan() {
  try {
    await api('createPlan', {
      name: $('newPlanName').value.trim(),
      durationDays: Number($('newPlanDurationDays').value || 30),
      creditCost: Number($('newPlanCreditCost').value || 1),
      maxDevices: Number($('newPlanMaxDevices').value || 1),
      status: 'active'
    });

    $('newPlanName').value = '';
    $('newPlanDurationDays').value = '30';
    $('newPlanCreditCost').value = '1';
    $('newPlanMaxDevices').value = '1';

    await loadAll();
    show('Plano cadastrado.');
  } catch (err) {
    show(err.message, true);
  }
}

async function updatePlan(id) {
  try {
    await api('updatePlan', {
      id,
      name: $('plan-name-' + id).value.trim(),
      durationDays: Number($('plan-days-' + id).value || 30),
      creditCost: Number($('plan-cost-' + id).value || 1),
      status: $('plan-status-' + id).value
    });

    await loadAll();
    show('Plano atualizado.');
  } catch (err) {
    show(err.message, true);
  }
}


async function logout() {
  await RonecaPanelAuth.signOut();
  window.location.href = './index.html';
}

loadAll();
