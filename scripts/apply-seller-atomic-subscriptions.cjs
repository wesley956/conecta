const fs = require('node:fs');

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`Não foi possível localizar o bloco: ${label}.`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

const backendFile = 'supabase/functions/seller-panel/index.ts';
let backend = fs.readFileSync(backendFile, 'utf8');

const rpcHelper = `async function applySellerDeviceSubscription(
  supabase: any,
  seller: any,
  payload: {
    deviceId: string;
    deviceCode?: string | null;
    customerId?: string | null;
    customerName?: string | null;
    planId: string;
    planName?: string | null;
    playlistId: string;
    expiresAt: string;
    type: 'activation' | 'renewal';
    idempotencyKey: string;
  },
) {
  const { data, error } = await supabase.rpc('apply_device_subscription_transaction', {
    p_seller_id: seller.id,
    p_device_id: payload.deviceId,
    p_plan_id: payload.planId,
    p_playlist_id: payload.playlistId,
    p_expires_at: payload.expiresAt,
    p_operation_type: payload.type,
    p_performed_by: \`seller:\${seller.id}\`,
    p_idempotency_key: payload.idempotencyKey,
    p_customer_id: payload.customerId || null,
    p_client_name: payload.customerName || null,
    p_enforce_seller_ownership: true,
  });

  if (error) {
    throw new Error(\`Falha na operação comercial: \${error.message}\`);
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error('A operação comercial não retornou resultado.');

  const balanceBefore = Number(result.balance_before ?? result.balanceBefore ?? 0);
  const balanceAfter = Number(result.balance_after ?? result.balanceAfter ?? balanceBefore);

  return {
    sellerId: seller.id,
    sellerName: seller.name,
    amount: balanceAfter - balanceBefore,
    balanceBefore,
    balanceAfter,
    type: payload.type,
    applied: result.applied !== false,
    ledgerId: result.ledger_id ?? result.ledgerId ?? null,
    description:
      \`\${payload.type === 'activation' ? 'Ativação' : 'Renovação'} do aparelho \` +
      \`\${payload.deviceCode || payload.deviceId}\${payload.planName ? \` — plano \${payload.planName}\` : ''}\`,
  };
}
`;

if (!backend.includes("async function applySellerDeviceSubscription(")) {
  backend = replaceBetween(
    backend,
    'async function consumeSellerCredits(',
    '\nasync function upsertSellerCustomer(',
    rpcHelper,
    'helper antigo de créditos',
  );
}

const activationBlock = `    if (action === 'activateDeviceByCode') {
      const deviceCode = requiredText(body.deviceCode, 'Código do aparelho').toUpperCase();
      const customerName = requiredText(body.customerName, 'Nome do cliente');
      const customerWhatsapp = normalizeWhatsapp(body.customerWhatsapp);
      if (!customerWhatsapp) return json({ error: 'WhatsApp do cliente é obrigatório.' }, 400);

      const plan = await getActivePlanForCharge(supabase, textOrNull(body.planId));
      const playlist = await getAllowedSellerPlaylist(supabase, seller.id, textOrNull(body.playlistId));
      const device = await getSellerDeviceByCode(supabase, seller, deviceCode);

      if (!device) return json({ error: 'Aparelho não encontrado. Confira o código enviado pelo cliente.' }, 404);
      if (device.seller_id && device.seller_id !== seller.id) return json({ error: 'Este aparelho já está vinculado a outro vendedor.' }, 409);

      const expiresAt = requiredText(body.expiresAt, 'Data de expiração');
      const idempotencyKey = requiredText(body.idempotencyKey, 'Chave de idempotência');
      const customerId = await upsertSellerCustomer(supabase, seller.id, customerName, customerWhatsapp);
      const creditConsumption = await applySellerDeviceSubscription(supabase, seller, {
        deviceId: device.id,
        deviceCode: device.device_code,
        customerId,
        customerName,
        planId: plan.id,
        planName: plan.name,
        playlistId: playlist.id,
        expiresAt,
        type: 'activation',
        idempotencyKey,
      });

      return json({
        ok: true,
        deviceId: device.id,
        deviceCode: device.device_code,
        customerId,
        planId: plan.id,
        planName: plan.name,
        playlistId: playlist.id,
        playlistName: playlist.name,
        expiresAt,
        creditConsumption,
        message: creditConsumption.applied
          ? 'Aparelho ativado com sucesso.'
          : 'Esta ativação já havia sido processada.',
      });
    }
`;

