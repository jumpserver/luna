import fs from 'node:fs';
import path from 'node:path';

const iconFiles = [
  '32x32.png',
  '128x128.png',
  '128x128@2x.png',
  'icon-appimage.png',
  'icon.icns',
  'icon.ico',
  'icon.png',
  'icon3.png',
  'tray-mac.png'
];

function parseArgs(argv) {
  const args = argv.slice(2);
  let dir;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dir' || arg === '-d') {
      dir = args[i + 1];
      i++;
      continue;
    }
    if (arg.startsWith('--dir=')) {
      dir = arg.slice('--dir='.length);
    }
  }

  return { dir };
}

function firstExisting(paths) {
  return paths.find((candidate) => fs.existsSync(candidate));
}

function copyIfPresent(sourceCandidates, target) {
  const source = firstExisting(sourceCandidates);
  if (!source) {
    return false;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`Applied brand asset: ${source} -> ${target}`);
  return true;
}

const { dir: dirFromArgs } = parseArgs(process.argv);
const sourceDir = path.resolve((dirFromArgs || process.env.CLIENT_BRAND_ASSETS_DIR || '').trim());

if (!sourceDir || !fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
  console.error('Missing brand asset directory. Provide --dir "<path>" or CLIENT_BRAND_ASSETS_DIR.');
  process.exit(2);
}

const repoRoot = process.cwd();
let copied = 0;

if (copyIfPresent(
  [
    path.join(sourceDir, 'public', 'logo.png'),
    path.join(sourceDir, 'logo.png')
  ],
  path.join(repoRoot, 'public', 'logo.png')
)) {
  copied++;
}

for (const file of iconFiles) {
  if (copyIfPresent(
    [
      path.join(sourceDir, 'src-tauri', 'icons', file),
      path.join(sourceDir, 'icons', file),
      path.join(sourceDir, file)
    ],
    path.join(repoRoot, 'src-tauri', 'icons', file)
  )) {
    copied++;
  }
}

if (copied === 0) {
  console.error(`No brand assets found in ${sourceDir}.`);
  process.exit(2);
}

console.log(`Applied ${copied} brand asset(s).`);
