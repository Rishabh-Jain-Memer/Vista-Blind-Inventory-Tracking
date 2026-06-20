import fs from 'node:fs/promises'
import path from 'node:path'
import { Buffer } from 'node:buffer'

const CONFIG_PATH = path.resolve('js', 'config.js')
const OUTPUT_DIR = path.resolve('exports')
const PAGE_SIZE = Number(process.env.EXPORT_PAGE_SIZE || 1000)
const EXPORT_DATE = new Date()
const DATE_STAMP = EXPORT_DATE.toISOString().replace(/[:.]/g, '-').slice(0, 19)
const OUTPUT_FILE = path.join(OUTPUT_DIR, `vista_supabase_backup_${DATE_STAMP}.xlsx`)

const PUBLIC_TABLES = [
  'profiles',
  'customers',
  'suppliers',
  'inv_categories',
  'inv_products',
  'inv_variants',
  'inv_rolls',
  'inv_movements',
  'fg_stock',
  'product_codes',
  'product_recipes',
  'recipe_items',
  'rrp_entries',
  'orders',
  'order_items',
  'order_components',
  'wastage_logs',
  'execution_logs',
  'activity_logs',
  'order_tickets',
  'order_ticket_followups',
  'order_quote_forms',
  'order_quote_downloads',
  'stock_orders',
  'stock_order_items',
  'stock_order_downloads',
]

function readConfigValue(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*['"]([^'"]+)['"]`))
  return match ? match[1] : ''
}

async function loadConfig() {
  const source = await fs.readFile(CONFIG_PATH, 'utf8')
  return {
    url: process.env.SUPABASE_URL || readConfigValue(source, 'SUPABASE_URL') || readConfigValue(source, 'LIVE_SUPABASE_URL'),
    anonKey: process.env.SUPABASE_ANON_KEY || readConfigValue(source, 'SUPABASE_ANON_KEY') || readConfigValue(source, 'LIVE_SUPABASE_ANON_KEY'),
  }
}

function getAccess(config) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''
  const userJwt = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_JWT || ''
  const bearer = serviceKey || userJwt || config.anonKey
  const apikey = serviceKey || config.anonKey
  return {
    bearer,
    apikey,
    hasServiceKey: Boolean(serviceKey),
    mode: serviceKey ? 'service_role' : userJwt ? 'authenticated_jwt' : 'anon',
  }
}

function authHeaders(access, extra = {}) {
  return {
    apikey: access.apikey,
    Authorization: `Bearer ${access.bearer}`,
    ...extra,
  }
}

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers })
  const text = await res.text()
  if (!res.ok) {
    let message = text
    try {
      const body = JSON.parse(text)
      message = body.message || body.error_description || body.error || text
    } catch {}
    const err = new Error(`${res.status} ${res.statusText}: ${message}`)
    err.status = res.status
    err.body = text
    throw err
  }
  if (!text.trim()) return null
  return { data: JSON.parse(text), headers: res.headers }
}

async function fetchTable(config, access, table) {
  const rows = []
  let from = 0
  let total = null
  while (true) {
    const to = from + PAGE_SIZE - 1
    const url = `${config.url}/rest/v1/${encodeURIComponent(table)}?select=*`
    const headers = authHeaders(access, {
      Prefer: 'count=exact',
      Range: `${from}-${to}`,
      'Range-Unit': 'items',
    })
    const { data: page, headers: responseHeaders } = await fetchJson(url, headers)
    rows.push(...(Array.isArray(page) ? page : []))
    const contentRange = responseHeaders.get('content-range')
    if (contentRange) {
      const match = contentRange.match(/\/(\d+|\*)$/)
      if (match && match[1] !== '*') total = Number(match[1])
    }
    if (!Array.isArray(page) || page.length < PAGE_SIZE) break
    from += PAGE_SIZE
    if (total !== null && rows.length >= total) break
  }
  return rows
}

async function fetchAuthUsers(config, access) {
  if (!access.hasServiceKey) return { rows: [], skipped: 'SUPABASE_SERVICE_ROLE_KEY not provided' }
  const rows = []
  for (let page = 1; ; page += 1) {
    const url = `${config.url}/auth/v1/admin/users?page=${page}&per_page=1000`
    const { data: body } = await fetchJson(url, authHeaders(access))
    const users = Array.isArray(body?.users) ? body.users : []
    rows.push(...users)
    if (users.length < 1000) break
  }
  return { rows, skipped: '' }
}

function flattenValue(value) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  return value
}

function columnsFor(rows) {
  const columns = []
  const seen = new Set()
  for (const row of rows) {
    for (const key of Object.keys(row || {})) {
      if (!seen.has(key)) {
        seen.add(key)
        columns.push(key)
      }
    }
  }
  return columns
}

function rowsForSheet(rows) {
  const columns = columnsFor(rows)
  if (!columns.length) return [['No exported rows']]
  return [columns, ...rows.map(row => columns.map(col => flattenValue(row[col])))]
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r?\n/g, '&#10;')
}

function colName(index) {
  let n = index + 1
  let name = ''
  while (n > 0) {
    const r = (n - 1) % 26
    name = String.fromCharCode(65 + r) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

function cellXml(value, rowIndex, colIndex, isHeader) {
  const ref = `${colName(colIndex)}${rowIndex + 1}`
  const style = isHeader ? ' s="1"' : ''
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`
  if (typeof value === 'boolean') return `<c r="${ref}" t="b"${style}><v>${value ? 1 : 0}</v></c>`
  return `<c r="${ref}" t="inlineStr"${style}><is><t>${xmlEscape(value ?? '')}</t></is></c>`
}

