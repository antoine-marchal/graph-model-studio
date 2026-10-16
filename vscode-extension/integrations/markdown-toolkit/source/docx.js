'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { unzipSync, zipSync, strFromU8, strToU8 } = require('fflate')

/**
 * DOCX export helpers: Markdown Studio constructs Pandoc's Markdown reader
 * doesn't map on its own, and a reference document carrying the styles they
 * use (so the result looks right without a user template).
 *
 *   columns  `<div class="ms-columns">` / `<div class="ms-column">` → one-row
 *            borderless table ("Columns" table style), one cell per column
 *   align    `<div align="center|right">` → "Center" / "Right" paragraph styles
 *   mark     `<mark data-color>` → "Highlight <Color>" character styles
 *   HTML     raw HTML blocks and inline tag pairs are re-read with Pandoc's
 *            HTML reader instead of being dropped; comments are dropped
 */

/** Notion palette tints (editor.css), as Word shading. */
const HIGHLIGHTS = {
  yellow: 'FBF3DB', red: 'FDEBEC', orange: 'FBECDD', green: 'EDF3EC',
  blue: 'E7F3F8', purple: 'F4F0F7', pink: 'FAF1F5', gray: 'F1F1EF',
}

const capitalize = word => word[0].toUpperCase() + word.slice(1)

const LUA_FILTER = String.raw`
local HTML = 'html'

local function is_html(el) return el.format:match('html') ~= nil end

local function read_html(text)
  local ok, doc = pcall(pandoc.read, text, HTML)
  if ok then return doc.blocks end
  return pandoc.Blocks({})
end

function RawBlock(el)
  if not is_html(el) then return nil end
  if el.text:match('^%s*<!%-%-') then return {} end
  return read_html(el.text)
end

local VOID = { br = true, img = true, wbr = true, hr = true, input = true }
local convert_inlines

local function wrap(tag, open, inner)
  tag = tag:lower()
  if tag == 'mark' then
    local color = open:match('data%-color%s*=%s*["\']?(%a+)') or 'yellow'
    return { pandoc.Span(inner, { ['custom-style'] = 'Highlight ' .. color:sub(1, 1):upper() .. color:sub(2):lower() }) }
  elseif tag == 'sub' then return { pandoc.Subscript(inner) }
  elseif tag == 'sup' then return { pandoc.Superscript(inner) }
  elseif tag == 'u' or tag == 'ins' then return { pandoc.Underline(inner) }
  elseif tag == 's' or tag == 'del' or tag == 'strike' then return { pandoc.Strikeout(inner) }
  elseif tag == 'b' or tag == 'strong' then return { pandoc.Strong(inner) }
  elseif tag == 'i' or tag == 'em' then return { pandoc.Emph(inner) }
  elseif tag == 'kbd' or tag == 'code' or tag == 'samp' then return { pandoc.Code(pandoc.utils.stringify(inner)) }
  elseif tag == 'a' then
    local href = open:match('href%s*=%s*"([^"]*)"') or open:match("href%s*=%s*'([^']*)'")
    if href then return { pandoc.Link(inner, href) } end
  end
  return inner
end

convert_inlines = function(inlines)
  local out = pandoc.Inlines({})
  local i = 1
  while i <= #inlines do
    local el = inlines[i]
    if el.t == 'RawInline' and is_html(el) then
      local tag = el.text:match('^<(%a[%w-]*)')
      if tag and VOID[tag:lower()] then
        if tag:lower() == 'br' then out:insert(pandoc.LineBreak())
        else out:extend(pandoc.utils.blocks_to_inlines(read_html(el.text))) end
        i = i + 1
      elseif tag then
        local depth, j = 0, i + 1
        while j <= #inlines do
          local e = inlines[j]
          if e.t == 'RawInline' and is_html(e) then
            local name = e.text:match('^<(/?%a[%w-]*)')
            if name and name:lower() == tag:lower() then depth = depth + 1
            elseif name and name:lower() == '/' .. tag:lower() then
              if depth == 0 then break end
              depth = depth - 1
            end
          end
          j = j + 1
        end
        if j <= #inlines then
          local inner = pandoc.Inlines({})
          for k = i + 1, j - 1 do inner:insert(inlines[k]) end
          out:extend(wrap(tag, el.text, convert_inlines(inner)))
          i = j + 1
        else
          i = i + 1
        end
      else
        i = i + 1
      end
    else
      out:insert(el)
      i = i + 1
    end
  end
  return out
end

function Inlines(inlines) return convert_inlines(inlines) end

local ALERTS = { NOTE = 'Note', TIP = 'Tip', IMPORTANT = 'Important', WARNING = 'Warning', CAUTION = 'Caution' }

-- GitHub alerts: '> [!NOTE]' → bold "Note" label.
function BlockQuote(el)
  local first = el.content[1]
  if not first or (first.t ~= 'Para' and first.t ~= 'Plain') or not first.content[1] then return nil end
  local marker = first.content[1].t == 'Str' and first.content[1].text:match('^%[!(%u+)%]$')
  if not marker or not ALERTS[marker] then return nil end
  first.content:remove(1)
  while first.content[1] and (first.content[1].t == 'Space' or first.content[1].t == 'SoftBreak') do
    first.content:remove(1)
  end
  first.content:insert(1, pandoc.Strong(ALERTS[marker]))
  if #first.content > 1 then first.content:insert(2, pandoc.LineBreak()) end
  return el
end

function Div(el)
  if el.classes:includes('ms-columns') then
    local columns = {}
    for _, block in ipairs(el.content) do
      if block.t == 'Div' and block.classes:includes('ms-column') then
        table.insert(columns, block.content)
      end
    end
    if #columns == 0 then return el.content end
    local specs, cells = {}, {}
    for k, blocks in ipairs(columns) do
      specs[k] = { pandoc.AlignDefault, 1 / #columns }
      cells[k] = pandoc.Cell(blocks)
    end
    local body = { attr = pandoc.Attr(), head = {}, body = { pandoc.Row(cells) }, row_head_columns = 0 }
    return pandoc.Table({ long = {} }, specs, pandoc.TableHead(), { body }, pandoc.TableFoot(),
      pandoc.Attr('', {}, { ['custom-style'] = 'Columns' }))
  end
  local align = el.attributes.align
  if align == 'center' or align == 'right' then
    el.attributes.align = nil
    el.attributes['custom-style'] = align == 'center' and 'Center' or 'Right'
    return el
  end
end
`

