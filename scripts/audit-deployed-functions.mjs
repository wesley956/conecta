#!/usr/bin/env node
// DEPLOY-01: proves what is running in Supabase vs. what is in the repo.
// Read-only. Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF (env).
// Usage: node scripts/audit-deployed-functions.mjs [--json out.json]
import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF.');
  process.exit(2);
}
const api = (p) =>
  fetch(`https://api.supabase.com/v1/projects/${ref}${p}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => {
    if (!r.ok) throw new Error(`${p} -> ${r.status}`);
    return r.json();
  });

const repoFns = new Set(
  readdirSync('supabase/functions', { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(`supabase/functions/${d.name}/index.ts`))
    .map((d) => d.name),
);
const head = execSync('git rev-parse HEAD').toString().trim();
const deployed = await api('/functions');
const rows = [];
for (const f of deployed) {
  let kind = 'unknown', pinned = '';
  try {
    const body = await api(`/functions/${f.slug}/body`).catch(() => null);
    const src = typeof body === 'string' ? body : JSON.stringify(body ?? '');
    const m = src.match(/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/([0-9a-f]{7,40})\//);
    if (m) { kind = 'shim'; pinned = m[1]; } else if (src) kind = 'inline';
  } catch { /* body endpoint not available: rely on list metadata */ }
  rows.push({
    slug: f.slug, version: f.version, ezbr_sha256: f.ezbr_sha256 ?? null,
    verify_jwt: f.verify_jwt, kind, pinned,
    inRepo: repoFns.has(f.slug),
  });
}
const deployedSlugs = new Set(rows.map((r) => r.slug));
const report = {
  repoHead: head, project: ref, generatedAt: new Date().toISOString(),
  deployedNotInRepo: rows.filter((r) => !r.inRepo).map((r) => r.slug),
  repoNotDeployed: [...repoFns].filter((s) => !deployedSlugs.has(s)),
  shims: rows.filter((r) => r.kind === 'shim'),
  functions: rows,
};
console.log(`repo HEAD ${head}`);
console.log(`deployed: ${rows.length}  in repo: ${repoFns.size}`);
console.log(`shims (dynamic import from GitHub): ${report.shims.length}`);
console.log(`deployed but NOT in repo: ${report.deployedNotInRepo.join(', ') || '-'}`);
console.log(`in repo but NOT deployed: ${report.repoNotDeployed.join(', ') || '-'}`);
const out = process.argv.indexOf('--json');
if (out > 0) writeFileSync(process.argv[out + 1], JSON.stringify(report, null, 2));
// exit 1 while any shim exists: prod is not provably == main
process.exit(report.shims.length || report.deployedNotInRepo.length ? 1 : 0);
