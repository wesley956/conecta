import fs from 'node:fs';

const migrationsDirectory = 'supabase/migrations';
const migrationFilePattern = /^(\d+)_([a-z0-9][a-z0-9_]*)\.sql$/;
const migrationFiles = fs
  .readdirSync(migrationsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
  .map((entry) => entry.name)
  .sort();

const invalidNames = migrationFiles.filter((file) => !migrationFilePattern.test(file));
if (invalidNames.length > 0) {
  throw new Error(
    `Migrations com nome inválido: ${invalidNames.join(', ')}. `
      + 'Use <versão_numérica>_<nome_descritivo>.sql.',
  );
}

const filesByVersion = new Map();
for (const file of migrationFiles) {
  const [, version] = file.match(migrationFilePattern);
  const files = filesByVersion.get(version) ?? [];
  files.push(file);
  filesByVersion.set(version, files);
}

const duplicateVersions = [...filesByVersion.entries()]
  .filter(([, files]) => files.length > 1)
  .map(([version, files]) => `${version}: ${files.join(', ')}`);

if (duplicateVersions.length > 0) {
  throw new Error(
    `Versões de migration duplicadas:\n${duplicateVersions.join('\n')}`,
  );
}

console.log(`✅ ${migrationFiles.length} migrations com versões únicas.`);
