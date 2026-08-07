(function installAdminIntegrityLote1(global) {
  'use strict';

  const FUNCTION_NAME = 'admin-integrity-panel';
  const state = { pending: [], loaded: false };

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function fmtDate(value) {
    if (!value) return 'Sem validade';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? 'Data inválida'
      : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  async function integrityApi(action, payload = {}) {
    const config = global.RONECA_PANEL_CONFIG || {};
    const supabaseUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
    const anonKey = String(config.anonKey || '');
    const accessToken = await global.RonecaPanelAuth.getAccessToken();

    const response = await global.fetch(`${supabaseUrl}/functions/v1/${FUNCTION_NAME}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || data.message || 'Falha na verificação de integridade.');
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function activePlaylistOptions(selectedId = '') {
    const available = (typeof playlists !== 'undefined' ? playlists : [])
      .filter(item => item.active !== false);
    return '<option value="">Selecione</option>' + available.map(item => `
      <option value="${esc(item.id)}" ${item.id === selectedId ? 'selected' : ''}>
        ${esc(item.name)} · ${esc(item.cacheStatus || item.accessMode || 'status desconhecido')}
      </option>
    `).join('');
  }

  function ensureRepairModal() {
    if (document.getElementById('integrityRepairModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div id="integrityRepairModal" class="integrity-modal" aria-hidden="true">
        <div class="integrity-modal-card" role="dialog" aria-modal="true" aria-labelledby="integrityRepairTitle">
          <button class="integrity-modal-close" type="button" aria-label="Fechar">×</button>
          <p class="integrity-eyebrow">Correção sem crédito</p>
          <h2 id="integrityRepairTitle">Definir listas do aparelho</h2>
          <p id="integrityRepairSubtitle" class="muted"></p>
          <input type="hidden" id="integrityRepairDeviceId">
          <label>Lista principal
            <select id="integrityRepairPrimary" class="table-select"></select>
          </label>
          <label>Lista reserva <span class="muted">(opcional)</span>
            <select id="integrityRepairBackup" class="table-select"></select>
          </label>
          <div class="integrity-modal-note">
            Esta correção mantém plano, validade e saldo exatamente como estão.
          </div>
          <div class="integrity-modal-actions">
            <button class="btn" type="button" data-integrity-cancel>Cancelar</button>
            <button class="btn primary" type="button" data-integrity-save>Salvar listas</button>
          </div>
          <div id="integrityRepairStatus" class="small muted"></div>
        </div>
      </div>
    `);

    const modal = document.getElementById('integrityRepairModal');
    const close = () => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    };
    modal.querySelector('.integrity-modal-close').addEventListener('click', close);
    modal.querySelector('[data-integrity-cancel]').addEventListener('click', close);
    modal.addEventListener('click', event => {
      if (event.target === modal) close();
    });
    modal.querySelector('[data-integrity-save]').addEventListener('click', saveRepair);
  }

  function openRepair(deviceId) {
    ensureRepairModal();
    const item = state.pending.find(row => row.id === deviceId);
    if (!item) return;

    document.getElementById('integrityRepairDeviceId').value = item.id;
    document.getElementById('integrityRepairSubtitle').textContent =
      `${item.deviceCode} · ${item.customerName || item.clientName || 'Sem cliente'} · validade ${fmtDate(item.expiresAt)}`;
    document.getElementById('integrityRepairPrimary').innerHTML = activePlaylistOptions();
    document.getElementById('integrityRepairBackup').innerHTML =
      '<option value="">Sem reserva</option>' + activePlaylistOptions().replace('<option value="">Selecione</option>', '');
    document.getElementById('integrityRepairStatus').textContent = '';

    const modal = document.getElementById('integrityRepairModal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.getElementById('integrityRepairPrimary').focus();
  }

  async function saveRepair() {
    const deviceId = document.getElementById('integrityRepairDeviceId').value;
    const primaryPlaylistId = document.getElementById('integrityRepairPrimary').value;
    const backupPlaylistId = document.getElementById('integrityRepairBackup').value || null;
    const status = document.getElementById('integrityRepairStatus');
    const button = document.querySelector('[data-integrity-save]');

    if (!primaryPlaylistId) {
      status.textContent = 'Escolha a lista principal.';
      return;
    }
    if (backupPlaylistId && backupPlaylistId === primaryPlaylistId) {
      status.textContent = 'A reserva precisa ser diferente da principal.';
      return;
    }

    button.disabled = true;
    status.textContent = 'Salvando sem alterar crédito ou validade…';
    try {
      await integrityApi('repairDevicePlaylists', { deviceId, primaryPlaylistId, backupPlaylistId });
      document.getElementById('integrityRepairModal').classList.remove('open');
      if (typeof loadAll === 'function') await loadAll();
      await loadIntegrity();
      if (typeof show === 'function') show('Listas corrigidas sem consumir crédito.');
    } catch (error) {
      status.textContent = error.message || 'Não foi possível corrigir o aparelho.';
    } finally {
      button.disabled = false;
    }
  }

  function pendingCard(item) {
    return `
      <article class="integrity-pending-card">
        <div>
          <strong class="mono">${esc(item.deviceCode)}</strong>
          <span>${esc(item.customerName || item.clientName || 'Sem cliente')}</span>
          <small>${esc(item.sellerName || 'Sem vendedor')} · ${esc(item.planName || 'Sem plano')} · ${esc(fmtDate(item.expiresAt))}</small>
        </div>
        <button class="btn primary" type="button" data-integrity-repair="${esc(item.id)}">Escolher listas</button>
      </article>
    `;
  }

  function renderIntegrity() {
    const sections = [
      document.getElementById('section-dashboard'),
      document.getElementById('section-devices'),
    ].filter(Boolean);

    sections.forEach(section => {
      let panel = section.querySelector('.integrity-lote1-panel');
      if (!panel) {
        panel = document.createElement('section');
        panel.className = 'integrity-lote1-panel';
        section.prepend(panel);
      }

      if (!state.loaded) {
        panel.innerHTML = '<div class="muted">Verificando integridade dos aparelhos…</div>';
        return;
      }

      if (!state.pending.length) {
        panel.innerHTML = `
          <div class="integrity-ok">
            <strong>Integridade dos aparelhos verificada</strong>
            <span>Nenhum aparelho ativo está sem lista principal.</span>
          </div>
        `;
        return;
      }

      panel.innerHTML = `
        <div class="integrity-alert-head">
          <div>
            <p class="integrity-eyebrow">Ação necessária</p>
            <h3>${state.pending.length} aparelho(s) ativo(s) sem lista</h3>
            <p>Esses aparelhos mantêm plano e validade, mas não conseguem carregar conteúdo.</p>
          </div>
          <span class="integrity-count">${state.pending.length}</span>
        </div>
        <div class="integrity-pending-list">${state.pending.map(pendingCard).join('')}</div>
      `;

      panel.querySelectorAll('[data-integrity-repair]').forEach(button => {
        button.addEventListener('click', () => openRepair(button.dataset.integrityRepair));
      });
    });

    if (typeof devices !== 'undefined') {
      state.pending.forEach(item => {
        document.querySelectorAll('.admin-device-card').forEach(card => {
          if (card.querySelector('.admin-device-code')?.textContent.trim() !== item.deviceCode) return;
          card.classList.add('integrity-missing-playlist');
          if (!card.querySelector('.integrity-inline-warning')) {
            card.querySelector('.admin-device-head')?.insertAdjacentHTML('afterend', `
              <div class="integrity-inline-warning">
                <strong>Ativo sem lista</strong>
                <span>Escolha uma lista principal para o conteúdo voltar a carregar.</span>
              </div>
            `);
          }
        });
      });
    }
  }

  async function loadIntegrity() {
    try {
      const data = await integrityApi('listIntegrity');
      state.pending = data.activeWithoutPlaylist || [];
      state.loaded = true;
      renderIntegrity();
    } catch (error) {
      state.loaded = true;
      console.error('Falha ao carregar integridade:', error);
      renderIntegrity();
    }
  }

  function impactItems(impact) {
    return {
      primary: Array.isArray(impact?.primaryDevices) ? impact.primaryDevices : [],
      reserve: Array.isArray(impact?.reserveDevices) ? impact.reserveDevices : [],
      blockers: Array.isArray(impact?.blockingDevices) ? impact.blockingDevices : [],
      sellers: Number(impact?.sellerLinks || 0),
      validations: Number(impact?.activeValidationSessions || 0),
    };
  }

  async function safeDeletePlaylist(id) {
    try {
      const preview = await integrityApi('inspectPlaylistArchive', { playlistId: id });
      const impact = preview.impact || {};
      const usage = impactItems(impact);

      if (!impact.canArchive || usage.blockers.length) {
        const codes = usage.blockers.map(item => item.deviceCode).filter(Boolean).join(', ');
        alert(
          `Esta lista não pode ser arquivada.\n\n` +
          `Ela é a lista principal de aparelho(s) ativo(s) sem reserva: ${codes || 'não identificado'}.\n\n` +
          `Escolha uma substituta ou desative o aparelho antes de tentar novamente.`
        );
        if (typeof setTab === 'function') setTab('devices');
        return;
      }

      const consequences = [
        `Lista: ${impact.playlistName || id}`,
        `Aparelhos usando como principal: ${usage.primary.length}`,
        `Aparelhos usando como reserva: ${usage.reserve.length}`,
        `Vínculos com vendedores: ${usage.sellers}`,
        `Homologações ativas: ${usage.validations}`,
      ];
      if (usage.primary.length) consequences.push('As reservas elegíveis serão promovidas para principal.');
      if (usage.reserve.length) consequences.push('Os vínculos de reserva serão removidos.');
      consequences.push('A lista será arquivada e deixará de aparecer em novas ativações.');

      if (!confirm(`${consequences.join('\n')}\n\nDeseja continuar?`)) return;

      await integrityApi('archivePlaylist', { playlistId: id, confirmed: true });
      if (typeof loadAll === 'function') await loadAll();
      await loadIntegrity();
      if (typeof show === 'function') show('Lista arquivada com segurança.');
    } catch (error) {
      if (typeof show === 'function') show(error.message || 'Não foi possível arquivar a lista.', true);
      else alert(error.message || 'Não foi possível arquivar a lista.');
    }
  }

  function install() {
    ensureRepairModal();

    if (typeof global.deletePlaylist === 'function' && !global.deletePlaylist.__lote1SafeArchive) {
      const replacement = id => safeDeletePlaylist(id);
      replacement.__lote1SafeArchive = true;
      global.deletePlaylist = replacement;
    }

    if (typeof global.loadAll === 'function' && !global.loadAll.__lote1Integrity) {
      const originalLoadAll = global.loadAll;
      const wrapped = async function integrityAwareLoadAll(...args) {
        const result = await originalLoadAll.apply(this, args);
        await loadIntegrity();
        return result;
      };
      wrapped.__lote1Integrity = true;
      global.loadAll = wrapped;
    }

    loadIntegrity();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})(window);
