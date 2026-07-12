const fs = require('fs');
const path = require('path');

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

const executeMigration = new Function(
  'require',
  'process',
  'console',
  `${code}\n//# sourceURL=${migrationPath}`,
);

executeMigration(require, process, console);
