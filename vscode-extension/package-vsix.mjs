import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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

function runNpm(args, cwd) {
  if (process.platform === 'win32') {
    execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm', ...args], { cwd, stdio: 'inherit' })
  } else {
    execFileSync('npm', args, { cwd, stdio: 'inherit' })
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
const vendor = path.join(extensionDir, 'integrations', 'slides', 'vendor')
await rm(vendor, { recursive: true, force: true })
await mkdir(vendor, { recursive: true })
await writeFile(path.join(vendor, 'package.json'), JSON.stringify({ private: true }, null, 2))

try {
  const presentationPackage = path.resolve(extensionDir, '..', '..', 'presentation-md')
  runNpm([
    'install', '--omit=dev', '--ignore-scripts', '--install-links',
    `@pptxascode/presentation-md@file:${presentationPackage}`,
  ], vendor)
  run([
    'exec', 'vsce', 'package',
    '--no-dependencies',
    '--allow-missing-repository',
    '--skip-license',
    '--out', output,
  ])
} finally {
  await rm(vendor, { recursive: true, force: true })
}

console.log(`Packaged Graph Model Studio v${manifest.version} with icon: ${output}`)
