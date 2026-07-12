const fs = require('fs');
const path = require('path');

const migrationFiles = [
  'apply-player-core-reliability.cjs',
  'apply-player-core-polish.cjs',
];

for (const fileName of migrationFiles) {
  const migrationPath = path.join(
    process.cwd(),
    'scripts',
    fileName,
  );

  let code = fs.readFileSync(migrationPath, 'utf8');

  // Uma migração contém uma representação textual de um template TypeScript.
  // Normalizamos somente o escape duplicado de crase nessa amostra.
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
}
