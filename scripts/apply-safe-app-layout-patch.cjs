const fs = require('node:fs');
const path = require('node:path');

const file = path.join(process.cwd(), 'src/index.css');
const marker = '/* RonecaPlayTV — Layout Seguro APK 1 */';
let css = fs.readFileSync(file, 'utf8');

if (css.includes(marker)) {
  console.log('OK: patch seguro de layout já aplicado.');
  process.exit(0);
}

const patch = `

${marker}
/* Ajustes de layout com baixo risco: apenas CSS, sem alterar player/rotas. */
@media (hover: none) and (pointer: coarse) and (orientation: landscape) {
  html {
    /* Mantém o app compacto, mas evita texto microscópico em APK landscape. */
    font-size: clamp(12px, 1.55vw, 15px) !important;
  }

  .premium-bg::before {
    opacity: 0.10 !important;
  }

  .roneca-side-menu {
    width: 68px !important;
    min-width: 68px !important;
    overflow: hidden !important;
    box-shadow: 10px 0 34px rgba(0, 0, 0, 0.28) !important;
  }

  /* Em touch, hover pode ficar preso em alguns WebViews/TV Box.
     O menu fica estável para não cobrir os cards ao navegar. */
  .roneca-side-menu:hover,
  .roneca-side-menu:focus-within {
    width: 68px !important;
    min-width: 68px !important;
  }

  .roneca-side-logo {
    min-height: 46px !important;
    justify-content: center !important;
    padding: 0.38rem !important;
  }

  .roneca-side-logo-mark {
    width: 34px !important;
    height: 34px !important;
    flex: 0 0 34px !important;
    border-radius: 0.72rem !important;
    font-size: 0.74rem !important;
  }

  .roneca-side-logo-text,
  .roneca-side-menu:hover .roneca-side-logo-text,
  .roneca-side-menu:focus-within .roneca-side-logo-text,
  .roneca-side-label,
  .roneca-side-menu:hover .roneca-side-label,
  .roneca-side-menu:focus-within .roneca-side-label {
    display: none !important;
    opacity: 0 !important;
    width: 0 !important;
    max-width: 0 !important;
  }

  .roneca-side-menu nav {
    padding-inline: 0.36rem !important;
    gap: 0.42rem !important;
  }

  .roneca-side-button {
    justify-content: center !important;
    min-height: 44px !important;
    padding: 0.34rem !important;
    gap: 0 !important;
    border-radius: 0.78rem !important;
  }

  .roneca-side-icon {
    width: 32px !important;
    height: 32px !important;
    flex: 0 0 32px !important;
    border-radius: 0.68rem !important;
  }

  .roneca-page,
  .clean-tv-page {
    padding-left: 78px !important;
    padding-right: 0.55rem !important;
    padding-top: 0.48rem !important;
    padding-bottom: 0.42rem !important;
  }

  .clean-tv-page {
    gap: 0.45rem !important;
  }

  .clean-tv-categories,
  .clean-tv-page > aside.clean-tv-categories {
    width: clamp(150px, 17vw, 190px) !important;
    padding-right: 0.5rem !important;
  }

  .clean-tv-categories > button:first-child {
    margin-bottom: 0.5rem !important;
  }

  .clean-tv-row {
    min-height: 38px !important;
    padding: 0.4rem 0.52rem !important;
    gap: 0.4rem !important;
    border-radius: 0.56rem !important;
  }

  .clean-tv-row span {
    font-size: 1rem !important;
    line-height: 1.08 !important;
  }

  .clean-tv-title {
    font-size: clamp(1.85rem, 3vw, 2.8rem) !important;
    line-height: 1 !important;
  }

  main > .mb-8,
  main > .mb-7,
  main > .mb-6 {
    margin-bottom: 0.62rem !important;
  }

  .roneca-channel-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 0.58rem !important;
    max-height: calc(100dvh - 86px) !important;
  }

  .roneca-channel-grid > button {
    min-height: 62px !important;
    padding: 0.46rem 0.58rem !important;
    border-radius: 0.72rem !important;
  }

  .roneca-channel-grid > button > span:first-child {
    width: 50px !important;
    height: 36px !important;
    flex: 0 0 50px !important;
  }

  .roneca-channel-grid > button img {
    max-height: 32px !important;
  }

  .roneca-channel-grid > button span span:first-child,
  .roneca-channel-grid > button .truncate {
    font-size: 1rem !important;
    line-height: 1.1 !important;
    font-weight: 800 !important;
  }

  .roneca-channel-grid > button span span:last-child {
    font-size: 0.75rem !important;
  }

  .roneca-media-grid {
    grid-template-columns: repeat(auto-fill, minmax(116px, 1fr)) !important;
    gap: 0.65rem !important;
    max-height: calc(100dvh - 96px) !important;
  }

  .roneca-poster-card > div:first-child {
    height: clamp(118px, 25vh, 162px) !important;
  }

  .roneca-poster-card p {
    font-size: 0.98rem !important;
    line-height: 1.08 !important;
  }
}

@media (hover: none) and (pointer: coarse) and (orientation: landscape) and (max-height: 430px) {
  html {
    font-size: clamp(11px, 1.42vw, 13px) !important;
  }

  .roneca-side-menu,
  .roneca-side-menu:hover,
  .roneca-side-menu:focus-within {
    width: 62px !important;
    min-width: 62px !important;
  }

  .roneca-page,
  .clean-tv-page {
    padding-left: 70px !important;
  }

  .clean-tv-categories,
  .clean-tv-page > aside.clean-tv-categories {
    width: 138px !important;
  }

  .roneca-channel-grid > button {
    min-height: 54px !important;
  }

  .roneca-media-grid {
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)) !important;
  }

  .roneca-poster-card > div:first-child {
    height: clamp(104px, 24vh, 136px) !important;
  }
}
`;

css += patch;
fs.writeFileSync(file, css);
console.log('Aplicado: patch seguro de layout do app em src/index.css.');
