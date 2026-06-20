// ── Shared esc helper (not in utils.js) ──────────────────────────────────────
/*
  Reports page controller.
  Builds accounting-style inward/outward views from the same Supabase inventory
  and order tables used by the app. Inward reports drill down year -> month ->
  bill -> line items; outward reports summarize orders and components.
*/

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ── Raw data ──────────────────────────────────────────────────────────────────
let allRolls      = []   // enriched inv_rolls
let allOrders     = []
let allComponents = []
let allSuppliers  = []

// ── Inward drill state ────────────────────────────────────────────────────────
let iwDrillLevel    = 0          // 0 = year not chosen, 1 = months, 2 = bills, 3 = items
let iwSelectedYear  = null
let iwSelectedMonth = null       // 1-12
let iwSelectedBill  = null       // {date, bill_no, supplier} key object

// Secondary filters (always active across all drill levels)
let iwCatFilter      = ''
let iwSupplierFilter = ''

// ── Current tab ───────────────────────────────────────────────────────────────
let currentTab = 'inward'
let outwardCustomerFilter = null

function orderStatus(o) {
  const s = String(o?.status || '').toLowerCase()
  if (s === 'discussing' || s === 'pending') return 'inquiry'
  if (s === 'in progress') return 'processing'
  return s
}

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

const LENGTH_UNITS = new Set(['m', 'ft', 'cm', 'in'])

function inwardQtyBuckets(rows) {
  return rows.reduce((acc, r) => {
    const qty = Number(r.original_length || 0)
    const unit = String(r.unit || 'm').toLowerCase()
    if (LENGTH_UNITS.has(unit)) acc.m += cvtUnit(qty, unit, 'm')
    else if (unit === 'sqm') acc.sqm += qty
    else if (unit === 'pcs') acc.pcs += qty
    else acc.other[unit] = (acc.other[unit] || 0) + qty
    return acc
  }, { m: 0, sqm: 0, pcs: 0, other: {} })
}

function fmtQtyValue(n) {
  return Number(n || 0) % 1 === 0 ? Number(n || 0).toFixed(0) : Number(n || 0).toFixed(2)
}

