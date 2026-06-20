/*
  Wastage page controller.
  Records and lists material wastage against inventory variants so production
  losses remain visible separately from normal order consumption.
*/

let allLogs = []
let allFabricVariants = []
let allRecentOrders   = []
let currentProfile    = null

async function fetchWastageLogsHydrated() {
  const { data: logs, error } = await db.from('wastage_logs')
    .select(`
      id, variant_id, order_id,
      cut_length_m, used_length_m, waste_length_m,
      cut_width_m, used_width_m, waste_width_m, waste_area_sqm,
      notes, created_at
    `)
    .order('created_at', { ascending: false })

  if (error) return { data: [], error }
  if (!logs?.length) return { data: [], error: null }

  const variantIds = [...new Set(logs.map(l => l.variant_id).filter(Boolean))]
  const orderIds = [...new Set(logs.map(l => l.order_id).filter(Boolean))]

  const [variantsRes, ordersRes] = await Promise.all([
    variantIds.length
      ? db.from('inv_variants').select('id, name, unit, inv_products(name)').in('id', variantIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? db.from('orders').select('id, order_uid, dealer_name, status, customers!cust_id(name)').in('id', orderIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const variantMap = new Map((variantsRes.data || []).map(v => [v.id, v]))
  const orderMap = new Map((ordersRes.data || []).map(o => [o.id, o]))

  return {
    data: logs.map(l => ({
      ...l,
      inv_variants: l.variant_id ? (variantMap.get(l.variant_id) || null) : null,
      orders: l.order_id ? (orderMap.get(l.order_id) || null) : null,
    })),
    error: variantsRes.error || ordersRes.error || null,
  }
}

async function init() {
  const profile = await initSidebar()
  if (!profile) return
  currentProfile = profile

  await loadData()
  hide('loading')
  show('content')
}

async function loadData() {
  const [logsRes, inventoryCatalog, ordersRes] = await Promise.all([
    fetchWastageLogsHydrated(),
    INVENTORY_SOURCE.loadCatalog({ includeCosts: false }),
    db.from('orders')
      .select('id, order_uid, dealer_name, customers!cust_id(name)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  if (logsRes.error) { toast(logsRes.error.message, 'error'); return }
  if (inventoryCatalog.errors.variants) { toast(inventoryCatalog.errors.variants.message, 'error'); return }

  allLogs = (logsRes.data || []).filter(l => {
    if (!l.order_id) return true
    const status = String(l.orders?.status || '').toLowerCase()
    return status === 'executed' || status === 'completed'
  })
  allFabricVariants = inventoryCatalog.variants.filter(v => {
    const sg = String(v.category?.sub_group || v.inv_products?.inv_categories?.sub_group || '').toLowerCase()
    return sg === 'fabric'
  })
  allRecentOrders = ordersRes.data || []

  renderStats()
  renderTable()
}

function renderStats() {
  const totalWasteArea   = allLogs.reduce((s, l) => s + Number(l.waste_area_sqm || 0), 0)
  const totalCutLength   = allLogs.reduce((s, l) => s + Number(l.cut_length_m   || 0), 0)
  const totalWasteLength = allLogs.reduce((s, l) => s + Number(l.waste_length_m || 0), 0)
  const wasteRatio = totalCutLength > 0 ? (totalWasteLength / totalCutLength) * 100 : 0

  html('wastage-stats', `
    <div class="stat-card">
      <div><div class="stat-label">Total Waste Area</div><div class="stat-value">${totalWasteArea.toFixed(2)} m²</div></div>
      <div class="stat-icon icon-amber"><i class="fa-solid fa-scissors"></i></div>
    </div>
    <div class="stat-card">
      <div><div class="stat-label">Total Cut Length</div><div class="stat-value">${totalCutLength.toFixed(2)} m</div></div>
      <div class="stat-icon icon-blue"><i class="fa-solid fa-ruler-horizontal"></i></div>
    </div>
    <div class="stat-card">
      <div><div class="stat-label">Total Waste Length</div><div class="stat-value">${totalWasteLength.toFixed(2)} m</div></div>
      <div class="stat-icon icon-red"><i class="fa-solid fa-triangle-exclamation"></i></div>
    </div>
    <div class="stat-card">
      <div><div class="stat-label">Waste Ratio</div><div class="stat-value" style="color:${wasteRatio > 15 ? '#ef4444' : '#059669'}">${wasteRatio.toFixed(1)}%</div></div>
      <div class="stat-icon icon-indigo"><i class="fa-solid fa-chart-pie"></i></div>
    </div>
  `)
}

function renderTable() {
  const q       = val('search-input').toLowerCase()
  const fromD   = val('from-date')
  const toD     = val('to-date')

  let logs = allLogs.filter(l => {
    if (fromD && l.created_at < fromD) return false
    if (toD   && l.created_at > toD + 'T23:59:59') return false
    if (q) {
      const text = [
        l.orders?.order_uid, l.orders?.dealer_name, l.orders?.customers?.name,
        l.inv_variants?.name, l.inv_variants?.inv_products?.name,
        l.notes,
      ].filter(Boolean).join(' ').toLowerCase()
      return text.includes(q)
    }
    return true
  })

  if (!logs.length) {
    html('wastage-body', `<tr><td colspan="10" class="empty-state">No wastage records found.</td></tr>`)
    return
  }

  html('wastage-body', logs.map(l => {
    const wasteArea  = Number(l.waste_area_sqm || 0)
    const wasteLen   = Number(l.waste_length_m || 0)
    const wasteColor = wasteArea > 0.5 ? '#f59e0b' : '#6b7280'
    const orderLabel = l.orders?.order_uid || '—'
    const custLabel  = l.orders?.customers?.name || l.orders?.dealer_name || ''
    return `<tr>
      <td class="text-muted">${fmtDate(l.created_at)}</td>
      <td>
        ${l.orders ? `<a href="order-detail.html?id=${l.orders.id}" class="fw-600" style="color:var(--accent);">${esc(orderLabel)}</a>` : '<span class="text-muted">Manual</span>'}
        ${custLabel ? `<div class="text-xs text-muted">${esc(custLabel)}</div>` : ''}
      </td>
      <td>
        <div class="fw-600">${esc(l.inv_variants?.name || '—')}</div>
        <div class="text-xs text-muted">${esc(l.inv_variants?.inv_products?.name || '')}</div>
      </td>
      <td style="text-align:right;">${Number(l.cut_length_m || 0).toFixed(3)} m</td>
      <td style="text-align:right;">${Number(l.used_length_m || 0).toFixed(3)} m</td>
      <td style="text-align:right;color:${wasteColor};font-weight:600;">${wasteLen.toFixed(3)} m</td>
      <td style="text-align:right;">${l.cut_width_m ? Number(l.cut_width_m).toFixed(3) + ' m' : '—'}</td>
      <td style="text-align:right;">${l.used_width_m ? Number(l.used_width_m).toFixed(3) + ' m' : '—'}</td>
      <td style="text-align:right;color:${wasteColor};font-weight:600;">${wasteArea.toFixed(4)} m²</td>
      <td>
        ${l.notes ? `<div class="text-xs text-muted" style="max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${esc(l.notes)}">${esc(l.notes)}</div>` : ''}
        <button class="btn btn-ghost btn-sm" style="color:#ef4444;padding:2px 6px;" onclick="deleteWastageLog('${l.id}')" title="Delete entry">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>`
  }).join(''))
}

// ── Delete wastage entry ────────────────────────────────────────────────────
async function deleteWastageLog(id) {
  if (!confirm('Delete this wastage entry?')) return
  const { error } = await db.from('wastage_logs').delete().eq('id', id)
  if (error) { toast(error.message, 'error'); return }
  toast('Wastage entry deleted')
  await loadData()
}

// ── Manual Wastage Entry Modal ──────────────────────────────────────────────
function openAddWastageModal() {
  const varOpts = allFabricVariants.map(v =>
    `<option value="${v.id}" data-width="${v.width_m || 0}">${esc(v.name)}${v.width_m ? ` (${v.width_m}m wide)` : ''} [${esc(v.inv_products?.name || '')}]</option>`
  ).join('')

  const orderOpts = allRecentOrders.map(o => {
    const label = o.order_uid || o.id.substring(0,8).toUpperCase()
    const cust  = o.customers?.name || o.dealer_name || ''
    return `<option value="${o.id}">${esc(label)}${cust ? ' — ' + esc(cust) : ''}</option>`
  }).join('')

  openModal('Add Wastage Entry', `
    <div id="aw-alert" class="alert alert-error"></div>
    <p class="text-sm text-muted" style="margin-bottom:14px;">
      Record fabric waste that occurred outside of an order execution — e.g. sample cuts, defects, or manual trimming.
    </p>

    <div class="form-row cols-2" style="margin-bottom:12px;">
      <div class="form-group" style="margin:0;">
        <label>Fabric Variant <span style="color:#ef4444">*</span></label>
        <select id="aw-variant" onchange="onAwVariantChange()">
          <option value="">Select fabric…</option>
          ${varOpts}
        </select>
      </div>
      <div class="form-group" style="margin:0;">
        <label>Linked Order (optional)</label>
        <select id="aw-order">
          <option value="">— No order —</option>
          ${orderOpts}
        </select>
      </div>
    </div>

    <div class="form-row cols-2" style="margin-bottom:12px;">
      <div class="form-group" style="margin:0;">
        <label>Cut Length (m) <span style="color:#ef4444">*</span>
          <span class="text-xs text-muted">— total fabric cut from roll</span>
        </label>
        <input id="aw-cut" type="number" min="0.001" step="0.001" placeholder="e.g. 3.5" oninput="calcAwWaste()">
      </div>
      <div class="form-group" style="margin:0;">
        <label>Used Length (m) <span style="color:#ef4444">*</span>
          <span class="text-xs text-muted">— went into the product</span>
        </label>
        <input id="aw-used" type="number" min="0" step="0.001" placeholder="e.g. 3.1" oninput="calcAwWaste()">
      </div>
    </div>

    <div class="form-row cols-2" style="margin-bottom:12px;">
      <div class="form-group" style="margin:0;">
        <label>Roll Width (m) <span class="text-xs text-muted">auto-filled from variant</span></label>
        <input id="aw-rollw" type="number" min="0" step="0.001" placeholder="e.g. 2.3" oninput="calcAwWaste()">
      </div>
      <div class="form-group" style="margin:0;">
        <label>Product Width (m) <span class="text-xs text-muted">blind/product width</span></label>
        <input id="aw-prodw" type="number" min="0" step="0.001" placeholder="e.g. 2.1" oninput="calcAwWaste()">
      </div>
    </div>

    <div id="aw-preview" style="background:#f8fafc;border:1px solid var(--border);border-radius:6px;padding:10px 12px;font-size:12px;color:#64748b;margin-bottom:12px;display:none;"></div>

    <div class="form-group" style="margin-bottom:0;">
      <label>Notes (optional)</label>
      <input id="aw-notes" placeholder="e.g. Defective piece, sample cut, leftover from repair">
    </div>

    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="aw-save-btn" onclick="saveManualWastage()">
        <i class="fa-solid fa-plus"></i> Add Entry
      </button>
    </div>
  `)
}

function onAwVariantChange() {
  const sel  = document.getElementById('aw-variant')
  const opt  = sel?.options[sel.selectedIndex]
  const w    = opt?.dataset?.width
  if (w && w !== '0') {
    const inp = document.getElementById('aw-rollw')
    if (inp && !inp.value) inp.value = w
  }
  calcAwWaste()
}

function calcAwWaste() {
  const cut   = parseFloat(document.getElementById('aw-cut')?.value)
  const used  = parseFloat(document.getElementById('aw-used')?.value)
  const rollW = parseFloat(document.getElementById('aw-rollw')?.value)
  const prodW = parseFloat(document.getElementById('aw-prodw')?.value)
  const prev  = document.getElementById('aw-preview')
  if (!prev) return

  if (isNaN(cut) || isNaN(used) || cut <= 0) {
    prev.style.display = 'none'; return
  }
  const wasteLen = cut - used
  let wasteAreaText = ''
  if (!isNaN(rollW) && rollW > 0 && !isNaN(prodW) && prodW > 0) {
    const sideWaste = Math.max(rollW - prodW, 0) * used
    const endWaste  = wasteLen * rollW
    const total     = sideWaste + endWaste
    wasteAreaText   = ` | Waste area: <strong>${total.toFixed(4)} m²</strong>`
  } else if (!isNaN(rollW) && rollW > 0) {
    wasteAreaText = ` | Waste area ≈ <strong>${(wasteLen * rollW).toFixed(4)} m²</strong>`
  }
  prev.style.display = ''
  prev.innerHTML = `Waste: <strong style="color:${wasteLen > 0 ? '#f59e0b' : '#059669'}">${wasteLen.toFixed(3)} m</strong>${wasteAreaText}`
}

async function saveManualWastage() {
  hideAlert('aw-alert')
  const variantId = document.getElementById('aw-variant')?.value
  const orderId   = document.getElementById('aw-order')?.value || null
  const cutLen    = parseFloat(document.getElementById('aw-cut')?.value)
  const usedLen   = parseFloat(document.getElementById('aw-used')?.value)
  const rollW     = parseFloat(document.getElementById('aw-rollw')?.value) || null
  const prodW     = parseFloat(document.getElementById('aw-prodw')?.value) || null
  const notes     = val('aw-notes') || null

  if (!variantId)              { showAlert('aw-alert', 'Please select a fabric variant'); return }
  if (isNaN(cutLen) || cutLen <= 0) { showAlert('aw-alert', 'Cut length must be > 0'); return }
  if (isNaN(usedLen) || usedLen < 0) { showAlert('aw-alert', 'Used length must be ≥ 0'); return }
  if (usedLen > cutLen) { showAlert('aw-alert', 'Used length cannot exceed cut length'); return }

  disable('aw-save-btn')

  const row = {
    variant_id:    variantId,
    order_id:      orderId,
    cut_length_m:  cutLen,
    used_length_m: usedLen,
    cut_width_m:   rollW,
    used_width_m:  prodW,
    notes,
    recorded_by:   currentProfile?.id || null,
  }

  const { error } = await db.from('wastage_logs').insert(row)
  if (error) { showAlert('aw-alert', error.message); disable('aw-save-btn', false); return }

  toast('Wastage entry added')
  closeModal()
  await loadData()
}

// ── Export ──────────────────────────────────────────────────────────────────
function exportWastageExcel() {
  const rows = [['Date', 'Order UID', 'Customer', 'Fabric', 'Cut Length (m)', 'Used Length (m)', 'Waste Length (m)', 'Roll Width (m)', 'Blind Width (m)', 'Waste Area (m²)', 'Notes']]
  for (const l of allLogs) {
    rows.push([
      fmtDate(l.created_at),
      l.orders?.order_uid || '',
      l.orders?.customers?.name || l.orders?.dealer_name || '',
      l.inv_variants?.name || '',
      Number(l.cut_length_m  || 0),
      Number(l.used_length_m || 0),
      Number(l.waste_length_m || 0),
      Number(l.cut_width_m   || 0),
      Number(l.used_width_m  || 0),
      Number(l.waste_area_sqm || 0),
      l.notes || '',
    ])
  }
  const ok = exportWorkbook([
    { name: 'Wastage', rows, cols: rows[0].map(() => ({ wch: 18 })) },
  ], `Vista-Wastage-${todayStamp()}.xlsx`)
  if (ok) toast('Wastage exported to Excel')
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

init()
