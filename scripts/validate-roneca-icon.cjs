const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const projectRoot = path.resolve(__dirname, '..');
const officialIcon = path.join(projectRoot, 'assets', 'icon.png');
const obsoleteBrandAssets = [
  'assets/splash.png',
  'public/roneca.png',
  'resources/icon.png',
  'resources/splash.png',
];

async function main() {
  if (!fs.existsSync(officialIcon)) {
    throw new Error('Logo oficial ausente: assets/icon.png');
  }

  const metadata = await sharp(officialIcon).metadata();
  if (metadata.format !== 'png' || metadata.width !== 1024 || metadata.height !== 1024) {
    throw new Error('assets/icon.png deve ser um PNG de 1024x1024.');
  }

  const leftovers = obsoleteBrandAssets.filter(relativePath =>
    fs.existsSync(path.join(projectRoot, relativePath)),
  );
  if (leftovers.length > 0) {
    throw new Error(`Assets antigos encontrados: ${leftovers.join(', ')}`);
  }

  console.log('OK: assets/icon.png é a fonte oficial do logo do aplicativo.');
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