function inwardQtyDisplay(rows) {
  const b = inwardQtyBuckets(rows)
  return [
    b.m > 0 ? `${b.m.toFixed(1)} m` : '',
    b.sqm > 0 ? `${fmtQtyValue(b.sqm)} sqm` : '',
    b.pcs > 0 ? `${fmtQtyValue(b.pcs)} pcs` : '',
    ...Object.entries(b.other).map(([unit, qty]) => `${fmtQtyValue(qty)} ${unit}`),
  ].filter(Boolean).join(', ') || '—'
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const profile = await initSidebar()
  if (!profile) return

  await Promise.all([loadInward(), loadOutward(), loadSuppliers()])

  buildYearSelects()
  buildCategorySelect()
  buildSupplierSelect()

  // Default to current year and immediately show months
  const now = new Date().getFullYear()
  const params = new URLSearchParams(window.location.search)
  outwardCustomerFilter = params.get('customer')
  document.getElementById('iw-year').value = String(now)
  if (params.get('supplier')) {
    iwSupplierFilter = params.get('supplier')
    document.getElementById('iw-supplier').value = iwSupplierFilter
  }
  iwSelectYear()

  applyOutwardFilters()
  if (params.get('tab') === 'outward') switchTab('outward')

  hide('loading')
  show('content')
}

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadInward() {
  const rollsPromise = db.from('inv_rolls')
    .select(`
      id, batch_code, original_length, remaining_length, unit,
      purchase_rate, stock_value, inward_date, bill_no, supplier, created_at,
      inv_variants(
        id, name, unit, purchase_rate,
        inv_products(name, inv_categories(id, name, sub_group))
      )
    `)
    .order('inward_date', { ascending: false })

  const fgSelect = 'id, code, name, description, purchase_date, purchase_cost, quantity, unit, bill_no, supplier, notes, created_at'
  const fgFallbackSelect = 'id, code, name, description, purchase_date, purchase_cost, quantity, unit, created_at'

  const [rollsRes, fgPrimaryRes] = await Promise.all([
    rollsPromise,
    db.from('fg_stock').select(fgSelect).order('purchase_date', { ascending: false }),
  ])

  let fgRes = fgPrimaryRes
  if (fgRes.error && /column fg_stock\.(bill_no|supplier|notes) does not exist/i.test(fgRes.error.message || '')) {
    fgRes = await db.from('fg_stock').select(fgFallbackSelect).order('purchase_date', { ascending: false })
  }

  if (rollsRes.error) { toast(rollsRes.error.message, 'error'); return }
  if (fgRes.error)    { console.warn('fg_stock load error:', fgRes.error.message); toast('Could not load finished goods: ' + fgRes.error.message, 'error') }

  const rolls = (rollsRes.data ?? []).map(r => ({
    ...r,
    inward_date:    r.inward_date,
    variantId:      r.inv_variants?.id || '',
    variantName:    r.inv_variants?.name || '—',
    categoryName:   r.inv_variants?.inv_products?.inv_categories?.name || '—',
    effectiveRate:  Number(r.purchase_rate || r.inv_variants?.purchase_rate || 0),
    effectiveValue: Number(r.stock_value || 0) ||
                    (Number(r.original_length || 0) * Number(r.purchase_rate || r.inv_variants?.purchase_rate || 0)),
    rowType: 'roll',
  }))

  // Map fg_stock rows into the same shape so they appear in the drill-down
  const fgRows = (fgRes.data ?? []).map(f => ({
    id:              f.id,
    batch_code:      f.code || '—',
    original_length: f.quantity || 0,
    remaining_length: f.quantity || 0,
    unit:            f.unit || 'pcs',
    purchase_rate:   f.purchase_cost || 0,
    stock_value:     (f.purchase_cost || 0) * (f.quantity || 0),
    inward_date:     f.purchase_date || f.created_at?.slice(0, 10) || null,
    bill_no:         f.bill_no || null,
    supplier:        f.supplier || null,
    variantName:     f.name || '—',
    categoryName:    'Finished Goods',
    effectiveRate:   Number(f.purchase_cost || 0),
    effectiveValue:  Number(f.purchase_cost || 0) * Number(f.quantity || 0),
    rowType:         'fg',
  }))

  allRolls = [...rolls, ...fgRows]
}

