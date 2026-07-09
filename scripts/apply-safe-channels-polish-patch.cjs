const fs = require('node:fs');
const path = require('node:path');

const file = path.join(process.cwd(), 'src/index.css');
const marker = '/* RonecaPlayTV — Canais Seguro 1 */';
let css = fs.readFileSync(file, 'utf8');

if (css.includes(marker)) {
  console.log('OK: patch visual seguro da tela de canais já aplicado.');
  process.exit(0);
}

const patch = `

${marker}
/* Melhora visual da tela de canais sem alterar React/player/carregamento. */
.clean-tv-categories .clean-tv-row,
.roneca-channel-grid > button {
  will-change: transform, border-color, box-shadow;
}

.clean-tv-categories .clean-tv-row {
  position: relative;
  border: 1px solid rgba(148, 163, 184, 0.10) !important;
  background: rgba(15, 23, 42, 0.34) !important;
  color: rgba(226, 232, 240, 0.72) !important;
  transition:
    transform 150ms ease,
    background 150ms ease,
    border-color 150ms ease,
    color 150ms ease,
    box-shadow 150ms ease !important;
}

.clean-tv-categories .clean-tv-row:hover,
.clean-tv-categories .clean-tv-row:focus-visible,
.clean-tv-categories .clean-tv-row.active {
  transform: translateX(2px) !important;
  color: #ffffff !important;
  border-color: rgba(34, 211, 238, 0.48) !important;
  background:
    linear-gradient(135deg, rgba(14, 165, 233, 0.22), rgba(34, 211, 238, 0.08)),
    rgba(15, 23, 42, 0.78) !important;
  box-shadow:
    inset 3px 0 0 #22d3ee,
    0 12px 28px rgba(8, 47, 73, 0.22) !important;
}

.clean-tv-categories .clean-tv-row:focus-visible {
  outline: none !important;
  box-shadow:
    inset 3px 0 0 #22d3ee,
    0 0 0 2px rgba(34, 211, 238, 0.32),
    0 0 28px rgba(34, 211, 238, 0.18) !important;
}

.roneca-channel-grid > button {
  overflow: hidden !important;
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.82), rgba(2, 6, 23, 0.58)) !important;
  border: 1px solid rgba(148, 163, 184, 0.13) !important;
  border-left: 4px solid rgba(56, 189, 248, 0.42) !important;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.20) !important;
}

.roneca-channel-grid > button:hover,
.roneca-channel-grid > button:focus-visible {
  transform: translateY(-1px) scale(1.01) !important;
  border-color: rgba(34, 211, 238, 0.60) !important;
  border-left-color: #22d3ee !important;
  background:
    linear-gradient(135deg, rgba(8, 47, 73, 0.82), rgba(15, 23, 42, 0.82)) !important;
  box-shadow:
    0 0 0 2px rgba(34, 211, 238, 0.30),
    0 0 32px rgba(34, 211, 238, 0.20),
    0 20px 42px rgba(0, 0, 0, 0.34) !important;
}

.roneca-channel-grid > button:focus-visible::after {
  content: "";
  position: absolute;
  inset: 4px;
  border-radius: inherit;
  border: 1px solid rgba(255, 255, 255, 0.16);
  pointer-events: none;
}

.roneca-channel-grid > button > span:first-child {
  border-radius: 0.78rem !important;
  background:
    radial-gradient(circle at 30% 20%, rgba(34, 211, 238, 0.18), transparent 48%),
    rgba(255, 255, 255, 0.055) !important;
  border: 1px solid rgba(148, 163, 184, 0.12) !important;
}

.roneca-channel-grid > button img {
  filter: saturate(1.04) contrast(1.04) !important;
}

/* Nomes grandes não devem sumir numa linha só em TV/controle remoto. */
.roneca-channel-grid > button span span:first-child {
  white-space: normal !important;
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
  -webkit-box-orient: vertical !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.roneca-channel-grid > button span span:last-child {
  opacity: 0.86 !important;
}

.roneca-channel-grid > button .absolute.right-4,
.roneca-channel-grid > button span.absolute {
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.24) !important;
}

@media (hover: none) and (pointer: coarse) and (orientation: landscape) {
  .clean-tv-categories,
  .clean-tv-page > aside.clean-tv-categories {
    width: clamp(162px, 18vw, 204px) !important;
    padding-right: 0.56rem !important;
  }

  .clean-tv-categories > div {
    padding-right: 0.22rem !important;
  }

  .clean-tv-categories .clean-tv-row {
    min-height: 42px !important;
    padding: 0.44rem 0.56rem !important;
    gap: 0.44rem !important;
    border-radius: 0.72rem !important;
  }

  .clean-tv-categories .clean-tv-row span:first-child {
    width: 1.55rem !important;
    min-width: 1.55rem !important;
    text-align: center !important;
  }

  .clean-tv-categories .clean-tv-row span:nth-child(2) {
    font-size: 0.98rem !important;
    line-height: 1.08 !important;
    font-weight: 760 !important;
  }

  .clean-tv-categories .clean-tv-row span:last-child {
    font-size: 0.78rem !important;
    opacity: 0.72 !important;
  }

  .roneca-channel-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 0.68rem !important;
    padding-right: 0.34rem !important;
  }

  .roneca-channel-grid > button {
    min-height: 74px !important;
    padding: 0.56rem 3rem 0.56rem 0.62rem !important;
    gap: 0.62rem !important;
    border-radius: 0.84rem !important;
  }

  .roneca-channel-grid > button > span:first-child {
    width: 58px !important;
    height: 44px !important;
    flex: 0 0 58px !important;
  }

  .roneca-channel-grid > button img {
    max-height: 37px !important;
  }

  .roneca-channel-grid > button span span:first-child,
  .roneca-channel-grid > button .truncate {
    font-size: 1.04rem !important;
    line-height: 1.12 !important;
    font-weight: 850 !important;
  }

  .roneca-channel-grid > button span span:last-child {
    margin-top: 0.16rem !important;
    font-size: 0.76rem !important;
  }

  .roneca-channel-grid > button .absolute.right-4,
  .roneca-channel-grid > button span.absolute {
    right: 0.54rem !important;
    padding: 0.34rem !important;
  }
}

@media (hover: none) and (pointer: coarse) and (orientation: landscape) and (max-height: 430px) {
  .clean-tv-categories,
  .clean-tv-page > aside.clean-tv-categories {
    width: 146px !important;
  }

  .clean-tv-categories .clean-tv-row {
    min-height: 36px !important;
    padding: 0.34rem 0.46rem !important;
  }

  .clean-tv-categories .clean-tv-row span:nth-child(2) {
    font-size: 0.86rem !important;
  }

  .roneca-channel-grid {
    gap: 0.5rem !important;
  }

  .roneca-channel-grid > button {
    min-height: 60px !important;
    padding: 0.42rem 2.6rem 0.42rem 0.48rem !important;
  }

  .roneca-channel-grid > button > span:first-child {
    width: 48px !important;
    height: 34px !important;
    flex-basis: 48px !important;
  }

  .roneca-channel-grid > button span span:first-child,
  .roneca-channel-grid > button .truncate {
    font-size: 0.88rem !important;
  }
}

@media (hover: hover) and (pointer: fine) and (min-width: 1100px) {
  .roneca-channel-grid > button {
    min-height: 82px !important;
  }

  .roneca-channel-grid > button span span:first-child,
  .roneca-channel-grid > button .truncate {
    font-size: 1.05rem !important;
  }
}
`;

css += patch;
fs.writeFileSync(file, css);
console.log('Aplicado: patch visual seguro da tela de canais em src/index.css.');
