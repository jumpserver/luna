#!/usr/bin/env node

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

const versionInput = process.env.VERSION || process.argv[2];
const target = process.env.RELEASE_TARGET || "client";
if (!["client", "weblite"].includes(target)) {
  console.error("Error: RELEASE_TARGET must be client or weblite");
  process.exit(1);
}

// Product prefixes identify releases; package versions and filenames stay SemVer.
const prefix = `${target}-v`;
const version = versionInput?.startsWith(prefix)
  ? versionInput.slice(prefix.length)
  : (versionInput || "").replace(/^v/, "");
const match = version.match(
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
);
if (!match || match[4]?.split(".").some((part) => /^0\d+$/.test(part))) {
  console.error(`Error: expected a SemVer version or ${target}-v<version> tag`);
  process.exit(1);
}

const packagePaths = target === "client" ? ["package.json", "electron/package.json"] : ["applets/weblite/package.json"];
for (const relativePath of packagePaths) {
  const packagePath = join(rootDir, relativePath);
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  packageJson.version = version;
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

if (target === "client") {
  const appConfigPath = join(rootDir, "ui", "app.config.ts");
  const appConfig = readFileSync(appConfigPath, "utf8");
  writeFileSync(appConfigPath, appConfig.replace(/version: "[^"]*"/, `version: "${version}"`));
}

const tag = `${target}-v${version}`;
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `target=${target}\nversion=${version}\ntag=${tag}\n`);
}
console.log(`Updated ${target} to ${version} (${tag})`);
