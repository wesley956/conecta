#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly SUPABASE_CLI_VERSION="${SUPABASE_CLI_VERSION:-2.111.0}"
readonly KEEP_FAILED_BACKUP="${RONECA_KEEP_FAILED_BACKUP:-0}"

backup_dir=""

fail() {
  printf 'ERRO: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Comando obrigatório não encontrado: $1"
}

canonical_path() {
  node - "$1" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const original = path.resolve(process.argv[2]);
let existing = original;
const suffix = [];
while (!fs.existsSync(existing)) {
  const parent = path.dirname(existing);
  if (parent === existing) break;
  suffix.unshift(path.basename(existing));
  existing = parent;
}
const resolvedBase = fs.realpathSync(existing);
process.stdout.write(path.join(resolvedBase, ...suffix));
NODE
}

path_is_inside() {
  local candidate="$1"
  local parent="$2"
  [[ "${candidate}" == "${parent}" || "${candidate}" == "${parent}/"* ]]
}

on_exit() {
  local status=$?
  trap - EXIT

  if [[ ${status} -ne 0 && -n "${backup_dir}" && -d "${backup_dir}" ]]; then
    find "${backup_dir}" -maxdepth 1 -type f -name '.*.partial' -delete 2>/dev/null || true
    printf 'Falha em %s. Este diretório não é um backup válido.\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" > "${backup_dir}/FAILED"
    chmod 600 "${backup_dir}/FAILED" 2>/dev/null || true
    rm -f "${backup_dir}/READY"

    if [[ "${KEEP_FAILED_BACKUP}" != "1" ]]; then
      rm -f \
        "${backup_dir}/roles.sql" \
        "${backup_dir}/schema.sql" \
        "${backup_dir}/data.sql" \
        "${backup_dir}/METADATA.json" \
        "${backup_dir}/SHA256SUMS"
    fi

    printf 'O backup não foi concluído. Diretório marcado como FAILED: %s\n' "${backup_dir}" >&2
  fi

  exit "${status}"
}
trap on_exit EXIT

require_command node
require_command npx
require_command sha256sum
require_command date
require_command git

if [[ -z "${RONECA_DB_URL:-}" ]]; then
  if [[ -t 0 ]]; then
    read -r -s -p 'Cole a URL do Session pooler do Supabase: ' RONECA_DB_URL
    printf '\n'
    export RONECA_DB_URL
  else
    fail 'Defina RONECA_DB_URL sem gravar a senha no repositório ou no comando executado.'
  fi
fi

db_metadata=""
set +e
db_metadata="$({
  node <<'NODE'
const crypto = require('node:crypto');

const raw = String(process.env.RONECA_DB_URL || '').trim();
let parsed;
try {
  parsed = new URL(raw);
} catch {
  process.stderr.write('URL do banco inválida.\n');
  process.exit(1);
}

if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
  process.stderr.write('A URL precisa usar postgres:// ou postgresql://.\n');
  process.exit(1);
}
if (!parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
  process.stderr.write('A URL precisa informar host e banco.\n');
  process.exit(1);
}
if (!parsed.password) {
  process.stderr.write('A URL do Session pooler precisa conter a senha do banco.\n');
  process.exit(1);
}
if (/[\r\n\0]/.test(raw)) {
  process.stderr.write('A URL contém caracteres inválidos.\n');
  process.exit(1);
}

const port = parsed.port || '5432';
const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
const sourceId = crypto
  .createHash('sha256')
  .update(`${parsed.hostname.toLowerCase()}:${port}/${database}`)
  .digest('hex');

process.stdout.write([parsed.hostname.toLowerCase(), port, database, sourceId].join('\t'));
NODE
} 2>&1)"
db_metadata_status=$?
set -e
[[ ${db_metadata_status} -eq 0 ]] || fail "${db_metadata:-Não foi possível validar a URL do banco.}"
readonly db_metadata

IFS=$'\t' read -r db_host db_port db_name source_id <<< "${db_metadata}"
[[ -n "${db_host}" && -n "${db_name}" && "${source_id}" =~ ^[a-f0-9]{64}$ ]] \
  || fail 'Metadados seguros do banco não puderam ser calculados.'

readonly timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
if [[ -n "${RONECA_BACKUP_DIR:-}" ]]; then
  backup_dir="$(canonical_path "${RONECA_BACKUP_DIR}")"
else
  readonly backup_root="$(canonical_path "${RONECA_BACKUP_ROOT:-${HOME}/.roneca/backups}")"
  backup_dir="${backup_root}/production-${timestamp}"
fi
readonly backup_dir

