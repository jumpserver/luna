import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_PRODUCT_NAME = 'JumpServerClient';
const DEFAULT_PUBLISHER = 'jumpserver';
const CUSTOM_PUBLISHER = 'sangfor';

function parseArgs(argv) {
  const args = argv.slice(2);
  let name;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--name' || a === '-n') {
      name = args[i + 1];
      i++;
      continue;
    }
    if (a.startsWith('--name=')) {
      name = a.slice('--name='.length);
      continue;
    }
  }
  return { name };
}

const { name: rawName } = parseArgs(process.argv);
const name = (rawName || process.env.CLIENT_NAME || '').trim();

if (!name) {
  console.error('Missing --name "<ProductName>" (or CLIENT_NAME).');
  process.exit(2);
}

const repoRoot = process.cwd();
const confPath = path.join(repoRoot, 'src-tauri', 'tauri.conf.json');
const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));

conf.productName = name;
// Windows uses bundle.publisher as the publisher shown in "Programs and Features".
// Keep the upstream publisher for JumpServerClient and use Sangfor for custom builds such as OSMClient.
conf.bundle.publisher = name === DEFAULT_PRODUCT_NAME ? DEFAULT_PUBLISHER : CUSTOM_PUBLISHER;

fs.writeFileSync(confPath, `${JSON.stringify(conf, null, 2)}\n`);
console.log(
  `Set src-tauri/tauri.conf.json productName to "${name}" and publisher to "${conf.bundle.publisher}".`
);
