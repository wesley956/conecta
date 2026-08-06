import fs from 'node:fs';

function appendOnce(path, marker, content) {
  const current = fs.readFileSync(path, 'utf8');
  if (!current.includes(marker)) fs.writeFileSync(path, current.trimEnd() + '\n\n' + content.trim() + '\n');
}

appendOnce('admin-panel/app-release.js', 'universal-playlist-registration.css', `
(function loadUniversalPlaylistRegistration(global) {
  'use strict';
  if (document.querySelector('link[data-universal-playlists]')) return;
  var style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = './universal-playlist-registration.css';
  style.dataset.universalPlaylists = 'true';
  document.head.appendChild(style);
  var script = document.createElement('script');
  script.src = './universal-playlist-registration.js';
  script.async = false;
  script.dataset.universalPlaylists = 'true';
  document.body.appendChild(script);
})(window);
`);

appendOnce('supabase/config.toml', '[functions.playlist-source-manager]', `
[functions.playlist-source-manager]
verify_jwt = true
`);

const packagePath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.scripts['check:universal-playlist-source'] = 'node --check admin-panel/universal-playlist-registration.js && node --experimental-strip-types scripts/check-universal-playlist-source.mjs';
if (!pkg.scripts.verify.includes('check:universal-playlist-source')) {
  pkg.scripts.verify = pkg.scripts.verify.replace('npm run check:m3u-parser &&', 'npm run check:m3u-parser && npm run check:universal-playlist-source &&');
}
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