function sheetXml(rows) {
  const maxCols = Math.max(1, ...rows.map(row => row.length))
  const cols = Array.from({ length: maxCols }, (_, i) => {
    const maxLen = Math.max(...rows.slice(0, 1000).map(row => String(row[i] ?? '').length), 8)
    const width = Math.min(Math.max(maxLen + 2, 10), 55)
    return `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`
  }).join('')
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((value, colIndex) => cellXml(value, rowIndex, colIndex, rowIndex === 0)).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${cols}</cols>
  <sheetData>${body}</sheetData>
</worksheet>`
}

function workbookXml(sheets) {
  const sheetRefs = sheets.map((sheet, i) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetRefs}</sheets>
</workbook>`
}

function workbookRelsXml(sheets) {
  const sheetRels = sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRels}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
}

function contentTypesXml(sheets) {
  const sheetTypes = sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheetTypes}
</Types>`
}

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE9EDF5"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

function crc32(buf) {
  let crc = 0xffffffff
  for (const byte of buf) {
    crc ^= byte
    for (let k = 0; k < 8; k += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u16(n) {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(n)
  return b
}

function u32(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n >>> 0)
  return b
}

function zipFile(entries) {
  const localParts = []
  const centralParts = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const data = Buffer.from(entry.data, 'utf8')
    const crc = crc32(data)
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc),
      u32(data.length), u32(data.length), u16(name.length), u16(0), name, data,
    ])
    localParts.push(local)
    centralParts.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc),
      u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0),
      u16(0), u32(0), u32(offset), name,
    ]))
    offset += local.length
  }
  const central = Buffer.concat(centralParts)
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(central.length), u32(offset), u16(0),
  ])
  return Buffer.concat([...localParts, central, end])
}

async function writeWorkbook(filePath, sheets) {
  const entries = [
    { name: '[Content_Types].xml', data: contentTypesXml(sheets) },
    { name: '_rels/.rels', data: ROOT_RELS_XML },
    { name: 'xl/workbook.xml', data: workbookXml(sheets) },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml(sheets) },
    { name: 'xl/styles.xml', data: STYLES_XML },
    ...sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sheet.rows) })),
  ]
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, zipFile(entries))
}

function makeSummary(exportMeta, tableResults, errors) {
  return [
    ['Vista Blind Tracking Supabase Export'],
    ['Exported at', exportMeta.exportedAt],
    ['Supabase URL', exportMeta.url],
    ['Access mode', exportMeta.mode],
    [''],
    ['Table', 'Rows exported', 'Status'],
    ...tableResults.map(result => [result.table, result.rows.length, result.error ? result.error : 'ok']),
    ...errors.map(error => [error.table, 0, error.error]),
  ]
}

async function main() {
  const config = await loadConfig()
  const access = getAccess(config)
  if (!config.url || !access.apikey || !access.bearer) {
    throw new Error('Missing Supabase URL/key. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or keep js/config.js available.')
  }

  const tableResults = []
  const errors = []
  for (const table of PUBLIC_TABLES) {
    try {
      const rows = await fetchTable(config, access, table)
      tableResults.push({ table, rows })
      console.log(`${table}: ${rows.length}`)
    } catch (err) {
      errors.push({ table, error: err.message })
      console.error(`${table}: ${err.message}`)
    }
  }

  let authResult
  try {
    authResult = await fetchAuthUsers(config, access)
    if (authResult.skipped) console.log(`auth_users: skipped (${authResult.skipped})`)
    else console.log(`auth_users: ${authResult.rows.length}`)
  } catch (err) {
    authResult = { rows: [], skipped: err.message }
    errors.push({ table: 'auth_users', error: err.message })
    console.error(`auth_users: ${err.message}`)
  }

  const successfulReads = tableResults.length + (authResult.rows.length ? 1 : 0)
  if (!successfulReads) {
    const firstError = errors[0]?.error || authResult.skipped || 'No readable tables'
    throw new Error(`No data was exported because every table read failed. First error: ${firstError}`)
  }

  const sheets = [
    {
      name: 'README',
      rows: makeSummary(
        { exportedAt: EXPORT_DATE.toISOString(), url: config.url, mode: access.mode },
        tableResults,
        authResult.skipped ? [...errors, { table: 'auth_users', error: `skipped: ${authResult.skipped}` }] : errors,
      ),
    },
    ...tableResults.map(result => ({ name: result.table.slice(0, 31), rows: rowsForSheet(result.rows) })),
  ]
  if (authResult.rows.length) sheets.push({ name: 'auth_users', rows: rowsForSheet(authResult.rows) })
  if (errors.length) sheets.push({ name: 'EXPORT_ERRORS', rows: [['Table', 'Error'], ...errors.map(e => [e.table, e.error])] })

  await writeWorkbook(OUTPUT_FILE, sheets)
  const totalRows = tableResults.reduce((sum, result) => sum + result.rows.length, 0) + authResult.rows.length
  console.log(`Exported ${totalRows} rows to ${OUTPUT_FILE}`)
  if (errors.length) {
    console.log(`Completed with ${errors.length} table error(s). See README and EXPORT_ERRORS sheets.`)
  }
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
