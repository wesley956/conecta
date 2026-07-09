const fs = require('node:fs');
const path = require('node:path');

const file = path.join(process.cwd(), 'src/index.css');
const marker = '/* RonecaPlayTV — Filmes Series Seguro 1 */';
let css = fs.readFileSync(file, 'utf8');

if (css.includes(marker)) {
  console.log('OK: patch visual seguro de filmes/séries já aplicado.');
  process.exit(0);
}

const patch = `

${marker}
/* Polimento visual de Filmes/Séries: apenas CSS, sem alterar player ou carregamento. */
.roneca-media-grid {
  align-items: start !important;
}

.roneca-poster-card {
  position: relative !important;
  border-radius: 1rem !important;
  padding: 0.18rem !important;
  transition:
    transform 160ms ease,
    filter 160ms ease,
    opacity 160ms ease !important;
}

.roneca-poster-card:hover,
.roneca-poster-card:focus-visible {
  transform: translateY(-2px) !important;
  outline: none !important;
  filter: brightness(1.06) !important;
}

.roneca-poster-card > div:first-child {
  position: relative !important;
  border: 1px solid rgba(148, 163, 184, 0.14) !important;
  background:
    radial-gradient(circle at 30% 18%, rgba(34, 211, 238, 0.14), transparent 45%),
    linear-gradient(145deg, rgba(15, 23, 42, 0.88), rgba(2, 6, 23, 0.68)) !important;
  box-shadow:
    0 16px 34px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
}

.roneca-poster-card > div:first-child::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(2, 6, 23, 0.04) 0%, transparent 42%, rgba(2, 6, 23, 0.62) 100%);
  opacity: 0.82;
}

.roneca-poster-card:hover > div:first-child,
.roneca-poster-card:focus-visible > div:first-child,
.roneca-poster-card:focus > div:first-child {
  border-color: rgba(34, 211, 238, 0.62) !important;
  box-shadow:
    0 0 0 2px rgba(34, 211, 238, 0.26),
    0 0 34px rgba(34, 211, 238, 0.18),
    0 22px 48px rgba(0, 0, 0, 0.42) !important;
}

.roneca-poster-card img {
  transform-origin: center !important;
  transition:
    transform 220ms ease,
    filter 220ms ease !important;
  filter: saturate(1.04) contrast(1.03) !important;
}

.roneca-poster-card:hover img,
.roneca-poster-card:focus-visible img,
.roneca-poster-card:focus img {
  transform: scale(1.045) !important;
  filter: saturate(1.12) contrast(1.08) !important;
}

.roneca-poster-card > p:first-of-type {
  white-space: normal !important;
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
  -webkit-box-orient: vertical !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  min-height: 2.18em !important;
  color: rgba(248, 250, 252, 0.88) !important;
  font-weight: 780 !important;
}

.roneca-poster-card:hover > p:first-of-type,
.roneca-poster-card:focus-visible > p:first-of-type,
.roneca-poster-card:focus > p:first-of-type {
  color: #ffffff !important;
}

.roneca-poster-card > p:last-of-type {
  color: rgba(148, 163, 184, 0.82) !important;
  font-weight: 600 !important;
}

.roneca-poster-card span.absolute {
  z-index: 20 !important;
  backdrop-filter: blur(10px) !important;
}

.roneca-poster-card span[title*="favoritar"] {
  border-color: rgba(255, 255, 255, 0.14) !important;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28) !important;
}

.roneca-poster-card:disabled {
  cursor: wait !important;
}

.roneca-load-more {
  border: 1px solid rgba(34, 211, 238, 0.22) !important;
  background:
    linear-gradient(135deg, rgba(14, 165, 233, 0.18), rgba(251, 146, 60, 0.12)),
    rgba(15, 23, 42, 0.72) !important;
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.24) !important;
}

.roneca-load-more:hover,
.roneca-load-more:focus-visible {
  border-color: rgba(34, 211, 238, 0.56) !important;
  box-shadow:
    0 0 0 2px rgba(34, 211, 238, 0.20),
    0 18px 44px rgba(0, 0, 0, 0.34) !important;
}

/* Campo de busca da tela de séries. */
.clean-tv-page main header input {
  min-height: auto !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

.clean-tv-page main header:has(input) > div:last-child {
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    background 160ms ease !important;
}

.clean-tv-page main header:has(input) > div:last-child:focus-within {
  border-color: rgba(34, 211, 238, 0.55) !important;
  background: rgba(15, 23, 42, 0.74) !important;
  box-shadow:
    0 0 0 2px rgba(34, 211, 238, 0.16),
    0 16px 34px rgba(0, 0, 0, 0.26) !important;
}

@media (hover: none) and (pointer: coarse) and (orientation: landscape) {
  .roneca-media-grid {
    grid-template-columns: repeat(auto-fill, minmax(126px, 1fr)) !important;
    gap: 0.78rem !important;
    padding-right: 0.38rem !important;
    max-height: calc(100dvh - 104px) !important;
  }

  .roneca-poster-card {
    padding: 0.12rem !important;
  }

  .roneca-poster-card > div:first-child {
    height: clamp(132px, 27vh, 178px) !important;
    border-radius: 0.86rem !important;
  }

  .roneca-poster-card > p:first-of-type {
    margin-top: 0.42rem !important;
    font-size: 1rem !important;
    line-height: 1.10 !important;
    min-height: 2.18em !important;
  }

  .roneca-poster-card > p:last-of-type {
    font-size: 0.74rem !important;
    line-height: 1.05 !important;
  }

  .roneca-poster-card span[title*="favoritar"] {
    right: 0.45rem !important;
    top: 0.45rem !important;
    padding: 0.28rem !important;
  }

  .roneca-poster-card span.absolute.bottom-3,
  .roneca-poster-card span.absolute.left-3 {
    bottom: 0.48rem !important;
    left: 0.48rem !important;
    max-width: calc(100% - 0.96rem) !important;
    padding: 0.2rem 0.42rem !important;
    font-size: 0.66rem !important;
    border-radius: 0.42rem !important;
  }

  .clean-tv-page main header:has(input) {
    align-items: center !important;
    gap: 0.8rem !important;
  }

  .clean-tv-page main header:has(input) > div:last-child {
    min-width: min(320px, 36vw) !important;
    border-radius: 1rem !important;
    padding: 0.48rem 0.72rem !important;
  }

  .clean-tv-page main header input {
    font-size: 1rem !important;
  }
}

@media (hover: none) and (pointer: coarse) and (orientation: landscape) and (max-height: 430px) {
  .roneca-media-grid {
    grid-template-columns: repeat(auto-fill, minmax(108px, 1fr)) !important;
    gap: 0.56rem !important;
    max-height: calc(100dvh - 82px) !important;
  }

  .roneca-poster-card > div:first-child {
    height: clamp(106px, 24vh, 138px) !important;
  }

  .roneca-poster-card > p:first-of-type {
    font-size: 0.86rem !important;
    margin-top: 0.28rem !important;
  }

  .roneca-poster-card > p:last-of-type {
    font-size: 0.66rem !important;
  }

  .clean-tv-page main header:has(input) > div:last-child {
    min-width: min(260px, 34vw) !important;
    padding: 0.38rem 0.58rem !important;
  }
}

@media (hover: hover) and (pointer: fine) and (min-width: 1100px) {
  .roneca-media-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)) !important;
    gap: 1rem !important;
  }

  .roneca-poster-card > div:first-child {
    height: clamp(190px, 24vw, 248px) !important;
  }
}
`;

css += patch;
fs.writeFileSync(file, css);
console.log('Aplicado: patch visual seguro de filmes/séries em src/index.css.');
