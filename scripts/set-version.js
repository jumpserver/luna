#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// Get version from environment variable or command line argument
const versionInput = process.env.VERSION || process.argv[2];
if (!versionInput) {
  console.error("Error: VERSION environment variable or version argument is required");
  process.exit(1);
}

// Remove 'v' prefix if present, then remove '-rcN' suffix
let version = versionInput.replace(/^v/, "");
version = version.replace(/-rc\d+$/, "");
console.log(`Updating version to: ${version}`);

// Update package.json
const packageJsonPath = join(rootDir, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
packageJson.version = version;
writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
console.log("✓ Updated package.json");

// Update tauri.conf.json
const tauriConfPath = join(rootDir, "src-tauri", "tauri.conf.json");
const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf8"));
tauriConf.version = version;
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");
console.log("✓ Updated src-tauri/tauri.conf.json");

// Update Cargo.toml
const cargoTomlPath = join(rootDir, "src-tauri", "Cargo.toml");
let cargoToml = readFileSync(cargoTomlPath, "utf8");
cargoToml = cargoToml.replace(/^version = "[^"]*"/m, `version = "${version}"`);
writeFileSync(cargoTomlPath, cargoToml);
console.log("✓ Updated src-tauri/Cargo.toml");

// Update app.config.ts
const appConfigPath = join(rootDir, "ui", "app.config.ts");
let appConfig = readFileSync(appConfigPath, "utf8");
appConfig = appConfig.replace(/version: "[^"]*"/, `version: "${version}"`);
writeFileSync(appConfigPath, appConfig);
console.log("✓ Updated ui/app.config.ts");

console.log("✓ Version updated successfully");
