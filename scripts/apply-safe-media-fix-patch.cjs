const fs = require('node:fs');
const path = require('node:path');

const file = path.join(process.cwd(), 'src/index.css');
const badMarker = '/* RonecaPlayTV — Filmes Series Seguro 1 */';
const fixMarker = '/* RonecaPlayTV — Filmes Series Correcao 1 */';
let css = fs.readFileSync(file, 'utf8');

if (css.includes(badMarker)) {
  const start = css.indexOf(badMarker);
  const nextMarker = css.indexOf('\n\n/* RonecaPlayTV', start + badMarker.length);
  css = nextMarker >= 0 ? css.slice(0, start).trimEnd() + css.slice(nextMarker) : css.slice(0, start).trimEnd();
  console.log('Removido: patch visual anterior de filmes/séries.');
}

if (css.includes(fixMarker)) {
  console.log('OK: correção visual de filmes/séries já aplicada.');
  fs.writeFileSync(file, css);
  process.exit(0);
}

const patch = `

${fixMarker}
/* Correção visual: pôster vertical, categorias legíveis e busca menor. */
@media (hover: none) and (pointer: coarse) and (orientation: landscape) {
  /* Filmes/Séries precisam de pôster, não card achatado. */
  .roneca-media-grid {
    grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)) !important;
    gap: 0.72rem !important;
    align-items: start !important;
    max-height: calc(100dvh - 96px) !important;
    padding-right: 0.36rem !important;
  }

  .roneca-poster-card {
    padding: 0 !important;
    border-radius: 0.95rem !important;
  }

  .roneca-poster-card > div:first-child {
    height: auto !important;
    aspect-ratio: 2 / 3 !important;
    min-height: 150px !important;
    max-height: 205px !important;
    border-radius: 0.92rem !important;
    border: 1px solid rgba(148, 163, 184, 0.16) !important;
    background: rgba(15, 23, 42, 0.72) !important;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.24) !important;
  }

  .roneca-poster-card:hover > div:first-child,
  .roneca-poster-card:focus > div:first-child,
  .roneca-poster-card:focus-visible > div:first-child {
    border-color: rgba(34, 211, 238, 0.66) !important;
    box-shadow:
      0 0 0 2px rgba(34, 211, 238, 0.26),
      0 18px 38px rgba(0, 0, 0, 0.38) !important;
  }

  .roneca-poster-card > p:first-of-type {
    margin-top: 0.42rem !important;
    white-space: normal !important;
    display: -webkit-box !important;
    -webkit-line-clamp: 2 !important;
    -webkit-box-orient: vertical !important;
    overflow: hidden !important;
    min-height: 2.05em !important;
    font-size: 0.92rem !important;
    line-height: 1.08 !important;
    font-weight: 800 !important;
    color: rgba(248, 250, 252, 0.88) !important;
  }

  .roneca-poster-card > p:last-of-type {
    margin-top: 0.18rem !important;
    font-size: 0.70rem !important;
    line-height: 1.05 !important;
    color: rgba(148, 163, 184, 0.74) !important;
  }

  .roneca-poster-card span[title*="favoritar"] {
    right: 0.42rem !important;
    top: 0.42rem !important;
    padding: 0.24rem !important;
    background: rgba(2, 6, 23, 0.42) !important;
    backdrop-filter: blur(8px) !important;
  }

  .roneca-poster-card span.absolute.bottom-3,
  .roneca-poster-card span.absolute.left-3 {
    bottom: 0.44rem !important;
    left: 0.44rem !important;
    max-width: calc(100% - 0.88rem) !important;
    padding: 0.18rem 0.38rem !important;
    border-radius: 0.36rem !important;
    font-size: 0.62rem !important;
    background: rgba(2, 6, 23, 0.62) !important;
    backdrop-filter: blur(8px) !important;
  }

  /* A lateral da tela de Filmes/Séries precisa ter espaço para ler categoria. */
  .clean-tv-page:has(.roneca-media-grid) .clean-tv-categories,
  .clean-tv-page:has(.roneca-media-grid) > aside.clean-tv-categories {
    width: clamp(188px, 21vw, 236px) !important;
    padding-right: 0.7rem !important;
  }

  .clean-tv-page:has(.roneca-media-grid) .clean-tv-categories .clean-tv-row {
    min-height: 42px !important;
    padding: 0.44rem 0.58rem !important;
    border-radius: 0.72rem !important;
  }

  .clean-tv-page:has(.roneca-media-grid) .clean-tv-categories .clean-tv-row span:first-child {
    min-width: 0 !important;
    font-size: 0.92rem !important;
    line-height: 1.08 !important;
    font-weight: 760 !important;
  }

  .clean-tv-page:has(.roneca-media-grid) .clean-tv-categories .clean-tv-row .clean-tv-category-count,
  .clean-tv-page:has(.roneca-media-grid) .clean-tv-categories .clean-tv-row span:last-child {
    font-size: 0.72rem !important;
    opacity: 0.70 !important;
  }

  /* Busca de séries estava gigante e competindo com o conteúdo. */
  .clean-tv-page main header:has(input) {
    gap: 0.8rem !important;
    margin-bottom: 0.62rem !important;
  }

  .clean-tv-page main header:has(input) > div:last-child {
    min-width: min(280px, 31vw) !important;
    max-width: 340px !important;
    border-radius: 1rem !important;
    padding: 0.42rem 0.64rem !important;
  }

  .clean-tv-page main header:has(input) svg {
    width: 1.55rem !important;
    height: 1.55rem !important;
  }

  .clean-tv-page main header input {
    font-size: 0.96rem !important;
  }

  .clean-tv-page main > .mb-8.flex.items-center.justify-between {
    margin-bottom: 0.72rem !important;
  }
}

@media (hover: none) and (pointer: coarse) and (orientation: landscape) and (max-height: 430px) {
  .roneca-media-grid {
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)) !important;
    gap: 0.56rem !important;
    max-height: calc(100dvh - 84px) !important;
  }

  .roneca-poster-card > div:first-child {
    min-height: 126px !important;
    max-height: 165px !important;
  }

  .roneca-poster-card > p:first-of-type {
    font-size: 0.78rem !important;
    min-height: 2.04em !important;
  }

  .roneca-poster-card > p:last-of-type {
    font-size: 0.62rem !important;
  }

  .clean-tv-page:has(.roneca-media-grid) .clean-tv-categories,
  .clean-tv-page:has(.roneca-media-grid) > aside.clean-tv-categories {
    width: 168px !important;
  }

  .clean-tv-page:has(.roneca-media-grid) .clean-tv-categories .clean-tv-row {
    min-height: 36px !important;
    padding: 0.34rem 0.46rem !important;
  }

  .clean-tv-page:has(.roneca-media-grid) .clean-tv-categories .clean-tv-row span:first-child {
    font-size: 0.78rem !important;
  }

  .clean-tv-page main header:has(input) > div:last-child {
    min-width: min(230px, 29vw) !important;
    padding: 0.34rem 0.52rem !important;
  }
}
`;

css += patch;
fs.writeFileSync(file, css);
console.log('Aplicado: correção visual segura de Filmes/Séries em src/index.css.');
