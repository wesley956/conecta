(function installMobileMoreNavigation(global) {
  'use strict';

  if (global.RonecaMobileMoreNavigation) return;

  var COMPACT_NAV_QUERY = '(max-width: 820px)';
  var MORE_SELECTOR = 'details.admin-nav-more, details.seller-v2-more';
  var OPEN_MORE_SELECTOR = 'details.admin-nav-more[open], details.seller-v2-more[open]';
  var boundDetails = new WeakSet();
  var navigationModes = new WeakMap();
  var resizeFrame = 0;

  function isCompactNavigation() {
    return global.matchMedia(COMPACT_NAV_QUERY).matches;
  }

  function setOpen(details, open) {
    details.open = Boolean(open);
    var summary = details.querySelector(':scope > summary');
    if (summary) summary.setAttribute('aria-expanded', String(details.open));
  }

  function closeOtherMenus(current) {
    document.querySelectorAll(OPEN_MORE_SELECTOR).forEach(function closeMenu(details) {
      if (details !== current) setOpen(details, false);
    });
  }

  function syncNavigationMode(details) {
    var mode = isCompactNavigation() ? 'compact' : 'wide';
    var previousMode = navigationModes.get(details);
    navigationModes.set(details, mode);

    if (previousMode === mode) return;
    setOpen(details, mode === 'wide' && details.classList.contains('admin-nav-more'));
  }

  function bindDetails(details) {
    if (!(details instanceof HTMLDetailsElement) || boundDetails.has(details)) return;
    var summary = details.querySelector(':scope > summary');
    if (!summary) return;

    boundDetails.add(details);
    summary.setAttribute('aria-haspopup', 'menu');
    summary.setAttribute('aria-expanded', String(details.open));

    summary.addEventListener('click', function toggleMobileMore(event) {
      if (!isCompactNavigation()) return;
      event.preventDefault();
      var shouldOpen = !details.open;
      closeOtherMenus(details);
      setOpen(details, shouldOpen);
    });

    details.addEventListener('toggle', function announceMobileMoreState() {
      summary.setAttribute('aria-expanded', String(details.open));
    });

    syncNavigationMode(details);
  }

  function refresh(root) {
    var scope = root && root.querySelectorAll ? root : document;
    if (scope.matches && scope.matches(MORE_SELECTOR)) bindDetails(scope);
    scope.querySelectorAll(MORE_SELECTOR).forEach(bindDetails);
    document.querySelectorAll(MORE_SELECTOR).forEach(syncNavigationMode);
  }

  function closeFromInteraction(event) {
    if (!isCompactNavigation()) return;

    var selectedItem = event.target.closest('[data-tab], [data-seller-nav]');
    var selectedMenu = selectedItem && selectedItem.closest(MORE_SELECTOR);
    if (selectedMenu) {
      setOpen(selectedMenu, false);
      return;
    }

    document.querySelectorAll(OPEN_MORE_SELECTOR).forEach(function closeOutside(details) {
      if (!details.contains(event.target)) setOpen(details, false);
    });
  }

  function closeFromKeyboard(event) {
    if (event.key !== 'Escape' || !isCompactNavigation()) return;
    document.querySelectorAll(OPEN_MORE_SELECTOR).forEach(function closeMenu(details) {
      setOpen(details, false);
      details.querySelector(':scope > summary')?.focus();
    });
  }

  function initialize() {
    refresh(document);

    new MutationObserver(function navigationChanged(mutations) {
      mutations.forEach(function inspectAddedNavigation(mutation) {
        mutation.addedNodes.forEach(function inspectNode(node) {
          if (node.nodeType === Node.ELEMENT_NODE) refresh(node);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', closeFromInteraction);
    document.addEventListener('keydown', closeFromKeyboard);
    global.addEventListener('resize', function syncOnlyAcrossBreakpoint() {
      global.cancelAnimationFrame(resizeFrame);
      resizeFrame = global.requestAnimationFrame(function syncNavigationAfterResize() {
        refresh(document);
      });
    });
  }

  global.RonecaMobileMoreNavigation = Object.freeze({ refresh: refresh });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})(window);