backend = replaceBetween(
  backend,
  "    if (action === 'activateDeviceByCode') {",
  "\n    if (action === 'renewDevice') {",
  activationBlock,
  'ativação do vendedor',
);

const renewalBlock = `    if (action === 'renewDevice') {
      const deviceId = requiredText(body.deviceId, 'ID do aparelho');
      const device = await getOwnedDevice(supabase, seller, deviceId);
      const plan = await getActivePlanForCharge(supabase, textOrNull(body.planId) || device.plan_id || null);
      const playlistId = textOrNull(body.playlistId) || device.playlist_id || null;
      const playlist = await getAllowedSellerPlaylist(supabase, seller.id, playlistId);
      const customer = Array.isArray(device.customer) ? device.customer[0] ?? null : device.customer;
      const customerName = customer?.name || null;
      const expiresAt = requiredText(body.expiresAt, 'Data de expiração');
      const idempotencyKey = requiredText(body.idempotencyKey, 'Chave de idempotência');

      const creditConsumption = await applySellerDeviceSubscription(supabase, seller, {
        deviceId: device.id,
        deviceCode: device.device_code,
        customerId: device.customer_id || null,
        customerName,
        planId: plan.id,
        planName: plan.name,
        playlistId: playlist.id,
        expiresAt,
        type: 'renewal',
        idempotencyKey,
      });

      return json({
        ok: true,
        deviceId,
        expiresAt,
        creditConsumption,
        message: creditConsumption.applied
          ? 'Aparelho renovado com sucesso.'
          : 'Esta renovação já havia sido processada.',
      });
    }
`;

backend = replaceBetween(
  backend,
  "    if (action === 'renewDevice') {",
  "\n    if (action === 'blockDevice') {",
  renewalBlock,
  'renovação do vendedor',
);

if (backend.includes('consumeSellerCredits(')) {
  throw new Error('O helper de cobrança não atômica ainda está presente.');
}

fs.writeFileSync(backendFile, backend);

const frontendFile = 'admin-panel/seller-portal-ux.js';
let frontend = fs.readFileSync(frontendFile, 'utf8');

const helperMarker = '  let renewDeviceTarget = null;\n';
const helperCode = `  let renewDeviceTarget = null;
  let activationAttempt = null;
  let renewalAttempt = null;

  function newOperationKey(prefix) {
    const random = globalThis.crypto?.randomUUID?.()
      || \`\${Date.now()}-\${Math.random().toString(36).slice(2)}\`;
    return \`\${prefix}:\${random}\`;
  }

  function selectedPlan(planId) {
    return (sellerUxData?.plans || []).find(plan => plan.id === planId) || null;
  }

  function resolveExpiry(dateValue, planId, currentExpiresAt = null) {
    if (dateValue) {
      const explicit = new Date(\`\${dateValue}T23:59:59.999Z\`);
      if (Number.isNaN(explicit.getTime())) throw new Error('Data de validade inválida.');
      return explicit.toISOString();
    }

    const plan = selectedPlan(planId);
    const durationDays = Math.max(1, Number(plan?.durationDays || 30));
    const now = new Date();
    const current = currentExpiresAt ? new Date(currentExpiresAt) : null;
    const base = current && !Number.isNaN(current.getTime()) && current > now
      ? new Date(current)
      : now;

    base.setUTCDate(base.getUTCDate() + durationDays);
    base.setUTCHours(23, 59, 59, 999);
    return base.toISOString();
  }

  function ensureAttempt(current, prefix, input, expiryFactory) {
    const fingerprint = JSON.stringify(input);
    if (!current || current.fingerprint !== fingerprint) {
      return {
        fingerprint,
        key: newOperationKey(prefix),
        expiresAt: expiryFactory(),
      };
    }
    return current;
  }
`;

if (!frontend.includes('  let activationAttempt = null;')) {
  if (!frontend.includes(helperMarker)) throw new Error('Marcador de estado do frontend não encontrado.');
  frontend = frontend.replace(helperMarker, helperCode);
}

