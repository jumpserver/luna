import fs from "node:fs";
import path from "node:path";

const DEFAULT_PRODUCT_NAME = "JumpServerClient";

function parseArgs(argv) {
  const args = argv.slice(2);
  let name;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--name" || a === "-n") {
      name = args[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--name=")) {
      name = a.slice("--name=".length);
      continue;
    }
  }
  return { name };
}

const { name: rawName } = parseArgs(process.argv);
const name = (rawName || process.env.CLIENT_NAME || "").trim();

if (!name) {
  console.error('Missing --name "<ProductName>" (or CLIENT_NAME).');
  process.exit(2);
}

const repoRoot = process.cwd();
const packagePath = path.join(repoRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
packageJson.productName = name;
packageJson.build.productName = name;
packageJson.build.artifactName = `${name}_\${version}_\${arch}.\${ext}`;

fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const electronPackagePath = path.join(repoRoot, "electron", "package.json");
const electronPackageJson = JSON.parse(fs.readFileSync(electronPackagePath, "utf8"));
electronPackageJson.displayName = name;
fs.writeFileSync(electronPackagePath, `${JSON.stringify(electronPackageJson, null, 2)}\n`);
console.log(`Set Electron product name to "${name}"${name === DEFAULT_PRODUCT_NAME ? "" : " for the custom build"}.`);
