import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function parseArgs(argv) {
  const args = argv.slice(2)
  let name
  const rest = []
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
    rest.push(a)
  }
  return { name, rest }
}

const { name: nameFromArgs, rest } = parseArgs(process.argv)
const name = (nameFromArgs || process.env.CLIENT_NAME || '').trim()

if (!name) {
  console.error('Missing app name. Provide --name "<YourName>" or set CLIENT_NAME.')
  process.exit(2)
}

const repoRoot = process.cwd()
const confPath = path.join(repoRoot, 'src-tauri', 'tauri.conf.json')
const raw = fs.readFileSync(confPath, 'utf8')
const conf = JSON.parse(raw)

conf.productName = name

const tmpPath = path.join(
  os.tmpdir(),
  `tauri.conf.${Date.now()}.${Math.random().toString(16).slice(2)}.json`,
)
fs.writeFileSync(tmpPath, JSON.stringify(conf, null, 2))

const result = spawnSync('pnpm', ['tauri', 'build', '--config', tmpPath, ...rest], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

try {
  fs.unlinkSync(tmpPath)
} catch {
  // ignore
}

process.exit(result.status ?? 1)