async function loadOutward() {
  let ordersQuery = db.from('orders')
      .select('id, order_uid, dealer_name, customer_name, status, total_amount, cost_amount, created_at, order_date, invoice_number, invoice_date, source_bill_no, cust_id, customers!cust_id(name)')
      .in('status', ['completed', 'Completed'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
  let [ordersRes, compsRes] = await Promise.all([
    ordersQuery,
    db.from('order_components')
      .select(`id, order_id, actual_qty, planned_qty,
        inv_variants(id, name, unit, purchase_rate,
          inv_products(name, inv_categories(name, sub_group)))`),
  ])
  if (ordersRes.error && /invoice_number|invoice_date/i.test(ordersRes.error.message || '')) {
    ordersRes = await db.from('orders')
      .select('id, order_uid, dealer_name, customer_name, status, total_amount, cost_amount, created_at, order_date, source_bill_no, cust_id, customers!cust_id(name)')
      .in('status', ['completed', 'Completed'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
  }
  if (ordersRes.error) { toast(ordersRes.error.message, 'error'); return }
  allOrders     = ordersRes.data ?? []
  allComponents = compsRes.data  ?? []
}

async function loadSuppliers() {
  const { data, error } = await db.from('suppliers').select('name').order('name')
  if (error) {
    console.warn('suppliers load error:', error.message)
    allSuppliers = []
    return
  }
  allSuppliers = data || []
}

// ── Year / filter selects ─────────────────────────────────────────────────────
function buildYearSelects() {
  const years = new Set()
  const now   = new Date().getFullYear()
  allRolls.forEach(r  => { if (r.inward_date) years.add(new Date(r.inward_date).getFullYear()) })
  allOrders.forEach(o => { if (o.created_at)  years.add(new Date(o.created_at).getFullYear())  })
  years.add(now)

  const sorted = [...years].sort((a, b) => b - a)
  const iwOpts = sorted.map(y => `<option value="${y}">${y}</option>`).join('')
  const owOpts = `<option value="">All Years</option>` + iwOpts
  document.getElementById('iw-year').innerHTML = iwOpts
  document.getElementById('ow-year').innerHTML = owOpts
  document.getElementById('ow-year').value = String(now)
}

function buildCategorySelect() {
  const cats = new Set()
  allRolls.forEach(r => { if (r.categoryName !== '—') cats.add(r.categoryName) })
  document.getElementById('iw-cat').innerHTML =
    `<option value="">All Categories</option>` +
    [...cats].sort().map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')
}

function buildSupplierSelect() {
  const sups = new Set()
  allRolls.forEach(r => { if (r.supplier) sups.add(r.supplier) })
  allSuppliers.forEach(s => { if (s.name) sups.add(s.name) })
  document.getElementById('iw-supplier').innerHTML =
    `<option value="">All Suppliers</option>` +
    [...sups].sort().map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab
  document.querySelectorAll('.report-tab-btn').forEach(b => b.classList.remove('active'))
  document.querySelectorAll('.report-pane').forEach(p  => p.classList.remove('active'))
  document.getElementById(`tab-${tab}-btn`).classList.add('active')
  document.getElementById(`pane-${tab}`).classList.add('active')
}

// ─────────────────────────────────────────────────────────────────────────────
//  INWARD DRILL-DOWN
// ─────────────────────────────────────────────────────────────────────────────

// Filter rolls by secondary filters only (cat + supplier) — year/month handled per level
function iwBaseRolls() {
  return allRolls.filter(r => {
    if (iwCatFilter      && r.categoryName !== iwCatFilter)  return false
    if (iwSupplierFilter && r.supplier     !== iwSupplierFilter) return false
    return true
  })
}

function iwSelectYear() {
  iwSelectedYear  = document.getElementById('iw-year').value
  iwSelectedMonth = null
  iwSelectedBill  = null
  iwDrillLevel    = 1
  renderIwBreadcrumb()
  renderIwMonths()
}

function iwApplySecondaryFilter() {
  iwCatFilter      = document.getElementById('iw-cat').value
  iwSupplierFilter = document.getElementById('iw-supplier').value
  // Re-render whichever level we're at
  if      (iwDrillLevel === 1) renderIwMonths()
  else if (iwDrillLevel === 2) renderIwBills()
  else if (iwDrillLevel === 3) renderIwItems()
}

// ── Level 1: Months ───────────────────────────────────────────────────────────
function iwDrillMonth(monthNum) {
  iwSelectedMonth = monthNum
  iwDrillLevel    = 2
  renderIwBreadcrumb()
  renderIwBills()
}

function renderIwMonths() {
  const base = iwBaseRolls().filter(r =>
    r.inward_date && new Date(r.inward_date).getFullYear() === Number(iwSelectedYear)
  )

  // Build per-month stats
  const months = Array.from({ length: 12 }, (_, i) => {
    const mRolls = base.filter(r => new Date(r.inward_date).getMonth() === i)
    const totalValue   = mRolls.reduce((s, r) => s + r.effectiveValue, 0)
    const totalBatches = mRolls.length
    return { month: i + 1, name: MONTHS[i], totalValue, totalBatches, qtyDisplay: inwardQtyDisplay(mRolls) }
  })

  const yearTotal   = months.reduce((s, m) => s + m.totalValue, 0)
  const yearBatches = months.reduce((s, m) => s + m.totalBatches, 0)
  const yearQtyDisplay = inwardQtyDisplay(base)

  const rows = months.map(m => {
    const empty = m.totalBatches === 0
    return `<tr ${empty ? 'style="opacity:.4;"' : `class="drill-row month-has-data" style="cursor:pointer;" onclick="iwDrillMonth(${m.month})"`}>
      <td style="font-weight:${empty ? '400' : '600'};">${m.name}</td>
      <td class="tr">${m.totalBatches || '—'}</td>
      <td class="tr">${m.qtyDisplay}</td>
      <td class="tr" style="font-weight:700;color:${m.totalValue > 0 ? 'var(--accent)' : 'inherit'};">${m.totalValue > 0 ? fmt$(m.totalValue) : '—'}</td>
      <td style="width:24px;color:var(--text-muted);text-align:right;">${empty ? '' : '<i class="fa-solid fa-chevron-right" style="font-size:11px;"></i>'}</td>
    </tr>`
  }).join('')

  document.getElementById('iw-drill-content').innerHTML = `
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Month</th>
            <th class="tr">Batches</th>
            <th class="tr">Qty</th>
            <th class="tr">Total Value</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${rows}
            <tr class="totals-row">
              <td><strong>Total ${iwSelectedYear}</strong></td>
              <td class="tr">${yearBatches}</td>
              <td class="tr">${yearQtyDisplay}</td>
              <td class="tr">${fmt$(yearTotal)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`
}

// ── Level 2: Bills/Date entries ───────────────────────────────────────────────
let iwBillEntries = []   // indexed lookup to avoid inline JSON in onclick attrs

function iwDrillBill(idx) {
  iwSelectedBill = iwBillEntries[idx]
  iwDrillLevel   = 3
  renderIwBreadcrumb()
  renderIwItems()
}

function renderIwBills() {
  const base = iwBaseRolls().filter(r => {
    if (!r.inward_date) return false
    const d = new Date(r.inward_date)
    return d.getFullYear() === Number(iwSelectedYear) && (d.getMonth() + 1) === iwSelectedMonth
  })

  // Group by date + bill_no + supplier
  const grouped = new Map()
  for (const r of base) {
    const key = `${r.inward_date}||${r.bill_no || ''}||${r.supplier || ''}`
    if (!grouped.has(key)) {
      grouped.set(key, {
        dateKey:  r.inward_date,
        billNo:   r.bill_no  || '',
        supplier: r.supplier || '',
        rolls:    [],
      })
    }
    grouped.get(key).rolls.push(r)
  }

  iwBillEntries = [...grouped.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey))

  const monthTotal   = iwBillEntries.reduce((s, e) => s + e.rolls.reduce((ss, r) => ss + r.effectiveValue, 0), 0)
  const monthBatches = base.length
  const monthQtyDisplay = inwardQtyDisplay(base)

  if (!iwBillEntries.length) {
    document.getElementById('iw-drill-content').innerHTML =
      `<div class="empty-state">No inward entries for ${MONTHS[iwSelectedMonth - 1]} ${iwSelectedYear}</div>`
    return
  }

  const rows = iwBillEntries.map((e, idx) => {
    const eValue = e.rolls.reduce((s, r) => s + r.effectiveValue, 0)
    const qtyDisp = inwardQtyDisplay(e.rolls)
    return `<tr class="drill-row" style="cursor:pointer;" onclick="iwDrillBill(${idx})">
      <td>${fmtDate(e.dateKey)}</td>
      <td style="font-family:monospace;font-weight:600;color:var(--accent);">${esc(e.billNo || '—')}</td>
      <td>${esc(e.supplier || '—')}</td>
      <td class="tr text-muted text-sm">${e.rolls.length} item${e.rolls.length !== 1 ? 's' : ''}</td>
      <td class="tr text-muted text-sm">${qtyDisp}</td>
      <td class="tr" style="font-weight:700;">${fmt$(eValue)}</td>
      <td style="width:24px;text-align:right;color:var(--text-muted);"><i class="fa-solid fa-chevron-right" style="font-size:11px;"></i></td>
    </tr>`
  }).join('')

  document.getElementById('iw-drill-content').innerHTML = `
    <div class="report-summary-bar">
      <div class="rsb-item"><span class="rsb-label">Month Total</span><span class="rsb-value">${fmt$(monthTotal)}</span></div>
      <div class="rsb-item"><span class="rsb-label">Entries</span><span class="rsb-value">${iwBillEntries.length}</span></div>
      <div class="rsb-item"><span class="rsb-label">Batches</span><span class="rsb-value">${monthBatches}</span></div>
      <div class="rsb-item"><span class="rsb-label">Total Qty</span><span class="rsb-value">${monthQtyDisplay}</span></div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Date</th><th>Bill / Invoice No.</th><th>Supplier</th>
            <th class="tr">Items</th><th class="tr">Qty</th><th class="tr">Value</th><th></th>
          </tr></thead>
          <tbody>
            ${rows}
            <tr class="totals-row">
              <td colspan="4"><strong>Total — ${MONTHS[iwSelectedMonth - 1]} ${iwSelectedYear}</strong></td>
              <td class="tr">${monthQtyDisplay}</td>
              <td class="tr">${fmt$(monthTotal)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`
}

// ── Level 3: Items in a bill entry ─────────────────────────────────────────────
function renderIwItems() {
  const { dateKey, billNo, supplier } = iwSelectedBill

  const rolls = iwBaseRolls().filter(r =>
    r.inward_date === dateKey &&
    (r.bill_no  || '') === (billNo   || '') &&
    (r.supplier || '') === (supplier || '')
  )

  if (!rolls.length) {
    document.getElementById('iw-drill-content').innerHTML =
      `<div class="empty-state">No items found for this entry</div>`
    return
  }

  const sorted     = [...rolls].sort((a, b) => a.variantName.localeCompare(b.variantName))
  const totalValue = sorted.reduce((s, r) => s + r.effectiveValue, 0)

  const rows = sorted.map((r, i) => {
    const qty    = Number(r.original_length || 0)
    const unit   = r.unit || 'm'
    const qtyStr = qty % 1 === 0 ? qty : qty.toFixed(2)
    const pct    = totalValue > 0 ? (r.effectiveValue / totalValue * 100) : 0
    return `<tr>
      <td style="color:var(--text-muted);font-size:12px;width:32px;">${i + 1}</td>
      <td style="font-weight:600;"><a href="inventory.html?${r.variantId ? `variant=${encodeURIComponent(r.variantId)}` : `q=${encodeURIComponent(r.variantName)}`}" style="color:var(--accent);text-decoration:none;">${esc(r.variantName)}</a></td>
      <td><span class="text-muted text-sm">${esc(r.categoryName)}</span></td>
      <td style="font-family:monospace;font-size:12px;color:var(--text-muted);">${esc(r.batch_code || '—')}</td>
      <td class="tr">${qtyStr} ${unit}</td>
      <td class="tr text-muted text-sm">${r.effectiveRate ? fmt$(r.effectiveRate) + '/' + unit : '—'}</td>
      <td class="tr" style="font-weight:700;">${fmt$(r.effectiveValue)}</td>
      <td style="width:80px;padding-left:8px;">
        <div style="background:#e8eaf0;border-radius:4px;height:6px;overflow:hidden;">
          <div style="background:var(--accent);height:100%;width:${pct.toFixed(1)}%;border-radius:4px;"></div>
        </div>
      </td>
    </tr>`
  }).join('')

  document.getElementById('iw-drill-content').innerHTML = `
    <div class="report-summary-bar">
      <div class="rsb-item"><span class="rsb-label">Bill / Invoice</span><span class="rsb-value" style="font-family:monospace;">${esc(billNo || '—')}</span></div>
      <div class="rsb-item"><span class="rsb-label">Date</span><span class="rsb-value">${fmtDate(dateKey)}</span></div>
      <div class="rsb-item"><span class="rsb-label">Supplier</span><span class="rsb-value">${esc(supplier || '—')}</span></div>
      <div class="rsb-item"><span class="rsb-label">Items</span><span class="rsb-value">${sorted.length}</span></div>
      <div class="rsb-item rsb-accent"><span class="rsb-label">Total Value</span><span class="rsb-value">${fmt$(totalValue)}</span></div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th style="width:32px;">#</th>
            <th>Variant</th><th>Category</th><th>Batch Code</th>
            <th class="tr">Qty</th><th class="tr">Rate</th><th class="tr">Value</th><th style="width:80px;"></th>
          </tr></thead>
          <tbody>
            ${rows}
            <tr class="totals-row">
              <td colspan="5"><strong>Total</strong></td>
              <td class="tr">—</td>
              <td class="tr">${fmt$(totalValue)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
function renderIwBreadcrumb() {
  const bc = document.getElementById('iw-breadcrumb')
  const parts = []

  // Level 1 always shown once year is chosen
  if (iwDrillLevel >= 1) {
    const isCurrentL1 = iwDrillLevel === 1
    parts.push(`<span class="crumb ${isCurrentL1 ? 'current' : ''}" ${isCurrentL1 ? '' : 'onclick="iwBackToYear()"'}>${iwSelectedYear}</span>`)
  }

  if (iwDrillLevel >= 2) {
    const mName = MONTHS[iwSelectedMonth - 1]
    const isCurrentL2 = iwDrillLevel === 2
    parts.push(`<span class="sep">›</span>`)
    parts.push(`<span class="crumb ${isCurrentL2 ? 'current' : ''}" ${isCurrentL2 ? '' : 'onclick="iwBackToMonth()"'}>${mName}</span>`)
  }

  if (iwDrillLevel >= 3) {
    const { dateKey, billNo } = iwSelectedBill
    parts.push(`<span class="sep">›</span>`)
    parts.push(`<span class="crumb current">${fmtDate(dateKey)}${billNo ? ' · ' + esc(billNo) : ''}</span>`)
  }

  bc.innerHTML = parts.join(' ')
}

function iwBackToYear() {
  iwSelectedMonth = null
  iwSelectedBill  = null
  iwDrillLevel    = 1
  renderIwBreadcrumb()
  renderIwMonths()
}

function iwBackToMonth() {
  iwSelectedBill = null
  iwDrillLevel   = 2
  renderIwBreadcrumb()
  renderIwBills()
}

// ─────────────────────────────────────────────────────────────────────────────
//  OUTWARD
// ─────────────────────────────────────────────────────────────────────────────
let filteredOrders = []

function clearOutwardFilters() {
  document.getElementById('ow-year').value   = String(new Date().getFullYear())
  document.getElementById('ow-month').value  = ''
  document.getElementById('ow-from').value   = ''
  document.getElementById('ow-to').value     = ''
  document.getElementById('ow-status').value = 'completed'
  applyOutwardFilters()
}

function applyOutwardFilters() {
  const year   = document.getElementById('ow-year').value
  const month  = document.getElementById('ow-month').value
  const from   = document.getElementById('ow-from').value
  const to     = document.getElementById('ow-to').value
  const status = document.getElementById('ow-status').value || 'completed'

  filteredOrders = allOrders.filter(o => {
    const d       = new Date(o.created_at)
    const dateStr = o.created_at.slice(0, 10)
    if (outwardCustomerFilter && o.cust_id !== outwardCustomerFilter) return false
    if (year   && String(d.getFullYear())  !== year)   return false
    if (month  && String(d.getMonth() + 1) !== month)  return false
    if (from   && dateStr < from)                       return false
    if (to     && dateStr > to)                         return false
    if (orderStatus(o) !== 'completed')                return false
    if (status && orderStatus(o) !== status)           return false
    return true
  })

  renderOutwardKPIs()
  renderOutwardOrders()
  renderOutwardMaterials()
}

function renderOutwardKPIs() {
  const revenue  = filteredOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0)
  const cost     = filteredOrders.reduce((s, o) => s + Number(o.cost_amount  || 0), 0)
  const profit   = revenue - cost

  text('ow-kpi-orders',  filteredOrders.length.toLocaleString('en-IN'))
  text('ow-kpi-revenue', fmt$(revenue))
  text('ow-kpi-rmcost',  fmt$(cost))
  text('ow-kpi-profit',  fmt$(profit))
  const el = document.getElementById('ow-kpi-profit')
  if (el) el.style.color = profit >= 0 ? 'var(--green,#16a34a)' : '#ef4444'
}

function renderOutwardOrders() {
  text('ow-orders-count', `${filteredOrders.length} completed orders`)
  if (!filteredOrders.length) {
    html('ow-orders-tbody', `<tr><td colspan="8" class="empty-state">No completed orders for the selected filters</td></tr>`)
    return
  }

  let totalRev = 0, totalCost = 0
  const monthFilter = document.getElementById('ow-month')?.value || ''
  let lastMonthKey = ''
  const rows = filteredOrders.map(o => {
    const customer = o.customers?.name || o.customer_name || o.dealer_name || '-'
    const rev = Number(o.total_amount || 0)
    const cost = Number(o.cost_amount || 0)
    const profit = rev - cost
    const invoice = o.invoice_number || o.source_bill_no || '—'
    const d = new Date(o.order_date || o.created_at)
    const monthKey = `${d.getFullYear()}-${d.getMonth()}`
    const monthRow = !monthFilter && monthKey !== lastMonthKey
      ? `<tr class="totals-row"><td colspan="8">${MONTHS[d.getMonth()]} ${d.getFullYear()}</td></tr>`
      : ''
    lastMonthKey = monthKey
    totalRev += rev
    totalCost += cost
    return `${monthRow}<tr>
      <td><a href="order-detail.html?id=${o.id}" style="color:var(--accent);text-decoration:none;font-family:monospace;font-weight:600;">${esc(o.order_uid || o.id.slice(0,8))}</a></td>
      <td style="font-family:monospace;color:#64748b;">${esc(invoice)}</td>
      <td>${fmtDate(o.order_date || o.created_at)}</td>
      <td>${esc(customer)}</td>
      <td>${badge(orderStatus(o))}</td>
      <td class="tr">${fmt$(rev)}</td>
      <td class="tr">${fmt$(cost)}</td>
      <td class="tr" style="color:${profit >= 0 ? 'var(--green,#16a34a)' : '#ef4444'}">${fmt$(profit)}</td>
    </tr>`
  }).join('')

  const tot = totalRev - totalCost
  html('ow-orders-tbody', rows + `<tr class="totals-row">
    <td colspan="5"><strong>Total (Completed)</strong></td>
    <td class="tr">${fmt$(totalRev)}</td>
    <td class="tr">${fmt$(totalCost)}</td>
    <td class="tr" style="color:${tot >= 0 ? 'var(--green,#16a34a)' : '#ef4444'}">${fmt$(tot)}</td>
  </tr>`)
}

function renderOutwardMaterials() {
  const orderIds = new Set(filteredOrders.map(o => o.id))
  const comps    = allComponents.filter(c => orderIds.has(c.order_id))

  if (!comps.length) {
    html('ow-rm-tbody', `<tr><td colspan="6" class="empty-state">No material consumption data for the selected filters</td></tr>`)
    text('ow-rm-count', '0 variants')
    return
  }

  const grouped = new Map()
  for (const c of comps) {
    const vId   = c.inv_variants?.id || 'unknown'
    const vName = c.inv_variants?.name || 'Unknown'
    const cat   = c.inv_variants?.inv_products?.inv_categories?.name || '—'
    const unit  = c.unit || c.inv_variants?.unit || 'pcs'
    const rawRate = Number(c.inv_variants?.purchase_rate || 0)
    const rate  = unit === 'ft' ? rawRate * 0.3048 : rawRate
    const qty   = Number(c.actual_qty ?? c.planned_qty ?? 0)
    if (!grouped.has(vId)) grouped.set(vId, { name: vName, cat, unit, rate, totalQty: 0, totalCost: 0, orderSet: new Set() })
    const g = grouped.get(vId)
    g.totalQty  += qty
    g.totalCost += qty * rate
    if (c.order_id) g.orderSet.add(c.order_id)
  }

  const sorted = [...grouped.values()].sort((a, b) => b.totalCost - a.totalCost)
  text('ow-rm-count', `${sorted.length} variants`)

  let grand = 0
  const rows = sorted.map(g => {
    grand += g.totalCost
    const qtyStr = g.totalQty % 1 === 0 ? g.totalQty : g.totalQty.toFixed(2)
    return `<tr>
      <td class="fw-600">${esc(g.name)}</td>
      <td><span class="text-muted text-sm">${esc(g.cat)}</span></td>
      <td class="tr">${qtyStr} ${esc(g.unit)}</td>
      <td class="tr">${g.rate ? fmt$(g.rate) + '/' + esc(g.unit) : '—'}</td>
      <td class="tr fw-600">${fmt$(g.totalCost)}</td>
      <td>${g.orderSet.size}</td>
    </tr>`
  }).join('')

  html('ow-rm-tbody', rows + `<tr class="totals-row">
    <td colspan="4"><strong>Total Material Cost</strong></td>
    <td class="tr">${fmt$(grand)}</td><td></td>
  </tr>`)
}

// ── Export ────────────────────────────────────────────────────────────────────
function exportCurrentTab() {
  if (currentTab === 'inward') exportInwardCSV()
  else exportOutwardCSV()
}

function exportInwardCSV() {
  // Export whatever is currently visible
  let rolls = []
  if (iwDrillLevel === 3 && iwSelectedBill) {
    const { dateKey, billNo, supplier } = iwSelectedBill
    rolls = allRolls.filter(r =>
      r.inward_date === dateKey &&
      (r.bill_no || '') === (billNo || '') &&
      (r.supplier || '') === (supplier || '')
    )
  } else if (iwDrillLevel >= 1 && iwSelectedYear) {
    rolls = iwBaseRolls().filter(r => {
      if (!r.inward_date) return false
      const d = new Date(r.inward_date)
      if (String(d.getFullYear()) !== String(iwSelectedYear)) return false
      if (iwDrillLevel >= 2 && iwSelectedMonth && (d.getMonth() + 1) !== iwSelectedMonth) return false
      return true
    })
  }

  const headers = ['Date','Bill No.','Supplier','Batch Code','Variant','Category','Qty','Unit','Rate','Value']
  const rows = rolls.map(r => [
    r.inward_date || '', r.bill_no || '', r.supplier || '', r.batch_code || '',
    r.variantName, r.categoryName, Number(r.original_length || 0),
    r.unit || 'm', r.effectiveRate, r.effectiveValue,
  ])
  downloadReport('Inward Report', 'inward_report.xlsx', headers, rows)
}

function exportOutwardCSV() {
  const headers = ['Order ID','Invoice No.','Date','Customer','Status','Order Value','Cost','Profit']
  const rows = filteredOrders.map(o => {
    const customer = o.customers?.name || o.customer_name || o.dealer_name || ''
    const rev = Number(o.total_amount || 0); const cost = Number(o.cost_amount || 0)
    return [o.order_uid || o.id, o.invoice_number || o.source_bill_no || '', (o.order_date || o.created_at || '').slice(0,10), customer, orderStatus(o), rev, cost, rev - cost]
  })
  downloadReport('Outward Orders', 'outward_orders.xlsx', headers, rows)
}

function downloadReport(sheetName, filename, headers, rows) {
  const ok = exportWorkbook([
    { name: sheetName, rows: [headers, ...rows], cols: headers.map(() => ({ wch: 18 })) },
  ], filename)
  if (ok) toast('Report exported to Excel')
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init()
