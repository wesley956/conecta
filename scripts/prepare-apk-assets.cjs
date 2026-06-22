const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const source = path.resolve('public/roneca.png');

if (!fs.existsSync(source)) {
  console.error('public/roneca.png não encontrado');
  process.exit(1);
}

fs.mkdirSync('resources', { recursive: true });
fs.mkdirSync('assets', { recursive: true });

async function prepareLogoBuffer(maxWidth, maxHeight) {
  return sharp(source)
    .ensureAlpha()
    .trim({ threshold: 12 })
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
}

async function makeSplash() {
  const logo = await prepareLogoBuffer(2200, 1500);

  await sharp({
    create: {
      width: 2732,
      height: 2732,
      channels: 4,
      background: '#02040aff',
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile('resources/splash.png');

  fs.copyFileSync('resources/splash.png', 'assets/splash.png');
}

async function makeIcon() {
  const svg = `
  <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg" cx="50%" cy="35%" r="75%">
        <stop offset="0%" stop-color="#12315f"/>
        <stop offset="55%" stop-color="#050914"/>
        <stop offset="100%" stop-color="#000000"/>
      </radialGradient>
      <linearGradient id="rgrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="45%" stop-color="#27a8ff"/>
        <stop offset="100%" stop-color="#ff8a1c"/>
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="10" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>

    <rect width="1024" height="1024" rx="210" fill="url(#bg)"/>
    <circle cx="512" cy="512" r="390" fill="none" stroke="#2396f2" stroke-opacity="0.25" stroke-width="18"/>
    <circle cx="512" cy="512" r="318" fill="none" stroke="#ff7a1a" stroke-opacity="0.18" stroke-width="10"/>

    <text x="512" y="610"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="520"
      font-weight="900"
      fill="url(#rgrad)"
      filter="url(#glow)">R</text>

    <text x="512" y="745"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="86"
      font-weight="800"
      letter-spacing="8"
      fill="#ffffff"
      opacity="0.92">PLAYTV</text>
  </svg>`;

  await sharp(Buffer.from(svg))
    .png()
    .toFile('resources/icon.png');

  fs.copyFileSync('resources/icon.png', 'assets/icon.png');
}

Promise.all([makeSplash(), makeIcon()])
  .then(() => {
    console.log('OK: resources/icon.png com R grande');
    console.log('OK: resources/splash.png com logo maior');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
