(() => {
  'use strict';

  if (!/\/dashboard\.html$/i.test(window.location.pathname)) return;

  function repairPlaylistWorkspaceVisibility() {
    const workspace = document.getElementById('adminPlaylistWorkspace');
    if (!workspace) return false;

    const workspaceCard = workspace.closest('.entity-primary-card');
    if (workspaceCard) workspaceCard.classList.remove('upl-legacy-hidden');

    const legacyTable = document.getElementById('playlistsBody');
    if (legacyTable && !workspace.contains(legacyTable)) {
      const legacyWrapper = legacyTable.closest('.tablewrap') || legacyTable;
      legacyWrapper.classList.add('upl-legacy-hidden');
    }

    return true;
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const repaired = repairPlaylistWorkspaceVisibility();
    if (repaired || attempts >= 40) clearInterval(timer);
  }, 250);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', repairPlaylistWorkspaceVisibility, { once: true });
  } else {
    repairPlaylistWorkspaceVisibility();
  }
})();
