#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly CONFIRMATION='RESTORE_TO_DISPOSABLE_DATABASE'
readonly REMOTE_CONFIRMATION='I_UNDERSTAND_THIS_ERASES_THE_TARGET'
readonly PRODUCTION_PROJECT_REF='awauvkjkucjqulkklmuo'

backup_dir="${1:-${RONECA_BACKUP_DIR:-}}"

fail() {
  printf 'ERRO: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Comando obrigatório não encontrado: $1"
}

[[ -n "${backup_dir}" ]] || fail 'Informe o diretório do backup a ser ensaiado.'
[[ "${RONECA_RESTORE_CONFIRM:-}" == "${CONFIRMATION}" ]] \
  || fail "Defina RONECA_RESTORE_CONFIRM=${CONFIRMATION} para autorizar somente o ensaio descartável."
[[ -n "${RONECA_RESTORE_TARGET_URL:-}" ]] \
  || fail 'Defina RONECA_RESTORE_TARGET_URL para um banco vazio e descartável.'

require_command node
require_command psql
require_command date

bash "${SCRIPT_DIR}/verify-production-backup.sh" "${backup_dir}"

readonly metadata_file="${backup_dir}/METADATA.json"
readonly source_summary="$(node - "${metadata_file}" <<'NODE'
const fs = require('node:fs');
const metadata = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.stdout.write(`${metadata.source.host}\t${metadata.source.id}`);
NODE
)"
IFS=$'\t' read -r source_host source_id <<< "${source_summary}"

target_summary=""
set +e
target_summary="$({
  RONECA_RESTORE_TARGET_URL="${RONECA_RESTORE_TARGET_URL}" node <<'NODE'
const crypto = require('node:crypto');
const raw = String(process.env.RONECA_RESTORE_TARGET_URL || '').trim();
let parsed;
try {
  parsed = new URL(raw);
} catch {
  process.stderr.write('URL de restauração inválida.\n');
  process.exit(1);
}
if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
  process.stderr.write('A URL de restauração precisa usar postgres:// ou postgresql://.\n');
  process.exit(1);
}
if (!parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
  process.stderr.write('A URL de restauração precisa informar host e banco.\n');
  process.exit(1);
}
if (/[\r\n\0]/.test(raw)) {
  process.stderr.write('A URL de restauração contém caracteres inválidos.\n');
  process.exit(1);
}
const host = parsed.hostname.toLowerCase();
const port = parsed.port || '5432';
const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
const id = crypto.createHash('sha256').update(`${host}:${port}/${database}`).digest('hex');
process.stdout.write([host, port, database, id].join('\t'));
NODE
} 2>&1)"
target_summary_status=$?
set -e
[[ ${target_summary_status} -eq 0 ]] || fail "${target_summary:-Não foi possível validar o destino descartável.}"
readonly target_summary
IFS=$'\t' read -r target_host target_port target_database target_id <<< "${target_summary}"

[[ "${target_id}" =~ ^[a-f0-9]{64}$ ]] || fail 'Identificador do destino descartável inválido.'
[[ "${target_id}" != "${source_id}" ]] || fail 'O destino corresponde à origem do backup. Restauração bloqueada.'
[[ "${target_host}" != "${source_host}" ]] || fail 'O host de destino corresponde ao host da produção. Restauração bloqueada.'
[[ "${target_host}" != *"${PRODUCTION_PROJECT_REF}"* ]] \
  || fail 'A URL de destino contém o identificador do projeto de produção. Restauração bloqueada.'

case "${target_host}" in
  localhost|127.0.0.1|::1|host.docker.internal)
    ;;
  *)
    [[ "${RONECA_ALLOW_REMOTE_DISPOSABLE:-}" == "${REMOTE_CONFIRMATION}" ]] \
      || fail "Destino remoto bloqueado. Para um ambiente descartável remoto, defina RONECA_ALLOW_REMOTE_DISPOSABLE=${REMOTE_CONFIRMATION}."
    ;;
esac

printf 'Validando conexão com o banco descartável %s/%s...\n' "${target_host}" "${target_database}"
psql "${RONECA_RESTORE_TARGET_URL}" -X -v ON_ERROR_STOP=1 -Atqc 'select 1' >/dev/null