readonly canonical_repo="$(canonical_path "${REPO_ROOT}")"
path_is_inside "${backup_dir}" "${canonical_repo}" \
  && fail 'O backup precisa ficar fora do repositório para impedir commit ou publicação acidental.'

[[ "${backup_dir}" != '/' && "${backup_dir}" != "${HOME}" ]] \
  || fail 'Diretório de backup amplo demais. Use uma pasta exclusiva.'

mkdir -p "${backup_dir}"
chmod 700 "${backup_dir}"

if find "${backup_dir}" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
  fail "O diretório de destino precisa estar vazio: ${backup_dir}"
fi

printf 'Backup iniciado em %s. Não usar estes arquivos até existir READY.\n' \
  "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" > "${backup_dir}/INCOMPLETE"
chmod 600 "${backup_dir}/INCOMPLETE"

readonly supabase_home="${SUPABASE_HOME:-/tmp/roneca-supabase-home-${UID:-0}}"
mkdir -p "${supabase_home}"
chmod 700 "${supabase_home}"

run_dump() {
  local label="$1"
  local output_name="$2"
  shift 2

  local temporary_file="${backup_dir}/.${output_name}.partial"
  printf 'Gerando %s...\n' "${label}"
  rm -f "${temporary_file}"

  SUPABASE_HOME="${supabase_home}" \
    npx --yes "supabase@${SUPABASE_CLI_VERSION}" db dump \
      --db-url "${RONECA_DB_URL}" \
      --file "${temporary_file}" \
      "$@"

  [[ -s "${temporary_file}" ]] || fail "O arquivo ${output_name} foi gerado vazio."
  chmod 600 "${temporary_file}"
  mv "${temporary_file}" "${backup_dir}/${output_name}"
}

run_dump 'papéis e permissões' 'roles.sql' --role-only
run_dump 'estrutura do banco' 'schema.sql'
run_dump 'dados do banco' 'data.sql' --data-only --use-copy

for required_file in roles.sql schema.sql data.sql; do
  [[ -s "${backup_dir}/${required_file}" ]] || fail "Arquivo ausente ou vazio: ${required_file}"
  chmod 600 "${backup_dir}/${required_file}"
done

readonly git_commit="$(git -C "${REPO_ROOT}" rev-parse HEAD 2>/dev/null || printf 'unknown')"
export RONECA_BACKUP_CREATED_AT="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
export RONECA_BACKUP_DB_HOST="${db_host}"
export RONECA_BACKUP_DB_PORT="${db_port}"
export RONECA_BACKUP_DB_NAME="${db_name}"
export RONECA_BACKUP_SOURCE_ID="${source_id}"
export RONECA_BACKUP_CLI_VERSION="${SUPABASE_CLI_VERSION}"
export RONECA_BACKUP_GIT_COMMIT="${git_commit}"

node <<'NODE' > "${backup_dir}/METADATA.json"
const metadata = {
  schemaVersion: 1,
  createdAt: process.env.RONECA_BACKUP_CREATED_AT,
  source: {
    host: process.env.RONECA_BACKUP_DB_HOST,
    port: Number(process.env.RONECA_BACKUP_DB_PORT),
    database: process.env.RONECA_BACKUP_DB_NAME,
    id: process.env.RONECA_BACKUP_SOURCE_ID,
  },
  tooling: {
    supabaseCli: process.env.RONECA_BACKUP_CLI_VERSION,
    gitCommit: process.env.RONECA_BACKUP_GIT_COMMIT,
  },
  files: ['roles.sql', 'schema.sql', 'data.sql'],
  containsSensitiveData: true,
};
process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
NODE
chmod 600 "${backup_dir}/METADATA.json"

(
  cd "${backup_dir}"
  sha256sum roles.sql schema.sql data.sql METADATA.json > SHA256SUMS
)
chmod 600 "${backup_dir}/SHA256SUMS"

bash "${SCRIPT_DIR}/verify-production-backup.sh" --pre-finalize "${backup_dir}"

rm -f "${backup_dir}/INCOMPLETE" "${backup_dir}/FAILED"
printf 'Backup válido e verificado em %s.\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" > "${backup_dir}/READY"
chmod 600 "${backup_dir}/READY"

# Verificação final já com o marcador de prontidão.
bash "${SCRIPT_DIR}/verify-production-backup.sh" "${backup_dir}"

trap - EXIT
unset RONECA_DB_URL

printf '\nBackup lógico concluído sem alterar a produção.\n'
printf 'Diretório protegido: %s\n' "${backup_dir}"
printf 'Identificador seguro da origem: %s\n' "${source_id}"
