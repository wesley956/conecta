const fs = require('node:fs');

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  if (start < 0 || end < 0) {
    throw new Error(`Não foi possível localizar o bloco ${label}.`);
  }

  return source.slice(0, start) + replacement + source.slice(end);
}

function replaceOnce(source, before, after, label) {
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Trecho ${label} encontrado ${occurrences} vez(es).`);
  }
  return source.replace(before, after);
}

const backendPath = 'supabase/functions/admin-panel/index.ts';
const dashboardPath = 'admin-panel/dashboard.html';
let backend = fs.readFileSync(backendPath, 'utf8');
let dashboard = fs.readFileSync(dashboardPath, 'utf8');

const backendApplied = backend.includes('async function applyAdminDeviceSubscription(');
const dashboardApplied = dashboard.includes('const deviceCommercialAttempts = new Map();');

if (backendApplied && dashboardApplied) {
  console.log('Migração atômica administrativa já aplicada.');
  process.exit(0);
}

if (backendApplied !== dashboardApplied) {
  throw new Error('Aplicação parcial detectada entre backend e painel administrativo.');
}

const backendHelper = `async function applyAdminDeviceSubscription(
  supabase: any,
  payload: {
    sellerId: string;
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
    p_seller_id: payload.sellerId,
    p_device_id: payload.deviceId,
    p_plan_id: payload.planId,
    p_playlist_id: payload.playlistId,
    p_expires_at: payload.expiresAt,
    p_operation_type: payload.type,
    p_performed_by: 'admin',
    p_idempotency_key: payload.idempotencyKey,
    p_customer_id: payload.customerId || null,
    p_client_name: payload.customerName || null,
    p_enforce_seller_ownership: false,
  });

  if (error) {
    throw new Error(\`Falha na operação comercial: \${error.message}\`);
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error('A operação comercial não retornou resultado.');

  const balanceBefore = Number(result.balance_before ?? result.balanceBefore ?? 0);
  const balanceAfter = Number(result.balance_after ?? result.balanceAfter ?? balanceBefore);

  return {
    sellerId: payload.sellerId,
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

backend = replaceBetween(
  backend,
  'async function consumeSellerCredits(',
  '\n\n\nasync function writeAudit(',
  backendHelper,
  'consumeSellerCredits',
);

const updateDeviceBlock = `    if (action === 'updateDevice') {
      const id = requiredText(body.id, 'ID do aparelho');

      const { data: currentDevice, error: currentError } = await supabase
        .from('panel_devices')
        .select(\`
          id,
          device_code,
          client_name,
          customer_id,
          status,
          seller_id,
          plan_id,
          playlist_id,
          subscription_expires_at,
          customer:panel_customers (
            id,
            name
          )
        \`)
        .eq('id', id)
        .single();

      if (currentError || !currentDevice) {
        return json({ error: currentError?.message || 'Aparelho não encontrado.' }, 404);
      }

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if ('status' in body) updates.status = normalizeStatus(body.status);
      if ('clientName' in body) updates.client_name = textOrNull(body.clientName);
      if ('customerId' in body) updates.customer_id = textOrNull(body.customerId);
      if ('sellerId' in body) updates.seller_id = textOrNull(body.sellerId);
      if ('planId' in body) updates.plan_id = textOrNull(body.planId);
      if ('playlistId' in body) updates.playlist_id = textOrNull(body.playlistId);
      if ('expiresAt' in body) updates.subscription_expires_at = textOrNull(body.expiresAt);

      const previousStatus = String(currentDevice.status || 'pending');
      const nextStatus = 'status' in body ? String(updates.status) : previousStatus;
      const nextSellerId = 'sellerId' in body ? textOrNull(body.sellerId) : (currentDevice.seller_id || null);
      const nextPlanId = 'planId' in body ? textOrNull(body.planId) : (currentDevice.plan_id || null);
      const nextPlaylistId = 'playlistId' in body ? textOrNull(body.playlistId) : (currentDevice.playlist_id || null);
      const nextCustomerId = 'customerId' in body ? textOrNull(body.customerId) : (currentDevice.customer_id || null);
      const previousExpiresAt = currentDevice.subscription_expires_at || null;
      const nextExpiresAt = 'expiresAt' in body ? textOrNull(body.expiresAt) : previousExpiresAt;
      const requestedOperation = textOrNull(body.operationType);

      if (requestedOperation && !['activation', 'renewal'].includes(requestedOperation)) {
        return json({ error: 'Tipo de operação comercial inválido.' }, 400);
      }

      if (
        previousStatus === 'active' &&
        nextStatus === 'active' &&
        'expiresAt' in body &&
        timestampOrZero(nextExpiresAt) < timestampOrZero(previousExpiresAt)
      ) {
        return json({ error: 'A validade de um aparelho ativo não pode ser reduzida.' }, 400);
      }

      const inferredActivation = previousStatus !== 'active' && nextStatus === 'active';
      const inferredRenewal =
        previousStatus === 'active' &&
        nextStatus === 'active' &&
        'expiresAt' in body &&
        timestampOrZero(nextExpiresAt) > timestampOrZero(previousExpiresAt);
      const operationType = requestedOperation || (inferredActivation ? 'activation' : (inferredRenewal ? 'renewal' : null));
      const currentCustomer = Array.isArray(currentDevice.customer)
        ? currentDevice.customer[0] ?? null
        : currentDevice.customer;
      const nextClientName = 'clientName' in body
        ? textOrNull(body.clientName)
        : (currentDevice.client_name || currentCustomer?.name || null);

      let creditConsumption = null;

      if (operationType) {
        if (nextStatus !== 'active') {
          return json({ error: 'Ativação e renovação exigem status ativo.' }, 400);
        }

        if (!nextSellerId) return json({ error: 'Escolha um vendedor para consumir crédito.' }, 400);
        if (!nextPlanId) return json({ error: 'Escolha um plano para consumir crédito.' }, 400);
        if (!nextPlaylistId) return json({ error: 'Escolha uma lista para ativar ou renovar.' }, 400);
        if (!nextExpiresAt) return json({ error: 'Informe a validade da assinatura.' }, 400);

        const idempotencyKey = requiredText(body.idempotencyKey, 'Chave de idempotência');
        const plan = await getActivePlanForCharge(supabase, nextPlanId);

        creditConsumption = await applyAdminDeviceSubscription(supabase, {
          sellerId: nextSellerId,
          deviceId: id,
          deviceCode: currentDevice.device_code,
          customerId: nextCustomerId,
          customerName: nextClientName,
          planId: plan.id,
          planName: plan.name,
          playlistId: nextPlaylistId,
          expiresAt: nextExpiresAt,
          type: operationType as 'activation' | 'renewal',
          idempotencyKey,
        });
      } else {
        const { error } = await supabase
          .from('panel_devices')
          .update(updates)
          .eq('id', id);

        if (error) return json({ error: error.message }, 500);
      }

      const auditAction = operationType === 'activation'
        ? 'device.activated'
        : (operationType === 'renewal' ? 'device.renewed' : 'device.updated');
      const auditDescription = operationType === 'activation'
        ? 'Aparelho ativado com consumo atômico de crédito'
        : (operationType === 'renewal'
          ? 'Aparelho renovado com consumo atômico de crédito'
          : 'Aparelho atualizado');

      await writeAudit(supabase, {
        action: auditAction,
        entityType: 'device',
        entityId: id,
        description: auditDescription,
        metadata: { updates, operationType, creditConsumption },
      });

      return json({
        ok: true,
        operationType,
        creditConsumption,
        message: creditConsumption?.applied === false
          ? 'Esta operação comercial já havia sido processada.'
          : undefined,
      });
    }

`;

backend = replaceBetween(
  backend,
  "    if (action === 'updateDevice') {",
  "    if (action === 'deleteDevice') {",
  updateDeviceBlock,
  'ação updateDevice',
);

const dashboardAnchor = `const deviceActionLocks = new Set();
let auditLogs = [];`;
const dashboardHelpers = `const deviceActionLocks = new Set();
const deviceCommercialAttempts = new Map();

function newDeviceOperationKey(prefix) {
  const random = globalThis.crypto?.randomUUID?.()
    || \`\${Date.now()}-\${Math.random().toString(36).slice(2)}\`;
  return \`\${prefix}:\${random}\`;
}

function selectedAdminPlan(planId) {
  return plans.find(plan => plan.id === planId) || null;
}

function explicitExpiry(dateValue) {
  if (!dateValue) return null;
  const date = new Date(\`\${dateValue}T23:59:59.999Z\`);
  if (Number.isNaN(date.getTime())) throw new Error('Data de validade inválida.');
  return date.toISOString();
}

function calculatedExpiry(planId, currentExpiresAt = null, fallbackDays = null) {
  const plan = selectedAdminPlan(planId);
  const durationDays = Math.max(1, Number(fallbackDays || plan?.durationDays || 30));
  const now = new Date();
  const current = currentExpiresAt ? new Date(currentExpiresAt) : null;
  const base = current && !Number.isNaN(current.getTime()) && current > now
    ? new Date(current)
    : now;

  base.setUTCDate(base.getUTCDate() + durationDays);
  base.setUTCHours(23, 59, 59, 999);
  return base.toISOString();
}

function ensureDeviceCommercialAttempt(deviceId, operationType, input, expiryFactory) {
  const mapKey = \`\${operationType}:\${deviceId}\`;
  const fingerprint = JSON.stringify(input);
  const current = deviceCommercialAttempts.get(mapKey);

  if (current && current.fingerprint === fingerprint) return current;

  const attempt = {
    fingerprint,
    idempotencyKey: newDeviceOperationKey(\`admin-\${operationType}\`),
    expiresAt: expiryFactory(),
  };
  deviceCommercialAttempts.set(mapKey, attempt);
  return attempt;
}

function clearDeviceCommercialAttempt(deviceId, operationType) {
  deviceCommercialAttempts.delete(\`\${operationType}:\${deviceId}\`);
}

let auditLogs = [];`;

dashboard = replaceOnce(
  dashboard,
  dashboardAnchor,
  dashboardHelpers,
  'helpers de idempotência do painel',
);

const saveDeviceBlock = `async function saveDevice(id) {
  try {
    const device = devices.find(d => d.id === id);
    if (!device) throw new Error('Aparelho não encontrado.');

    const nextCustomerId = $('dev-customer-' + id).value || null;
    const nextSellerId = $('dev-seller-' + id).value || null;
    const nextPlanId = $('dev-plan-' + id).value || null;
    const nextStatus = $('dev-status-' + id).value;
    const nextPlaylistId = $('dev-playlist-' + id).value || null;
    const expiresAtInput = $('dev-exp-' + id).value || '';
    const isActivation = device.status !== 'active' && nextStatus === 'active';
    const isRenewal =
      device.status === 'active' &&
      nextStatus === 'active' &&
      dateTimeForCreditCheck(expiresAtInput) > dateTimeForCreditCheck(device.expiresAt);
    const operationType = isActivation ? 'activation' : (isRenewal ? 'renewal' : null);

    if (operationType && !confirmCreditConsumption(
      id,
      nextSellerId,
      nextPlanId,
      operationType === 'activation' ? 'Ativar aparelho' : 'Renovar aparelho'
    )) {
      return;
    }

    await withDeviceActionLock(id, 'saveDevice', async () => {
      const payload = {
        id,
        customerId: nextCustomerId,
        sellerId: nextSellerId,
        planId: nextPlanId,
        status: nextStatus,
        playlistId: nextPlaylistId,
        expiresAt: expiresAtInput || null
      };

      if (operationType) {
        const input = {
          customerId: nextCustomerId,
          sellerId: nextSellerId,
          planId: nextPlanId,
          status: nextStatus,
          playlistId: nextPlaylistId,
          expiresAtInput
        };
        const attempt = ensureDeviceCommercialAttempt(
          id,
          operationType,
          input,
          () => explicitExpiry(expiresAtInput) || calculatedExpiry(nextPlanId, operationType === 'renewal' ? device.expiresAt : null)
        );
        payload.expiresAt = attempt.expiresAt;
        payload.operationType = operationType;
        payload.idempotencyKey = attempt.idempotencyKey;
      }

      await api('updateDevice', payload);

      if (operationType) clearDeviceCommercialAttempt(id, operationType);
      await loadAll();
      show(operationType === 'activation'
        ? 'Aparelho ativado.'
        : (operationType === 'renewal' ? 'Aparelho renovado.' : 'Aparelho salvo.'));
    });
  } catch (err) {
    show(err.message, true);
  }
}

`;

dashboard = replaceBetween(
  dashboard,
  'async function saveDevice(id) {',
  'async function renewDevice(id) {',
  saveDeviceBlock,
  'saveDevice',
);

const renewDeviceBlock = `async function renewDevice(id) {
  try {
    const device = devices.find(d => d.id === id);
    if (!device) throw new Error('Aparelho não encontrado.');

    const sellerId = device.sellerId || null;
    const planId = device.planId || null;
    const playlistId = device.playlistId || null;

    if (!confirmCreditConsumption(id, sellerId, planId, 'Renovar aparelho por 30 dias')) {
      return;
    }

    await withDeviceActionLock(id, 'renewDevice', async () => {
      const input = { sellerId, planId, playlistId, currentExpiresAt: device.expiresAt || null, days: 30 };
      const attempt = ensureDeviceCommercialAttempt(
        id,
        'renewal',
        input,
        () => calculatedExpiry(planId, device.expiresAt, 30)
      );

      await api('updateDevice', {
        id,
        sellerId,
        planId,
        playlistId,
        status: 'active',
        expiresAt: attempt.expiresAt,
        operationType: 'renewal',
        idempotencyKey: attempt.idempotencyKey
      });

      clearDeviceCommercialAttempt(id, 'renewal');
      await loadAll();
      show('Aparelho renovado por 30 dias.');
    });
  } catch (err) {
    show(err.message, true);
  }
}

`;

dashboard = replaceBetween(
  dashboard,
  'async function renewDevice(id) {',
  'async function blockDevice(id) {',
  renewDeviceBlock,
  'renewDevice',
);

const activatePendingBlock = `async function activatePending(id) {
  try {
    const sellerId = $('pend-seller-' + id).value || null;
    const planId = $('pend-plan-' + id).value || null;
    const playlistId = $('pend-playlist-' + id).value || null;
    const customerId = $('pend-customer-' + id).value || null;
    const expiresAtInput = $('pend-exp-' + id).value || '';

    if (!confirmCreditConsumption(id, sellerId, planId, 'Liberar aparelho pendente')) {
      return;
    }

    await withDeviceActionLock(id, 'activatePending', async () => {
      const input = { customerId, sellerId, planId, playlistId, expiresAtInput };
      const attempt = ensureDeviceCommercialAttempt(
        id,
        'activation',
        input,
        () => explicitExpiry(expiresAtInput) || calculatedExpiry(planId)
      );

      await api('updateDevice', {
        id,
        customerId,
        sellerId,
        planId,
        playlistId,
        status: 'active',
        expiresAt: attempt.expiresAt,
        operationType: 'activation',
        idempotencyKey: attempt.idempotencyKey
      });

      clearDeviceCommercialAttempt(id, 'activation');
      await loadAll();
      show('Aparelho liberado.');
    });
  } catch (err) {
    show(err.message, true);
  }
}

`;

dashboard = replaceBetween(
  dashboard,
  'async function activatePending(id) {',
  'function openDetails(',
  activatePendingBlock,
  'activatePending',
);

const setDeviceStatusBlock = `async function setDeviceStatus(id, status) {
  try {
    if (status === 'active') {
      const statusSelect = $('dev-status-' + id);
      if (!statusSelect) throw new Error('Abra a tabela de aparelhos para ativar este dispositivo.');
      statusSelect.value = 'active';
      closeDetails();
      await saveDevice(id);
      return;
    }

    await api('updateDevice', { id, status });
    await loadAll();
    show('Status do aparelho atualizado.');
    showDeviceDetails(id);
  } catch (err) {
    show(err.message, true);
  }
}


`;

dashboard = replaceBetween(
  dashboard,
  'async function setDeviceStatus(id, status) {',
  'async function deleteDevice(id) {',
  setDeviceStatusBlock,
  'setDeviceStatus',
);

fs.writeFileSync(backendPath, backend);
fs.writeFileSync(dashboardPath, dashboard);
console.log('Migração atômica administrativa aplicada.');
