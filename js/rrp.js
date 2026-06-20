/*
  RRP page controller.
  Shows the retail price list for all blind families. DP is always computed as
  RRP / 2 in the app. Roller legacy columns are kept in sync for older code.
*/

let allRRPEntries = []
let pendingEdits = {} // { id: { price_map: { subtype: value }, legacy: { column: value } } }
let activeBlindType = 'Roller Blinds'

const BLIND_TYPE_ORDER = [
  'Roller Blinds',
  'Sheer Dimout Blinds',
  'S Contour Blinds',
  'Vertical Blinds',
  'Roman Blinds',
  'Wooden Venetian Blinds',
  'Aluminium Venetian Blinds',
  'Cellular Blinds',
]

const LEGACY_FIELD_BY_KEY = {
  'Roller Blinds Without Headrail': 'rrp_wo_headrail',
  'Roller Blinds With Headrail': 'rrp_w_headrail',
  'Roller Blinds With Plain Cassette': 'rrp_w_plain_cassette',
  'Roller Blinds With Decorative Cassette': 'rrp_w_dec_cassette',
}

const GROUP_COLORS = ['#dbeafe', '#d1fae5', '#ede9fe', '#fee2e2', '#fef3c7', '#cffafe', '#fce7f3']
const GROUP_TEXT = ['#1e40af', '#065f46', '#4c1d95', '#991b1b', '#92400e', '#155e75', '#9d174d']

async function init() {
  const profile = await initSidebar()
  if (!profile) return
  if (profile.role !== 'admin') {
    window.location.href = 'dashboard.html'
    return
  }

  await loadRRP()

  hide('loading')
  show('content')
}

async function loadRRP() {
  const { data, error } = await db
    .from('rrp_entries')
    .select('*')
    .order('blind_type')
    .order('sort_order')
  if (error) { toast(error.message, 'error'); return }
  allRRPEntries = data || []
  pendingEdits = {}
  activeBlindType = availableBlindTypes()[0] || 'Roller Blinds'
  renderBlindTabs()
  renderRRPTable()
  hideSaveBar()
}

function availableBlindTypes() {
  const present = new Set(allRRPEntries.map(e => e.blind_type).filter(Boolean))
  return BLIND_TYPE_ORDER.filter(t => present.has(t)).concat(
    [...present].filter(t => !BLIND_TYPE_ORDER.includes(t)).sort()
  )
}

function renderBlindTabs() {
  const tabs = document.getElementById('rrp-tabs')
  if (!tabs) return
  tabs.innerHTML = availableBlindTypes().map(type => `
    <button class="page-tab-btn ${type === activeBlindType ? 'active' : ''}"
            onclick="switchBlindTab('${escAttr(type)}')">
      <i class="fa-solid fa-layer-group"></i> ${esc(type)}
    </button>
  `).join('')
}

function renderRRPTable() {
  const tbody = document.getElementById('rrp-tbody')
  const thead = document.querySelector('#rrp-table thead')
  if (!tbody || !thead) return

  const entries = allRRPEntries.filter(e => e.blind_type === activeBlindType)
  const fields = priceFieldsFor(entries)
  renderTableHead(thead, fields)

  if (!entries.length) {
    tbody.innerHTML = `<tr><td colspan="${3 + fields.length * 2}" style="text-align:center;padding:24px;color:#9ca3af;">
      No RRP data found. Run the latest RRP migration in Supabase first.
    </td></tr>`
    return
  }

  let lastGroup = null
  let html = ''

  for (const entry of entries) {
    const grp = entry.fabric_group || 'General'
    const palette = groupPalette(grp)

    if (grp !== lastGroup) {
      lastGroup = grp
      html += `<tr>
        <td colspan="${3 + fields.length * 2}" style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;
            letter-spacing:.07em;background:${palette.bg};color:${palette.text};border-top:2px solid #e5e7eb;">
          ${esc(grp)}
        </td>
      </tr>`
    }

    html += `<tr id="row-${entry.id}" style="background:${palette.bg}18;">`
    html += `<td style="font-weight:600;font-size:12px;">${esc(entry.fabric_name)}</td>`
    html += `<td style="text-align:center;color:#6b7280;font-size:12px;">${esc(entry.width_max || '-')}</td>`
    html += `<td style="text-align:center;color:#6b7280;font-size:12px;">${esc(entry.uom || 'SQM')}</td>`

    for (const field of fields) {
      const rrpVal = priceValue(entry, field)
      const dpVal = rrpVal != null ? Math.round(rrpVal / 2) : null
      html += rrpCell(entry.id, field, rrpVal)
      html += dpCell(dpVal)
    }

    html += '</tr>'
  }

  tbody.innerHTML = html
}

