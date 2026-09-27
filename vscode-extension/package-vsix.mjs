import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const extensionDir = path.dirname(fileURLToPath(import.meta.url))
function run(args) {
  if (process.platform === 'win32') {
    execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm', ...args], {
      cwd: extensionDir,
      stdio: 'inherit',
    })
  } else {
    execFileSync('pnpm', args, { cwd: extensionDir, stdio: 'inherit' })
  }
}

run(['run', 'build'])

const manifest = JSON.parse(await readFile(path.join(extensionDir, 'package.json'), 'utf8'))
const iconPath = path.join(extensionDir, manifest.icon)
const icon = await readFile(iconPath)
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
if (icon.length < pngSignature.length || !pngSignature.every((byte, index) => icon[index] === byte)) {
  throw new Error(`Extension icon is missing or is not a valid PNG: ${iconPath}`)
}

const filename = `${manifest.name}-${manifest.version}.vsix`
const output = path.join('dist', filename)
run([
  'exec', 'vsce', 'package',
  '--no-dependencies',
  '--allow-missing-repository',
  '--skip-license',
  '--out', output,
])

console.log(`Packaged Graph Model Studio v${manifest.version} with icon: ${output}`)
