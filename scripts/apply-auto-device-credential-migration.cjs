const fs = require('node:fs');

const file = 'src/utils/devicePanel.ts';
const source = fs.readFileSync(file, 'utf8');

const before = `  const configUrl = getDevicePanelUrl();
  const code = String(deviceCode || getStoredDeviceCode()).trim();
  const uuid = String(deviceUuid || getOrCreateDeviceUuid()).trim();
  let deviceCredential = await getStoredDeviceCredential();

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

  if (!configUrl) {
    return {
      active: false,
      status: 'pending',
      deviceCode: code,
      message: 'Endpoint do painel não configurado no APK.',
    };
  }`;

const after = `  const configUrl = getDevicePanelUrl();
  let code = String(deviceCode || getStoredDeviceCode()).trim();
  const uuid = String(deviceUuid || getOrCreateDeviceUuid()).trim();
  let deviceCredential = await getStoredDeviceCredential();

  if (!configUrl) {
    return {
      active: false,
      status: 'pending',
      deviceCode: code,
      message: 'Endpoint do painel não configurado no APK.',
    };
  }

  if (!deviceCredential) {
    try {
      await activateDeviceWithPanel();
      code = String(getStoredDeviceCode()).trim();
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
  }`;

if (source.includes(after)) {
  console.log('Migração automática de credencial já corrigida.');
  process.exit(0);
}

const occurrences = source.split(before).length - 1;
if (occurrences !== 1) {
  throw new Error(`Bloco completo esperado encontrado ${occurrences} vez(es).`);
}

fs.writeFileSync(file, source.replace(before, after));
console.log('Migração automática de credencial corrigida em src/utils/devicePanel.ts.');