function renderTableHead(thead, fields) {
  thead.innerHTML = `
    <tr>
      <th style="min-width:200px;">Fabric Name</th>
      <th style="text-align:center;min-width:80px;">Max Width</th>
      <th style="text-align:center;min-width:80px;">UOM</th>
      ${fields.map(f => `<th colspan="2" style="text-align:center;min-width:180px;border-left:2px solid var(--border);">${esc(shortFieldLabel(f))}</th>`).join('')}
    </tr>
    <tr style="font-size:11px;background:#f9fafb;">
      <th></th><th></th><th></th>
      ${fields.map(() => `
        <th style="text-align:center;color:#059669;border-left:2px solid var(--border);">RRP</th>
        <th style="text-align:center;color:#9ca3af;">DP</th>
      `).join('')}
    </tr>
  `
}

function priceFieldsFor(entries) {
  const seen = new Set()
  const fields = []
  for (const entry of entries) {
    for (const key of Object.keys(readPriceMap(entry))) {
      if (!seen.has(key)) {
        seen.add(key)
        fields.push(key)
      }
    }
  }

  if (!fields.length && activeBlindType === 'Roller Blinds') {
    return Object.keys(LEGACY_FIELD_BY_KEY)
  }

  return fields
}

function readPriceMap(entry) {
  if (!entry) return {}
  if (entry.price_map && typeof entry.price_map === 'object') return entry.price_map
  if (typeof entry.price_map === 'string') {
    try { return JSON.parse(entry.price_map) || {} } catch { return {} }
  }
  const map = {}
  for (const [key, col] of Object.entries(LEGACY_FIELD_BY_KEY)) {
    if (entry[col] != null) map[key] = entry[col]
  }
  return map
}

function mergedPriceMap(entry) {
  return {
    ...readPriceMap(entry),
    ...(pendingEdits[entry.id]?.price_map || {}),
  }
}

function priceValue(entry, field) {
  const map = mergedPriceMap(entry)
  const value = map[field]
  return value != null && value !== '' ? Number(value) : null
}

function rrpCell(id, field, value) {
  const display = value != null ? value.toLocaleString('en-IN') : '-'
  const cellId = cellIdFor(id, field)
  const hasPending = pendingEdits[id]?.price_map && field in pendingEdits[id].price_map
  return `<td style="text-align:center;border-left:2px solid var(--border);">
    <div class="rrp-cell" id="${cellId}"
         onclick="startEdit('${escAttr(id)}','${escAttr(field)}')"
         title="Click to edit"
         style="cursor:pointer;padding:4px 8px;border-radius:4px;border:1px solid ${hasPending ? '#f59e0b' : 'transparent'};
                transition:background .15s;font-weight:600;color:${hasPending ? '#d97706' : '#059669'};
                min-width:70px;display:inline-block;background:${hasPending ? '#fef3c7' : 'transparent'};">
      ${esc(display)}
    </div>
  </td>`
}

function dpCell(value) {
  const display = value != null ? value.toLocaleString('en-IN') : '-'
  return `<td style="text-align:center;color:#9ca3af;font-size:12px;">${esc(display)}</td>`
}

function startEdit(id, field) {
  const cellEl = document.getElementById(cellIdFor(id, field))
  if (!cellEl) return
  const entry = allRRPEntries.find(e => e.id === id)
  if (!entry) return
  const current = priceValue(entry, field) ?? ''

  cellEl.innerHTML = `<input type="number" step="1" min="0"
    id="inp-${cellIdFor(id, field)}"
    value="${current}"
    style="width:80px;padding:3px 6px;border:2px solid #3b82f6;border-radius:4px;font-size:13px;font-weight:600;text-align:center;background:#eff6ff;"
    onblur="commitEdit('${escAttr(id)}','${escAttr(field)}',this.value)"
    onkeydown="onCellKey(event,'${escAttr(id)}','${escAttr(field)}')">`

  const inp = document.getElementById(`inp-${cellIdFor(id, field)}`)
  inp?.focus()
  inp?.select()
}

function onCellKey(e, id, field) {
  if (e.key === 'Enter') {
    e.preventDefault()
    document.getElementById(`inp-${cellIdFor(id, field)}`)?.blur()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    refreshCell(id, field)
  } else if (e.key === 'Tab') {
    e.preventDefault()
    document.getElementById(`inp-${cellIdFor(id, field)}`)?.blur()
    const fields = priceFieldsFor(allRRPEntries.filter(e => e.blind_type === activeBlindType))
    const idx = fields.indexOf(field)
    if (idx >= 0 && idx < fields.length - 1) startEdit(id, fields[idx + 1])
  }
}

