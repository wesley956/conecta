(() => {
  'use strict';

  // Compatibilidade para contratos antigos: a implementação única do menu Mais
  // vive em mobile-more-navigation.js. Este arquivo não mantém lógica paralela.
  function refreshSharedSellerNavigation() {
    window.RonecaMobileMoreNavigation?.refresh(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshSharedSellerNavigation, { once: true });
  } else {
    refreshSharedSellerNavigation();
  }
})();
