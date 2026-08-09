import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../supabase/functions/series-detail/index.ts', import.meta.url),
  'utf8',
);

assert.match(source, /const REQUEST_BUDGET_MS = 35_000/);
assert.match(source, /const PROVIDER_ATTEMPT_TIMEOUT_MS = 12_000/);
assert.match(source, /deadlineMs - Date\.now\(\)/);
assert.match(source, /UPSTREAM_BUDGET_EXHAUSTED/);
assert.match(source, /providerText\(target, source\.origin, deadlineMs\)/);
assert.match(source, /try \{[\s\S]*?storage\.from\(CACHE_BUCKET\)\.upload[\s\S]*?catch \{/);
assert.match(source, /await saveCache[\s\S]*?return json\(/);
assert.doesNotMatch(source, /console\.(?:log|debug|info|warn|error)\([^)]*(?:playlist_url|password|username|token)/i);

console.log('✅ series-detail: orçamento global, fallback e cache best effort validados.');