/** Pandoc reader: Markdown with the GitHub behaviours the editor writes. */
const PANDOC_FROM = [
  'markdown',
  '+gfm_auto_identifiers',
  '+lists_without_preceding_blankline',
  '+autolink_bare_uris',
  '+emoji',
  '-implicit_figures',
  '-smart',
].join('')

function compact(xml) {
  return xml.replace(/^\s+/gm, '')
}

/** Styles the filter refers to; `plainTables` also grids the default "Table". */
function patchStyles(styles, plainTables) {
  const has = id => new RegExp(`w:styleId="${id}"`).test(styles)
  const added = []
  if (!has('Columns')) added.push(compact(`
    <w:style w:type="table" w:customStyle="1" w:styleId="Columns">
      <w:name w:val="Columns"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="99"/>
      <w:tblPr><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>
      <w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="240" w:type="dxa"/></w:tblCellMar></w:tblPr>
      <w:tcPr><w:vAlign w:val="top"/></w:tcPr>
    </w:style>`))
  for (const [id, jc] of [['Center', 'center'], ['Right', 'right']]) {
    if (!has(id)) added.push(compact(`
      <w:style w:type="paragraph" w:customStyle="1" w:styleId="${id}">
        <w:name w:val="${id}"/><w:basedOn w:val="${has('BodyText') ? 'BodyText' : 'Normal'}"/><w:qFormat/>
        <w:pPr><w:jc w:val="${jc}"/></w:pPr>
      </w:style>`))
  }
  for (const [color, fill] of Object.entries(HIGHLIGHTS)) {
    const id = `Highlight${capitalize(color)}`
    if (!has(id)) added.push(compact(`
      <w:style w:type="character" w:customStyle="1" w:styleId="${id}">
        <w:name w:val="Highlight ${capitalize(color)}"/><w:basedOn w:val="DefaultParagraphFont"/>
        <w:rPr><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/></w:rPr>
      </w:style>`))
  }
  let result = styles.replace('</w:styles>', `${added.join('')}</w:styles>`)
  if (plainTables) {
    // Pandoc's default "Table" has no grid: data tables read better with one.
    result = result.replace(
      /(<w:style [^>]*w:styleId="Table"[^>]*>[\s\S]*?<w:tblPr>)/,
      '$1<w:tblBorders><w:top w:val="single" w:sz="4" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideH w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideV w:val="single" w:sz="4" w:color="BFBFBF"/></w:tblBorders>',
    ).replace(
      /(<w:style [^>]*w:styleId="Table"[\s\S]*?<w:tblStylePr w:type="firstRow">\s*)/,
      '$1<w:rPr><w:b/></w:rPr>',
    ).replace(
      /(<w:style [^>]*w:styleId="Table"[\s\S]*?<w:tblStylePr w:type="firstRow">[\s\S]*?<w:tcPr>)/,
      '$1<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>',
    )
  }
  return result
}

/**
 * Reference DOCX for Pandoc in `directory`: the user's template (or Pandoc's
 * default one) with the styles above added when missing.
 */
async function prepareReferenceDoc(pandoc, template, directory, run) {
  let source = template
  if (!source) {
    source = path.join(directory, 'pandoc-default-reference.docx')
    await run(pandoc, ['-o', source, '--print-default-data-file', 'reference.docx'])
  }
  const files = unzipSync(fs.readFileSync(source))
  files['word/styles.xml'] = strToU8(patchStyles(strFromU8(files['word/styles.xml']), !template))
  const target = path.join(directory, 'reference.docx')
  fs.writeFileSync(target, zipSync(files))
  return target
}

function writeDocxFilter(directory) {
  const file = path.join(directory, 'markdown-studio.lua')
  fs.writeFileSync(file, LUA_FILTER, 'utf8')
  return file
}

module.exports = { PANDOC_FROM, LUA_FILTER, patchStyles, prepareReferenceDoc, writeDocxFilter }
