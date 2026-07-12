const fs = require('fs');
const path = require('path');
const vm = require('vm');

const migrationPath = path.join(
  process.cwd(),
  'scripts',
  'apply-player-core-reliability.cjs',
);

let code = fs.readFileSync(migrationPath, 'utf8');

// O arquivo de migração contém uma representação textual de um template
// TypeScript. Normalizamos somente o escape duplicado de crase nessa amostra.
const duplicatedEscape = '\\\\' + '`';
const validEscape = '\\' + '`';
code = code.split(duplicatedEscape).join(validEscape);

new vm.Script(code, {
  filename: migrationPath,
}).runInThisContext();