function commitEdit(id, field, rawVal) {
  const num = rawVal === '' ? null : Math.round(parseFloat(rawVal))
  if (rawVal !== '' && (isNaN(num) || num < 0)) {
    refreshCell(id, field)
    return
  }

  const entry = allRRPEntries.find(e => e.id === id)
  if (!entry) return
  const original = readPriceMap(entry)[field] ?? null

  if ((num === null && original === null) || Number(num) === Number(original)) {
    if (pendingEdits[id]?.price_map) delete pendingEdits[id].price_map[field]
    refreshCell(id, field)
    return
  }

  if (!pendingEdits[id]) pendingEdits[id] = { price_map: {}, legacy: {} }
  if (!pendingEdits[id].price_map) pendingEdits[id].price_map = {}
  pendingEdits[id].price_map[field] = num

  const legacyCol = LEGACY_FIELD_BY_KEY[field]
  if (legacyCol) {
    if (!pendingEdits[id].legacy) pendingEdits[id].legacy = {}
    pendingEdits[id].legacy[legacyCol] = num
  }

  refreshCell(id, field)
  showSaveBar()
}

function refreshCell(id, field) {
  const cellEl = document.getElementById(cellIdFor(id, field))
  if (!cellEl) return
  const entry = allRRPEntries.find(e => e.id === id)
  if (!entry) return
  const rrpVal = priceValue(entry, field)
  const hasPending = pendingEdits[id]?.price_map && field in pendingEdits[id].price_map
  const display = rrpVal != null ? rrpVal.toLocaleString('en-IN') : '-'

  cellEl.outerHTML = `<div class="rrp-cell" id="${cellIdFor(id, field)}"
    onclick="startEdit('${escAttr(id)}','${escAttr(field)}')"
    title="Click to edit"
    style="cursor:pointer;padding:4px 8px;border-radius:4px;border:1px solid ${hasPending ? '#f59e0b' : 'transparent'};
           transition:background .15s;font-weight:600;color:${hasPending ? '#d97706' : '#059669'};
           min-width:70px;display:inline-block;background:${hasPending ? '#fef3c7' : 'transparent'};">
    ${esc(display)}
  </div>`

  renderRRPTable()
}

function showSaveBar() {
  document.getElementById('unsaved-badge').style.display = ''
  document.getElementById('discard-btn').style.display = ''
  document.getElementById('save-btn').style.display = ''
}

function hideSaveBar() {
  document.getElementById('unsaved-badge').style.display = 'none'
  document.getElementById('discard-btn').style.display = 'none'
  document.getElementById('save-btn').style.display = 'none'
}

function discardChanges() {
  pendingEdits = {}
  renderRRPTable()
  hideSaveBar()
}

async function saveChanges() {
  const btn = document.getElementById('save-btn')
  btn.disabled = true
  btn.innerHTML = '<span class="spinner spinner-sm"></span> Saving...'

  const ids = Object.keys(pendingEdits)
  let errored = 0

  for (const id of ids) {
    const entry = allRRPEntries.find(e => e.id === id)
    if (!entry) continue

    const changes = pendingEdits[id]
    const payload = {
      price_map: { ...readPriceMap(entry), ...(changes.price_map || {}) },
      ...(changes.legacy || {}),
      updated_at: new Date().toISOString(),
    }

    const { error } = await db.from('rrp_entries').update(payload).eq('id', id)
    if (error) {
      errored++
      console.error('RRP save error:', error)
      toast(`Save failed for one entry: ${error.message}`, 'error')
    } else {
      const idx = allRRPEntries.findIndex(e => e.id === id)
      if (idx >= 0) allRRPEntries[idx] = { ...allRRPEntries[idx], ...payload }
      delete pendingEdits[id]
    }
  }

  if (!errored) {
    toast(`Saved ${ids.length} price${ids.length !== 1 ? 's' : ''}`)
    pendingEdits = {}
    renderRRPTable()
    hideSaveBar()
  }

  btn.disabled = false
  btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes'
}

function switchBlindTab(type) {
  activeBlindType = type
  renderBlindTabs()
  renderRRPTable()
}

function shortFieldLabel(field) {
  return field
    .replace(activeBlindType, '')
    .replace(/^Roller Blinds /, '')
    .replace(/^Sheer Dimout Blinds /, '')
    .replace(/^Roman Blinds /, '')
    .replace(/^Wooden Venetian Blinds$/, 'Mono Mechanism')
    .replace(/^Aluminium Venetian Blinds$/, 'Mono Mechanism')
    .replace(/^Cellular Blinds$/, 'Mono Mechanism')
    .trim() || field
}

function groupPalette(group) {
  let hash = 0
  for (const ch of String(group || '')) hash = (hash + ch.charCodeAt(0)) % GROUP_COLORS.length
  return { bg: GROUP_COLORS[hash], text: GROUP_TEXT[hash] }
}

function cellIdFor(id, field) {
  return `cell-${id}-${field.replace(/[^a-z0-9]+/gi, '-')}`
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escAttr(s) {
  return esc(s).replace(/'/g, '&#39;')
}

init()
