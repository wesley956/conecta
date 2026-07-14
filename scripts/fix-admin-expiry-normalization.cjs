const fs = require('node:fs');

const file = 'admin-panel/dashboard.html';
let source = fs.readFileSync(file, 'utf8');

const beforeDetection = `    const expiresAtInput = $('dev-exp-' + id).value || '';
    const isActivation = device.status !== 'active' && nextStatus === 'active';
    const isRenewal =
      device.status === 'active' &&
      nextStatus === 'active' &&
      dateTimeForCreditCheck(expiresAtInput) > dateTimeForCreditCheck(device.expiresAt);`;

const afterDetection = `    const expiresAtInput = $('dev-exp-' + id).value || '';
    const currentExpiryInput = dateInput(device.expiresAt);
    const normalizedExpiresAt = explicitExpiry(expiresAtInput);
    const expiryChanged = expiresAtInput !== currentExpiryInput;
    const isActivation = device.status !== 'active' && nextStatus === 'active';
    const isRenewal =
      device.status === 'active' &&
      nextStatus === 'active' &&
      expiryChanged &&
      dateTimeForCreditCheck(normalizedExpiresAt) > dateTimeForCreditCheck(device.expiresAt);`;

const beforePayload = `      const payload = {
        id,
        customerId: nextCustomerId,
        sellerId: nextSellerId,
        planId: nextPlanId,
        status: nextStatus,
        playlistId: nextPlaylistId,
        expiresAt: expiresAtInput || null
      };`;

const afterPayload = `      const payload = {
        id,
        customerId: nextCustomerId,
        sellerId: nextSellerId,
        planId: nextPlanId,
        status: nextStatus,
        playlistId: nextPlaylistId
      };

      if (expiryChanged) {
        payload.expiresAt = normalizedExpiresAt;
      }`;

if (source.includes(afterDetection) && source.includes(afterPayload)) {
  console.log('Normalização de validade já aplicada.');
  process.exit(0);
}

const detectionOccurrences = source.split(beforeDetection).length - 1;
const payloadOccurrences = source.split(beforePayload).length - 1;

if (detectionOccurrences !== 1 || payloadOccurrences !== 1) {
  throw new Error(`Trechos esperados inválidos: detecção=${detectionOccurrences}, payload=${payloadOccurrences}`);
}

source = source.replace(beforeDetection, afterDetection);
source = source.replace(beforePayload, afterPayload);
fs.writeFileSync(file, source);
console.log('Normalização de validade aplicada ao painel administrativo.');
