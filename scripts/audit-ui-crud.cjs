const fs = require('fs');
const path = require('path');

const roots = ['src/screens', 'src/admin', 'src/components'];
const files = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;

  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) walk(full);
    else if (/\.(tsx|ts)$/.test(full)) files.push(full);
  }
}

for (const root of roots) walk(root);

const buttonRows = [];
const suspicious = [];

const crudWords = /(Adicionar|Novo|Nova|Editar|Salvar|Remover|Excluir|Deletar|Liberar|Rejeitar|Cancelar|Testar|Sincronizar|Renovar|Limpar|Importar|Ativar|Desativar|Entrar|Solicitar|Tentar)/i;
const noopWords = /(em breve|próxima fase|TODO|FIXME|console\.log|alert\(|não foi implementado)/i;

function stripTags(s) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{[^}]+\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  const buttonRegex = /<button\b[\s\S]*?<\/button>/g;
  let match;

  while ((match = buttonRegex.exec(text))) {
    const block = match[0];
    const before = text.slice(0, match.index);
    const line = before.split(/\r?\n/).length;
    const label = stripTags(block) || '(sem texto detectado)';
    const hasOnClick = /\bonClick\s*=/.test(block);
    const hasType = /\btype\s*=/.test(block);
    const disabled = /\bdisabled\s*=/.test(block);
    const isCrud = crudWords.test(label) || crudWords.test(block);

    buttonRows.push({
      file,
      line,
      label,
      hasOnClick,
      hasType,
      disabled,
      isCrud,
    });

    if (isCrud && !hasOnClick && !/type=["']submit["']/.test(block)) {
      suspicious.push({
        type: 'BOTÃO_DE_AÇÃO_SEM_ONCLICK',
        file,
        line,
        label,
      });
    }
  }

  lines.forEach((lineText, i) => {
    if (noopWords.test(lineText) && !lineText.includes('Xtream/Stalker entram em uma próxima fase')) {
      suspicious.push({
        type: 'PLACEHOLDER_OU_AÇÃO_FALSA',
        file,
        line: i + 1,
        label: lineText.trim().slice(0, 160),
      });
    }
  });
}

const storePath = 'src/stores/appStore.ts';
let storeActions = [];

if (fs.existsSync(storePath)) {
  const storeText = fs.readFileSync(storePath, 'utf8');
  const candidates = storeText.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*(?:async\s*)?\([^)]*\)\s*=>/g) || [];
  storeActions = candidates.map(s => s.split(':')[0].trim()).sort();
}

const report = [];

report.push('# Auditoria QA / CRUD / Botões');
report.push('');
report.push(`Arquivos analisados: ${files.length}`);
report.push(`Botões encontrados: ${buttonRows.length}`);
report.push(`Botões de ação/CRUD encontrados: ${buttonRows.filter(b => b.isCrud).length}`);
report.push(`Suspeitas encontradas: ${suspicious.length}`);
report.push('');

report.push('## Actions detectadas no appStore');
report.push('');

if (storeActions.length) {
  for (const action of storeActions) report.push(`- ${action}`);
} else {
  report.push('- Nenhuma action detectada automaticamente.');
}

report.push('');
report.push('## Botões de ação/CRUD');
report.push('');

for (const b of buttonRows.filter(b => b.isCrud)) {
  report.push(`- ${b.file}:${b.line} | onClick=${b.hasOnClick ? 'SIM' : 'NÃO'} | disabled=${b.disabled ? 'SIM' : 'NÃO'} | ${b.label}`);
}

report.push('');
report.push('## Suspeitas / pontos para corrigir ou testar');
report.push('');

if (!suspicious.length) {
  report.push('- Nenhuma suspeita automática encontrada.');
} else {
  for (const s of suspicious) {
    report.push(`- [${s.type}] ${s.file}:${s.line} | ${s.label}`);
  }
}

report.push('');
report.push('## Todos os botões mapeados');
report.push('');

for (const b of buttonRows) {
  report.push(`- ${b.file}:${b.line} | onClick=${b.hasOnClick ? 'SIM' : 'NÃO'} | ${b.label}`);
}

fs.writeFileSync('AUDIT_QA_PRELIMINAR.md', report.join('\n'));

console.log('Relatório gerado: AUDIT_QA_PRELIMINAR.md');
console.log(`Arquivos analisados: ${files.length}`);
console.log(`Botões encontrados: ${buttonRows.length}`);
console.log(`Suspeitas: ${suspicious.length}`);

if (suspicious.length) {
  console.log('');
  console.log('===== PRIMEIRAS SUSPEITAS =====');
  for (const s of suspicious.slice(0, 120)) {
    console.log(`${s.type} | ${s.file}:${s.line} | ${s.label}`);
  }
}
