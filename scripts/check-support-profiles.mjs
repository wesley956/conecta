import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  genericSupportProfile,
  normalizeSupportProfileInput,
  resolveDeviceSupportProfile,
  resolveSystemSupportProfile,
} from '../supabase/functions/_shared/supportProfile.ts';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [migration, indexMigration, deviceActivate, deviceConfig, supportPanel, panelAuth, config, adminHtml, sellerHtml, ui] = await Promise.all([
  read('supabase/migrations/20260812084220_support_profiles_contract.sql'),
  read('supabase/migrations/20260812084809_support_profiles_fk_indexes.sql'),
  read('supabase/functions/device-activate/index.ts'),
  read('supabase/functions/device-config/index.ts'),
  read('supabase/functions/support-panel/index.ts'),
  read('admin-panel/panel-auth-session.js'),
  read('supabase/config.toml'),
  read('admin-panel/dashboard.html'),
  read('admin-panel/seller.html'),
  read('admin-panel/support-profile.js'),
]);

for (const table of ['panel_system_support_profiles', 'panel_seller_support_profiles']) {
  assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
  assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
}
assert.match(indexMigration, /panel_system_support_profiles_updated_by_idx/);
assert.match(indexMigration, /panel_seller_support_profiles_updated_by_idx/);
assert.match(config, /\[functions\.support-panel\][\s\S]*?verify_jwt = true/);
assert.match(panelAuth, /'support-panel': true/);
assert.match(supportPanel, /requirePanelPrincipal\(request, supabase, \['owner', 'admin', 'seller'\]\)/);
assert.match(deviceActivate, /resolveSystemSupportProfile/);
assert.match(deviceConfig, /resolveDeviceSupportProfile/);
assert.match(deviceConfig, /seller_id,[\s\S]*?status,/);
assert.match(adminHtml, /data-support-role="system"/);
assert.match(sellerHtml, /data-support-role="seller"/);
assert.match(ui, /submit\.disabled = true/);
assert.doesNotMatch([deviceActivate, deviceConfig, ui].join('\n'), /(?:wa\.me|whatsapp\.com)\/\d{8,}/i);

const normalized = normalizeSupportProfileInput({
  displayName: ' Minha marca ',
  whatsapp: '+55 (19) 99999-9999',
  email: ' SUPORTE@EXAMPLE.COM ',
  supportText: ' Atendimento ',
  businessHours: ' 9h às 18h ',
  contactUrl: 'https://example.com/ajuda#contato',
  showInApp: true,
}, 'showInApp');
assert.deepEqual(normalized, {
  displayName: 'Minha marca',
  whatsapp: '+5519999999999',
  email: 'suporte@example.com',
  supportText: 'Atendimento',
  businessHours: '9h às 18h',
  contactUrl: 'https://example.com/ajuda',
  visible: true,
});
assert.throws(() => normalizeSupportProfileInput({ displayName: 'X', contactUrl: 'javascript:alert(1)' }, 'enabled'));
assert.throws(() => normalizeSupportProfileInput({ displayName: 'X', whatsapp: '123' }, 'enabled'));
assert.equal(genericSupportProfile().source, 'generic');

function supabaseMock(rows) {
  return {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return rows[table] || { data: null, error: null }; },
      };
    },
  };
}

const sellerResolved = await resolveDeviceSupportProfile(supabaseMock({
  panel_seller_support_profiles: { data: { display_name: 'Seller', whatsapp: '5519999999999', show_in_app: true }, error: null },
}), 'seller-id');
assert.equal(sellerResolved.source, 'seller');

const systemResolved = await resolveSystemSupportProfile(supabaseMock({
  panel_system_support_profiles: { data: { display_name: 'Oficial', email: 'help@example.com', enabled: true }, error: null },
}));
assert.equal(systemResolved.source, 'system');

const fallbackResolved = await resolveDeviceSupportProfile(supabaseMock({
  panel_seller_support_profiles: { data: { display_name: 'Oculto', whatsapp: '5519999999999', show_in_app: false }, error: null },
  panel_system_support_profiles: { data: { display_name: 'Desligado', enabled: false }, error: null },
}), 'seller-id');
assert.equal(fallbackResolved.source, 'generic');

console.log('✅ Suporte #274/#275: contrato, fallback, validação, RLS e integração do painel validados.');
