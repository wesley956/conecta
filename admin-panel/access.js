(() => {
  'use strict';

  const ADMIN_API = 'https://awauvkjkucjqulkklmuo.supabase.co/functions/v1/admin-panel';
  const SELLER_API = 'https://awauvkjkucjqulkklmuo.supabase.co/functions/v1/seller-panel';
  const ADMIN_TOKEN_KEY = 'cruz-stars-admin-token';
  const SELLER_TOKEN_KEY = 'roneca_seller_token';

  const form = document.getElementById('accessForm');
  const tokenInput = document.getElementById('accessToken');
  const loginButton = document.getElementById('loginButton');
  const clearButton = document.getElementById('clearLoginButton');
  const message = document.getElementById('accessMsg');

  function setMessage(text, type = '') {
    message.className = `access-message${type ? ` is-${type}` : ''}`;
    message.textContent = text;
  }

  function setLoading(loading) {
    loginButton.disabled = loading;
    clearButton.disabled = loading;
    tokenInput.disabled = loading;
  }

  async function validateToken(apiUrl, headerName, token, action) {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [headerName]: token,
      },
      body: JSON.stringify({ action }),
    });

    if (!response.ok) return false;
    await response.json().catch(() => ({}));
    return true;
  }

  async function login(event) {
    event.preventDefault();
    const token = tokenInput.value.trim();

    if (!token) {
      setMessage('Digite o token de acesso.', 'error');
      tokenInput.focus();
      return;
    }

    try {
      setLoading(true);
      setMessage('Verificando acesso...');

      const isAdmin = await validateToken(
        ADMIN_API,
        'x-admin-token',
        token,
        'listCommercialData',
      );

      if (isAdmin) {
        localStorage.setItem(ADMIN_TOKEN_KEY, token);
        localStorage.removeItem(SELLER_TOKEN_KEY);
        setMessage('Acesso de administrador confirmado.', 'success');
        window.location.assign('./dashboard.html');
        return;
      }

      const isSeller = await validateToken(
        SELLER_API,
        'x-seller-token',
        token,
        'dashboard',
      );

      if (isSeller) {
        localStorage.setItem(SELLER_TOKEN_KEY, token);
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        setMessage('Acesso de vendedor confirmado.', 'success');
        window.location.assign('./seller.html');
        return;
      }

      setMessage('Token inválido para administrador e vendedor.', 'error');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao verificar token.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function clearLogin() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(SELLER_TOKEN_KEY);
    tokenInput.value = '';
    setMessage('Acesso salvo removido deste navegador.', 'success');
    tokenInput.focus();
  }

  form.addEventListener('submit', login);
  clearButton.addEventListener('click', clearLogin);
})();
