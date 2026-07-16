import { copyFile, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const extensionDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(extensionDir, '..')
const version = (await readFile(path.join(root, '.version'), 'utf8')).trim()

async function syncJsonVersion(file) {
  const document = JSON.parse(await readFile(file, 'utf8'))
  if (document.version === version) return
  document.version = version
  await writeFile(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
}

async function replaceVersion(file, pattern, label) {
  const content = await readFile(file, 'utf8')
  const updated = content.replace(pattern, (_match, prefix, suffix) => `${prefix}${version}${suffix}`)
  if (updated === content) {
    if (!pattern.test(content)) throw new Error(`Could not locate ${label} version in ${file}`)
    return
  }
  await writeFile(file, updated, 'utf8')
}

await syncJsonVersion(path.join(root, 'package.json'))
await syncJsonVersion(path.join(root, 'src-tauri', 'tauri.conf.json'))
await syncJsonVersion(path.join(extensionDir, 'package.json'))
await replaceVersion(
  path.join(root, 'src-tauri', 'Cargo.toml'),
  /(^\[package\][\s\S]*?^version\s*=\s*")[^"]+("?)/m,
  'Cargo package',
)
await replaceVersion(
  path.join(root, 'src-tauri', 'Cargo.lock'),
  /(^name\s*=\s*"graph-model-studio"\s*\r?\nversion\s*=\s*")[^"]+("?)/m,
  'Cargo lock package',
)
await copyFile(path.join(root, 'icon.png'), path.join(extensionDir, 'media', 'icon.png'))
console.log(`Synchronized Graph Model Studio, Tauri, Rust, and VSIX at v${version}`)
