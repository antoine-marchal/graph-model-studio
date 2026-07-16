import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

if (process.argv[2] === 'clean') {
  await rm(path.join(here, 'dist'), { recursive: true, force: true })
}
