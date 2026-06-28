/*
  Wastage page controller.
  Lists reusable fabric cut pieces created from order execution.
*/

let cutPieces = []

async function init() {
  const profile = await initSidebar()
  if (!profile) return

  ;['search-input', 'status-filter', 'from-date', 'to-date'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', renderPage)
    document.getElementById(id)?.addEventListener('change', renderPage)
  })

  await loadCutPieces()
  hide('loading')
  show('content')
}

async function loadCutPieces() {
  const { data, error } = await db.from('fabric_cut_pieces')
    .select(`
      id, variant_id, source_roll_id, source_order_id, source_order_item_id,
      width_m, length_m, remaining_length_m, unit, status, notes, created_at,
      inv_variants(id, name, width_m, inv_products(id, name, inv_categories(id, name))),
      inv_rolls!fabric_cut_pieces_source_roll_id_fkey(id, batch_code),
      orders!fabric_cut_pieces_source_order_id_fkey(id, order_uid, dealer_name, customer_name, customers!cust_id(name))
    `)
    .order('created_at', { ascending: false })

  if (error) {
    toast(error.message, 'error')
    cutPieces = []
    renderPage()
    return
  }
  cutPieces = data || []
  renderPage()
}

function filteredPieces() {
  const q = val('search-input').toLowerCase()
  const status = val('status-filter')
  const fromD = val('from-date')
  const toD = val('to-date')
  return cutPieces.filter(p => {
    if (status && p.status !== status) return false
    if (fromD && p.created_at < fromD) return false
    if (toD && p.created_at > `${toD}T23:59:59`) return false
    if (!q) return true
    const order = p.orders?.order_uid || p.source_order_id || ''
    const customer = p.orders?.customers?.name || p.orders?.customer_name || p.orders?.dealer_name || ''
    const text = [
      p.inv_variants?.name,
      p.inv_variants?.inv_products?.name,
      p.inv_variants?.inv_products?.inv_categories?.name,
      p.inv_rolls?.batch_code,
      order,
      customer,
      p.width_m,
      p.length_m,
      p.remaining_length_m,
      p.notes,
    ].filter(Boolean).join(' ').toLowerCase()
    return text.includes(q)
  })
}

function renderPage() {
  const rows = filteredPieces()
  renderStats(rows)
  renderTable(rows)
}

function renderStats(rows) {
  const available = rows.filter(p => p.status === 'available')
  const totalArea = rows.reduce((s, p) => s + Number(p.width_m || 0) * Number(p.length_m || 0), 0)
  const availableArea = available.reduce((s, p) => s + Number(p.width_m || 0) * Number(p.remaining_length_m || 0), 0)
  html('wastage-stats', `
    <div class="stat-card">
      <div><div class="stat-label">Cut Pieces</div><div class="stat-value">${rows.length}</div></div>
      <div class="stat-icon icon-amber"><i class="fa-solid fa-scissors"></i></div>
    </div>
    <div class="stat-card">
      <div><div class="stat-label">Available Pieces</div><div class="stat-value">${available.length}</div></div>
      <div class="stat-icon icon-green"><i class="fa-solid fa-box-open"></i></div>
    </div>
    <div class="stat-card">
      <div><div class="stat-label">Created Area</div><div class="stat-value">${totalArea.toFixed(2)} sqm</div></div>
      <div class="stat-icon icon-blue"><i class="fa-solid fa-ruler-combined"></i></div>
    </div>
    <div class="stat-card">
      <div><div class="stat-label">Available Area</div><div class="stat-value">${availableArea.toFixed(2)} sqm</div></div>
      <div class="stat-icon icon-indigo"><i class="fa-solid fa-layer-group"></i></div>
    </div>
  `)
}

function renderTable(rows) {
  if (!rows.length) {
    html('wastage-body', '<tr><td colspan="7" class="empty-state">No cut pieces found.</td></tr>')
    return
  }

  html('wastage-body', rows.map(p => {
    const createdArea = Number(p.width_m || 0) * Number(p.length_m || 0)
    const remainingArea = Number(p.width_m || 0) * Number(p.remaining_length_m || 0)
    const orderLabel = p.orders?.order_uid || (p.source_order_id ? p.source_order_id.slice(0, 8).toUpperCase() : '')
    const customer = p.orders?.customers?.name || p.orders?.customer_name || p.orders?.dealer_name || ''
    const statusClass = p.status === 'available' ? 'badge-active' : 'badge-exhausted'
    return `<tr>
      <td class="text-muted">${fmtDate(p.created_at)}</td>
      <td>
        <div class="fw-600">${esc(p.inv_variants?.name || 'Unknown fabric')}</div>
        <div class="text-xs text-muted">${esc(p.inv_variants?.inv_products?.name || '')}</div>
      </td>
      <td>
        <div class="fw-600">${Number(p.width_m || 0).toFixed(3)}m x ${Number(p.length_m || 0).toFixed(3)}m</div>
        <div class="text-xs text-muted">${createdArea.toFixed(3)} sqm created</div>
      </td>
      <td>
        <div class="fw-600">${Number(p.width_m || 0).toFixed(3)}m x ${Number(p.remaining_length_m || 0).toFixed(3)}m</div>
        <div class="text-xs text-muted">${remainingArea.toFixed(3)} sqm left</div>
      </td>
      <td class="text-muted">${esc(p.inv_rolls?.batch_code || '-')}</td>
      <td>
        ${orderLabel ? `<a href="order-detail.html?id=${p.source_order_id}" class="fw-600" style="color:var(--accent);">${esc(orderLabel)}</a>` : '<span class="text-muted">-</span>'}
        ${customer ? `<div class="text-xs text-muted">${esc(customer)}</div>` : ''}
      </td>
      <td><span class="badge ${statusClass}">${esc(p.status || 'available')}</span></td>
    </tr>`
  }).join(''))
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

init()
