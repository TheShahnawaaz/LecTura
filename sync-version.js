import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, 'package.json');
const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');

try {
  // 1. Read version from package.json
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = packageJson.version;
  console.log(`[Version Sync] Source of truth version (package.json): ${version}`);

  // 2. Sync to Cargo.toml
  let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
  const updatedCargoToml = cargoToml.replace(/^version\s*=\s*".*"/m, `version = "${version}"`);
  
  if (cargoToml !== updatedCargoToml) {
    fs.writeFileSync(cargoTomlPath, updatedCargoToml, 'utf8');
    console.log(`[Version Sync] Updated Cargo.toml version to: ${version}`);
  } else {
    console.log(`[Version Sync] Cargo.toml is already up-to-date.`);
  }
} catch (err) {
  console.error(`[Version Sync] Failed to synchronize versions: ${err.message}`);
  process.exit(1);
}
