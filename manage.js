(() => {
  const PROJECT = 'https://awauvkjkucjqulkklmuo.supabase.co';
  const KEY = 'sb_publishable_QhNyg55ZhiOCPZyuSjsX8A_Kq7nTiYN';
  let token = null;
  try { window.opener = null; } catch {}
  const q = id => document.getElementById(id);
  const message = (id, value, kind = '') => { const el = q(id); el.textContent = value; el.className = `msg ${kind}`; };
  q('loginForm').addEventListener('submit', async event => {
    event.preventDefault(); message('loginMsg', 'Entrando…'); token = null;
    try {
      const response = await fetch(`${PROJECT}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY },
        body: JSON.stringify({ email: q('email').value.trim(), password: q('password').value }),
      });
      const body = await response.json();
      if (!response.ok || !body.access_token) throw new Error(body.error_description || body.msg || 'Login inválido.');
      token = body.access_token; q('password').value = '';
      q('loginCard').classList.add('hidden'); q('pinCard').classList.remove('hidden'); message('loginMsg', '');
    } catch (error) { message('loginMsg', error instanceof Error ? error.message : 'Falha no login.', 'error'); }
  });
  q('pinForm').addEventListener('submit', async event => {
    event.preventDefault(); if (!token) return; message('pinMsg', 'Salvando…'); q('playerLink').classList.add('hidden');
    try {
      const code = q('deviceCode').value.trim().toUpperCase(); const pin = q('pin').value.trim();
      const response = await fetch(`${PROJECT}/functions/v1/web-homolog-configure`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ deviceCode: code, pin }),
      });
      const body = await response.json();
      if (!response.ok || body.ok === false) throw new Error(body.message || body.error || 'Falha ao configurar.');
      q('pin').value = '';
      message('pinMsg', `Acesso Web ativado. Use o código ${body.device?.code || code} e o PIN escolhido no player.`, 'ok');
      q('playerLink').classList.remove('hidden');
    } catch (error) { message('pinMsg', error instanceof Error ? error.message : 'Falha ao configurar.', 'error'); }
  });
  q('logout').addEventListener('click', () => { token = null; q('pinCard').classList.add('hidden'); q('loginCard').classList.remove('hidden'); message('pinMsg', ''); });
})();
