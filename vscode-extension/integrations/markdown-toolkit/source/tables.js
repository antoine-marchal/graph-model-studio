'use strict'

function splitTableRow(line) {
  let value = line.trim()
  if (value.startsWith('|')) value = value.slice(1)
  if (value.endsWith('|') && !value.endsWith('\\|')) value = value.slice(0, -1)
  const cells = []
  let cell = ''
  let escaped = false
  let backticks = 0
  for (const character of value) {
    if (escaped) {
      cell += character
      escaped = false
      continue
    }
    if (character === '\\') {
      cell += character
      escaped = true
      continue
    }
    if (character === '`') {
      backticks = backticks ? 0 : 1
      cell += character
      continue
    }
    if (character === '|' && !backticks) {
      cells.push(cell.trim())
      cell = ''
      continue
    }
    cell += character
  }
  cells.push(cell.trim())
  return cells
}

function isSeparatorRow(line) {
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))
}

function formatTableLines(lines) {
  if (lines.length < 2 || !isSeparatorRow(lines[1])) return lines
  const rows = lines.map(splitTableRow)
  const columns = Math.max(...rows.map(row => row.length))
  const alignments = Array.from({ length: columns }, (_, index) => {
    const marker = (rows[1][index] || '---').replace(/\s/g, '')
    return { left: marker.startsWith(':'), right: marker.endsWith(':') }
  })
  const widths = Array.from({ length: columns }, (_, index) => Math.max(
    3 + Number(alignments[index].left) + Number(alignments[index].right),
    ...rows.filter((_row, rowIndex) => rowIndex !== 1).map(row => (row[index] || '').length),
  ))
  return rows.map((row, rowIndex) => {
    const cells = Array.from({ length: columns }, (_, index) => {
      if (rowIndex === 1) {
        const alignment = alignments[index]
        const dashCount = Math.max(3, widths[index] - Number(alignment.left) - Number(alignment.right))
        return `${alignment.left ? ':' : ''}${'-'.repeat(dashCount)}${alignment.right ? ':' : ''}`
          .padEnd(widths[index], '-')
      }
      return (row[index] || '').padEnd(widths[index], ' ')
    })
    return `| ${cells.join(' | ')} |`
  })
}

function formatMarkdownTables(markdown) {
  const lines = markdown.split(/\r?\n/)
  const output = []
  for (let index = 0; index < lines.length;) {
    if (index + 1 < lines.length && lines[index].includes('|') && isSeparatorRow(lines[index + 1])) {
      let end = index + 2
      while (end < lines.length && lines[end].includes('|') && lines[end].trim()) end++
      output.push(...formatTableLines(lines.slice(index, end)))
      index = end
    } else {
      output.push(lines[index++])
    }
  }
  return output.join('\n')
}

module.exports = { formatMarkdownTables, formatTableLines, isSeparatorRow, splitTableRow }
