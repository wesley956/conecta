(() => {
  'use strict';

  if (!/\/dashboard\.html$/i.test(window.location.pathname)) return;

  const STYLE_ID = 'adminRouteGuardStyle';
  const ADMIN_ACTION = 'listCommercialData';
  const SELLER_ACTION = 'dashboard';

  function hideAdminShell() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = 'body.admin-v2 > .app{visibility:hidden!important}';
    document.head.appendChild(style);
  }

  function revealAdminShell() {
    document.getElementById(STYLE_ID)?.remove();
  }

  async function waitForPanelAuth() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (window.RonecaPanelAuth && window.RONECA_PANEL_CONFIG) return true;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return false;
  }

  async function callRole(functionName, action) {
    const config = window.RONECA_PANEL_CONFIG || {};
    const base = String(config.supabaseUrl || '').replace(/\/$/, '');
    if (!base || !window.RonecaPanelAuth) return { ok: false, status: 0 };

    const response = await fetch(`${base}/functions/v1/${functionName}`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });

    return { ok: response.ok, status: response.status };
  }

  async function guard() {
    hideAdminShell();

    const ready = await waitForPanelAuth();
    if (!ready || !window.RonecaPanelAuth.hasSession()) {
      window.location.replace('./index.html');
      return;
    }

    try {
      const admin = await callRole('admin-panel', ADMIN_ACTION);
      if (admin.ok) {
        window.__RONECA_ADMIN_ROUTE_AUTHORIZED = true;
        revealAdminShell();
        return;
      }

      if (admin.status !== 401 && admin.status !== 403) {
        // Falha técnica do endpoint administrativo: não confundir com papel incorreto.
        // O dashboard existente continua responsável por exibir o erro operacional.
        revealAdminShell();
        return;
      }

      const seller = await callRole('seller-panel', SELLER_ACTION);
      if (seller.ok) {
        window.location.replace('./seller.html');
        return;
      }

      if (seller.status === 401 || seller.status === 403) {
        await window.RonecaPanelAuth.signOut().catch(() => {});
      }
      window.location.replace('./index.html');
    } catch (error) {
      console.error('Falha ao validar rota administrativa:', error);
      window.location.replace('./index.html');
    }
  }

  hideAdminShell();
  setTimeout(guard, 0);
})();
