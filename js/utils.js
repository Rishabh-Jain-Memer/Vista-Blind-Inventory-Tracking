/*
  Shared UI and formatting utilities.
  Keep cross-page helpers here: currency/date formatting, safe text/HTML updates,
  modals, toast messages, fuzzy filtering, unit conversion, and audit logging.
*/

function fmt$(n) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n ?? 0)
}

function fmtDate(s) {
  return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(s) {
  return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function badge(status) {
  return `<span class="badge badge-${status}">${status}</span>`
}

function show(id) {
  const el = document.getElementById(id)
  if (!el) return
  el.classList.remove('d-none')
  // Re-trigger fade-in animation on #content so navigation feels smooth
  if (el.id === 'content') {
    el.style.animation = 'none'
    void el.offsetHeight   // force reflow
    el.style.animation = ''
  }
}
function hide(id)             { document.getElementById(id)?.classList.add('d-none') }
function html(id, h)          { const e = document.getElementById(id); if (e) e.innerHTML = h }
function text(id, t)          { const e = document.getElementById(id); if (e) e.textContent = t }
function val(id)               { return document.getElementById(id)?.value?.trim() ?? '' }
function setVal(id, v)         { const e = document.getElementById(id); if (e) e.value = v }
function disable(id, v = true) { const e = document.getElementById(id); if (e) e.disabled = v }

function showAlert(id, msg, type = 'error') {
  const el = document.getElementById(id)
  if (!el) return
  el.className = `alert alert-${type} show`
  el.textContent = msg
}
function hideAlert(id) {
  const el = document.getElementById(id)
  if (el) { el.className = 'alert'; el.textContent = '' }
}

function toast(msg, type = 'success') {
  let wrap = document.getElementById('toasts')
  if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toasts'; wrap.className = 'toast-wrap'; document.body.appendChild(wrap) }
  const t = document.createElement('div')
  t.className = `toast toast-${type}`
  t.textContent = msg
  wrap.appendChild(t)
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')))
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300) }, 3000)
}

function openModal(title, bodyHTML, large = false) {
  text('modal-title', title)
  html('modal-body', bodyHTML)
  const modal = document.querySelector('.modal')
  if (modal) { modal.classList.toggle('modal-lg', large) }
  document.getElementById('modal-overlay')?.classList.add('open')
}
function closeModal() {
  document.getElementById('modal-overlay')?.classList.remove('open')
}

document.addEventListener('click', e => {
  if (e.target?.id === 'modal-overlay') closeModal()
})

// ── Fuzzy Search ────────────────────────────────────────────────────────────
// Returns a relevance score 0–100. Higher = better match.
function fuzzyScore(haystack, needle) {
  if (!needle) return 100
  haystack = String(haystack || '').toLowerCase()
  needle = String(needle).toLowerCase().trim()
  if (!needle) return 100
  if (haystack === needle) return 100
  if (haystack.startsWith(needle)) return 95
  if (haystack.includes(needle)) return 85 - Math.min(haystack.indexOf(needle), 15)

  // Token-based: every word in the query appears somewhere in the haystack
  const tokens = needle.split(/\s+/).filter(Boolean)
  const matchedAll = tokens.every(t => haystack.includes(t))
  if (matchedAll) return 70
  const matchedSome = tokens.filter(t => haystack.includes(t))
  if (matchedSome.length) return 50 * (matchedSome.length / tokens.length)

  // Character-sequence match (handles abbreviations and transpositions)
  let score = 0, j = 0
  for (let i = 0; i < needle.length; i++) {
    const idx = haystack.indexOf(needle[i], j)
    if (idx === -1) continue
    score++
    j = idx + 1
  }
  return Math.round((score / needle.length) * 35)
}

// Filter an array by query, sorted best-match first.
// getTextFn(item) should return a space-joined string of all searchable fields.
function fuzzyFilter(arr, query, getTextFn) {
  if (!query || !query.trim()) return arr
  return arr
    .map(item => ({ item, score: fuzzyScore(getTextFn(item), query) }))
    .filter(x => x.score > 15)
    .sort((a, b) => b.score - a.score)
    .map(x => x.item)
}

// ── Unit Conversion ─────────────────────────────────────────────────────────
// All internal storage is in centimeters (cm).
// Display can be toggled per-page or globally.
const UNIT_TO_CM = { cm: 1, m: 100, ft: 30.48, in: 2.54 }

function cvtUnit(value, fromUnit, toUnit) {
  if (fromUnit === toUnit) return value
  const cm = Number(value) * (UNIT_TO_CM[fromUnit] || 1)
  return cm / (UNIT_TO_CM[toUnit] || 1)
}

// Format a centimeter value for display in user's chosen unit
function fmtMeasure(valueCm, toUnit) {
  const v = cvtUnit(Number(valueCm), 'cm', toUnit || 'cm')
  const digits = (toUnit === 'in' || toUnit === 'ft') ? 2 : 2
  return `${v.toFixed(digits)} ${toUnit || 'cm'}`
}

// Meters version (many DB fields store meters, not cm)
function fmtMeasureM(valueM, toUnit) {
  return fmtMeasure(Number(valueM) * 100, toUnit)
}

function getPreferredUnit() {
  return localStorage.getItem('vista_unit') || 'm'
}
function setPreferredUnit(unit) {
  localStorage.setItem('vista_unit', unit)
}

function appUuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const value = Math.random() * 16 | 0
    const digit = ch === 'x' ? value : ((value & 0x3) | 0x8)
    return digit.toString(16)
  })
}

// ── Activity Logging ─────────────────────────────────────────────────────────
// Writes a row to activity_logs. Non-blocking — errors are silently swallowed
// so they never break the main operation.
async function logActivity(actionType, entityType, entityId, entityLabel, changes = null) {
  try {
    const profile = AUTH?.currentProfile?.() || null
    const profileName = profile?.full_name || profile?.username || null

    let payload = {
      id:           appUuid(),
      user_id:      profile?.id || null,
      user_name:    profileName,
      action_type:  actionType,
      entity_type:  entityType,
      entity_id:    entityId ? String(entityId) : null,
      entity_label: entityLabel || null,
      changes:      changes || null
    }

    let result = await db.from('activity_logs').insert(payload)

    for (let attempts = 0; result.error && attempts < 4; attempts += 1) {
      const message = String(result.error.message || '')
      const missingColumn = message.match(/Could not find the '([^']+)' column/i)?.[1]
        || message.match(/column \"([^\"]+)\"/i)?.[1]
        || message.match(/'([^']+)' column/i)?.[1]
      if (!missingColumn || !(missingColumn in payload)) break
      delete payload[missingColumn]
      result = await db.from('activity_logs').insert(payload)
    }

    if (result.error) console.warn('activity log insert failed:', result.error.message)
  } catch (err) {
    console.warn('activity log insert failed:', err?.message || err)
  }
}
