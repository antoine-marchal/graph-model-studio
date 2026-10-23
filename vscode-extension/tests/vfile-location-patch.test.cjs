// patches/vfile-location@5.0.3.patch: same line/offset mapping, linear on CR-less text
// (rehype-parse maps every HTML node through it when the rich editor serializes a document).
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

// A transitive dependency: resolved from pnpm's hoisted store, like hast-util-from-parse5 sees it.
const vfileLocation = () => import(pathToFileURL(require.resolve('vfile-location', { paths: [path.join(__dirname, '..', 'node_modules', '.pnpm', 'node_modules')] })).href)

test('vfile-location keeps LF / CRLF / CR semantics and stays linear', async () => {
  const { location } = await vfileLocation()
  const text = 'a\nb\r\nc\rd'
  const place = location(text)
  for (const [offset, line, column] of [[0, 1, 1], [2, 2, 1], [5, 3, 1], [7, 4, 1], [8, 4, 2]]) {
    assert.deepEqual(place.toPoint(offset), { line, column, offset })
    assert.equal(place.toOffset({ line, column }), offset)
  }

  const big = 'x\n'.repeat(200_000)
  const started = performance.now()
  assert.equal(location(big).toOffset({ line: 200_000, column: 1 }), 399_998)
  // Unpatched: indexOf('\r') scans the rest of the text for each of the 200k lines (seconds).
  assert.ok(performance.now() - started < 500, 'line lookup is not linear')
})
