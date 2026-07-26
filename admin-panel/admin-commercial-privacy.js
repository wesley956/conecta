(() => {
  'use strict';

  if (!/\/dashboard\.html$/i.test(location.pathname)) return;

  function cleanPrivateSellerFinance() {
    document.querySelectorAll('.tab[data-tab="finance"]').forEach(item => item.remove());
    document.getElementById('section-finance')?.remove();

    document.querySelectorAll('.finance-inline').forEach(host => {
      const id = String(host.id || '');
      if (id.startsWith('finance-pending-') || id === 'finance-admin-renew') host.remove();
    });

    document.querySelectorAll('[id^="finance-pending-"]').forEach(item => item.remove());
    document.getElementById('finance-admin-renew')?.remove();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanPrivateSellerFinance, { once: true });
  } else {
    cleanPrivateSellerFinance();
  }

  new MutationObserver(cleanPrivateSellerFinance).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  setTimeout(cleanPrivateSellerFinance, 300);
  setTimeout(cleanPrivateSellerFinance, 1000);
})();
