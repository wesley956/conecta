#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

allow_incomplete=0
if [[ "${1:-}" == '--pre-finalize' ]]; then
  allow_incomplete=1
  shift
fi

backup_dir="${1:-${RONECA_BACKUP_DIR:-}}"

fail() {
  printf 'ERRO: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Comando obrigatório não encontrado: $1"
}

require_command node
require_command sha256sum
require_command stat
require_command awk
require_command sort
require_command cmp

[[ -n "${backup_dir}" ]] || fail 'Informe o diretório do backup.'
[[ -d "${backup_dir}" ]] || fail "Diretório inexistente: ${backup_dir}"
[[ ! -L "${backup_dir}" ]] || fail 'Diretório de backup não pode ser um link simbólico.'

backup_dir="$(node -e "const path=require('node:path'); console.log(path.resolve(process.argv[1]));" "${backup_dir}")"

if [[ -e "${backup_dir}/FAILED" ]]; then
  fail 'O diretório está marcado como FAILED.'
fi

if [[ ${allow_incomplete} -eq 1 ]]; then
  [[ -e "${backup_dir}/INCOMPLETE" ]] || fail 'A verificação preliminar exige o marcador INCOMPLETE.'
  [[ ! -e "${backup_dir}/READY" ]] || fail 'Backup preliminar não pode estar marcado como READY.'
else
  [[ -e "${backup_dir}/READY" ]] || fail 'O backup não possui marcador READY.'
  [[ ! -e "${backup_dir}/INCOMPLETE" ]] || fail 'O backup ainda está marcado como INCOMPLETE.'
fi

readonly required_files=(roles.sql schema.sql data.sql METADATA.json SHA256SUMS)
for file_name in "${required_files[@]}"; do
  file_path="${backup_dir}/${file_name}"
  [[ -f "${file_path}" ]] || fail "Arquivo obrigatório ausente: ${file_name}"
  [[ ! -L "${file_path}" ]] || fail "Arquivo obrigatório não pode ser link simbólico: ${file_name}"
  [[ -s "${file_path}" ]] || fail "Arquivo obrigatório vazio: ${file_name}"
done