frontend = frontend.replace(
  "    $('sellerActivationForm').classList.add('open');",
  "    activationAttempt = null;\n    $('sellerActivationForm').classList.add('open');",
);
frontend = frontend.replace(
  "  window.sellerUxCloseActivationForm = function sellerUxCloseActivationForm() {\n    $('sellerActivationForm')?.classList.remove('open');",
  "  window.sellerUxCloseActivationForm = function sellerUxCloseActivationForm() {\n    activationAttempt = null;\n    $('sellerActivationForm')?.classList.remove('open');",
);
frontend = frontend.replace(
  "    renewDeviceTarget = device;",
  "    renewDeviceTarget = device;\n    renewalAttempt = null;",
);

const activationFrontend = `  window.sellerUxActivateDevice = async function sellerUxActivateDevice() {
    try {
      if (!lookupDevice?.deviceCode) throw new Error('Busque um aparelho primeiro.');
      showMsg('Ativando aparelho e consumindo créditos...');

      const input = {
        deviceCode: lookupDevice.deviceCode,
        customerName: $('sellerActivationCustomerName').value.trim(),
        customerWhatsapp: $('sellerActivationCustomerWhatsapp').value.trim(),
        planId: $('sellerActivationPlan').value,
        playlistId: $('sellerActivationPlaylist').value,
        expiresAtInput: $('sellerActivationExpiresAt').value || '',
      };

      activationAttempt = ensureAttempt(
        activationAttempt,
        'seller-activation',
        input,
        () => resolveExpiry(input.expiresAtInput, input.planId),
      );

      await api('activateDeviceByCode', {
        deviceCode: input.deviceCode,
        customerName: input.customerName,
        customerWhatsapp: input.customerWhatsapp,
        planId: input.planId,
        playlistId: input.playlistId,
        expiresAt: activationAttempt.expiresAt,
        idempotencyKey: activationAttempt.key,
      });

      activationAttempt = null;
      showMsg('Aparelho ativado com sucesso.', 'ok');
      $('sellerActivationForm').classList.remove('open');
      $('sellerDeviceLookupResult').innerHTML = '';
      lookupDevice = null;
      await window.loadPortal?.();
      await refreshSellerUxData();
    } catch (err) {
      showMsg(err.message || 'Erro ao ativar aparelho.', 'err');
    }
  };
`;

frontend = replaceBetween(
  frontend,
  '  window.sellerUxActivateDevice = async function sellerUxActivateDevice() {',
  '\n\n  window.sellerUxShowDeviceDetails =',
  activationFrontend,
  'envio de ativação no frontend',
);

const renewalFrontend = `  window.sellerUxRenewDevice = async function sellerUxRenewDevice() {
    try {
      if (!renewDeviceTarget) throw new Error('Aparelho não selecionado.');

      const input = {
        deviceId: renewDeviceTarget.id,
        planId: $('sellerRenewPlan').value,
        playlistId: $('sellerRenewPlaylist').value,
        expiresAtInput: $('sellerRenewExpiresAt').value || '',
      };

      renewalAttempt = ensureAttempt(
        renewalAttempt,
        'seller-renewal',
        input,
        () => resolveExpiry(input.expiresAtInput, input.planId, renewDeviceTarget.expiresAt),
      );

      await api('renewDevice', {
        deviceId: input.deviceId,
        planId: input.planId,
        playlistId: input.playlistId,
        expiresAt: renewalAttempt.expiresAt,
        idempotencyKey: renewalAttempt.key,
      });

      renewalAttempt = null;
      renewDeviceTarget = null;
      closeSellerUxModal();
      await window.loadPortal?.();
      await refreshSellerUxData();
    } catch (err) {
      alert(err.message || 'Erro ao renovar aparelho.');
    }
  };
`;

frontend = replaceBetween(
  frontend,
  '  window.sellerUxRenewDevice = async function sellerUxRenewDevice() {',
  '\n\n  window.sellerUxBlockDevice =',
  renewalFrontend,
  'envio de renovação no frontend',
);

for (const required of [
  "supabase.rpc('apply_device_subscription_transaction'",
  'idempotencyKey: activationAttempt.key',
  'idempotencyKey: renewalAttempt.key',
]) {
  if (!(backend + frontend).includes(required)) {
    throw new Error(`Validação final ausente: ${required}`);
  }
}

fs.writeFileSync(frontendFile, frontend);
console.log('Fluxo atômico do vendedor aplicado.');
