(() => {
  const REFRESH_KEY = 'roneca.web.refresh.v1';
  try { window.opener = null; } catch {}
  try { window.sessionStorage.removeItem(REFRESH_KEY); } catch {}
  const getItem = Storage.prototype.getItem;
  const setItem = Storage.prototype.setItem;
  const removeItem = Storage.prototype.removeItem;
  Storage.prototype.getItem = function (key) {
    if (this === window.sessionStorage && key === REFRESH_KEY) return null;
    return getItem.call(this, key);
  };
  Storage.prototype.setItem = function (key, value) {
    if (this === window.sessionStorage && key === REFRESH_KEY) return;
    return setItem.call(this, key, value);
  };
  Storage.prototype.removeItem = function (key) {
    if (this === window.sessionStorage && key === REFRESH_KEY) return;
    return removeItem.call(this, key);
  };
})();
