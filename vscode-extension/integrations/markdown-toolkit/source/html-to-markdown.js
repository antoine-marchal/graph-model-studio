'use strict'

const TurndownService = require('turndown')
const { gfm } = require('turndown-plugin-gfm')
const { formatMarkdownTables } = require('./tables')

function normalizeTables(html) {
  return html.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, table => {
    if (/<thead\b/i.test(table)) return table
    const open = /^<table\b[^>]*>/i.exec(table)?.[0] || '<table>'
    const rows = table.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []
    if (!rows.length) return table
    const header = rows[0].replace(/<td\b/gi, '<th').replace(/<\/td>/gi, '</th>')
    return `${open}<thead>${header}</thead><tbody>${rows.slice(1).join('')}</tbody></table>`
  })
}

function cleanHtml(html) {
  let result = html
    .replace(/<!--(?:Start|End)Fragment-->/g, '')
    .replace(/<!--\[if\s[^\]]*\]>[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<\?(?:xml)[^?]*\?>/gi, '')
    .replace(/<xml\b[\s\S]*?<\/xml>/gi, '')
    .replace(/<\/?(?:o|w|m|v|st\d):[^>]*>/gi, '')
    .replace(/<(script|style|meta|link|head|iframe|object|applet|form|textarea|select|button|svg|canvas|noscript)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(meta|link)\b[^>]*>/gi, '')
    .replace(/\s+(?:class|id)=(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/\s+data-[a-z][a-z0-9-]*=(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')

  result = result
    .replace(/<(span|font)\b[^>]*style="[^"]*font-weight:\s*(?:bold|[7-9]00)[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi, '<strong>$2</strong>')
    .replace(/<(span|font)\b[^>]*style="[^"]*font-style:\s*italic[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi, '<em>$2</em>')
    .replace(/<(span|font)\b[^>]*style="[^"]*line-through[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi, '<s>$2</s>')
    .replace(/\s+style=(?:"[^"]*"|'[^']*')/gi, '')

  return normalizeTables(result)
}

let service
function getTurndown() {
  if (service) return service
  service = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
  })
  service.use(gfm)
  service.addRule('highlight', {
    filter: 'mark',
    replacement: content => content ? `==${content}==` : '',
  })
  service.addRule('fencedCodeBlock', {
    filter: node => node.nodeName === 'PRE' && node.firstChild?.nodeName === 'CODE',
    replacement: (_content, node) => {
      const codeNode = node.firstChild
      const code = codeNode.textContent || ''
      const className = codeNode.getAttribute?.('class') || ''
      const language = /(?:language-|lang-|highlight-source-)([\w+#.-]+)/.exec(className)?.[1] || ''
      const fence = code.includes('```') ? '~~~~' : '```'
      return `\n\n${fence}${language}\n${code.replace(/\n$/, '')}\n${fence}\n\n`
    },
  })
  return service
}

function htmlToMarkdown(html) {
  try {
    const markdown = getTurndown().turndown(cleanHtml(html))
      .replace(/(?:\n[ \t]*){3,}/g, '\n\n')
      .replace(/[^\S\n]+$/gm, '')
      .replace(/\\-(?!-)/g, '-')
      .trim()
    return formatMarkdownTables(markdown)
  } catch {
    return ''
  }
}

function isTrivialHtml(html) {
  const inner = html
    .replace(/^<!--StartFragment-->/, '')
    .replace(/<!--EndFragment-->$/, '')
    .trim()
    .replace(/^<(?:span|p|div)[^>]*>([\s\S]*)<\/(?:span|p|div)>$/i, '$1')
    .trim()
  return !/<[a-z][^>]*>/i.test(inner)
}

module.exports = { cleanHtml, htmlToMarkdown, isTrivialHtml, normalizeTables }
