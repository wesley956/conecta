const fs = require('fs');
const sharp = require('sharp');

fs.mkdirSync('resources', { recursive: true });
fs.mkdirSync('assets', { recursive: true });

const svg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="35%" r="78%">
      <stop offset="0%" stop-color="#132b4f"/>
      <stop offset="52%" stop-color="#06111f"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>

    <linearGradient id="rgrad" x1="20%" y1="0%" x2="90%" y2="100%">
      <stop offset="0%" stop-color="#ff8a1c"/>
      <stop offset="42%" stop-color="#ff6b00"/>
      <stop offset="58%" stop-color="#17d9d2"/>
      <stop offset="100%" stop-color="#146a8f"/>
    </linearGradient>

    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#000000" flood-opacity="0.65"/>
      <feDropShadow dx="0" dy="0" stdDeviation="12" flood-color="#19d8d2" flood-opacity="0.28"/>
    </filter>
  </defs>

  <rect width="1024" height="1024" rx="210" fill="url(#bg)"/>

  <circle cx="512" cy="512" r="388" fill="none" stroke="#17d9d2" stroke-width="14" stroke-opacity="0.18"/>
  <circle cx="512" cy="512" r="322" fill="none" stroke="#ff7a1a" stroke-width="10" stroke-opacity="0.16"/>

  <text
    x="512"
    y="680"
    text-anchor="middle"
    font-family="Arial Black, Arial, Helvetica, sans-serif"
    font-size="660"
    font-weight="900"
    fill="url(#rgrad)"
    filter="url(#shadow)">R</text>

  <path d="M620 405 L762 512 L620 619 Z" fill="#ffffff" opacity="0.92"/>
  <path d="M620 405 L762 512 L620 619 Z" fill="none" stroke="#06111f" stroke-width="24" stroke-linejoin="round" opacity="0.85"/>
</svg>
`;

async function main() {
  await sharp(Buffer.from(svg))
    .resize(1024, 1024)
    .png()
    .toFile('resources/icon.png');

  await sharp(Buffer.from(svg))
    .resize(1024, 1024)
    .png()
    .toFile('assets/icon.png');

  console.log('OK: resources/icon.png com R grande e fundo escuro');
  console.log('OK: assets/icon.png com R grande e fundo escuro');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
