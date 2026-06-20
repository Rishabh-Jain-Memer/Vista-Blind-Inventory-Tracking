/*
  Activity log controller.
  Reads audit rows written by shared helpers and page actions, then applies
  date/action/entity/search filters for admin/staff review.
*/

const PAGE_SIZE = 50
let allLogs = []
let offset = 0
let hasMore = false
let userFilter = null

async function init() {
  const profile = await initSidebar()
  if (!profile) return
  if (profile.role === 'customer') { window.location.href = 'customer-dashboard.html'; return }
  userFilter = new URLSearchParams(window.location.search).get('user')

  document.getElementById('search-input').addEventListener('input', renderLogs)
  document.getElementById('action-filter').addEventListener('change', renderLogs)
  document.getElementById('entity-filter').addEventListener('change', renderLogs)
  document.getElementById('date-from').addEventListener('change', renderLogs)
  document.getElementById('date-to').addEventListener('change', renderLogs)

  await fetchLogs(true)
  hide('loading')
  show('content')
}

async function fetchLogs(reset = false) {
  if (reset) { allLogs = []; offset = 0 }

  let query = db
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)
  if (userFilter) query = query.eq('user_id', userFilter)
  const { data, error } = await query

  if (error) { toast(error.message, 'error'); return }
  const rows = data || []
  hasMore = rows.length === PAGE_SIZE
  allLogs = reset ? rows : [...allLogs, ...rows]
  offset += rows.length

  document.getElementById('load-more-btn').style.display = hasMore ? '' : 'none'
  renderLogs()
}

async function loadMore() {
  await fetchLogs(false)
}

function renderLogs() {
  const search  = val('search-input').toLowerCase()
  const action  = val('action-filter')
  const entity  = val('entity-filter')
  const dateFrom = document.getElementById('date-from').value
  const dateTo   = document.getElementById('date-to').value

  let filtered = allLogs.filter(l => {
    if (action && l.action_type !== action) return false
    if (entity && l.entity_type !== entity) return false
    if (dateFrom && l.created_at < dateFrom) return false
    if (dateTo   && l.created_at > dateTo + 'T23:59:59') return false
    if (search) {
      const hay = `${l.user_name||''} ${l.action_type} ${l.entity_type} ${l.entity_label||''} ${l.entity_id||''}`.toLowerCase()
      return fuzzyScore(hay, search) > 20
    }
    return true
  })

  text('log-count', `Showing ${filtered.length} of ${allLogs.length} events${hasMore ? '+' : ''}`)

  html('log-body', !filtered.length
    ? `<tr><td colspan="6" class="empty-state">No activity found.</td></tr>`
    : filtered.map(l => {
        const actionCls = {
          create: 'badge-active', update: 'badge-pending', delete: 'badge-exhausted',
          status_change: 'badge-admin', stock_adjust: 'badge-staff', stock_receive: 'badge-active'
        }[l.action_type] || 'badge-staff'
        const entityIcon = {
          order: 'fa-cart-shopping', order_item: 'fa-list', sku: 'fa-barcode',
          roll: 'fa-box', material: 'fa-layer-group', recipe: 'fa-book-open',
          category: 'fa-folder'
        }[l.entity_type] || 'fa-circle'

        const changesHtml = l.changes
          ? Object.entries(l.changes).map(([k, v]) =>
              `<div class="text-xs"><span class="text-muted">${esc(k)}:</span> ${
                typeof v === 'object' && v !== null && 'old' in v
                  ? `<span style="color:#dc2626;text-decoration:line-through">${esc(String(v.old ?? '—'))}</span> → <span style="color:#059669">${esc(String(v.new ?? '—'))}</span>`
                  : esc(String(v ?? ''))
              }</div>`
            ).join('')
          : '<span class="text-muted text-xs">—</span>'

        return `<tr>
          <td class="text-muted" style="white-space:nowrap">${fmtDateTime(l.created_at)}</td>
          <td>
            <div class="fw-600">${esc(l.user_name || 'System')}</div>
          </td>
          <td><span class="badge ${actionCls}">${esc(l.action_type)}</span></td>
          <td>
            <span class="text-muted"><i class="fa-solid ${entityIcon}" style="margin-right:4px;opacity:.6;"></i>${esc(l.entity_type)}</span>
          </td>
          <td class="fw-600">${esc(l.entity_label || l.entity_id || '—')}</td>
          <td>${changesHtml}</td>
        </tr>`
      }).join(''))
}

function clearFilters() {
  setVal('search-input', '')
  setVal('action-filter', '')
  setVal('entity-filter', '')
  document.getElementById('date-from').value = ''
  document.getElementById('date-to').value = ''
  renderLogs()
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

init()
