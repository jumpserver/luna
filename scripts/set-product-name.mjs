import fs from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const args = argv.slice(2)
  let name
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--name' || a === '-n') {
      name = args[i + 1]
      i++
      continue
    }
    if (a.startsWith('--name=')) {
      name = a.slice('--name='.length)
      continue
    }
  }
  return { name }
}

const { name: rawName } = parseArgs(process.argv)
const name = (rawName || process.env.CLIENT_NAME || '').trim()

if (!name) {
  console.error('Missing --name "<ProductName>" (or CLIENT_NAME).')
  process.exit(2)
}

const repoRoot = process.cwd()
const confPath = path.join(repoRoot, 'src-tauri', 'tauri.conf.json')
const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'))

conf.productName = name

fs.writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n')
console.log(`Set src-tauri/tauri.conf.json productName to "${name}".`)

