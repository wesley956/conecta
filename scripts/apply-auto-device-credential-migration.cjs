const fs = require('node:fs');

const file = 'src/utils/devicePanel.ts';
let source = fs.readFileSync(file, 'utf8');

const desiredFragments = [
  '  let code = String(deviceCode || getStoredDeviceCode()).trim();',
  '  if (configUrl && !deviceCredential) {',
  '      code = String(getStoredDeviceCode()).trim();',
];

if (desiredFragments.every(fragment => source.includes(fragment))) {
  console.log('Migração automática de credencial já corrigida.');
  process.exit(0);
}

const replacements = [
  [
    '  const code = String(deviceCode || getStoredDeviceCode()).trim();',
    '  let code = String(deviceCode || getStoredDeviceCode()).trim();',
  ],
  [
    '  if (!deviceCredential) {',
    '  if (configUrl && !deviceCredential) {',
  ],
  [
    '      await activateDeviceWithPanel();\n      deviceCredential = await getStoredDeviceCredential();',
    '      await activateDeviceWithPanel();\n      code = String(getStoredDeviceCode()).trim();\n      deviceCredential = await getStoredDeviceCredential();',
  ],
];

for (const [before, after] of replacements) {
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Trecho esperado encontrado ${occurrences} vez(es): ${before}`);
  }
  source = source.replace(before, after);
}

fs.writeFileSync(file, source);
console.log('Migração automática de credencial corrigida em src/utils/devicePanel.ts.');
