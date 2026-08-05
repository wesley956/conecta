(() => {
  'use strict';

  if (window.__ronecaPlaylistFingerprintBackfillInstalled) return;
  window.__ronecaPlaylistFingerprintBackfillInstalled = true;
  if (!/\/dashboard\.html$/.test(window.location.pathname)) return;

  // Compatibilidade de regressão com o marcador anterior: 2026-08-05-v2.
  const STORAGE_KEY = 'roneca:playlist-fingerprint-backfill:2026-08-05-v3';
  let running = false;

  async function invokeBackfill() {
    const config = window.RONECA_PANEL_CONFIG || {};
    const supabaseUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
    const anonKey = String(config.anonKey || '').trim();
    if (!supabaseUrl || !anonKey || !window.RonecaPanelAuth) return false;

    const accessToken = await window.RonecaPanelAuth.getAccessToken();
    const response = await fetch(`${supabaseUrl}/functions/v1/playlist-fingerprint-backfill`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: '{}',
    });

    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) return false;
    if (!response.ok && response.status !== 207) {
      throw new Error(payload.error || payload.message || `Falha HTTP ${response.status}.`);
    }

    const result = payload.data || payload;
    const completed = Number(result.failures || 0) === 0
      && Number(result.remainingWithoutFingerprint || 0) === 0;
    if (completed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        completedAt: new Date().toISOString(),
        examined: Number(result.examined || 0),
        fingerprinted: Number(result.fingerprinted || 0),
        consolidated: Number(result.consolidated || 0),
        canonicalSources: Number(result.canonicalSources || 0),
      }));
      window.dispatchEvent(new CustomEvent('roneca:playlist-fingerprint-backfill-complete', {
        detail: result,
      }));
      return true;
    }
    return false;
  }

  async function runOnce() {
    if (running || localStorage.getItem(STORAGE_KEY)) return;
    running = true;
    try {
      await invokeBackfill();
    } catch (error) {
      console.error('Backfill protegido de fingerprints ainda não concluído.', {
        message: String(error?.message || 'falha temporária').slice(0, 180),
      });
    } finally {
      running = false;
    }
  }

  function initialize() {
    setTimeout(runOnce, 1200);
    window.addEventListener('roneca:panel-auth-ready', runOnce);
    window.addEventListener('focus', runOnce);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
