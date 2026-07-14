const fs = require('node:fs');

const file = 'supabase/migrations/2026071303_atomic_device_subscription.sql';
let source = fs.readFileSync(file, 'utf8');

const validationBlock = `  if p_operation_type = 'activation' and v_device.status = 'active' then
    raise exception using
      errcode = 'P0001',
      message = 'Aparelho já está ativo. Use renovação.';
  end if;

  if p_operation_type = 'renewal' and v_device.status <> 'active' then
    raise exception using
      errcode = 'P0001',
      message = 'Somente aparelhos ativos podem ser renovados.';
  end if;

  if p_operation_type = 'renewal'
     and p_expires_at <= greatest(now(), coalesce(v_device.subscription_expires_at, now())) then
    raise exception using
      errcode = '22023',
      message = 'A renovação deve ampliar a data atual de expiração.';
  end if;

`;

const anchor = `    return;
  end if;

  v_balance_before := coalesce(v_seller.credit_balance, 0);`;

const replacement = `    return;
  end if;

  if p_operation_type = 'activation' and v_device.status = 'active' then
    raise exception using
      errcode = 'P0001',
      message = 'Aparelho já está ativo. Use renovação.';
  end if;

  if p_operation_type = 'renewal' and v_device.status <> 'active' then
    raise exception using
      errcode = 'P0001',
      message = 'Somente aparelhos ativos podem ser renovados.';
  end if;

  if p_operation_type = 'renewal'
     and p_expires_at <= greatest(now(), coalesce(v_device.subscription_expires_at, now())) then
    raise exception using
      errcode = '22023',
      message = 'A renovação deve ampliar a data atual de expiração.';
  end if;

  v_balance_before := coalesce(v_seller.credit_balance, 0);`;

if (!source.includes(validationBlock) && source.includes(replacement)) {
  console.log('Correção de idempotência já aplicada.');
  process.exit(0);
}

const validationOccurrences = source.split(validationBlock).length - 1;
const anchorOccurrences = source.split(anchor).length - 1;

if (validationOccurrences !== 1 || anchorOccurrences !== 1) {
  throw new Error(
    `Blocos esperados inválidos: validação=${validationOccurrences}, âncora=${anchorOccurrences}`,
  );
}

source = source.replace(validationBlock, '');
source = source.replace(anchor, replacement);
fs.writeFileSync(file, source);
console.log('Correção de idempotência aplicada à migration de assinatura.');