readonly existing_public_objects="$(
  psql "${RONECA_RESTORE_TARGET_URL}" -X -v ON_ERROR_STOP=1 -Atqc \
    "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p','v','m','S','f');"
)"
[[ "${existing_public_objects}" =~ ^[0-9]+$ ]] || fail 'Não foi possível medir o banco descartável.'
[[ "${existing_public_objects}" == '0' ]] \
  || fail "O banco descartável não está vazio (${existing_public_objects} objetos públicos). Nenhum dado foi alterado."

readonly started_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

if [[ "${RONECA_RESTORE_SKIP_ROLES:-0}" != '1' ]]; then
  printf 'Restaurando papéis e permissões no ambiente descartável...\n'
  psql "${RONECA_RESTORE_TARGET_URL}" -X -v ON_ERROR_STOP=1 \
    -f "${backup_dir}/roles.sql"
else
  printf 'Papéis ignorados por RONECA_RESTORE_SKIP_ROLES=1. O ensaio será parcial.\n'
fi

printf 'Restaurando estrutura no ambiente descartável...\n'
psql "${RONECA_RESTORE_TARGET_URL}" -X -v ON_ERROR_STOP=1 --single-transaction \
  -f "${backup_dir}/schema.sql"

printf 'Restaurando dados no ambiente descartável...\n'
psql "${RONECA_RESTORE_TARGET_URL}" -X -v ON_ERROR_STOP=1 --single-transaction \
  -f "${backup_dir}/data.sql"

readonly restored_tables="$(
  psql "${RONECA_RESTORE_TARGET_URL}" -X -v ON_ERROR_STOP=1 -Atqc \
    "select count(*) from pg_tables where schemaname = 'public';"
)"
readonly restored_rows="$(
  psql "${RONECA_RESTORE_TARGET_URL}" -X -v ON_ERROR_STOP=1 -Atqc \
    "select coalesce(sum(n_live_tup),0)::bigint from pg_stat_user_tables;"
)"
readonly completed_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

readonly report_root="${RONECA_RESTORE_REPORT_DIR:-${HOME}/.roneca/restore-reports}"
mkdir -p "${report_root}"
chmod 700 "${report_root}"
readonly report_file="${report_root}/restore-drill-$(date -u +'%Y%m%dT%H%M%SZ').json"

export RONECA_DRILL_STARTED_AT="${started_at}"
export RONECA_DRILL_COMPLETED_AT="${completed_at}"
export RONECA_DRILL_SOURCE_ID="${source_id}"
export RONECA_DRILL_TARGET_HOST="${target_host}"
export RONECA_DRILL_TARGET_PORT="${target_port}"
export RONECA_DRILL_TARGET_DATABASE="${target_database}"
export RONECA_DRILL_RESTORED_TABLES="${restored_tables}"
export RONECA_DRILL_RESTORED_ROWS="${restored_rows}"
export RONECA_DRILL_ROLES_SKIPPED="${RONECA_RESTORE_SKIP_ROLES:-0}"

node <<'NODE' > "${report_file}"
const report = {
  schemaVersion: 1,
  type: 'disposable_restore_drill',
  startedAt: process.env.RONECA_DRILL_STARTED_AT,
  completedAt: process.env.RONECA_DRILL_COMPLETED_AT,
  sourceId: process.env.RONECA_DRILL_SOURCE_ID,
  target: {
    host: process.env.RONECA_DRILL_TARGET_HOST,
    port: Number(process.env.RONECA_DRILL_TARGET_PORT),
    database: process.env.RONECA_DRILL_TARGET_DATABASE,
  },
  result: {
    restoredPublicTables: Number(process.env.RONECA_DRILL_RESTORED_TABLES),
    estimatedRows: Number(process.env.RONECA_DRILL_RESTORED_ROWS),
    rolesSkipped: process.env.RONECA_DRILL_ROLES_SKIPPED === '1',
    success: true,
  },
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
NODE
chmod 600 "${report_file}"

unset RONECA_RESTORE_TARGET_URL

printf '\nEnsaio de restauração concluído no banco descartável.\n'
printf 'Tabelas públicas restauradas: %s\n' "${restored_tables}"
printf 'Linhas estimadas: %s\n' "${restored_rows}"
printf 'Relatório sem credenciais: %s\n' "${report_file}"
printf 'O banco descartável não é removido automaticamente para permitir a conferência manual.\n'
