(() => {
  function removeDuplicateCommercialPanels() {
    const panels = Array.from(document.querySelectorAll('#section-commercial .commercial-action-panel'));
    panels.forEach((panel, index) => {
      if (index > 0) panel.remove();
    });
  }

  function removeLegacySellerButtons() {
    document.querySelectorAll('.ux-seller-details').forEach(button => button.remove());
  }

  function safeText(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function getGlobalList(name) {
    try {
      return Function(`return typeof ${name} !== 'undefined' ? ${name} : []`)();
    } catch {
      return [];
    }
  }

  function getGlobalFn(name, fallback) {
    try {
      return Function(`return typeof ${name} !== 'undefined' ? ${name} : undefined`)() || fallback;
    } catch {
      return fallback;
    }
  }

  function installSellerDetailsFallback() {
    window.showSellerDetails = function showSellerDetailsFallback(id) {
      const sellers = getGlobalList('sellers');
      const devices = getGlobalList('devices');
      const creditLedger = getGlobalList('creditLedger');
      const seller = sellers.find(item => item.id === id);
      const show = getGlobalFn('show', () => {});
      const openDetails = getGlobalFn('openDetails', null);

      if (!seller || !openDetails) {
        show('Vendedor não encontrado ou modal indisponível.', true);
        return;
      }

      const esc = getGlobalFn('esc', safeText);
      const badge = getGlobalFn('badge', status => `<span class="badge ${esc(status)}">${esc(status)}</span>`);
      const fmtDate = getGlobalFn('fmtDate', value => value || '—');
      const daysLeft = getGlobalFn('daysLeft', () => null);
      const isExpiringSoon = getGlobalFn('isExpiringSoon', () => false);
      const ledgerTypeText = getGlobalFn('ledgerTypeText', value => value || 'Movimento');
      const reportNumber = getGlobalFn('reportNumber', value => Number(value || 0).toLocaleString('pt-BR'));

      const linkedDevices = devices.filter(device => device.sellerId === id);
      const ledger = creditLedger.filter(entry => entry.sellerId === id);
      const active = linkedDevices.filter(device => device.status === 'active').length;
      const pending = linkedDevices.filter(device => device.status === 'pending').length;
      const blocked = linkedDevices.filter(device => device.status === 'blocked').length;
      const expired = linkedDevices.filter(device => device.status === 'expired' || daysLeft(device.expiresAt) < 0).length;
      const expiring = linkedDevices.filter(isExpiringSoon).length;
      const creditsAdded = ledger.filter(entry => Number(entry.amount || 0) > 0).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
      const creditsConsumed = Math.abs(ledger.filter(entry => Number(entry.amount || 0) < 0).reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
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

      const needsLogin = seller.hasPortalLogin === false || !seller.email;

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

            ${needsLogin ? `
              <div class="seller-detail-section">
                <h3>Liberar login do vendedor antigo</h3>
                <p class="muted">Defina o e-mail e a senha inicial. O saldo, aparelhos, clientes e movimentações serão preservados.</p>
                <label for="seller-login-email-${esc(seller.id)}">E-mail de acesso</label>
                <input class="table-input" id="seller-login-email-${esc(seller.id)}" type="email" value="${esc(seller.email || '')}" placeholder="vendedor@exemplo.com">
                <label for="seller-login-password-${esc(seller.id)}" style="margin-top:12px;">Senha inicial</label>
                <input class="table-input" id="seller-login-password-${esc(seller.id)}" type="password" minlength="8" placeholder="Mínimo de 8 caracteres">
                <div class="actions" style="margin-top:12px;">
                  <button class="btn green" onclick="provisionExistingSellerLogin('${esc(seller.id)}')">Liberar acesso por login</button>
                </div>
              </div>
            ` : ''}

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
                <a class="btn" href="./seller.html" target="_blank" rel="noreferrer">Portal do vendedor</a>
                <button class="btn" onclick="openSellerDeviceFilter('${esc(seller.id)}'); closeDetails();">Ver aparelhos</button>
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
    };
  }

  function fixCommercialUx() {
    removeDuplicateCommercialPanels();
    removeLegacySellerButtons();
    installSellerDetailsFallback();
  }

  document.addEventListener('DOMContentLoaded', fixCommercialUx);
  window.setTimeout(fixCommercialUx, 250);
  window.setTimeout(fixCommercialUx, 1200);
})();