check_private_permissions() {
  local path="$1"
  local label="$2"
  local mode
  mode="$(stat -c '%a' "${path}")"
  [[ "${mode}" =~ ^[0-7]{3,4}$ ]] || fail "Não foi possível validar a permissão de ${label}."
  local numeric_mode=$((8#${mode}))
  if (( (numeric_mode & 0077) != 0 )); then
    fail "${label} permite acesso de grupo ou terceiros (${mode})."
  fi
}

check_private_permissions "${backup_dir}" 'diretório do backup'
for file_name in "${required_files[@]}"; do
  check_private_permissions "${backup_dir}/${file_name}" "arquivo ${file_name}"
done
[[ ${allow_incomplete} -eq 1 ]] \
  && check_private_permissions "${backup_dir}/INCOMPLETE" 'marcador INCOMPLETE'
[[ ${allow_incomplete} -eq 0 ]] \
  && check_private_permissions "${backup_dir}/READY" 'marcador READY'

mapfile -t checksum_names < <(awk '{ name=$2; sub(/^\*/, "", name); print name }' "${backup_dir}/SHA256SUMS" | sort)
mapfile -t expected_names < <(printf '%s\n' roles.sql schema.sql data.sql METADATA.json | sort)

[[ ${#checksum_names[@]} -eq ${#expected_names[@]} ]] \
  || fail 'SHA256SUMS precisa conter exatamente os quatro arquivos protegidos.'

for index in "${!expected_names[@]}"; do
  [[ "${checksum_names[$index]}" == "${expected_names[$index]}" ]] \
    || fail 'SHA256SUMS contém caminho inesperado, absoluto ou arquivo não autorizado.'
done

(
  cd "${backup_dir}"
  sha256sum -c SHA256SUMS >/dev/null
) || fail 'A assinatura SHA-256 não corresponde aos arquivos do backup.'

node - "${backup_dir}" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const directory = process.argv[2];
const requiredMinimumBytes = {
  'roles.sql': 24,
  'schema.sql': 64,
  'data.sql': 24,
};

for (const [fileName, minimumBytes] of Object.entries(requiredMinimumBytes)) {
  const filePath = path.join(directory, fileName);
  const content = fs.readFileSync(filePath);
  if (content.length < minimumBytes) {
    throw new Error(`${fileName} é pequeno demais para ser considerado um dump válido.`);
  }
  if (content.includes(0)) {
    throw new Error(`${fileName} contém bytes nulos inesperados.`);
  }
}

const roles = fs.readFileSync(path.join(directory, 'roles.sql'), 'utf8');
const schema = fs.readFileSync(path.join(directory, 'schema.sql'), 'utf8');
const data = fs.readFileSync(path.join(directory, 'data.sql'), 'utf8');

if (!/(SET|CREATE|ALTER|GRANT|REVOKE|COMMENT)/i.test(roles)) {
  throw new Error('roles.sql não possui instruções SQL reconhecíveis.');
}
if (!/(SET|CREATE|ALTER|GRANT|REVOKE|COMMENT)/i.test(schema)) {
  throw new Error('schema.sql não possui instruções SQL reconhecíveis.');
}
if (!/(SET|COPY|INSERT|SELECT|COMMENT|--)/i.test(data)) {
  throw new Error('data.sql não possui estrutura reconhecível de dump.');
}

const metadataText = fs.readFileSync(path.join(directory, 'METADATA.json'), 'utf8');
const metadata = JSON.parse(metadataText);

if (metadata.schemaVersion !== 1) throw new Error('Versão de METADATA.json não suportada.');
if (!Number.isFinite(Date.parse(metadata.createdAt))) throw new Error('Data do backup inválida.');
if (!metadata.source || typeof metadata.source !== 'object') throw new Error('Origem do backup ausente.');
if (!/^[a-f0-9]{64}$/.test(String(metadata.source.id || ''))) throw new Error('Identificador seguro da origem inválido.');
if (!metadata.source.host || !metadata.source.database) throw new Error('Host ou banco ausente nos metadados seguros.');
if (!metadata.tooling?.supabaseCli) throw new Error('Versão da CLI não registrada.');
if (metadata.containsSensitiveData !== true) throw new Error('Classificação de sensibilidade ausente.');

const expectedFiles = ['roles.sql', 'schema.sql', 'data.sql'];
if (JSON.stringify(metadata.files) !== JSON.stringify(expectedFiles)) {
  throw new Error('Lista de arquivos do backup não corresponde ao contrato.');
}

const forbiddenKeys = /url|password|passwd|secret|credential|token|connectionstring/i;
function visit(value, trail = []) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.test(key)) {
      throw new Error(`METADATA.json contém chave proibida: ${[...trail, key].join('.')}`);
    }
    visit(child, [...trail, key]);
  }
}
visit(metadata);

process.stdout.write(JSON.stringify({
  createdAt: metadata.createdAt,
  host: metadata.source.host,
  database: metadata.source.database,
  sourceId: metadata.source.id,
  supabaseCli: metadata.tooling.supabaseCli,
}));
NODE
metadata_summary="$?"
[[ "${metadata_summary}" -eq 0 ]] || fail 'Conteúdo do backup não passou pela validação estrutural.'

safe_summary="$(node - "${backup_dir}/METADATA.json" <<'NODE'
const fs = require('node:fs');
const metadata = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.stdout.write(`${metadata.createdAt}\t${metadata.source.host}\t${metadata.source.database}\t${metadata.source.id}`);
NODE
)"
IFS=$'\t' read -r created_at source_host source_database source_id <<< "${safe_summary}"

printf 'Backup verificado com sucesso.\n'
printf 'Criado em: %s\n' "${created_at}"
printf 'Origem segura: %s/%s\n' "${source_host}" "${source_database}"
printf 'Identificador: %s\n' "${source_id}"
