const fs = require('node:fs');

const file = 'src/utils/devicePanel.ts';
const source = fs.readFileSync(file, 'utf8');

const before = `  const deviceCredential = await getStoredDeviceCredential();

  if (!configUrl) {`;

const after = `  let deviceCredential = await getStoredDeviceCredential();

  if (!deviceCredential) {
    try {
      await activateDeviceWithPanel();
      deviceCredential = await getStoredDeviceCredential();
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Não foi possível emitir a credencial segura deste aparelho.';

      return {
        active: false,
        status: 'blocked',
        deviceCode: code,
        credentialRequired: true,
        message,
      };
    }
  }

  if (!configUrl) {`;

if (source.includes(after)) {
  console.log('Migração automática de credencial já aplicada.');
  process.exit(0);
}

const occurrences = source.split(before).length - 1;
if (occurrences !== 1) {
  throw new Error(`Bloco esperado encontrado ${occurrences} vez(es).`);
}

fs.writeFileSync(file, source.replace(before, after));
console.log('Migração automática de credencial aplicada em src/utils/devicePanel.ts.');
