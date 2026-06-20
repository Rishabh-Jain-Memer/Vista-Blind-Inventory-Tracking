/*
  Order detail controller.
  Displays one order, its line items, production/cut details, status controls,
  and print/PDF output. Keep page-specific editing here; shared order summaries
  belong in reports/dashboard/customers.
*/

const TRACK_RECIPES = {
  'Super Track': ['SECTION NON-FERROUS SUPER TRACK','SUPER TRACK- RUNNER','BRACKET WALL SUPER TRACK','BRACKET CEILING-SUPER TRACK','END CAP SUPER TRACK'],
  'Jumbo Track': ['AL SECTION NON-FERROUS JUMBO TRACK','RUNNER FOR JUMBO TRACK','BRACKET FOR JUMBO TRACK','CEILING BRACKET FOR JUMBO TRACK','END CAP FOR JUMBO TRACK'],
  'M Track':     ['ALU SECTION NON-FERROUS M TRACK','Runner for M Track','Bracket Wall for M Track','Bracket Ceiling for M Track','End Cap for M Track'],
}

const QUOTE_CUSTOMER_SELECT = 'id, name, contact_person, phone, phone2, email, gstin, address, city, state'
const QUOTE_COMPANY = {
  name: 'TIMBERVISION LLP',
  address1: 'Gala No. 03, 2nd Floor, Wing-C, Gami Industrial Park, Plot No. C-39A, TTC Industrial Area,',
  address2: 'MIDC Pavne, Thane - 400703',
  emailLine: 'Email: vista@timbervisionllp.in, visit us at: www.vistafashions.com',
  gstin: 'GST NO-27AAQFT0936L1ZL',
  bank: {
    accountName: 'Timbervision LLP',
    bankName: 'HDFC Bank',
    branch: 'New Panvel East',
    accountNo: '50200111292252',
    ifsc: 'HDFC0000256',
  },
}

const QUOTE_DEFAULT_TERMS = {
  payment1: '50% Advance',
  payment2: 'Balance 50% within 7 days after installation',
  installation: 'Final measurements & Installation done by our Technician.',
  delivery: '7 to 8 days from the date of order processed with confirm PO',
}

let currentProfile    = null
let currentOrderId    = null
let currentOrder      = null
let currentItems      = []
let currentComponents = []
let currentWastageLogs = []
let currentQuoteForm = null
let currentQuoteDownloads = []
let executerProfiles = []
let supportsExecutorAssignment = true

function isSalesRole() {
  return currentProfile?.role === 'sales'
}

function canViewMoney() {
  return !isSalesRole()
}

function canViewSalesTotals() {
  return ['admin', 'sales'].includes(currentProfile?.role)
}

function canAssignSalesOrder() {
  return isSalesRole()
    && ['inquiry', 'processing'].includes(orderStatus(currentOrder))
}

function canEditCurrentOrder() {
  return ['admin', 'sales'].includes(currentProfile?.role)
    && !currentOrder?.deleted_at
    && !['executed', 'completed'].includes(orderStatus(currentOrder))
}

async function fetchOrderComponentsWithVariants(orderId) {
  const { data: components, error } = await db
    .from('order_components')
    .select('id, order_id, order_item_id, variant_id, component_name, planned_qty, actual_qty, is_width_dependent, unit, is_extra, deducted, created_at')
    .eq('order_id', orderId)
    .order('created_at')

  if (error) return { data: [], error }
  if (!components?.length) return { data: [], error: null }

  const variantIds = [...new Set(components.map(c => c.variant_id).filter(Boolean))]
  if (!variantIds.length) return { data: components, error: null }

  const { data: variants, error: variantErr } = await db
    .from('inv_variants')
    .select('id, name, unit, purchase_rate')
    .in('id', variantIds)

  if (variantErr) return { data: components, error: variantErr }

  const variantMap = new Map((variants || []).map(v => [v.id, v]))
  return {
    data: components.map(c => ({ ...c, inv_variants: c.variant_id ? (variantMap.get(c.variant_id) || null) : null })),
    error: null,
  }
}

async function fetchOrderItemsWithVariants(orderId) {
  const measurementFields = ', input_width_raw, input_width_unit, input_height_raw, input_height_unit, input_length_raw, input_length_unit, input_length_ft, chargeable_length_ft'
  const withProductCodeSelect = 'id, order_id, variant_id, roll_id, fg_stock_id, product_code_id, width_cm, height_cm, area_sqm, quantity, rate_applied, line_total, item_type, sale_unit, blind_type, fabric_deducted, product_name, created_at' + measurementFields
  const fallbackSelect = 'id, order_id, variant_id, roll_id, fg_stock_id, width_cm, height_cm, area_sqm, quantity, rate_applied, line_total, item_type, sale_unit, blind_type, fabric_deducted, product_name, created_at'
  let itemResult = await db
    .from('order_items')
    .select(withProductCodeSelect)
    .eq('order_id', orderId)
    .order('id')
  if (itemResult.error && /product_code_id|input_width_raw|input_width_unit|input_height_raw|input_height_unit|input_length_raw|input_length_unit|input_length_ft|chargeable_length_ft/i.test(itemResult.error.message || '')) {
    itemResult = await db
      .from('order_items')
      .select(fallbackSelect)
      .eq('order_id', orderId)
      .order('id')
  }
  const { data: items, error } = itemResult

  if (error) return { data: [], error }
  if (!items?.length) return { data: [], error: null }

  const variantIds = [...new Set(items.map(it => it.variant_id).filter(Boolean))]
  const fgStockIds = [...new Set(items.map(it => it.fg_stock_id).filter(Boolean))]
  const [variantRes, fgStockRes] = await Promise.all([
    variantIds.length
      ? db.from('inv_variants')
        .select('id, name, width_m, unit, purchase_rate, base_rate_sqm, inv_products(name, inv_categories(name, sub_group))')
        .in('id', variantIds)
      : Promise.resolve({ data: [], error: null }),
    fgStockIds.length
      ? db.from('fg_stock')
        .select('id, code, name, description, purchase_cost, quantity, unit')
        .in('id', fgStockIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (variantRes.error) return { data: items, error: variantRes.error }
  if (fgStockRes.error) console.warn('fg_stock hydration failed:', fgStockRes.error.message)

  const variantMap = new Map((variantRes.data || []).map(v => [v.id, v]))
  const fgStockMap = new Map((fgStockRes.data || []).map(v => [v.id, v]))
  return {
    data: items.map(it => ({
      ...it,
      inv_variants: it.variant_id ? (variantMap.get(it.variant_id) || null) : null,
      fg_stock: it.fg_stock_id ? (fgStockMap.get(it.fg_stock_id) || null) : null,
    })),
    error: null,
  }
}

async function fetchOrderItemsForCost(orderId) {
  const { data: items, error } = await db
    .from('order_items')
    .select('variant_id, fg_stock_id, height_cm, width_cm, quantity, area_sqm, blind_type, item_type, sale_unit, rate_applied, line_total')
    .eq('order_id', orderId)

  if (error) return { data: [], error }
  if (!items?.length) return { data: [], error: null }

  const variantIds = [...new Set(items.map(it => it.variant_id).filter(Boolean))]
  const fgStockIds = [...new Set(items.map(it => it.fg_stock_id).filter(Boolean))]
  const [variantRes, fgStockRes] = await Promise.all([
    variantIds.length
      ? db.from('inv_variants').select('id, purchase_rate, width_m').in('id', variantIds)
      : Promise.resolve({ data: [], error: null }),
    fgStockIds.length
      ? db.from('fg_stock').select('id, purchase_cost, unit').in('id', fgStockIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (variantRes.error) return { data: items, error: variantRes.error }
  if (fgStockRes.error) console.warn('fg_stock cost hydration failed:', fgStockRes.error.message)

  const variantMap = new Map((variantRes.data || []).map(v => [v.id, v]))
  const fgStockMap = new Map((fgStockRes.data || []).map(v => [v.id, v]))
  return {
    data: items.map(it => ({
      ...it,
      inv_variants: it.variant_id ? (variantMap.get(it.variant_id) || null) : null,
      fg_stock: it.fg_stock_id ? (fgStockMap.get(it.fg_stock_id) || null) : null,
    })),
    error: null,
  }
}

async function fetchOrderForDetail(orderId) {
  let result = await db
    .from('orders')
    .select(`*, customers!cust_id(${QUOTE_CUSTOMER_SELECT})`)
    .eq('id', orderId)
    .single()

  if (result.error && /contact_person|phone2|email|gstin|address|state/i.test(result.error.message || '')) {
    result = await db
      .from('orders')
      .select('*, customers!cust_id(id, name, phone, city)')
      .eq('id', orderId)
      .single()
  }

  return result
}

async function fetchQuoteForm(orderId) {
  const { data, error } = await db
    .from('order_quote_forms')
    .select('order_id, form_data, updated_at, updated_by')
    .eq('order_id', orderId)
    .maybeSingle()

  if (error) {
    if (/order_quote_forms|relation .* does not exist|schema cache/i.test(error.message || '')) {
      console.warn('Quote/proforma form table unavailable. Run migration 033_order_quote_forms_and_downloads.sql:', error.message)
      return { data: null, error: null }
    }
    return { data: null, error }
  }
  return { data, error: null }
}

async function fetchQuoteDownloads(orderId) {
  const { data, error } = await db
    .from('order_quote_downloads')
    .select('id, order_id, quote_no, document_type, form_data, html, created_at, created_by')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })

  if (error) {
    if (/order_quote_downloads|relation .* does not exist|schema cache/i.test(error.message || '')) {
      console.warn('Quote download history table unavailable. Run migration 033_order_quote_forms_and_downloads.sql:', error.message)
      return { data: [], error: null }
    }
    return { data: [], error }
  }
  return { data: data || [], error: null }
}

async function fetchOrderComponentsForCost(orderId) {
  const compRes = await fetchOrderComponentsWithVariants(orderId)
  if (compRes.error) return compRes
  return {
    data: (compRes.data || []).map(c => ({
      actual_qty: c.actual_qty,
      planned_qty: c.planned_qty,
      unit: c.unit,
      inv_variants: c.inv_variants,
    })),
    error: null,
  }
}

function orderStatus(o = currentOrder) {
  const s = String(o?.status || '').toLowerCase()
  if (s === 'discussing' || s === 'pending') return 'inquiry'
  if (s === 'in progress') return 'processing'
  return s
}

// Lazy-loaded for edit modal
let editData = null

function isFinishedGoodVariantForEdit(v) {
  return INVENTORY_SOURCE.isFinishedGoodVariant(v)
/*
  const catName = String(v?.category?.name || '').toLowerCase()
  const subGroup = String(v?.category?.sub_group || '').toLowerCase()
  return subGroup === 'fg'
    || subGroup === 'finished goods'
    || catName.includes(' finished goods')
    || catName.endsWith(' fg')
*/
}

function editVariantAvailableQty(v) {
  return INVENTORY_SOURCE.availableQty(v)
/*
  return (v?.rolls || [])
    .filter(r => r.status === 'in_stock')
    .reduce((s, r) => s + Number(r.remaining_length || 0), 0)
*/
}

function buildEditDirectItems() {
  return INVENTORY_SOURCE.buildDirectOrderItems({
    fgStock: editData?.fgStock || [],
    variants: editData?.variants || [],
    includeAdditionalVariant: isAdditionalDirectOrderVariant,
  })
/*
  const fgStockItems = (editData?.fgStock || []).map(item => ({
    ...item,
    key: `fg:${item.id}`,
    source: 'fg_stock',
    fgStockId: item.id,
    variantId: null,
    code: item.code || '',
    name: item.name || 'Finished Good',
    description: item.description || '',
    purchase_cost: item.purchase_cost,
    quantity: Number(item.quantity || 0),
    unit: item.unit || 'pcs',
    categoryLabel: 'Finished Goods',
  }))

  const variantItems = (editData?.variants || [])
    .filter(v => isFinishedGoodVariantForEdit(v) && !isHiddenOrderVariant(v))
    .map(v => ({
      key: `var:${v.id}`,
      source: 'variant',
      fgStockId: null,
      variantId: v.id,
      code: v.inv_products?.name || v.category?.name || '',
      name: v.name || 'Finished Good',
      description: [v.inv_products?.name, v.category?.name].filter(Boolean).join(' · '),
      purchase_cost: v.purchase_rate,
      quantity: editVariantAvailableQty(v),
      unit: v.unit || 'pcs',
      categoryLabel: v.category?.name || 'Finished Goods',
      variant: v,
    }))

  return [...fgStockItems, ...variantItems]
    .sort((a, b) => `${a.categoryLabel} ${a.name}`.localeCompare(`${b.categoryLabel} ${b.name}`))
*/
}

function readPositiveNumber(inputId, label) {
  const raw = document.getElementById(inputId)?.value
  const num = Number(raw)
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`${label}: enter a valid number`)
  }
  return num
}

function editMeasuredBilling(qty, unit, wRaw, hRaw, wUnit = 'cm', hUnit = 'cm') {
  const baseUnit = unit || 'pcs'
  const normalizedUnit = String(baseUnit).toLowerCase()
  const hasWidth = !isNaN(wRaw) && wRaw > 0
  const hasLength = !isNaN(hRaw) && hRaw > 0
  const widthCm = hasWidth ? cvtUnit(wRaw, wUnit, 'cm') : null
  const heightCm = hasLength ? cvtUnit(hRaw, hUnit, 'cm') : null
  let billQty = qty
  let areaSqm = qty
  let saleUnit = baseUnit
  let labelUnit = baseUnit
  let mode = 'qty'

  if (hasWidth && hasLength) {
    areaSqm = (widthCm / 100) * (heightCm / 100) * qty
    billQty = areaSqm
    saleUnit = 'sqm'
    labelUnit = 'sqm'
    mode = 'area'
  } else if (hasLength && normalizedUnit === 'm') {
    billQty = (heightCm / 100) * qty
    areaSqm = billQty
    mode = 'length'
  } else if (hasLength && normalizedUnit === 'ft') {
    billQty = cvtUnit(hRaw, hUnit, 'ft') * qty
    areaSqm = billQty
    mode = 'length'
  }

  return { billQty, areaSqm, saleUnit, labelUnit, widthCm, heightCm, hasWidth, hasLength, mode }
}

function numberInputValue(value, fallback = 1) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? String(num) : String(fallback)
}

// Blind-type → fabric category mapping (mirrors create-order.js)
const BLIND_TYPE_TREE = {
  'Roller Blinds': ['Roller Blinds Without Headrail','Roller Blinds With Headrail','Roller Blinds With Plain Cassette','Roller Blinds With Decorative Cassette'],
  'Vertical Blinds': ['Vertical Blinds'],
  'Roman Blinds': ['Roman Blinds'],
  'Sheer Dimout Blinds': ['Sheer Dimout Blinds Classic Mechanism with Plain Cassette','Sheer Dimout Blinds Classic Mechanism with Decorative Cassette','Sheer Dimout Blinds Premium Mechanism with Plain Cassette','Sheer Dimout Blinds Premium Mechanism with Decorative Cassette'],
  'S Contour Blinds': ['S-Contour Blinds'],
  'Cellular Blinds': ['Cellular Blinds'],
  'Wooden Venetian Blinds': ['Wooden Venetian Blinds'],
}
const BLIND_FABRIC_MAP = {
  'Roller Blinds': ['Roller Blind Fabrics'],
  'Vertical Blinds': ['Vertical Blind Fabrics', 'Vertical Fabrics'],
  'Roman Blinds': ['Roller Blind Fabrics'],
  'Sheer Dimout Blinds': ['Sheer Dimout Fabrics'],
  'S Contour Blinds': ['S-Contour Fabrics'],
  'Cellular Blinds': ['Roller Blind Fabrics'],
  'Wooden Venetian Blinds': [],
}
const DIM_UNITS = ['cm', 'in', 'ft', 'm']
const HIDDEN_ORDER_MAIN_TYPES = new Set()
const HIDDEN_ORDER_CATEGORY_NAMES = new Set()
const ADDITIONAL_DIRECT_ORDER_CATEGORY_NAMES = new Set(['verticalblindfabrics'])

function normCatalogName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isHiddenOrderCategory(category) {
  return HIDDEN_ORDER_CATEGORY_NAMES.has(normCatalogName(category?.name))
}

function isHiddenOrderVariant(variant) {
  return isHiddenOrderCategory(variant?.category)
}

function isAdditionalDirectOrderVariant(variant) {
  return ADDITIONAL_DIRECT_ORDER_CATEGORY_NAMES.has(normCatalogName(variant?.category?.name))
}

function categoryMatchesName(category, name) {
  const catNorm = normCatalogName(category?.name)
  const wantNorm = normCatalogName(name)
  return catNorm && wantNorm && (catNorm === wantNorm || catNorm.includes(wantNorm) || wantNorm.includes(catNorm))
}

async function init() {
  const profile = await initSidebar()
  if (!profile) return
  currentProfile = profile

  const id = new URLSearchParams(window.location.search).get('id')
  if (!id) { window.location.href = 'orders.html'; return }
  currentOrderId = id

  const [orderRes, itemsRes, compRes, wastageRes, quoteFormRes, quoteDownloadsRes] = await Promise.all([
    fetchOrderForDetail(id),
    fetchOrderItemsWithVariants(id),
    fetchOrderComponentsWithVariants(id),
    db.from('wastage_logs')
      .select('id, order_item_id, cut_length_m, used_length_m, cut_width_m, used_width_m')
      .eq('order_id', id),
    fetchQuoteForm(id),
    fetchQuoteDownloads(id),
  ])

  if (orderRes.error || !orderRes.data) { toast('Order not found', 'error'); return }
  if (itemsRes.error) console.warn('Order items:', itemsRes.error.message)
  if (compRes.error) console.warn('Order components:', compRes.error.message)

  currentOrder       = orderRes.data
  currentItems       = itemsRes.data    ?? []
  currentComponents  = compRes.data     ?? []
  currentWastageLogs = wastageRes.data  ?? []
  currentQuoteForm = quoteFormRes.data?.form_data || null
  currentQuoteDownloads = quoteDownloadsRes.data || []

  if (currentOrder?.assigned_executor_id) {
    try {
      const { data: assignedProfile } = await db
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', currentOrder.assigned_executor_id)
        .maybeSingle()
      currentOrder._assignedExecutorName = assignedProfile?.full_name || assignedProfile?.email || null
    } catch (_) {
      supportsExecutorAssignment = false
    }
  }

  // If some items have no DB components, try to auto-populate from recipes
  // then re-fetch so we can show them immediately
  const itemsWithNoComps = currentItems.filter(it =>
    (it.item_type || 'finished_goods') === 'finished_goods' &&
    !currentComponents.some(c => c.order_item_id === it.id)
  )
  if (itemsWithNoComps.length) {
    await ensureOrderComponents(id)
    const freshCompRes = await fetchOrderComponentsWithVariants(id)
    if (freshCompRes.error) console.warn('Fresh order components:', freshCompRes.error.message)
    currentComponents = freshCompRes.data ?? currentComponents
  }

  renderHeader()
  renderActions()
  updateQuoteDownloadsButton()
  renderInfo()
  renderItems()
  await loadMovements()
  await renderFinancialSummary()
  scrubSalesOrderDetailUI()

  hide('loading')
  show('content')
}

// ── Header ───────────────────────────────────────────────────────────────────
function renderHeader() {
  const uid = currentOrder.order_uid || currentOrder.id.substring(0,8).toUpperCase()
  text('order-title', `Order #${uid}`)
  html('order-badge', badge(orderStatus()))
  html('order-uid-badge', currentOrder.order_uid ? `<i class="fa-solid fa-hashtag" style="font-size:11px;"></i> ${esc(currentOrder.order_uid)}` : '')
}

// ── Actions toolbar ──────────────────────────────────────────────────────────
function renderActions() {
  const role     = currentProfile?.role
  const status   = orderStatus()
  const canExec  = ['admin', 'executer'].includes(role)
  const isDeleted = !!currentOrder.deleted_at

  // Show Edit Order button for editable sales/admin orders.
  const editBtn = document.getElementById('edit-order-btn')
  if (editBtn && canEditCurrentOrder()) {
    editBtn.style.display = ''
  }

  const btns = []

  // Execute button — shown when Processing and user can execute
  if (canExec && status === 'processing') {
    const allDeducted = currentItems.every(i => i.fabric_deducted)
    if (!allDeducted) {
      btns.push(`
        <button class="execute-btn" onclick="executeOrder()" id="exec-btn">
          <i class="fa-solid fa-bolt"></i> Execute Order
        </button>`)
    } else {
      btns.push(`<span class="deducted-badge"><i class="fa-solid fa-check-circle"></i> Inventory Deducted</span>`)
    }
  }

  // Status change dropdown for admin/staff
  if (role === 'admin' && !isDeleted && status !== 'completed') {
    const opts = []
    if (status === 'inquiry') opts.push(`<option value="processing">Move to Processing</option>`)
    if (status === 'processing') opts.push(`<option value="inquiry">Back to Inquiry</option>`)
    if (status === 'executed') opts.push(`<option value="completed">Mark as Completed</option>`)
    if (opts.length) {
      btns.push(`
        <select class="btn btn-secondary" onchange="updateStatus(this)" style="padding:8px 12px;height:38px;">
          <option value="" disabled selected>Update Status…</option>
          ${opts.join('')}
        </select>`)
    }
  }

  if (canAssignSalesOrder()) {
    btns.push(`
      <button class="btn btn-secondary" onclick="assignExecuterToCurrentOrder()">
        <i class="fa-solid fa-user-check"></i> Assign Executer
      </button>`)
  }

  if (role === 'admin' && !isDeleted && ['processing', 'executed', 'completed'].includes(status)) {
    btns.push(`
      <button class="btn btn-secondary" onclick="openRollbackOrder()" style="border-color:#f97316;color:#c2410c;">
        <i class="fa-solid fa-rotate-left"></i> Roll Back
      </button>`)
  }

  // Restore button for deleted orders
  if (isDeleted && role === 'admin') {
    btns.push(`<button class="btn btn-secondary" onclick="restoreThisOrder()" style="border-color:#10b981;color:#059669;">
      <i class="fa-solid fa-trash-restore"></i> Restore Order
    </button>`)
  }

  html('admin-actions', btns.join(''))
}

function updateQuoteDownloadsButton() {
  const btn = document.getElementById('quote-downloads-btn')
  if (!btn) return
  const count = currentQuoteDownloads.length
  btn.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> Downloads${count ? ` (${count})` : ''}`
}

// ── Info card ────────────────────────────────────────────────────────────────
function renderInfo() {
  const o = currentOrder
  const customer = o.customers?.name || o.customer_name || o.dealer_name || 'Unknown'
  const customerSub = [o.customers?.phone, o.customers?.city].filter(Boolean).join(' · ')

  html('order-info', `
    <div>
      <div class="info-label">Customer</div>
      <div class="info-value">${esc(customer)}</div>
      ${customerSub ? `<div class="text-xs text-muted">${esc(customerSub)}</div>` : ''}
    </div>
    <div>
      <div class="info-label">Order Date</div>
      <div class="info-value">${fmtDateTime(o.order_date || o.created_at)}</div>
    </div>
    <div>
      <div class="info-label">Source</div>
      <div class="info-value">${esc(sourceLabel(o.source))}</div>
    </div>
    ${canViewSalesTotals() ? `<div>
      <div class="info-label">Grand Total</div>
      <div class="info-value fw-600" style="font-size:18px;color:#059669;">${fmt$(computeOrderRevenueFromItems(currentItems))}</div>
    </div>` : ''}
    ${o._assignedExecutorName ? `<div><div class="info-label">Assigned Executer</div><div class="info-value">${esc(o._assignedExecutorName)}</div></div>` : ''}
    ${o.dealer_name ? `<div><div class="info-label">Dealer / Agent</div><div class="info-value">${esc(o.dealer_name)}</div></div>` : ''}
    ${(o.invoice_number || o.invoice_date) ? `<div><div class="info-label">Invoice</div><div class="info-value">${esc(o.invoice_number || o.source_bill_no || '')}${o.invoice_date ? `<div class="text-xs text-muted">${fmtDate(o.invoice_date)}</div>` : ''}</div></div>` : ''}
    ${o.source_bill_no && !o.invoice_number ? `<div><div class="info-label">Bill / Ref No.</div><div class="info-value">${esc(o.source_bill_no)}</div></div>` : ''}
    ${o.notes ? `<div style="grid-column:1/-1">
      <div class="info-label">Notes</div>
      <div class="info-value">${esc(o.notes)}</div>
    </div>` : ''}
  `)
}

// ── Items list ───────────────────────────────────────────────────────────────
function renderItems() {
  text('items-heading', `Items (${currentItems.length})`)

  if (!currentItems.length) {
    html('items-list', `<div class="text-muted" style="padding:20px;">No items on this order.</div>`)
    return
  }

  html('items-list', renderAggregatedComponentsCard(currentComponents) + currentItems.map(it => renderItemCard(it)).join(''))
  scrubSalesOrderDetailUI()
}

function componentAggregateKey(c) {
  return c.variant_id || `name:${(c.component_name || c.inv_variants?.name || '').toLowerCase()}|${c.unit || c.inv_variants?.unit || 'pcs'}`
}

function aggregateComponents(components = []) {
  const grouped = new Map()
  for (const c of components) {
    const key = componentAggregateKey(c)
    if (!grouped.has(key)) grouped.set(key, { ...c, planned_qty: 0, actual_qty: 0, hasActual: false, rows: [] })
    const g = grouped.get(key)
    g.planned_qty += Number(c.planned_qty || 0)
    if (c.actual_qty != null) {
      g.actual_qty += Number(c.actual_qty || 0)
      g.hasActual = true
    }
    g.deducted = Boolean(g.deducted && c.deducted)
    g.rows.push(c)
  }
  return [...grouped.values()].map(g => ({ ...g, actual_qty: g.hasActual ? g.actual_qty : null }))
}

function renderAggregatedComponentsCard(components = []) {
  const comps = aggregateComponents(components)
  if (!comps.length) return ''
  return `
    <div class="item-card">
      <div class="item-card-header">
        <span class="item-tag tag-rm">Components</span>
        <strong>Combined Components Required</strong>
        <span class="text-xs text-muted">${comps.length} type${comps.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="item-card-body">
        <table class="bom-table" style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb;">Component</th>
            <th style="text-align:right;padding:6px 8px;border-bottom:1px solid #e5e7eb;">Recommended</th>
            <th style="text-align:right;padding:6px 8px;border-bottom:1px solid #e5e7eb;">Actual</th>
            <th style="text-align:right;padding:6px 8px;border-bottom:1px solid #e5e7eb;">Unit</th>
          </tr></thead>
          <tbody>${comps.map(c => `<tr>
            <td style="padding:6px 8px;">${esc(c.inv_variants?.name || c.component_name || 'Component')}</td>
            <td style="padding:6px 8px;text-align:right;font-weight:600;">${componentQtyDisplay(c, c.planned_qty)}</td>
            <td style="padding:6px 8px;text-align:right;">${c.actual_qty != null ? componentQtyDisplay(c, c.actual_qty) : '—'}</td>
            <td style="padding:6px 8px;text-align:right;color:#64748b;">${esc(c.unit || c.inv_variants?.unit || 'pcs')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`
}

function scrubSalesOrderDetailUI() {
  if (!isSalesRole()) return
  document.getElementById('financial-summary')?.classList.add('d-none')
  document.getElementById('financial-summary')?.replaceChildren()
}

function fmtMeasure(n, decimals = 3) {
  const v = Number(n || 0)
  if (!isFinite(v)) return '0'
  return v % 1 === 0 ? v.toFixed(0) : parseFloat(v.toFixed(decimals)).toString()
}

function lengthAlternatesFromCm(cm) {
  const v = Number(cm || 0)
  if (!v) return ''
  return `${fmtMeasure(v / 100)} m | ${fmtMeasure(v / 2.54, 2)} in | ${fmtMeasure(v / 30.48, 3)} ft`
}

function lengthAlternatesFromFt(ft) {
  const v = Number(ft || 0)
  if (!v) return ''
  return `${fmtMeasure(v * 30.48, 2)} cm | ${fmtMeasure(v * 0.3048, 3)} m | ${fmtMeasure(v * 12, 2)} in`
}

function dimCell(label, primary, secondary = '') {
  return `<div class="dim-cell"><div class="dim-label">${label}</div><div class="dim-value">${primary}${secondary ? `<div class="dim-label">${secondary}</div>` : ''}</div></div>`
}

function normalizedSaleUnit(unit) {
  return String(unit || '').toLowerCase().replace(/\s+/g, '')
}

function trackChargeableFt(it) {
  const explicitChargeable = Number(it?.chargeable_length_ft || 0)
  if (explicitChargeable > 0) return explicitChargeable

  const inputFt = Number(it?.input_length_ft || 0)
  if (inputFt > 0) return Math.ceil(inputFt * 2) / 2

  const raw = Number(it?.input_length_raw || 0)
  if (raw > 0) return Math.ceil(cvtUnit(raw, it?.input_length_unit || 'ft', 'ft') * 2) / 2

  const legacy = Number(it?.area_sqm || 0)
  if (legacy > 60) return Math.ceil((legacy / 12) * 2) / 2
  return legacy
}

function trackItemRevenue(it) {
  const qty = Number(it.quantity || 0)
  const rate = Number(it.rate_applied || 0)
  return qty > 0 && rate > 0 ? qty * rate : Number(it.line_total || 0)
}

function resaleBillQty(it) {
  const storedArea = Number(it.area_sqm || 0)
  const qty = Number(it.quantity || 0)
  const unit = normalizedSaleUnit(it.sale_unit || it.fg_stock?.unit || it.inv_variants?.unit)
  if (storedArea > 0 && ['sqm', 'm2', 'm²', 'sq.m', 'sqmt', 'm', 'ft'].includes(unit)) return storedArea
  if (storedArea > 0 && Number(it.width_cm || 0) > 0 && Number(it.height_cm || 0) > 0) return storedArea
  return qty || storedArea
}

function directInputQty(it) {
  const qty = Number(it.quantity || 0)
  const storedArea = Number(it.area_sqm || 0)
  const wM = Number(it.width_cm || 0) / 100
  const hM = Number(it.height_cm || 0) / 100
  const perPieceArea = wM > 0 && hM > 0 ? wM * hM : 0
  if (perPieceArea > 0 && storedArea > 0 && Math.abs(qty - storedArea) < 0.001) {
    return storedArea / perPieceArea
  }
  return qty
}

function orderItemRevenue(it) {
  const itemType = it.item_type || 'finished_goods'
  const rate = Number(it.rate_applied || 0)
  if (itemType === 'finished_goods') {
    const wM = Number(it.width_cm || 0) / 100
    const hM = Number(it.height_cm || 0) / 100
    const qty = Number(it.quantity || 1)
    const area = wM > 0 && hM > 0 ? wM * hM * qty : Number(it.area_sqm || 0)
    return area * rate
  }
  if (itemType === 'track') return trackItemRevenue(it)
  const billQty = resaleBillQty(it)
  return rate > 0 && billQty > 0 ? billQty * rate : Number(it.line_total || 0)
}

function directPurchaseRate(it) {
  return Number(it.inv_variants?.purchase_rate || it.fg_stock?.purchase_cost || 0)
}

function directUnit(it) {
  return it.sale_unit || it.fg_stock?.unit || it.inv_variants?.unit || 'pcs'
}

function buildOrderItemDimensionGrid(it, ctx) {
  const { isFG, isTrack, w_cm, h_cm, qty, areaSqm, areaSqft } = ctx
  if (isFG && w_cm && h_cm) {
    const widthInput = it.input_width_raw ? `${fmtMeasure(it.input_width_raw, 3)} ${esc(it.input_width_unit || '')}`.trim() : ''
    const heightInput = it.input_height_raw ? `${fmtMeasure(it.input_height_raw, 3)} ${esc(it.input_height_unit || '')}`.trim() : ''
    return `
      <div class="dim-grid">
        ${dimCell('Width', `${fmtMeasure(w_cm, 2)} cm`, `${widthInput ? `Input: ${widthInput} | ` : ''}${lengthAlternatesFromCm(w_cm)}`)}
        ${dimCell('Height', `${fmtMeasure(h_cm, 2)} cm`, `${heightInput ? `Input: ${heightInput} | ` : ''}${lengthAlternatesFromCm(h_cm)}`)}
        ${dimCell('Quantity', qty)}
        ${dimCell('Area', `${areaSqm.toFixed(3)} m²`, `${areaSqft.toFixed(2)} ft²`)}
      </div>`
  }
  if (isTrack) {
    const chargeableFt = trackChargeableFt(it)
    const inputFt = Number(it.input_length_ft || 0)
    const inputDisplay = it.input_length_raw
      ? `${fmtMeasure(it.input_length_raw, 3)} ${esc(it.input_length_unit || '')} = ${fmtMeasure(inputFt || chargeableFt, 3)} ft`
      : ''
    const totalChargeableFt = chargeableFt * qty
    return `<div class="dim-grid">
      ${dimCell('Quantity', `${qty} track${qty !== 1 ? 's' : ''}`)}
      ${inputDisplay ? dimCell('Input Length', inputDisplay, lengthAlternatesFromFt(inputFt || chargeableFt)) : ''}
      ${dimCell('Chargeable Length', `${fmtMeasure(chargeableFt, 1)} ft`, `${lengthAlternatesFromFt(chargeableFt)} | rounded up to nearest 0.5 ft`)}
      ${dimCell('Total Cut Length', `${fmtMeasure(totalChargeableFt, 1)} ft`, `${fmtMeasure(totalChargeableFt * 0.3048, 3)} m`)}
    </div>`
  }
  if (!isFG) {
    const unit = directUnit(it)
    const billQty = resaleBillQty(it)
    const inputQty = directInputQty(it)
    const widthInput = it.input_width_raw ? `${fmtMeasure(it.input_width_raw, 3)} ${esc(it.input_width_unit || '')}`.trim() : ''
    const heightInput = it.input_height_raw ? `${fmtMeasure(it.input_height_raw, 3)} ${esc(it.input_height_unit || '')}`.trim() : ''
    if (w_cm > 0 && h_cm > 0) {
      return `<div class="dim-grid">
        ${dimCell('Width', `${fmtMeasure(w_cm, 2)} cm`, `${widthInput ? `Input: ${widthInput} | ` : ''}${lengthAlternatesFromCm(w_cm)}`)}
        ${dimCell('Height / Length', `${fmtMeasure(h_cm, 2)} cm`, `${heightInput ? `Input: ${heightInput} | ` : ''}${lengthAlternatesFromCm(h_cm)}`)}
        ${inputQty ? dimCell('Input Qty', `${fmtMeasure(inputQty, 3)} pcs`) : ''}
        ${dimCell('Billing Qty', `${fmtMeasure(billQty, 3)} ${esc(unit)}`, `${(billQty * 10.7639).toFixed(2)} ft²`)}
      </div>`
    }
    if (h_cm > 0) {
      return `<div class="dim-grid">
        ${dimCell('Length', `${fmtMeasure(h_cm, 2)} cm`, `${heightInput ? `Input: ${heightInput} | ` : ''}${lengthAlternatesFromCm(h_cm)}`)}
        ${inputQty ? dimCell('Input Qty', `${fmtMeasure(inputQty, 3)} pcs`) : ''}
        ${dimCell('Billing Qty', `${fmtMeasure(billQty, 3)} ${esc(unit)}`)}
      </div>`
    }
    return `<div class="dim-grid">
      ${dimCell('Billing Qty', `${fmtMeasure(billQty, 3)} ${esc(unit)}`)}
    </div>`
  }
  return ''
}

function componentQtyDisplay(c, qty) {
  const n = Number(qty || 0)
  const unit = c.unit || c.inv_variants?.unit || 'pcs'
  if (unit === 'ft') return `${fmtMeasure(n, 3)} ft (${fmtMeasure(n * 0.3048, 3)} m)`
  return fmtMeasure(n, 3)
}

function renderDirectItemFinancialBreakdown({ purchaseRate, sellingRate, billQty, rateUnit, cost, revenue, margin, marginColor }) {
  return `
    <div style="margin-top:10px;padding:10px 12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
      <div class="fw-600" style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px;">
        <i class="fa-solid fa-chart-pie" style="color:#6366f1;margin-right:4px;"></i> Cost Breakdown
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;margin-bottom:6px;">
        ${purchaseRate > 0
          ? `<span style="color:#1d4ed8;"><i class="fa-solid fa-receipt" style="margin-right:3px;font-size:10px;"></i>Purchase: <strong>${fmt$(purchaseRate)}/${esc(rateUnit)}</strong></span>`
          : `<span style="color:#64748b;"><i class="fa-solid fa-receipt" style="margin-right:3px;font-size:10px;"></i>Purchase: <strong>Not recorded</strong></span>`}
        <span style="color:#374151;"><i class="fa-solid fa-tag" style="margin-right:3px;font-size:10px;"></i>Selling: <strong>${fmt$(sellingRate)}/${esc(rateUnit)}</strong></span>
        <span style="color:#64748b;">Billing Qty: <strong>${fmtMeasure(billQty, 3)} ${esc(rateUnit)}</strong></span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:6px 10px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:5px;font-size:12px;">
        ${purchaseRate > 0 ? `<span style="color:#64748b;">Material Cost: <strong>${fmt$(cost)}</strong></span>` : ''}
        <span>Revenue: <strong style="color:#059669;">${fmt$(revenue)}</strong></span>
        ${revenue > 0 && purchaseRate > 0 ? `<span style="color:${marginColor};font-weight:700;padding:2px 8px;background:${margin>=20?'#d1fae5':margin>=10?'#fef3c7':'#fee2e2'};border-radius:999px;">Margin: ${margin.toFixed(1)}%</span>` : ''}
      </div>
    </div>`
}

function itemTypeLabel(it) {
  const itemType = it.item_type || 'finished_goods'
  if (itemType === 'track') return 'Track'
  if (itemType === 'resale') return 'Direct Order'
  if (itemType === 'raw_material') return 'Raw Material'
  return 'Blind'
}

function itemTypeTagClass(it) {
  return (it.item_type || 'finished_goods') === 'finished_goods' ? 'tag-fg' : 'tag-rm'
}

function itemTitle(it) {
  const itemType = it.item_type || 'finished_goods'
  if (itemType === 'track') return it.blind_type || it.product_name || 'Track'
  if (itemType === 'resale') return it.product_name || it.fg_stock?.name || it.inv_variants?.name || 'Direct order item'
  if (itemType === 'raw_material') return it.product_name || it.inv_variants?.name || 'Raw material'
  return it.product_name || it.blind_type || it.inv_variants?.name || 'Blind'
}

function addUniqueDetail(rows, label, value) {
  const clean = String(value || '').trim()
  if (!clean || clean === '-' || clean === '—') return
  if (rows.some(row => row.label === label && row.value === clean)) return
  rows.push({ label, value: clean })
}

function itemIdentityRows(it) {
  const itemType = it.item_type || 'finished_goods'
  const rows = []
  const title = itemTitle(it)
  const variant = it.inv_variants
  const product = variant?.inv_products
  const category = product?.inv_categories
  const fg = it.fg_stock

  if (itemType === 'finished_goods') {
    addUniqueDetail(rows, 'Order Type', 'Made-to-measure blind')
    addUniqueDetail(rows, 'Blind Type', it.blind_type)
    addUniqueDetail(rows, 'Fabric', variant?.name)
    addUniqueDetail(rows, 'Fabric Group', [category?.name, product?.name].filter(Boolean).join(' / '))
    addUniqueDetail(rows, 'Roll Width', variant?.width_m ? `${fmtMeasure(variant.width_m, 3)} m` : '')
  } else if (itemType === 'resale') {
    const unit = it.sale_unit || fg?.unit || variant?.unit
    addUniqueDetail(rows, 'Order Type', 'Direct/custom order')
    addUniqueDetail(rows, 'Direct Item', title)
    addUniqueDetail(rows, 'Linked Stock', [fg?.code, fg?.name].filter(Boolean).join(' - '))
    addUniqueDetail(rows, 'Description', fg?.description)
    addUniqueDetail(rows, 'Variant', variant?.name)
    addUniqueDetail(rows, 'Billing Basis', normalizedSaleUnit(unit) === 'sqm' ? 'Per SQM' : unit)
  } else if (itemType === 'track') {
    addUniqueDetail(rows, 'Order Type', 'Track')
    addUniqueDetail(rows, 'Track Type', it.blind_type || it.product_name)
    addUniqueDetail(rows, 'Billing Basis', 'Per track')
  } else {
    addUniqueDetail(rows, 'Order Type', 'Raw material')
    addUniqueDetail(rows, 'Material', variant?.name || it.product_name)
    addUniqueDetail(rows, 'Product Group', [category?.name, product?.name].filter(Boolean).join(' / '))
    addUniqueDetail(rows, 'Billing Basis', it.sale_unit || variant?.unit)
  }

  return rows
}

function renderItemIdentity(it) {
  const rows = itemIdentityRows(it)
  if (!rows.length) return ''
  return `
    <div class="item-identity-grid">
      ${rows.map(row => `
        <div class="item-identity-pill">
          <span>${esc(row.label)}</span>
          <strong>${esc(row.value)}</strong>
        </div>`).join('')}
    </div>`
}

function renderItemCard(it) {
  const isFG     = (it.item_type || 'finished_goods') === 'finished_goods'
  const w_cm     = Number(it.width_cm || 0)
  const h_cm     = Number(it.height_cm || 0)
  const qty      = Number(it.quantity || 1)
  const w_m      = w_cm / 100
  const h_m      = h_cm / 100
  const areaSqm  = Number(it.area_sqm || (w_m * h_m * qty) || 0)
  const revenueAreaSqm = (w_m > 0 && h_m > 0) ? (w_m * h_m * qty) : areaSqm
  const areaSqft = areaSqm * 10.7639

  const deductedBadge = it.fabric_deducted
    ? `<span class="deducted-badge"><i class="fa-solid fa-check-circle"></i> Deducted</span>`
    : `<span style="font-size:11px;color:#f59e0b;font-weight:600;"><i class="fa-solid fa-clock"></i> Pending execution</span>`

  // Use DB components if present; otherwise compute from recipe in-memory
  let itemComps = currentComponents.filter(c => c.order_item_id === it.id)
  if (!itemComps.length && isFG) {
    const recipe = findRecipeForBlindType(
      (window._cachedRecipes || []),
      it.blind_type || it.product_name
    )
    if (recipe?.recipe_items?.length) {
      const wM = Number(it.width_cm || 0) / 100
      const qtyR  = Number(it.quantity || 1)
      itemComps = recipe.recipe_items.map(ri => ({
        id:                 `tmp-${it.id}-${ri.variant_id}`,
        order_item_id:      it.id,
        variant_id:         ri.variant_id,
        planned_qty:        ri.is_width_dependent
          ? wM * qtyR
          : Number(ri.quantity_per_unit || 0) * qtyR,
        actual_qty:         null,
        is_width_dependent: ri.is_width_dependent,
        unit:               ri.inv_variants?.unit || 'pcs',
        deducted:           false,
        isTemp:             true,
        inv_variants:       ri.inv_variants,
      }))
    }
  }

  const isTrack  = it.item_type === 'track'
  const isResale = it.item_type === 'resale'

  let dimsHtml = ''
  if (isFG && w_cm && h_cm) {
    const widthInput = it.input_width_raw ? `${fmtMeasure(it.input_width_raw, 3)} ${esc(it.input_width_unit || '')}`.trim() : ''
    const heightInput = it.input_height_raw ? `${fmtMeasure(it.input_height_raw, 3)} ${esc(it.input_height_unit || '')}`.trim() : ''
    dimsHtml = `
      <div class="dim-grid">
        <div class="dim-cell"><div class="dim-label">Width</div><div class="dim-value">${fmtN(w_cm)} cm</div></div>
        <div class="dim-cell"><div class="dim-label">Height</div><div class="dim-value">${fmtN(h_cm)} cm</div></div>
        <div class="dim-cell"><div class="dim-label">Quantity</div><div class="dim-value">${qty}</div></div>
        <div class="dim-cell"><div class="dim-label">Area</div><div class="dim-value">${areaSqm.toFixed(3)} m²<div class="dim-label">${areaSqft.toFixed(2)} ft²</div></div></div>
      </div>`
  } else if (isTrack) {
    const chargeableFt = Number(it.area_sqm || 0)
    dimsHtml = `<div class="dim-grid">
      <div class="dim-cell"><div class="dim-label">Quantity</div><div class="dim-value">${qty} track${qty !== 1 ? 's' : ''}</div></div>
      <div class="dim-cell"><div class="dim-label">Length (chargeable)</div><div class="dim-value">${chargeableFt.toFixed(1)} ft</div></div>
    </div>`
  } else if (!isFG) {
    const unit = it.sale_unit || it.inv_variants?.unit || 'pcs'
    dimsHtml = `<div class="dim-grid">
      <div class="dim-cell"><div class="dim-label">Quantity</div><div class="dim-value">${qty} ${esc(unit)}</div></div>
    </div>`
  }
  dimsHtml = buildOrderItemDimensionGrid(it, { isFG, isTrack, w_cm, h_cm, qty, areaSqm, areaSqft }) || dimsHtml

  // Fabric usage from wastage_logs
  const isSheerDimout = (it.blind_type || '').startsWith('Sheer Dimout')
  const wasteLog = currentWastageLogs.find(w => w.order_item_id === it.id)
  let fabricHtml = ''
  if (isFG && it.inv_variants) {
    if (wasteLog) {
      const showActual = wasteLog.used_length_m != null && Math.abs((wasteLog.used_length_m || 0) - (wasteLog.cut_length_m || 0)) > 0.001
      fabricHtml = `
        <div style="margin-top:10px;padding:8px 12px;background:#f0fdf4;border-radius:6px;border:1px solid #bbf7d0;">
          <div class="fw-600" style="font-size:11px;color:#059669;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">
            Fabric Usage${isSheerDimout ? ' <span style="color:#7c3aed;">(×2 sheer dimout)</span>' : ''}
          </div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;">
            <span><span style="color:#64748b;">Planned cut:</span> <strong>${Number(wasteLog.cut_length_m || 0).toFixed(3)}m</strong></span>
            ${showActual ? `<span><span style="color:#64748b;">Actual used:</span> <strong style="color:#059669;">${Number(wasteLog.used_length_m).toFixed(3)}m</strong></span>` : ''}
            <span><span style="color:#64748b;">Width:</span> <strong>${Number(wasteLog.cut_width_m || 0).toFixed(3)}m</strong></span>
          </div>
        </div>`
    } else if (h_cm && qty) {
      const fabricMultiplier = isSheerDimout ? 2 : 1
      const plannedFabricM   = (h_cm / 100) * qty * fabricMultiplier
      fabricHtml = `
        <div style="margin-top:10px;padding:8px 12px;background:#fafafa;border-radius:6px;border:1px solid #e5e7eb;">
          <div style="font-size:12px;">
            <span style="color:#64748b;">Planned fabric:</span> <strong>${plannedFabricM.toFixed(3)}m</strong>
            ${isSheerDimout ? '<span style="color:#7c3aed;font-size:11px;margin-left:6px;">(×2 — sheer dimout uses double cloth)</span>' : ''}
          </div>
        </div>`
    }
  }

  let compsHtml = ''
  if (itemComps.length && !currentComponents.length) {
    const hasActual   = itemComps.some(c => c.actual_qty != null)
    const hasRate     = canViewMoney() && itemComps.some(c => Number(c.inv_variants?.purchase_rate || 0) > 0)
    const compEffectiveRate = c => {
      const ratePerM = Number(c.inv_variants?.purchase_rate || 0)
      return (c.unit || 'pcs') === 'ft' ? ratePerM * 0.3048 : ratePerM
    }
    const totalCost   = itemComps.reduce((s, c) =>
      s + Number(c.actual_qty ?? c.planned_qty ?? 0) * compEffectiveRate(c), 0)
    compsHtml = `
      <div style="margin-top:10px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <div class="fw-600" style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;">Components${itemComps[0]?.isTemp ? ' <span style="font-size:10px;color:#7c3aed;font-weight:600;background:#ede9fe;padding:1px 6px;border-radius:999px;">from recipe</span>' : ''}</div>
          ${hasRate && totalCost > 0 ? `<div style="font-size:12px;color:#7c3aed;font-weight:600;">Est. cost: ${fmt$(totalCost)}</div>` : ''}
        </div>
        <table class="bom-table" style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb;">Component</th>
            <th style="text-align:right;padding:6px 8px;border-bottom:1px solid #e5e7eb;">Planned Qty</th>
            ${hasActual ? '<th style="text-align:right;padding:6px 8px;border-bottom:1px solid #e5e7eb;">Actual Qty</th>' : ''}
            <th style="text-align:right;padding:6px 8px;border-bottom:1px solid #e5e7eb;">Unit</th>
            ${hasRate ? '<th style="text-align:right;padding:6px 8px;border-bottom:1px solid #e5e7eb;">Rate</th>' : ''}
            ${hasRate ? '<th style="text-align:right;padding:6px 8px;border-bottom:1px solid #e5e7eb;">Line Cost</th>' : ''}
            <th style="text-align:center;padding:6px 8px;border-bottom:1px solid #e5e7eb;">Status</th>
          </tr></thead>
          <tbody>
            ${itemComps.map(c => {
              const rateDisplay = compEffectiveRate(c)
              const qty         = Number(c.actual_qty ?? c.planned_qty ?? 0)
              const lineCost    = qty * rateDisplay
              return `
              <tr>
                <td style="padding:6px 8px;">${esc(c.inv_variants?.name || '\u2014')}</td>
                <td style="padding:6px 8px;text-align:right;">${componentQtyDisplay(c, c.planned_qty)}</td>
                ${hasActual ? `<td style="padding:6px 8px;text-align:right;${c.actual_qty != null ? 'color:#059669;font-weight:600;' : 'color:#9ca3af;'}">${c.actual_qty != null ? componentQtyDisplay(c, c.actual_qty) : '\u2014'}</td>` : ''}
                <td style="padding:6px 8px;text-align:right;color:#64748b;">${esc(c.unit || c.inv_variants?.unit || 'pcs')}</td>
                ${hasRate ? `<td style="padding:6px 8px;text-align:right;color:#9ca3af;">${rateDisplay ? fmt$(rateDisplay) : '\u2014'}</td>` : ''}
                ${hasRate ? `<td style="padding:6px 8px;text-align:right;font-weight:600;color:#7c3aed;">${rateDisplay ? fmt$(lineCost) : '\u2014'}</td>` : ''}
                <td style="padding:6px 8px;text-align:center;">
                  ${c.deducted
                    ? '<span style="color:#10b981;font-size:11px;font-weight:600;">\u2713 Done</span>'
                    : '<span style="color:#f59e0b;font-size:11px;font-weight:600;">Pending</span>'}
                </td>
              </tr>`
            }).join('')}
          </tbody>
        </table>
      </div>`
  }

  // ── Per-item financial breakdown (visible at all stages) ──
  let financialHtml = ''
  if (canViewMoney() && isFG && it.inv_variants) {
    const purchaseRatePerM = Number(it.inv_variants?.purchase_rate || 0)
    const fabricWidth = Number(it.inv_variants?.width_m || 0)
    const costRateSqm = (fabricWidth > 0 && purchaseRatePerM > 0) ? (purchaseRatePerM / fabricWidth) : Number(it.inv_variants?.base_rate_sqm || 0)
    const sellingRate = Number(it.rate_applied || 0)
    const isSheerDimoutFin = (it.blind_type || '').startsWith('Sheer Dimout')
    const fabricMult = isSheerDimoutFin ? 2 : 1
    const fabricCostTotal = areaSqm * costRateSqm * fabricMult
    const fabricSaleTotal = revenueAreaSqm * sellingRate
    const componentCost = itemComps.reduce((s, c) => s + componentLineCost(c), 0)
    const totalCostAll = fabricCostTotal + componentCost
    const totalRevenue = fabricSaleTotal
    const margin = totalRevenue > 0 ? ((totalRevenue - totalCostAll) / totalRevenue * 100) : 0
    const marginColor = margin >= 20 ? '#059669' : margin >= 10 ? '#d97706' : '#ef4444'

    financialHtml = `
      <div style="margin-top:10px;padding:10px 12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
        <div class="fw-600" style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px;">
          <i class="fa-solid fa-chart-pie" style="color:#6366f1;margin-right:4px;"></i> Cost Breakdown
        </div>
        <!-- Rate row -->
        <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;margin-bottom:6px;">
          <span style="color:#1d4ed8;"><i class="fa-solid fa-receipt" style="margin-right:3px;font-size:10px;"></i>Purchase: <strong>₹${purchaseRatePerM.toFixed(2)}/m</strong></span>
          <span style="color:#92400e;"><i class="fa-solid fa-coins" style="margin-right:3px;font-size:10px;"></i>Cost: <strong>₹${costRateSqm.toFixed(2)}/m²</strong></span>
          <span style="color:#374151;"><i class="fa-solid fa-tag" style="margin-right:3px;font-size:10px;"></i>Selling: <strong>₹${sellingRate.toFixed(2)}/m²</strong></span>
        </div>
        <!-- Cost breakdown row -->
        <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;margin-bottom:6px;">
          <span style="color:#92400e;">Fabric Cost: <strong>${fmt$(fabricCostTotal)}</strong></span>
          <span style="color:#059669;">Fabric Sale: <strong>${fmt$(fabricSaleTotal)}</strong></span>
          ${componentCost > 0 ? `<span style="color:#7c3aed;">Components: <strong>${fmt$(componentCost)}</strong></span>` : ''}
        </div>
        <!-- Totals row -->
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:6px 10px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:5px;font-size:12px;">
          ${totalCostAll > 0 ? `<span style="color:#64748b;">Total Cost: <strong>${fmt$(totalCostAll)}</strong></span>` : ''}
          <span>Revenue: <strong style="color:#059669;">${fmt$(totalRevenue)}</strong></span>
          ${totalRevenue > 0 ? `<span style="color:${marginColor};font-weight:700;padding:2px 8px;background:${margin>=20?'#d1fae5':margin>=10?'#fef3c7':'#fee2e2'};border-radius:999px;">Margin: ${margin.toFixed(1)}%</span>` : ''}
        </div>
      </div>`
  }
  if (canViewMoney() && !isFG && !isTrack) {
    const unit = directUnit(it)
    const rateUnit = normalizedSaleUnit(unit) === 'sqm' ? 'sqm' : unit
    const purchaseRate = directPurchaseRate(it)
    const sellingRate = Number(it.rate_applied || 0)
    const billQty = resaleBillQty(it)
    const revenue = orderItemRevenue(it)
    const cost = billQty * purchaseRate
    const margin = revenue > 0 && cost > 0 ? ((revenue - cost) / revenue * 100) : 0
    const marginColor = margin >= 20 ? '#059669' : margin >= 10 ? '#d97706' : '#ef4444'

    financialHtml = `
      <div style="margin-top:10px;padding:10px 12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
        <div class="fw-600" style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px;">
          <i class="fa-solid fa-chart-pie" style="color:#6366f1;margin-right:4px;"></i> Cost Breakdown
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;margin-bottom:6px;">
          <span style="color:#1d4ed8;"><i class="fa-solid fa-receipt" style="margin-right:3px;font-size:10px;"></i>Purchase: <strong>₹${purchaseRate.toFixed(2)}/${esc(unit)}</strong></span>
          <span style="color:#374151;"><i class="fa-solid fa-tag" style="margin-right:3px;font-size:10px;"></i>Selling: <strong>₹${sellingRate.toFixed(2)}/${esc(unit)}</strong></span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:6px 10px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:5px;font-size:12px;">
          <span style="color:#64748b;">Material Cost: <strong>${fmt$(cost)}</strong></span>
          <span>Revenue: <strong style="color:#059669;">${fmt$(revenue)}</strong></span>
          ${revenue > 0 ? `<span style="color:${marginColor};font-weight:700;padding:2px 8px;background:${margin>=20?'#d1fae5':margin>=10?'#fef3c7':'#fee2e2'};border-radius:999px;">Margin: ${margin.toFixed(1)}%</span>` : ''}
        </div>
      </div>`
    financialHtml = renderDirectItemFinancialBreakdown({ purchaseRate, sellingRate, billQty, rateUnit, cost, revenue, margin, marginColor })
  }

  const itemRateUnit = isTrack ? 'track' : isFG ? 'm²' : directUnit(it)
  const itemRevenue = orderItemRevenue(it)
  const identityHtml = renderItemIdentity(it)

  return `
    <div class="item-card">
      <div class="item-card-header">
        <div class="item-card-title-wrap">
          <div class="item-card-title-row">
            <span class="item-tag ${itemTypeTagClass(it)}">${itemTypeLabel(it)}</span>
            <span class="fw-600 item-card-title">${esc(itemTitle(it))}</span>
          </div>
          ${identityHtml}
        </div>
        <span style="margin-left:auto;">${deductedBadge}</span>
      </div>
      <div class="item-card-body">
        ${dimsHtml}
        ${fabricHtml}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9;">
          <span class="text-muted text-xs">
            Rate: ${fmt$(Number(it.rate_applied || 0))}/${esc(itemRateUnit)}
          </span>
          <span class="fw-600" style="color:#059669;">${fmt$(itemRevenue)}</span>
        </div>
        ${financialHtml}
        ${compsHtml}
      </div>
    </div>`
}

// ── Execute Order ────────────────────────────────────────────────────────────
async function executeOrder() {
  const btn = document.getElementById('exec-btn')
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Executing…' }

  const { data, error } = await db.rpc('execute_order', {
    p_order_id:    currentOrderId,
    p_executor_id: currentProfile?.id ?? null,
  })

  if (error) {
    showAlert('detail-alert', error.message, 'error')
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Execute Order' }
    return
  }

  await calculateAndStoreOrderCost(currentOrderId)

  const fab  = data?.fabric_items_deducted ?? 0
  const comp = data?.components_deducted   ?? 0
  await db.from('orders').update({
    status: 'executed',
    executed_by: currentProfile?.id ?? null,
    executed_at: new Date().toISOString(),
  }).eq('id', currentOrderId)
  toast(`Executed — ${fab} fabric item${fab !== 1 ? 's' : ''} and ${comp} component${comp !== 1 ? 's' : ''} deducted`)
  setTimeout(() => window.location.reload(), 1200)
}

// ── Status update ────────────────────────────────────────────────────────────
async function calculateAndStoreOrderCost(orderId) {
  const [wastageRes, compsRes, itemsRes] = await Promise.all([
    db.from('wastage_logs')
      .select('cut_length_m, cut_width_m, roll_id, variant_id')
      .eq('order_id', orderId),
    fetchOrderComponentsForCost(orderId),
    fetchOrderItemsForCost(orderId),
  ])

  if (compsRes.error) console.warn('Order component cost hydration:', compsRes.error.message)
  if (itemsRes.error) console.warn('Order item cost hydration:', itemsRes.error.message)

  const wastageRows = wastageRes.data || []
  const rollIds = [...new Set(wastageRows.map(w => w.roll_id).filter(Boolean))]
  const variantIds = [...new Set(wastageRows.map(w => w.variant_id).filter(Boolean))]
  const [rollRateRes, variantRateRes] = await Promise.all([
    rollIds.length
      ? db.from('inv_rolls').select('id, purchase_rate').in('id', rollIds)
      : Promise.resolve({ data: [], error: null }),
    variantIds.length
      ? db.from('inv_variants').select('id, purchase_rate, width_m').in('id', variantIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  const rollRates = Object.fromEntries((rollRateRes.data || []).map(r => [r.id, Number(r.purchase_rate || 0)]))
  const variantRates = Object.fromEntries((variantRateRes.data || []).map(v => [v.id, Number(v.purchase_rate || 0)]))

  let fabricCost = wastageRows.reduce((s, w) => {
    // purchase_rate is per linear meter of the fabric's fixed width
    // cost = cut_length × purchase_rate (no width multiplication needed)
    const rate = rollRates[w.roll_id] || variantRates[w.variant_id] || 0
    return s + Number(w.cut_length_m || 0) * rate
  }, 0)

  const items = itemsRes.data || []

  // Fallback: if wastage_logs gave zero, derive FG fabric cost from order_items dimensions.
  if (fabricCost === 0) {
    fabricCost = items.reduce((s, it) => {
      if ((it.item_type || 'finished_goods') !== 'finished_goods') return s
      const mult   = (it.blind_type || '').startsWith('Sheer Dimout') ? 2 : 1
      // purchase_rate is per linear meter — cost = cut_length × purchase_rate
      const cutLen = (Number(it.height_cm || 0) / 100) * Number(it.quantity || 1) * mult
      return s + cutLen * Number(it.inv_variants?.purchase_rate || 0)
    }, 0)
  }

  const rawMaterialCost = items.reduce((s, it) => {
    if (!['raw_material', 'resale'].includes(it.item_type || 'finished_goods')) return s
    return s + resaleBillQty(it) * directPurchaseRate(it)
  }, 0)

  const componentCost = (compsRes.data || []).reduce((s, c) => {
    const qty  = Number(c.actual_qty ?? c.planned_qty ?? 0)
    const rate = Number(c.inv_variants?.purchase_rate || 0)
    // Track section components are stored in ft; inventory rates are per metre — convert
    const unit = c.unit || 'pcs'
    const qtyM = unit === 'ft' ? qty * 0.3048 : qty
    return s + qtyM * rate
  }, 0)

  const { error } = await db.from('orders').update({ cost_amount: fabricCost + componentCost + rawMaterialCost }).eq('id', orderId)
  if (error) console.warn('Unable to store order cost:', error.message)
}

async function addBackToRoll(rollId, qty, movement = {}) {
  if (!rollId || !qty || qty <= 0) return
  const { data: roll, error } = await db.from('inv_rolls').select('id, variant_id, original_length, remaining_length, unit, purchase_rate').eq('id', rollId).maybeSingle()
  if (error || !roll) return
  const original = Number(roll.original_length || 0)
  const current = Number(roll.remaining_length || 0)
  const requestedQty = Number(qty || 0)
  const restoreQty = original > 0 ? Math.min(requestedQty, Math.max(original - current, 0)) : requestedQty
  if (restoreQty <= 0) return
  const remaining = original > 0 ? Math.min(original, current + restoreQty) : current + restoreQty
  await db.from('inv_rolls').update({ remaining_length: remaining, status: 'in_stock' }).eq('id', rollId)
  const { error: movementErr } = await db.from('inv_movements').insert({
    roll_id: rollId,
    variant_id: movement.variant_id || roll.variant_id || null,
    movement_type: 'inflow',
    quantity: restoreQty,
    unit: roll.unit || movement.unit || null,
    rate: movement.rate ?? roll.purchase_rate ?? null,
    reference: currentOrder?.order_uid || currentOrderId,
    note: movement.note || 'Order rollback: inventory restored',
    performed_by: currentProfile?.id || null,
  })
  if (movementErr) console.warn('Rollback movement log failed:', movementErr.message)
}

async function addBackToVariant(variantId, qty, movement = {}) {
  if (!variantId || !qty || qty <= 0) return
  const { data: rolls, error } = await db
    .from('inv_rolls')
    .select('id, remaining_length, status, created_at')
    .eq('variant_id', variantId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error || !rolls?.length) return
  await addBackToRoll(rolls[0].id, qty, { ...movement, variant_id: variantId })
}

async function reverseExecutedInventory(orderId) {
  const refs = [orderId, currentOrder?.order_uid].filter(Boolean)
  const rollbackRes = await db.from('inv_movements')
    .select('id')
    .in('reference', refs)
    .eq('movement_type', 'inflow')
    .like('note', 'Order rollback:%')
    .limit(1)
  if (rollbackRes.error) throw rollbackRes.error
  if (rollbackRes.data?.length) {
    await db.from('order_items').update({ fabric_deducted: false }).eq('order_id', orderId)
    await db.from('order_components').update({ deducted: false }).eq('order_id', orderId)
    await db.from('wastage_logs').delete().eq('order_id', orderId)
    return
  }

  const [movementRes, wasteRes, compRes] = await Promise.all([
    db.from('inv_movements')
      .select('id, roll_id, variant_id, quantity, unit, rate, reference, note')
      .in('reference', refs)
      .eq('movement_type', 'outflow'),
    db.from('wastage_logs').select('id, roll_id, variant_id, cut_length_m').eq('order_id', orderId),
    fetchOrderComponentsWithVariants(orderId),
  ])
  if (movementRes.error) throw movementRes.error
  if (wasteRes.error) throw wasteRes.error
  if (compRes.error) throw compRes.error

  const outflows = movementRes.data || []
  if (outflows.length) {
    for (const m of outflows) {
      const qty = Math.abs(Number(m.quantity || 0))
      if (m.roll_id) {
        await addBackToRoll(m.roll_id, qty, {
          variant_id: m.variant_id,
          unit: m.unit,
          rate: m.rate,
          note: 'Order rollback: outflow reversed',
        })
      } else if (m.variant_id) {
        await addBackToVariant(m.variant_id, qty, {
          unit: m.unit,
          rate: m.rate,
          note: 'Order rollback: outflow reversed',
        })
      }
    }
  } else {
    for (const w of (wasteRes.data || [])) {
      const qty = Number(w.cut_length_m || 0)
      const movement = { variant_id: w.variant_id, unit: 'm', note: 'Order rollback: fabric restored' }
      if (w.roll_id) await addBackToRoll(w.roll_id, qty, movement)
      else if (w.variant_id) await addBackToVariant(w.variant_id, qty, movement)
    }

    for (const c of (compRes.data || []).filter(c => c.deducted && c.variant_id)) {
      const qty = Number(c.actual_qty ?? c.planned_qty ?? 0)
      const stockQty = (c.unit || 'pcs') === 'ft' ? qty * 0.3048 : qty
      await addBackToVariant(c.variant_id, stockQty, {
        unit: (c.unit || 'pcs') === 'ft' ? 'm' : (c.unit || 'pcs'),
        rate: c.inv_variants?.purchase_rate ?? null,
        note: 'Order rollback: component restored',
      })
    }
  }

  await db.from('order_items').update({ fabric_deducted: false }).eq('order_id', orderId)
  await db.from('order_components').update({ deducted: false }).eq('order_id', orderId)
  await db.from('wastage_logs').delete().eq('order_id', orderId)
}

function openRollbackOrder() {
  const status = orderStatus(currentOrder)
  const target = status === 'processing' ? 'inquiry' : 'processing'
  openModal('Roll Back Order', `
    <div id="rollback-alert" class="alert alert-error"></div>
    <p class="text-sm text-muted" style="margin-bottom:12px;">
      This will move the order back to <strong>${esc(target)}</strong>.
      Any deducted fabric/components will be added back to inventory if outflow records exist.
      ${status === 'processing' ? 'Executor assignment will also be cleared.' : 'Order cost will be reset.'}
    </p>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="rollback-confirm-btn" onclick="rollbackOrder('${target}')">
        <i class="fa-solid fa-rotate-left"></i> Roll Back to ${esc(target)}
      </button>
    </div>
  `)
}

async function rollbackOrder(targetStatus) {
  const btn = document.getElementById('rollback-confirm-btn')
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Rolling back...' }
  try {
    const status = orderStatus(currentOrder)
    await reverseExecutedInventory(currentOrderId)

    const updates = {
      status: targetStatus,
      total_amount: computeOrderRevenueFromItems(currentItems),
      cost_amount: 0,
      assigned_executor_id: targetStatus === 'inquiry' ? null : currentOrder.assigned_executor_id,
      assigned_at: targetStatus === 'inquiry' ? null : currentOrder.assigned_at,
      assigned_by: targetStatus === 'inquiry' ? null : currentOrder.assigned_by,
      executed_by: null,
      executed_at: null,
    }

    let { error } = await db.from('orders').update(updates).eq('id', currentOrderId)
    if (error && /assigned_executor_id|assigned_at|assigned_by|executed_by|executed_at/i.test(error.message || '')) {
      delete updates.assigned_executor_id
      delete updates.assigned_at
      delete updates.assigned_by
      delete updates.executed_by
      delete updates.executed_at
      ;({ error } = await db.from('orders').update(updates).eq('id', currentOrderId))
    }
    if (error) throw error

    await logActivity('rollback', 'order', currentOrderId, currentOrder.order_uid || currentOrderId, {
      status: { old: status, new: targetStatus },
    })
    toast(`Order rolled back to ${targetStatus}`)
    closeModal()
    setTimeout(() => window.location.reload(), 800)
  } catch (err) {
    showAlert('rollback-alert', err.message || 'Rollback failed')
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Roll Back' }
  }
}

function openCompleteOrderModal() {
  if (orderStatus(currentOrder) !== 'executed') {
    toast('Execute the order first. Inventory should only deduct on execution.', 'error')
    return
  }
  const invoiceNumber = currentOrder.invoice_number || currentOrder.source_bill_no || ''
  const invoiceDate = currentOrder.invoice_date || new Date().toISOString().slice(0, 10)
  openModal('Complete Order', `
    <div id="complete-alert" class="alert alert-error"></div>
    <p class="text-sm text-muted" style="margin-bottom:12px;">Enter invoice details before marking this order completed.</p>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Invoice Number <span style="color:#ef4444">*</span></label>
        <input id="complete-invoice-number" value="${esc(invoiceNumber)}" placeholder="Invoice number">
      </div>
      <div class="form-group">
        <label>Invoice Date <span style="color:#ef4444">*</span></label>
        <input id="complete-invoice-date" type="date" value="${esc(invoiceDate)}">
      </div>
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="complete-confirm-btn" onclick="completeOrderWithInvoice()">
        <i class="fa-solid fa-check"></i> Save & Complete
      </button>
    </div>
  `)
}

async function completeOrderWithInvoice() {
  const invoiceNumber = val('complete-invoice-number').trim()
  const invoiceDate = val('complete-invoice-date')
  if (!invoiceNumber) return showAlert('complete-alert', 'Invoice number is required')
  if (!invoiceDate) return showAlert('complete-alert', 'Invoice date is required')

  const btn = document.getElementById('complete-confirm-btn')
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...' }

  const updates = {
    status: 'completed',
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    source_bill_no: invoiceNumber,
  }
  let { error } = await db.from('orders').update(updates).eq('id', currentOrderId)
  if (error && /invoice_number|invoice_date/i.test(error.message || '')) {
    delete updates.invoice_number
    delete updates.invoice_date
    ;({ error } = await db.from('orders').update(updates).eq('id', currentOrderId))
  }
  if (error) {
    showAlert('complete-alert', error.message)
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Save & Complete' }
    return
  }

  await logActivity('status_change', 'order', currentOrderId,
    currentOrder.order_uid || `#${currentOrderId.substring(0,8)}`,
    { status: { old: currentOrder?.status, new: 'completed' }, invoice_number: invoiceNumber, invoice_date: invoiceDate }
  )
  toast('Invoice details saved and order completed')
  closeModal()
  setTimeout(() => window.location.reload(), 800)
}

async function updateStatus(sel) {
  const status = sel.value
  if (!status || !currentOrderId) return

  if (status === 'completed') {
    sel.selectedIndex = 0
    openCompleteOrderModal()
    return
  }

  sel.disabled = true

  const updates = { status }

  if (status === 'processing') {
    await ensureOrderComponents(currentOrderId)
    if (supportsExecutorAssignment) {
      const assignedExecutorId = await promptAssignExecuter()
      if (!assignedExecutorId) {
        sel.disabled = false
        sel.selectedIndex = 0
        return
      }
      updates.assigned_executor_id = assignedExecutorId
      updates.assigned_at = new Date().toISOString()
      updates.assigned_by = currentProfile.id
    } else {
      toast('Executer assignment will work after running 008_order_executor_assignment.sql in Supabase.', 'error')
    }
  }

  if (supportsExecutorAssignment && status === 'inquiry' && orderStatus(currentOrder) === 'processing') {
    updates.assigned_executor_id = null
    updates.assigned_at = null
    updates.assigned_by = null
  }

  let { error } = await db.from('orders').update(updates).eq('id', currentOrderId)
  if (error && /assigned_executor_id|assigned_at|assigned_by/i.test(error.message || '')) {
    supportsExecutorAssignment = false
    delete updates.assigned_executor_id
    delete updates.assigned_at
    delete updates.assigned_by
    ;({ error } = await db.from('orders').update(updates).eq('id', currentOrderId))
  }
  if (error) {
    toast(error.message, 'error')
    sel.disabled = false
    return
  }

  await logActivity('status_change', 'order', currentOrderId,
    `#${currentOrderId.substring(0,8)}`,
    { status: { old: currentOrder?.status, new: status } }
  )

  toast(`Order marked as ${status}`)
  setTimeout(() => window.location.reload(), 1000)
}

async function loadExecuterProfiles() {
  if (executerProfiles.length) return executerProfiles
  const { data, error } = await db
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('role', 'executer')
    .order('full_name')
  if (error) throw error
  executerProfiles = data || []
  return executerProfiles
}

async function promptAssignExecuter() {
  const executers = await loadExecuterProfiles()
  if (!executers.length) {
    toast('Create at least one executer profile before moving this order to processing.', 'error')
    return null
  }

  return await new Promise(resolve => {
    window._assignExecuterResolve = resolve
    const options = executers.map(ex => `
      <option value="${ex.id}" ${ex.id === currentOrder?.assigned_executor_id ? 'selected' : ''}>
        ${esc(ex.full_name || ex.email || ex.id)}
      </option>
    `).join('')

    openModal('Assign Executer', `
      <div id="assign-executer-alert" class="alert alert-error"></div>
      <p class="text-sm text-muted" style="margin-bottom:12px;">Choose which executer should receive this production order.</p>
      <div class="form-group">
        <label>Executer</label>
        <select id="assign-executer-select">
          <option value="">Select executer…</option>
          ${options}
        </select>
      </div>
      <div class="modal-footer" style="padding:0;margin-top:1rem;">
        <button class="btn btn-secondary" onclick="cancelAssignExecuter()">Cancel</button>
        <button class="btn btn-primary" onclick="confirmAssignExecuter()">Assign & Move</button>
      </div>
    `)
  })
}

function cancelAssignExecuter() {
  if (window._assignExecuterResolve) {
    window._assignExecuterResolve(null)
    window._assignExecuterResolve = null
  }
  closeModal()
}

function confirmAssignExecuter() {
  const selectedId = document.getElementById('assign-executer-select')?.value || ''
  if (!selectedId) {
    showAlert('assign-executer-alert', 'Select an executer before continuing')
    return
  }
  if (window._assignExecuterResolve) {
    window._assignExecuterResolve(selectedId)
    window._assignExecuterResolve = null
  }
  closeModal()
}

async function assignExecuterToCurrentOrder() {
  if (!canAssignSalesOrder()) return
  try {
    const assignedExecutorId = await promptAssignExecuter()
    if (!assignedExecutorId) return
    const shouldMoveToProcessing = orderStatus(currentOrder) === 'inquiry'
    if (shouldMoveToProcessing) await ensureOrderComponents(currentOrderId)
    const updates = {
      assigned_executor_id: assignedExecutorId,
      assigned_at: new Date().toISOString(),
      assigned_by: currentProfile.id,
    }
    if (shouldMoveToProcessing) updates.status = 'processing'
    let { error } = await db.from('orders').update(updates).eq('id', currentOrderId)
    if (error && /assigned_executor_id|assigned_at|assigned_by/i.test(error.message || '')) {
      supportsExecutorAssignment = false
      toast('Run 008_order_executor_assignment.sql in Supabase to enable executer assignment.', 'error')
      return
    }
    if (error) {
      toast(error.message, 'error')
      return
    }
    await logActivity('assign', 'order', currentOrderId, currentOrder.order_uid || currentOrderId, {
      assigned_executor_id: assignedExecutorId,
      status: shouldMoveToProcessing ? { old: 'inquiry', new: 'processing' } : undefined,
    })
    toast(shouldMoveToProcessing ? 'Executer assigned and order moved to processing' : 'Executer assigned')
    setTimeout(() => window.location.reload(), 500)
  } catch (err) {
    toast(err.message || 'Could not assign executer', 'error')
  }
}

// ── Restore this deleted order ───────────────────────────────────────────────
async function ensureOrderComponents(orderId) {
  const { data: existing } = await db.from('order_components')
    .select('order_item_id')
    .eq('order_id', orderId)
  const existingItemIds = new Set((existing || []).map(c => c.order_item_id).filter(Boolean))

  const [itemsRes, recipesRes] = await Promise.all([
    db.from('order_items')
      .select('id, width_cm, quantity, blind_type, item_type, area_sqm')
      .eq('order_id', orderId),
    db.from('product_recipes')
      .select('id, blind_type, recipe_items(id, variant_id, quantity_per_unit, is_width_dependent, inv_variants(id, name, unit, purchase_rate))')
      .eq('is_active', true),
  ])

  // Cache so renderItemCard in-memory fallback can use them
  window._cachedRecipes = recipesRes.data || []

  const rows = []
  for (const it of (itemsRes.data || [])) {
    if (existingItemIds.has(it.id)) continue

    const itemType = it.item_type || 'finished_goods'

    if (itemType === 'track') {
      // Track components are inserted at order creation; re-insert if missing
      const chargeableFt = Number(it.area_sqm || 0)
      const qty          = Number(it.quantity || 1)
      const trackType    = it.blind_type
      const recipe = findRecipeForBlindType(recipesRes.data || [], trackType)
      const componentSource = recipe?.recipe_items?.length
        ? recipe.recipe_items.map(item => ({
            name: item.inv_variants?.name || item.component_name,
            variantId: item.variant_id || item.inv_variants?.id || null,
            unit: item.inv_variants?.unit || 'pcs',
            isWidthDependent: Boolean(item.is_width_dependent),
            quantityPerUnit: Number(item.quantity_per_unit || 0),
          }))
        : (TRACK_RECIPES[trackType] || []).map(name => ({
            name,
            variantId: null,
            unit: null,
            isWidthDependent: false,
            quantityPerUnit: 0,
          }))

      componentSource.forEach((component, idx) => {
        const matched = component.variantId
          ? (editData?.variants || []).find(v => v.id === component.variantId) || null
          : resolveVariantForRecipeLabel(editData?.variants || [], component.name)
        const isSection = idx === 0
        rows.push({
          order_id:       orderId,
          order_item_id:  it.id,
          variant_id:     matched?.id || null,
          component_name: matched?.name || component.name,
          planned_qty:    isSection
            ? chargeableFt * qty
            : (component.isWidthDependent ? chargeableFt * qty : (component.quantityPerUnit || 0) * qty),
          unit:           isSection ? 'ft' : (matched?.unit || 'pcs'),
          is_extra:       false,
          deducted:       false,
        })
      })
      continue
    }

    if (itemType !== 'finished_goods') continue

    const recipe = findRecipeForBlindType(recipesRes.data || [], it.blind_type)
    if (!recipe?.recipe_items?.length) continue

    const wCm = Number(it.width_cm || 0)
    const qty = Number(it.quantity || 1)
    for (const ri of recipe.recipe_items) {
      const wM = wCm / 100
      rows.push({
        order_id:           orderId,
        order_item_id:      it.id,
        variant_id:         ri.variant_id,
        planned_qty:        ri.is_width_dependent ? wM * qty : Number(ri.quantity_per_unit || 0) * qty,
        is_width_dependent: ri.is_width_dependent,
        unit:               ri.inv_variants?.unit || 'pcs',
        is_extra:           false,
        deducted:           false,
      })
    }
  }

  if (rows.length) {
    const { error } = await db.from('order_components').insert(rows)
    if (error) console.warn('Unable to prepare order components:', error.message)
  }
}

function findRecipeForBlindType(recipes, blindType) {
  const name = String(blindType || '').trim()
  if (!name) return null
  const lower = name.toLowerCase()
  const normalized = normalizeRecipeName(name)
  return recipes.find(r => String(r.blind_type || '').trim().toLowerCase() === lower)
    || recipes.find(r => lower.includes(String(r.blind_type || '').trim().toLowerCase()))
    || recipes.find(r => String(r.blind_type || '').trim().toLowerCase().includes(lower))
    || recipes.find(r => normalizeRecipeName(r.blind_type) === normalized)
}

function normalizeRecipeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[-/]/g, ' ')
    .replace(/\b(blinds?|classic|premium|mechanism|with)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeInventoryNameForMatch(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[.']/g, '')
    .replace(/"/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildInventoryMatchKeys(name) {
  const raw = String(name || '').trim()
  if (!raw) return []

  const prefixes = [
    'Curtain Tracks-',
    'Roller W/o Headrail-',
    'Roller with Headrail-',
    'Sheer Dimout Plain Cassette-',
    'Sheer Dimout Decorative Cassette-',
    'S-Contour-',
    'Roller with Plain Cassette-',
    'Roller with Decorative Cassette-',
  ]

  const keys = new Set()
  const add = value => {
    const normalized = normalizeInventoryNameForMatch(value)
    if (normalized) keys.add(normalized)
  }

  add(raw)
  for (const prefix of prefixes) {
    if (raw.toLowerCase().startsWith(prefix.toLowerCase())) {
      add(raw.slice(prefix.length))
    }
  }
  return [...keys]
}

function resolveVariantForRecipeLabel(variants, label) {
  const targets = buildInventoryMatchKeys(label)
  return (variants || []).find(v => targets.includes(normalizeInventoryNameForMatch(v.name))) || null
}

async function restoreThisOrder() {
  if (!confirm('Restore this deleted order?')) return
  const { error } = await db.from('orders').update({ deleted_at: null }).eq('id', currentOrderId)
  if (error) { toast(error.message, 'error'); return }
  await logActivity('restore', 'order', currentOrderId, currentOrder?.order_uid || `#${currentOrderId.substring(0,8)}`)
  toast('Order restored')
  setTimeout(() => window.location.reload(), 800)
}

// ── Edit Order ───────────────────────────────────────────────────────────────
// Lazy-load variants/recipes/customers and build the edit form.
async function loadEditData() {
  if (!editData) {
    const [inventoryCatalog, recRes, custRes] = await Promise.all([
      INVENTORY_SOURCE.loadCatalog({ includeCosts: true }),
      db.from('product_recipes')
        .select('id, blind_type, recipe_items(id, variant_id, quantity_per_unit, is_width_dependent, inv_variants(id, name, unit, purchase_rate))')
        .eq('is_active', true),
      db.from('customers').select('id, name, phone, city, state').order('name'),
    ])
    editData = {
      variants:  inventoryCatalog.variants,
      recipes:   recRes.data || [],
      customers: custRes.data || [],
      fgStock:   inventoryCatalog.fgStock,
      directItems: [],
    }
    editData.directItems = buildEditDirectItems()
  }
}

async function openEditOrderLegacy() {
  openModal('Loading…', `<div class="loading-center"><div class="spinner spinner-md"></div></div>`)

  await loadEditData()
  renderEditModal()
}

async function openEditOrder() {
  showEditPanel(`
    <div class="card" style="margin-bottom:1rem;">
      <div style="padding:20px;" class="loading-center"><div class="spinner spinner-md"></div></div>
    </div>
  `)
  await loadEditData()
  renderEditModal()
  const title = document.getElementById('modal-title')?.textContent || 'Edit Order'
  const body = (document.getElementById('modal-body')?.innerHTML || '')
    .replaceAll('closeModal()', 'cancelEditOrder()')
  showEditPanel(`
    <div class="card" style="margin-bottom:1rem;">
      <div class="card-header">
        <div>
          <h2 style="margin:0;">${esc(title)}</h2>
          <span class="text-muted text-sm">Update the saved order details and items.</span>
        </div>
      </div>
      <div style="padding:16px;">${body}</div>
    </div>
  `)
}

function showEditPanel(markup) {
  html('edit-order-panel', markup)
  document.getElementById('edit-order-panel')?.classList.remove('d-none')
  document.getElementById('order-view-panel')?.classList.add('d-none')
  document.getElementById('financial-summary')?.classList.add('d-none')
  document.getElementById('movements-section')?.classList.add('d-none')
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function cancelEditOrder() {
  document.getElementById('edit-order-panel')?.classList.add('d-none')
  document.getElementById('order-view-panel')?.classList.remove('d-none')
  renderFinancialSummary()
  loadMovementLog()
}

let editNewItems = []
let editNewItemCount = 0

function renderEditModal() {
  editNewItems = []
  editNewItemCount = 0
  _toRemove.clear()
  const o = currentOrder

  const custName = o.customers?.name || o.customer_name || o.dealer_name || ''

  // Customer selector
  const custOpts = editData.customers.map(c =>
    `<option value="${c.id}" ${c.id === o.cust_id ? 'selected' : ''}>${esc(c.name)}${c.phone ? ' · ' + esc(c.phone) : ''}</option>`
  ).join('')

  // Existing item rows
  const existingItemsHtml = currentItems.map(it => renderEditExistingItem(it)).join('')

  text('modal-title', `Edit Order #${esc(o.order_uid || o.id.substring(0,8))}`)
  html('modal-body', `
    <div id="edit-alert" class="alert alert-error"></div>

    <div class="fw-600 mb-3" style="font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;">Order Details</div>
    <div class="form-row cols-2" style="margin-bottom:12px;">
      <div class="form-group" style="margin:0;">
        <label>Customer</label>
        <select id="eo-cust">
          <option value="">— Unlinked —</option>
          ${custOpts}
        </select>
      </div>
      <div class="form-group" style="margin:0;">
        <label>Dealer / Agent Name</label>
        <input id="eo-dealer" value="${esc(o.dealer_name || '')}">
      </div>
    </div>
    <div class="form-row cols-2" style="margin-bottom:12px;">
      <div class="form-group" style="margin:0;">
        <label>Order Date</label>
        <input id="eo-order-date" type="date" value="${esc(String(o.order_date || o.created_at || '').slice(0,10))}">
      </div>
      <div class="form-group" style="margin:0;">
        <label>Invoice Number</label>
        <input id="eo-invoice" value="${esc(o.invoice_number || '')}">
      </div>
    </div>
    <div class="form-row cols-2" style="margin-bottom:12px;">
      <div class="form-group" style="margin:0;">
        <label>Bill / Reference No.</label>
        <input id="eo-bill" value="${esc(o.source_bill_no || '')}">
      </div>
      <div class="form-group" style="margin:0;">
        <label>Invoice Date</label>
        <input id="eo-invoice-date" type="date" value="${esc(String(o.invoice_date || '').slice(0,10))}">
      </div>
    </div>
    <div class="form-row cols-1" style="margin-bottom:12px;">
      <div class="form-group" style="margin:0;">
        <label>Notes</label>
        <input id="eo-notes" value="${esc(o.notes || '')}" placeholder="Internal notes">
      </div>
    </div>

    <div style="border-top:1px solid var(--border);margin:16px 0 12px;"></div>
    <div class="fw-600 mb-3" style="font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;">Items</div>

    <div id="edit-existing-items">${existingItemsHtml}</div>

    <!-- Add new item section -->
    <div style="border-top:1px dashed #e2e8f0;margin:12px 0 10px;padding-top:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span class="text-xs fw-600" style="color:#64748b;text-transform:uppercase;">Add New Item</span>
        <button class="btn btn-ghost btn-sm" onclick="addEditNewItem()">
          <i class="fa-solid fa-plus"></i> Add Item
        </button>
      </div>
      <div id="edit-new-items"></div>
    </div>

    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveEditOrder()" id="eo-save-btn">
        <i class="fa-solid fa-check"></i> Save Changes
      </button>
    </div>
  `)
}

function renderEditExistingItem(it) {
  const isFG  = (it.item_type || 'finished_goods') === 'finished_goods'
  const name  = it.product_name || (isFG ? (it.blind_type || it.inv_variants?.name || 'Blind') : (it.inv_variants?.name || 'Item'))
  const w_cm  = Number(it.width_cm || 0)
  const h_cm  = Number(it.height_cm || 0)
  const wRaw  = Number(it.input_width_raw || 0) || w_cm
  const hRaw  = Number(it.input_height_raw || 0) || h_cm
  const wUnit = it.input_width_unit || 'cm'
  const hUnit = it.input_height_unit || 'cm'

  if (it.item_type === 'track') {
    const lenRaw = Number(it.input_length_raw || 0) || trackChargeableFt(it)
    const lenUnit = it.input_length_raw ? (it.input_length_unit || 'ft') : 'ft'
    return `
    <div class="edit-item-row" id="edit-item-${it.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div>
          <span class="item-tag tag-fg" style="font-size:10px;">Track</span>
          <span class="fw-600" style="margin-left:8px;font-size:13px;">${esc(it.blind_type || it.product_name || 'Track')}</span>
        </div>
        <button class="btn btn-ghost btn-sm" style="color:#ef4444;" onclick="removeEditItem('${it.id}', true)" title="Remove item">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
      <div class="form-row cols-4">
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Track Qty</label>
          <input id="eoi-q-${it.id}" type="number" min="1" step="1" value="${numberInputValue(it.quantity, 1)}" oninput="recalcTrackEditItem('${it.id}')">
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Length / Track</label>
          <div style="display:flex;gap:6px;">
            <input id="eoi-l-${it.id}" type="number" min="0.01" step="0.001" value="${lenRaw}" oninput="recalcTrackEditItem('${it.id}')">
            <select id="eoi-lu-${it.id}" onchange="recalcTrackEditItem('${it.id}')">${DIM_UNITS.map(u => `<option value="${u}" ${u === lenUnit ? 'selected' : ''}>${u}</option>`).join('')}</select>
          </div>
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Selling Rate / Track</label>
          <input id="eoi-rate-${it.id}" type="number" min="0" step="0.01" value="${Number(it.rate_applied || 0)}" oninput="recalcTrackEditItem('${it.id}')">
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Line Total</label>
          <input id="eoi-sub-${it.id}" readonly style="background:#f8fafc;font-weight:600;color:#059669;" value="${fmt$(trackItemRevenue(it))}">
        </div>
      </div>
    </div>`
  }

  if (isFG) {
    return `
    <div class="edit-item-row" id="edit-item-${it.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div>
          <span class="item-tag tag-fg" style="font-size:10px;">Blind</span>
          <span class="fw-600" style="margin-left:8px;font-size:13px;">${esc(name)}</span>
          ${it.inv_variants?.name ? `<span class="text-xs text-muted" style="margin-left:6px;">Fabric: ${esc(it.inv_variants.name)}</span>` : ''}
        </div>
        <button class="btn btn-ghost btn-sm" style="color:#ef4444;" onclick="removeEditItem('${it.id}', true)" title="Remove item">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
      <div class="form-row cols-4">
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Width</label>
          <div style="display:flex;gap:6px;">
            <input id="eoi-w-${it.id}" type="number" min="0.01" step="0.001" value="${wRaw}" oninput="recalcEditItem('${it.id}', ${Number(it.rate_applied||0)})">
            <select id="eoi-wu-${it.id}" onchange="recalcEditItem('${it.id}', ${Number(it.rate_applied||0)})">${DIM_UNITS.map(u => `<option value="${u}" ${u === wUnit ? 'selected' : ''}>${u}</option>`).join('')}</select>
          </div>
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Height</label>
          <div style="display:flex;gap:6px;">
            <input id="eoi-h-${it.id}" type="number" min="0.01" step="0.001" value="${hRaw}" oninput="recalcEditItem('${it.id}', ${Number(it.rate_applied||0)})">
            <select id="eoi-hu-${it.id}" onchange="recalcEditItem('${it.id}', ${Number(it.rate_applied||0)})">${DIM_UNITS.map(u => `<option value="${u}" ${u === hUnit ? 'selected' : ''}>${u}</option>`).join('')}</select>
          </div>
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Qty</label>
          <input id="eoi-q-${it.id}" type="number" min="0.001" step="0.001" value="${numberInputValue(it.quantity, 1)}" oninput="recalcEditItem('${it.id}', ${Number(it.rate_applied||0)})">
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Selling Rate</label>
          <input id="eoi-rate-${it.id}" type="number" min="0" step="0.01" value="${Number(it.rate_applied || 0)}" oninput="recalcEditItem('${it.id}', ${Number(it.rate_applied||0)})">
        </div>
      </div>
      <div id="eoi-sub-${it.id}" class="text-xs text-muted" style="margin-top:6px;"></div>
    </div>`
  } else {
    const unit = it.sale_unit || it.inv_variants?.unit || 'pcs'
    return `
    <div class="edit-item-row" id="edit-item-${it.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div>
          <span class="item-tag tag-rm" style="font-size:10px;">RM</span>
          <span class="fw-600" style="margin-left:8px;font-size:13px;">${esc(name)}</span>
          <span class="text-xs text-muted" style="margin-left:6px;">${esc(unit)}</span>
        </div>
        <button class="btn btn-ghost btn-sm" style="color:#ef4444;" onclick="removeEditItem('${it.id}', true)" title="Remove item">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
      <div class="form-row cols-2" style="margin-bottom:8px;">
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Width</label>
          <div style="display:flex;gap:6px;">
            <input id="eoi-w-${it.id}" type="number" min="0.01" step="0.001" value="${w_cm > 0 ? wRaw : ''}" placeholder="Optional" oninput="recalcRMEditItem('${it.id}', ${Number(it.rate_applied||0)}, '${esc(unit)}')">
            <select id="eoi-wu-${it.id}" onchange="recalcRMEditItem('${it.id}', ${Number(it.rate_applied||0)}, '${esc(unit)}')">${DIM_UNITS.map(u => `<option value="${u}" ${u === wUnit ? 'selected' : ''}>${u}</option>`).join('')}</select>
          </div>
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Height / Length</label>
          <div style="display:flex;gap:6px;">
            <input id="eoi-h-${it.id}" type="number" min="0.01" step="0.001" value="${h_cm > 0 ? hRaw : ''}" placeholder="Optional" oninput="recalcRMEditItem('${it.id}', ${Number(it.rate_applied||0)}, '${esc(unit)}')">
            <select id="eoi-hu-${it.id}" onchange="recalcRMEditItem('${it.id}', ${Number(it.rate_applied||0)}, '${esc(unit)}')">${DIM_UNITS.map(u => `<option value="${u}" ${u === hUnit ? 'selected' : ''}>${u}</option>`).join('')}</select>
          </div>
        </div>
      </div>
      <div class="form-row cols-4">
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Quantity (${esc(unit)})</label>
          <input id="eoi-q-${it.id}" type="number" min="0.001" step="0.001" value="${numberInputValue(it.quantity, 0)}" oninput="recalcRMEditItem('${it.id}', ${Number(it.rate_applied||0)}, '${esc(unit)}')">
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Selling Rate</label>
          <input id="eoi-rate-${it.id}" type="number" min="0" step="0.01" value="${Number(it.rate_applied || 0)}" oninput="recalcRMEditItem('${it.id}', ${Number(it.rate_applied||0)}, '${esc(unit)}')">
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Line Total</label>
          <input id="eoi-sub-${it.id}" readonly style="background:#f8fafc;font-weight:600;color:#059669;" value="${fmt$(Number(it.line_total || 0))}">
        </div>
      </div>
    </div>`
  }
}

function recalcEditItem(itemId, rate) {
  rate = parseFloat(document.getElementById(`eoi-rate-${itemId}`)?.value) || rate || 0
  const wRaw = parseFloat(document.getElementById(`eoi-w-${itemId}`)?.value) || 0
  const hRaw = parseFloat(document.getElementById(`eoi-h-${itemId}`)?.value) || 0
  const w = cvtUnit(wRaw, document.getElementById(`eoi-wu-${itemId}`)?.value || 'cm', 'cm')
  const h = cvtUnit(hRaw, document.getElementById(`eoi-hu-${itemId}`)?.value || 'cm', 'cm')
  const qRaw = parseFloat(document.getElementById(`eoi-q-${itemId}`)?.value)
  const q = !isNaN(qRaw) && qRaw > 0 ? qRaw : 1
  const area = (w / 100) * (h / 100) * q
  const total = area * rate
  const sub = document.getElementById(`eoi-sub-${itemId}`)
  if (sub) sub.textContent = `Area: ${area.toFixed(3)} m²  —  Total: ₹${total.toFixed(2)}`
}

function recalcRMEditItem(itemId, rate, unit) {
  const q = parseFloat(document.getElementById(`eoi-q-${itemId}`)?.value) || 0
  rate = parseFloat(document.getElementById(`eoi-rate-${itemId}`)?.value) || rate || 0
  const wRaw = parseFloat(document.getElementById(`eoi-w-${itemId}`)?.value)
  const hRaw = parseFloat(document.getElementById(`eoi-h-${itemId}`)?.value)
  const wUnit = document.getElementById(`eoi-wu-${itemId}`)?.value || 'cm'
  const hUnit = document.getElementById(`eoi-hu-${itemId}`)?.value || 'cm'
  const measure = editMeasuredBilling(q, unit, wRaw, hRaw, wUnit, hUnit)
  const total = measure.billQty * rate
  const sub = document.getElementById(`eoi-sub-${itemId}`)
  if (sub) {
    sub.value = measure.mode === 'qty'
      ? fmt$(total)
      : `${measure.billQty.toFixed(3)} ${measure.labelUnit} -> ${fmt$(total)}`
    return
  }
}

function recalcTrackEditItem(itemId) {
  const q = parseFloat(document.getElementById(`eoi-q-${itemId}`)?.value) || 0
  const lenRaw = parseFloat(document.getElementById(`eoi-l-${itemId}`)?.value) || 0
  const lenUnit = document.getElementById(`eoi-lu-${itemId}`)?.value || 'ft'
  const rate = parseFloat(document.getElementById(`eoi-rate-${itemId}`)?.value) || 0
  const total = q * rate
  const sub = document.getElementById(`eoi-sub-${itemId}`)
  if (sub) sub.value = `₹${total.toFixed(2)}`
}

function computeOrderRevenueFromItems(items = currentItems) {
  return (items || []).reduce((sum, it) => sum + orderItemRevenue(it), 0)
}

function componentLineCost(c) {
  const qty = Number(c.actual_qty ?? c.planned_qty ?? 0)
  const rate = Number(c.inv_variants?.purchase_rate || 0)
  const qtyForRate = (c.unit || 'pcs') === 'ft' ? qty * 0.3048 : qty
  return qtyForRate * rate
}

function computeOrderCostFromItems(items = currentItems, components = currentComponents) {
  return (items || []).reduce((sum, it) => {
    const itemType = it.item_type || 'finished_goods'
    let itemCost = 0
    if (itemType === 'finished_goods') {
      const purchaseRate = Number(it.inv_variants?.purchase_rate || 0)
      const fabricWidth = Number(it.inv_variants?.width_m || 0)
      const costSqm = (fabricWidth > 0 && purchaseRate > 0) ? (purchaseRate / fabricWidth) : Number(it.inv_variants?.base_rate_sqm || 0)
      const area = Number(it.area_sqm || 0)
      const mult = (it.blind_type || '').startsWith('Sheer Dimout') ? 2 : 1
      itemCost += area * costSqm * mult
    } else if (itemType === 'raw_material' || itemType === 'resale') {
      itemCost += resaleBillQty(it) * directPurchaseRate(it)
    }
    itemCost += (components || [])
      .filter(c => c.order_item_id === it.id)
      .reduce((s, c) => s + componentLineCost(c), 0)
    return sum + itemCost
  }, 0)
}

function orderItemAreaSqm(it) {
  const itemType = it.item_type || 'finished_goods'
  const unit = String(it.sale_unit || it.inv_variants?.unit || '').toLowerCase()
  if (itemType === 'track') return 0

  const wM = Number(it.width_cm || 0) / 100
  const hM = Number(it.height_cm || 0) / 100
  const qty = Number(it.quantity || 0)
  const areaFromDims = wM > 0 && hM > 0 && qty > 0 ? wM * hM * qty : 0
  const storedArea = Number(it.area_sqm || 0)

  if (itemType === 'finished_goods') return areaFromDims || storedArea
  if (unit === 'sqm' || unit === 'sq m' || unit === 'm2' || unit === 'm²') return storedArea || qty
  return 0
}

function orderTotalAreaSqm(items = currentItems) {
  return (items || []).reduce((sum, it) => sum + orderItemAreaSqm(it), 0)
}

function billingItemType(it) {
  return it.item_type || 'finished_goods'
}

function billingItemName(it) {
  const itemType = billingItemType(it)
  if (itemType === 'track') return it.blind_type || it.product_name || 'Track'
  if (itemType === 'raw_material') return it.product_name || it.inv_variants?.name || 'Part'
  if (itemType === 'resale') return it.product_name || it.fg_stock?.name || it.inv_variants?.name || 'Resale item'
  return it.blind_type || it.product_name || it.inv_variants?.name || 'Blind'
}

function billingItemDetails(it) {
  const itemType = billingItemType(it)
  const details = []
  const productName = it.product_name || ''
  const fabricName = it.inv_variants?.name || ''
  const stockName = it.fg_stock?.name || ''

  if (itemType === 'finished_goods' && fabricName) details.push(`Fabric: ${fabricName}`)
  if (itemType === 'resale' && stockName && stockName !== productName) details.push(`Item: ${stockName}`)
  if (itemType === 'raw_material' && fabricName && fabricName !== productName) details.push(`Part: ${fabricName}`)
  if (productName && productName !== billingItemName(it)) details.push(`Detail: ${productName}`)
  return details
}

function billingLineKey(parts) {
  return parts.map(part => String(part ?? '').trim().toLowerCase()).join('||')
}

function buildBillingLines(items = currentItems) {
  const grouped = new Map()

  ;(items || []).forEach(it => {
    const itemType = billingItemType(it)
    const wCm = Number(it.width_cm || 0)
    const hCm = Number(it.height_cm || 0)
    const wM = wCm / 100
    const hM = hCm / 100
    const hasBlindArea = wM > 0 && hM > 0
    const isTrackItem = itemType === 'track'
    const chargeableFt = isTrackItem ? trackChargeableFt(it) : 0
    const storedArea = Number(it.area_sqm || 0)
    const rate = Number(it.rate_applied || 0)
    const qty = hasBlindArea ? directInputQty(it) || Number(it.quantity || 0) || 1 : Number(it.quantity || 0) || 1
    const sqmPerBlind = hasBlindArea
      ? wM * hM
      : (itemType !== 'track' && normalizedSaleUnit(it.sale_unit || it.inv_variants?.unit || it.fg_stock?.unit) === 'sqm' && qty > 0 ? storedArea / qty : 0)
    const isSqmBilling = sqmPerBlind > 0
    const unit = isTrackItem
      ? 'track'
      : (it.sale_unit || it.fg_stock?.unit || it.inv_variants?.unit || 'pcs')
    const quantity = isTrackItem
      ? (Number(it.quantity || 0) || 1)
      : isSqmBilling
      ? qty
      : (itemType === 'resale' ? resaleBillQty(it) : (Number(it.quantity || 0) || resaleBillQty(it)))
    const lineTotal = isTrackItem
      ? (quantity * rate || Number(it.line_total || 0))
      : isSqmBilling
      ? sqmPerBlind * qty * rate
      : (Number(it.line_total || 0) || (quantity * rate) || orderItemRevenue(it))
    const name = billingItemName(it)
    const details = billingItemDetails(it)
    const dimsKey = isTrackItem
      ? `ft:${chargeableFt.toFixed(3)}`
      : isSqmBilling
      ? (hasBlindArea ? `${wCm.toFixed(3)}x${hCm.toFixed(3)}` : `sqm:${sqmPerBlind.toFixed(4)}`)
      : ''
    const key = billingLineKey([
      itemType,
      name,
      details.join('|'),
      dimsKey,
      unit,
      rate.toFixed(4),
      isSqmBilling ? 'sqm' : 'unit',
      isTrackItem ? 'track' : '',
    ])

    if (!grouped.has(key)) {
      grouped.set(key, {
        itemType,
        name,
        details,
        quantity: 0,
        unit,
        widthCm: isSqmBilling ? wCm : 0,
        heightCm: isSqmBilling ? hCm : 0,
        hasDimensions: hasBlindArea,
        isTrackItem,
        chargeableFt,
        sqmPerBlind,
        totalSqm: 0,
        rate,
        total: 0,
        isSqmBilling,
      })
    }

    const line = grouped.get(key)
    line.quantity += quantity
    if (isSqmBilling) line.totalSqm += sqmPerBlind * quantity
    line.total += lineTotal
  })

  return [...grouped.values()]
}

function billingLinesTotal(lines) {
  return (lines || []).reduce((sum, line) => sum + Number(line.total || 0), 0)
}

function billingLinesArea(lines) {
  return (lines || []).reduce((sum, line) => {
    if (!line.isSqmBilling) return sum
    return sum + Number(line.totalSqm || 0)
  }, 0)
}

function billingQtyDisplay(line) {
  if (line.isTrackItem) return `${fmtMeasure(line.quantity, 3)} track`
  if (line.isSqmBilling) return `${fmtMeasure(line.totalSqm, 3)} sqm`
  return `${fmtMeasure(line.quantity, 3)} ${esc(line.unit || 'pcs')}`
}

function billingQuantityDisplay(line) {
  if (line.isTrackItem) return `${fmtMeasure(line.quantity, 3)} track`
  if (line.isSqmBilling) return `${fmtMeasure(line.quantity, 3)} ${line.itemType === 'finished_goods' ? 'blind' : 'item'}`
  return `${fmtMeasure(line.quantity, 3)} ${esc(line.unit || 'pcs')}`
}

function billingRateUnit(line) {
  if (line.isTrackItem) return 'track'
  if (line.isSqmBilling) return 'sqm'
  return line.unit || 'unit'
}

function billingMeasureBox(line) {
  if (line.isTrackItem) {
    return `<div class="measure-box track-box">
      <div><strong>${fmtMeasure(line.chargeableFt, 1)} ft</strong> per track</div>
      <small>Chargeable length reference</small>
    </div>`
  }

  if (line.isSqmBilling) {
    const label = line.itemType === 'finished_goods' ? 'per blind' : 'per item'
    return `<div class="measure-box sqm-measure-box">
      <div><strong>${fmtMeasure(line.sqmPerBlind, 3)} sqm</strong> ${label}</div>
      <small>${line.hasDimensions ? `${fmtMeasure(line.widthCm, 2)} cm W x ${fmtMeasure(line.heightCm, 2)} cm L` : 'Area-based billing'}</small>
    </div>`
  }

  const unit = String(line.unit || 'pcs').toLowerCase()
  const isLength = ['m', 'meter', 'metre', 'ft', 'feet'].includes(unit)
  return `<div class="measure-box unit-measure-box">
    <div><strong>${esc(line.unit || 'pcs')}</strong> billing</div>
    <small>${isLength ? 'Length-based material' : 'Unit-based item'}</small>
  </div>`
}

// Track items marked for removal
const _toRemove = new Set()
function removeEditItem(itemId, isExisting) {
  const el = document.getElementById(`edit-item-${itemId}`)
  if (!el) return
  if (isExisting) {
    _toRemove.add(itemId)
    el.style.opacity = '.4'
    el.style.pointerEvents = 'none'
    el.style.position = 'relative'
    el.insertAdjacentHTML('beforeend', `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.6);border-radius:4px;font-size:12px;color:#ef4444;font-weight:600;"><i class="fa-solid fa-trash" style="margin-right:6px;"></i> Will be removed on save <button class="btn btn-ghost btn-sm" onclick="undoRemoveEditItem('${itemId}')" style="margin-left:8px;color:#059669;">Undo</button></div>`)
  } else {
    el.remove()
    editNewItems = editNewItems.filter(n => n.id !== itemId)
  }
}

function undoRemoveEditItem(itemId) {
  _toRemove.delete(itemId)
  const el = document.getElementById(`edit-item-${itemId}`)
  if (!el) return
  el.style.opacity = ''
  el.style.pointerEvents = ''
  const overlay = el.querySelector('div[style*="position:absolute"]')
  overlay?.remove()
}

// ── Add new item to the edit form ─────────────────────────────────────────────
function renderEditVariantOptions(filterFn = () => true) {
  return (editData?.variants || [])
    .filter(v => !isHiddenOrderVariant(v) && filterFn(v))
    .map(v => {
      const stockM = editVariantAvailableQty(v)
      const label = [v.inv_products?.name, v.category?.name].filter(Boolean).join(' · ')
      return `<option value="${v.id}" data-unit="${esc(v.unit || 'pcs')}" data-rate="${Number(v.base_rate_sqm || v.purchase_rate || 0)}" data-name="${esc(v.name)}">${esc(v.name)}${label ? ` (${esc(label)})` : ''}${stockM ? ` · ${stockM.toFixed(stockM % 1 === 0 ? 0 : 1)} ${esc(v.unit || 'm')} stock` : ''}</option>`
    }).join('')
}

function renderEditDirectItemOptions() {
  return (editData?.directItems || []).map(item => {
    const stock = Number(item.quantity || 0)
    const stockText = stock ? ` · ${stock.toFixed(stock % 1 === 0 ? 0 : 2)} ${esc(item.unit || 'pcs')} stock` : ''
    return `<option value="${esc(item.key)}" data-rate="${Number(item.purchase_cost || 0)}" data-unit="${esc(item.unit || 'pcs')}">${esc([item.code, item.name].filter(Boolean).join(' - '))}${stockText}</option>`
  }).join('')
}

function onEditNewType(nid) {
  const type = document.getElementById(`eni-type-${nid}`)?.value || 'finished_goods'
  ;['fg', 'rm', 'track', 'resale'].forEach(section => {
    const el = document.getElementById(`eni-${section}-section-${nid}`)
    if (el) el.style.display = 'none'
  })
  const target = type === 'finished_goods' ? 'fg' : type === 'raw_material' ? 'rm' : type
  const active = document.getElementById(`eni-${target}-section-${nid}`)
  if (active) active.style.display = ''
  recalcNewEditItem(nid)
}

function addEditNewItem() {
  editNewItemCount++
  const nid = `new-${editNewItemCount}`
  editNewItems.push({ id: nid })

  const mainTypeOpts = Object.keys(BLIND_TYPE_TREE)
    .filter(t => !HIDDEN_ORDER_MAIN_TYPES.has(t))
    .map(t => `<option value="${t}">${esc(t)}</option>`).join('')

  const wrap = document.getElementById('edit-new-items')
  const div = document.createElement('div')
  div.className = 'edit-item-row'
  div.id = `edit-item-${nid}`
  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span class="text-xs fw-600" style="color:#4f46e5;">New Item ${editNewItemCount}</span>
      <button class="btn btn-ghost btn-sm" style="color:#ef4444;" onclick="removeEditItem('${nid}', false)">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>
    <div class="form-row cols-2" style="margin-bottom:8px;">
      <div class="form-group" style="margin:0;">
        <label style="font-size:12px;">Item Type</label>
        <select id="eni-type-${nid}" onchange="onEditNewType('${nid}')">
          <option value="finished_goods">Finished Goods</option>
          <option value="raw_material">Raw Material</option>
          <option value="track">Track</option>
          <option value="resale">Direct Order</option>
        </select>
      </div>
    </div>
    <div id="eni-fg-section-${nid}">
    <div class="form-row cols-2" style="margin-bottom:8px;">
      <div class="form-group" style="margin:0;">
        <label style="font-size:12px;">Blind Type</label>
        <select id="eni-main-${nid}" onchange="onEditNewMainType('${nid}')">
          <option value="">Select…</option>${mainTypeOpts}
        </select>
      </div>
      <div class="form-group" style="margin:0;">
        <label style="font-size:12px;">Sub-Type</label>
        <select id="eni-sub-${nid}" disabled>
          <option value="">Select…</option>
        </select>
      </div>
    </div>
    <div class="form-group" style="margin-bottom:8px;">
      <label style="font-size:12px;">Fabric</label>
      <select id="eni-fabric-${nid}" disabled onchange="recalcNewEditItem('${nid}')">
        <option value="">Select fabric…</option>
      </select>
    </div>
    <div class="form-row cols-3" style="margin-bottom:8px;">
      <div class="form-group" style="margin:0;">
        <label style="font-size:12px;">Width (cm)</label>
        <input id="eni-w-${nid}" type="number" min="0.01" step="0.01" oninput="recalcNewEditItem('${nid}')">
      </div>
      <div class="form-group" style="margin:0;">
        <label style="font-size:12px;">Height (cm)</label>
        <input id="eni-h-${nid}" type="number" min="0.01" step="0.01" oninput="recalcNewEditItem('${nid}')">
      </div>
      <div class="form-group" style="margin:0;">
        <label style="font-size:12px;">Qty</label>
        <input id="eni-q-${nid}" type="number" min="0.001" step="0.001" value="1" oninput="recalcNewEditItem('${nid}')">
      </div>
    </div>
    <div id="eni-calc-${nid}" class="text-xs text-muted"></div>
    </div>
    <div id="eni-rm-section-${nid}" style="display:none;">
      <div class="form-row cols-3" style="margin-bottom:8px;">
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Variant</label>
          <select id="eni-rm-var-${nid}" onchange="recalcNewEditItem('${nid}')">
            <option value="">Select...</option>
            ${renderEditVariantOptions(v => !isFinishedGoodVariantForEdit(v))}
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Quantity</label>
          <input id="eni-rm-q-${nid}" type="number" min="0.001" step="0.001" value="1" oninput="recalcNewEditItem('${nid}')">
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Rate</label>
          <input id="eni-rm-rate-${nid}" type="number" min="0" step="0.01" oninput="recalcNewEditItem('${nid}')">
        </div>
      </div>
    </div>
    <div id="eni-track-section-${nid}" style="display:none;">
      <div class="form-row cols-4" style="margin-bottom:8px;">
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Track Type</label>
          <select id="eni-track-type-${nid}" onchange="recalcNewEditItem('${nid}')">
            <option value="">Select...</option>
            <option value="Super Track">Super Track</option>
            <option value="Jumbo Track">Jumbo Track</option>
            <option value="M Track">M Track</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Qty</label>
          <input id="eni-track-q-${nid}" type="number" min="1" step="1" value="1" oninput="recalcNewEditItem('${nid}')">
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Length</label>
          <div style="display:flex;gap:6px;">
            <input id="eni-track-l-${nid}" type="number" min="0.01" step="0.001" oninput="recalcNewEditItem('${nid}')">
            <select id="eni-track-lu-${nid}" onchange="recalcNewEditItem('${nid}')">${DIM_UNITS.map(u => `<option value="${u}" ${u === 'ft' ? 'selected' : ''}>${u}</option>`).join('')}</select>
          </div>
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Rate / Track</label>
          <input id="eni-track-rate-${nid}" type="number" min="0" step="0.01" oninput="recalcNewEditItem('${nid}')">
        </div>
      </div>
    </div>
    <div id="eni-resale-section-${nid}" style="display:none;">
      <div class="form-row cols-2" style="margin-bottom:8px;">
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Direct Item</label>
          <select id="eni-resale-item-${nid}" onchange="recalcNewEditItem('${nid}')">
            <option value="">Select...</option>
            ${renderEditDirectItemOptions()}
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label style="font-size:12px;">Rate</label>
          <input id="eni-resale-rate-${nid}" type="number" min="0" step="0.01" oninput="recalcNewEditItem('${nid}')">
        </div>
      </div>
      <div class="form-row cols-3" style="margin-bottom:8px;">
        <div class="form-group" style="margin:0;"><label style="font-size:12px;">Qty</label><input id="eni-resale-q-${nid}" type="number" min="0.001" step="0.001" value="1" oninput="recalcNewEditItem('${nid}')"></div>
        <div class="form-group" style="margin:0;"><label style="font-size:12px;">Width</label><div style="display:flex;gap:6px;"><input id="eni-resale-w-${nid}" type="number" min="0.01" step="0.001" placeholder="Optional" oninput="recalcNewEditItem('${nid}')"><select id="eni-resale-wu-${nid}" onchange="recalcNewEditItem('${nid}')">${DIM_UNITS.map(u => `<option value="${u}" ${u === 'cm' ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div>
        <div class="form-group" style="margin:0;"><label style="font-size:12px;">Height / Length</label><div style="display:flex;gap:6px;"><input id="eni-resale-h-${nid}" type="number" min="0.01" step="0.001" placeholder="Optional" oninput="recalcNewEditItem('${nid}')"><select id="eni-resale-hu-${nid}" onchange="recalcNewEditItem('${nid}')">${DIM_UNITS.map(u => `<option value="${u}" ${u === 'cm' ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div>
      </div>
    </div>
  `
  wrap.appendChild(div)
}

function onEditNewMainType(nid) {
  const mainType = document.getElementById(`eni-main-${nid}`)?.value
  const subSel   = document.getElementById(`eni-sub-${nid}`)
  const fabSel   = document.getElementById(`eni-fabric-${nid}`)
  subSel.disabled = true; fabSel.disabled = true
  subSel.innerHTML = '<option value="">Select…</option>'
  fabSel.innerHTML = '<option value="">Select fabric…</option>'
  if (!mainType) return

  const subTypes = BLIND_TYPE_TREE[mainType] || []
  subSel.innerHTML = '<option value="">Select…</option>' + subTypes.map(s => `<option value="${s}">${esc(s)}</option>`).join('')
  subSel.disabled = false

  // Populate fabrics
  const catNames = BLIND_FABRIC_MAP[mainType] || []
  if (!catNames.length) { fabSel.innerHTML = '<option value="">No fabric needed</option>'; return }
  const vars = editData.variants.filter(v =>
    !isHiddenOrderVariant(v) && catNames.some(name => categoryMatchesName(v.category, name))
  )
  fabSel.innerHTML = '<option value="">Select fabric…</option>' + vars.map(v => {
    const stockM = (v.rolls||[]).filter(r=>r.status==='in_stock').reduce((s,r)=>s+Number(r.remaining_length||0),0)
    const rate = v.base_rate_sqm ? ` ₹${Number(v.base_rate_sqm).toFixed(0)}/sqm` : ''
    return `<option value="${v.id}" data-width="${v.width_m||0}" data-rate="${v.base_rate_sqm||0}" ${stockM<=0 ? 'style="color:#ef4444"' : ''}>${esc(v.name)} [${stockM.toFixed(0)}m in stock]${rate}</option>`
  }).join('')
  fabSel.disabled = false
}

function recalcNewEditItem(nid) {
  const type = document.getElementById(`eni-type-${nid}`)?.value || 'finished_goods'
  if (type === 'raw_material') {
    const varSel = document.getElementById(`eni-rm-var-${nid}`)
    const opt = varSel?.options[varSel.selectedIndex]
    const qty = parseFloat(document.getElementById(`eni-rm-q-${nid}`)?.value) || 0
    const rate = parseFloat(document.getElementById(`eni-rm-rate-${nid}`)?.value) || parseFloat(opt?.dataset?.rate) || 0
    const sub = document.getElementById(`eni-calc-${nid}`)
    if (sub) sub.textContent = qty > 0 && rate > 0 ? `Qty: ${qty.toFixed(3)} ${opt?.dataset?.unit || ''} · Total: ${fmt$(qty * rate)}` : ''
    return
  }
  if (type === 'track') {
    const qty = parseFloat(document.getElementById(`eni-track-q-${nid}`)?.value) || 0
    const lenRaw = parseFloat(document.getElementById(`eni-track-l-${nid}`)?.value) || 0
    const lenUnit = document.getElementById(`eni-track-lu-${nid}`)?.value || 'ft'
    const rate = parseFloat(document.getElementById(`eni-track-rate-${nid}`)?.value) || 0
    const chargeableFt = lenRaw > 0 ? Math.ceil(cvtUnit(lenRaw, lenUnit, 'ft') * 2) / 2 : 0
    const sub = document.getElementById(`eni-calc-${nid}`)
    if (sub) sub.textContent = qty > 0 && chargeableFt > 0 ? `Chargeable: ${chargeableFt.toFixed(1)} ft · Total: ${fmt$(qty * rate)}` : ''
    return
  }
  if (type === 'resale') {
    const item = editData.directItems.find(x => x.key === document.getElementById(`eni-resale-item-${nid}`)?.value)
    const qty = parseFloat(document.getElementById(`eni-resale-q-${nid}`)?.value) || 0
    const rate = parseFloat(document.getElementById(`eni-resale-rate-${nid}`)?.value) || 0
    const wRaw = parseFloat(document.getElementById(`eni-resale-w-${nid}`)?.value)
    const hRaw = parseFloat(document.getElementById(`eni-resale-h-${nid}`)?.value)
    const wUnit = document.getElementById(`eni-resale-wu-${nid}`)?.value || 'cm'
    const hUnit = document.getElementById(`eni-resale-hu-${nid}`)?.value || 'cm'
    const measure = editMeasuredBilling(qty, item?.unit || 'pcs', wRaw, hRaw, wUnit, hUnit)
    const sub = document.getElementById(`eni-calc-${nid}`)
    if (sub) {
      sub.textContent = item && qty > 0 && rate > 0
        ? `${measure.mode === 'qty' ? 'Qty' : 'Billing'}: ${measure.billQty.toFixed(3)} ${measure.labelUnit} - Total: ${fmt$(measure.billQty * rate)}`
        : ''
    }
    return
  }
  const fabOpt = document.querySelector(`#eni-fabric-${nid} option:checked`)
  const rate   = parseFloat(fabOpt?.dataset?.rate) || 0
  const w = parseFloat(document.getElementById(`eni-w-${nid}`)?.value) || 0
  const h = parseFloat(document.getElementById(`eni-h-${nid}`)?.value) || 0
  const qRaw = parseFloat(document.getElementById(`eni-q-${nid}`)?.value)
  const q = !isNaN(qRaw) && qRaw > 0 ? qRaw : 1
  const area = (w/100) * (h/100) * q
  const total = area * rate
  const sub = document.getElementById(`eni-calc-${nid}`)
  if (sub) sub.textContent = (rate > 0 && w > 0 && h > 0) ? `Area: ${area.toFixed(3)} m²  —  Total: ₹${total.toFixed(2)}` : ''
}

// ── Save Edit Order ───────────────────────────────────────────────────────────
async function saveEditOrder() {
  hideAlert('edit-alert')
  disable('eo-save-btn')

  try {
    // 1. Update order header
    const custId    = document.getElementById('eo-cust')?.value || null
    const dealerName = val('eo-dealer') || null
    const billNo    = val('eo-bill')   || null
    const orderDate = val('eo-order-date') || null
    const invoiceNumber = val('eo-invoice') || null
    const invoiceDate = val('eo-invoice-date') || null
    const notes     = val('eo-notes') || null

    const orderUpdates = {
      cust_id:       custId || currentOrder.cust_id,
      dealer_name:   dealerName,
      order_date:     orderDate,
      source_bill_no: billNo,
      invoice_number: invoiceNumber,
      invoice_date:   invoiceDate,
      notes,
    }
    let ordResult = await db.from('orders').update(orderUpdates).eq('id', currentOrderId)
    if (ordResult.error && /invoice_number|invoice_date/i.test(ordResult.error.message || '')) {
      delete orderUpdates.invoice_number
      delete orderUpdates.invoice_date
      ordResult = await db.from('orders').update(orderUpdates).eq('id', currentOrderId)
    }
    const { error: ordErr } = ordResult
    if (ordErr) throw ordErr

    // 2. Delete removed existing items (and their components)
    for (const itemId of _toRemove) {
      await db.from('order_components').delete().eq('order_item_id', itemId)
      await db.from('wastage_logs').delete().eq('order_item_id', itemId)
      await db.from('order_items').delete().eq('id', itemId)
    }
    _toRemove.clear()

    // 3. Update existing items
    let newTotal = 0
    for (const it of currentItems) {
      const el = document.getElementById(`edit-item-${it.id}`)
      if (!el) continue   // was removed

      const isFG = (it.item_type || 'finished_goods') === 'finished_goods'
      if (isFG) {
        const wRaw = readPositiveNumber(`eoi-w-${it.id}`, 'Width')
        const hRaw = readPositiveNumber(`eoi-h-${it.id}`, 'Height')
        const wUnit = document.getElementById(`eoi-wu-${it.id}`)?.value || 'cm'
        const hUnit = document.getElementById(`eoi-hu-${it.id}`)?.value || 'cm'
        const w_cm = cvtUnit(wRaw, wUnit, 'cm')
        const h_cm = cvtUnit(hRaw, hUnit, 'cm')
        const qty  = readPositiveNumber(`eoi-q-${it.id}`, 'Quantity')
        const rate = parseFloat(document.getElementById(`eoi-rate-${it.id}`)?.value) || Number(it.rate_applied || 0)
        const area = (w_cm/100) * (h_cm/100) * qty
        const lineTotal = area * rate
        newTotal += lineTotal
        await db.from('order_items').update({
          width_cm: w_cm,
          height_cm: h_cm,
          input_width_raw: wRaw,
          input_width_unit: wUnit,
          input_height_raw: hRaw,
          input_height_unit: hUnit,
          quantity: qty,
          rate_applied: rate,
          area_sqm: area,
          line_total: lineTotal,
        }).eq('id', it.id)

        const oldQty = Number(it.quantity || 1)
        const oldWidthM = Number(it.width_cm || 0) / 100
        const newWidthM = w_cm / 100
        const comps = currentComponents.filter(c => c.order_item_id === it.id)
        for (const c of comps) {
          const planned = Number(c.planned_qty || 0)
          let plannedQty = planned
          if (c.is_width_dependent) {
            plannedQty = newWidthM * qty
          } else if (oldQty > 0) {
            plannedQty = (planned / oldQty) * qty
          } else if (oldWidthM > 0) {
            plannedQty = (planned / oldWidthM) * newWidthM
          }
          await db.from('order_components').update({
            planned_qty: plannedQty,
            actual_qty: null,
            deducted: false,
          }).eq('id', c.id)
        }
      } else if (it.item_type === 'track') {
        const qty = readPositiveNumber(`eoi-q-${it.id}`, 'Track quantity')
        const lenRaw = readPositiveNumber(`eoi-l-${it.id}`, 'Track length')
        const lenUnit = document.getElementById(`eoi-lu-${it.id}`)?.value || 'ft'
        const lengthFt = cvtUnit(lenRaw, lenUnit, 'ft')
        const chargeableFt = Math.ceil(lengthFt * 2) / 2
        const rate = parseFloat(document.getElementById(`eoi-rate-${it.id}`)?.value) || Number(it.rate_applied || 0)
        const lineTotal = qty * rate
        newTotal += lineTotal
        await db.from('order_items').update({
          quantity: qty,
          input_length_raw: lenRaw,
          input_length_unit: lenUnit,
          input_length_ft: lengthFt,
          chargeable_length_ft: chargeableFt,
          area_sqm: chargeableFt,
          sale_unit: 'track',
          rate_applied: rate,
          line_total: lineTotal,
        }).eq('id', it.id)

        const oldTrackQty = Number(it.quantity || 1)
        const oldChargeable = trackChargeableFt(it)
        const comps = currentComponents.filter(c => c.order_item_id === it.id)
        for (const c of comps) {
          const planned = Number(c.planned_qty || 0)
          const unit = c.unit || c.inv_variants?.unit || 'pcs'
          const plannedQty = unit === 'ft'
            ? chargeableFt * qty
            : (oldTrackQty > 0 ? (planned / oldTrackQty) * qty : planned)
          await db.from('order_components').update({
            planned_qty: plannedQty,
            actual_qty: null,
            deducted: false,
          }).eq('id', c.id)
        }
      } else {
        const qty = readPositiveNumber(`eoi-q-${it.id}`, 'Quantity')
        const rate = parseFloat(document.getElementById(`eoi-rate-${it.id}`)?.value) || Number(it.rate_applied || 0)
        const wRaw = parseFloat(document.getElementById(`eoi-w-${it.id}`)?.value)
        const hRaw = parseFloat(document.getElementById(`eoi-h-${it.id}`)?.value)
        const wUnit = document.getElementById(`eoi-wu-${it.id}`)?.value || 'cm'
        const hUnit = document.getElementById(`eoi-hu-${it.id}`)?.value || 'cm'
        const measure = editMeasuredBilling(qty, it.sale_unit || it.inv_variants?.unit || 'pcs', wRaw, hRaw, wUnit, hUnit)
        const lineTotal = measure.billQty * rate
        newTotal += lineTotal
        await db.from('order_items').update({
          width_cm: measure.widthCm,
          height_cm: measure.heightCm,
          input_width_raw: measure.hasWidth ? wRaw : null,
          input_width_unit: measure.hasWidth ? wUnit : null,
          input_height_raw: measure.hasLength ? hRaw : null,
          input_height_unit: measure.hasLength ? hUnit : null,
          quantity: qty,
          area_sqm: measure.areaSqm,
          sale_unit: measure.saleUnit,
          rate_applied: rate,
          line_total: lineTotal,
        }).eq('id', it.id)
      }
    }

    // 4. Insert new items
    for (const ni of editNewItems) {
      const nid = ni.id
      const el = document.getElementById(`edit-item-${nid}`)
      if (!el) continue

      const editItemType = document.getElementById(`eni-type-${nid}`)?.value || 'finished_goods'
      if (editItemType === 'raw_material') {
        const varSel = document.getElementById(`eni-rm-var-${nid}`)
        const varId = varSel?.value
        const opt = varSel?.options[varSel.selectedIndex]
        const qty = parseFloat(document.getElementById(`eni-rm-q-${nid}`)?.value)
        const rate = parseFloat(document.getElementById(`eni-rm-rate-${nid}`)?.value) || parseFloat(opt?.dataset?.rate) || 0
        if (!varId || isNaN(qty) || qty <= 0 || rate <= 0) continue
        const lineTotal = qty * rate
        newTotal += lineTotal
        const { error: rmErr } = await db.from('order_items').insert({
          order_id: currentOrderId,
          variant_id: varId,
          quantity: qty,
          area_sqm: qty,
          rate_applied: rate,
          line_total: lineTotal,
          item_type: 'raw_material',
          sale_unit: opt?.dataset?.unit || 'pcs',
          product_name: opt?.dataset?.name || opt?.textContent || null,
          fabric_deducted: false,
        })
        if (rmErr) throw rmErr
        continue
      }

      if (editItemType === 'resale') {
        const item = editData.directItems.find(x => x.key === document.getElementById(`eni-resale-item-${nid}`)?.value)
        const qty = parseFloat(document.getElementById(`eni-resale-q-${nid}`)?.value)
        const rate = parseFloat(document.getElementById(`eni-resale-rate-${nid}`)?.value)
        const wRaw = parseFloat(document.getElementById(`eni-resale-w-${nid}`)?.value)
        const hRaw = parseFloat(document.getElementById(`eni-resale-h-${nid}`)?.value)
        const wUnit = document.getElementById(`eni-resale-wu-${nid}`)?.value || 'cm'
        const hUnit = document.getElementById(`eni-resale-hu-${nid}`)?.value || 'cm'
        if (!item || isNaN(qty) || qty <= 0 || isNaN(rate) || rate <= 0) continue
        const measure = editMeasuredBilling(qty, item.unit, wRaw, hRaw, wUnit, hUnit)
        const lineTotal = measure.billQty * rate
        newTotal += lineTotal
        const { error: resaleErr } = await db.from('order_items').insert({
          order_id: currentOrderId,
          variant_id: item.variantId || null,
          fg_stock_id: item.fgStockId || null,
          width_cm: measure.widthCm,
          height_cm: measure.heightCm,
          input_width_raw: measure.hasWidth ? wRaw : null,
          input_width_unit: measure.hasWidth ? wUnit : null,
          input_height_raw: measure.hasLength ? hRaw : null,
          input_height_unit: measure.hasLength ? hUnit : null,
          quantity: qty,
          area_sqm: measure.areaSqm,
          rate_applied: rate,
          line_total: lineTotal,
          item_type: 'resale',
          sale_unit: measure.saleUnit,
          product_name: item.name,
          fabric_deducted: false,
        })
        if (resaleErr) throw resaleErr
        continue
      }

      if (editItemType === 'track') {
        const trackType = document.getElementById(`eni-track-type-${nid}`)?.value
        const qty = parseFloat(document.getElementById(`eni-track-q-${nid}`)?.value)
        const lenRaw = parseFloat(document.getElementById(`eni-track-l-${nid}`)?.value)
        const lenUnit = document.getElementById(`eni-track-lu-${nid}`)?.value || 'ft'
        const rate = parseFloat(document.getElementById(`eni-track-rate-${nid}`)?.value) || 0
        if (!trackType || isNaN(qty) || qty <= 0 || isNaN(lenRaw) || lenRaw <= 0 || rate <= 0) continue
        const lengthFt = cvtUnit(lenRaw, lenUnit, 'ft')
        const chargeableFt = Math.ceil(lengthFt * 2) / 2
        const lineTotal = qty * rate
        newTotal += lineTotal
        const { data: oiRow, error: trkErr } = await db.from('order_items').insert({
          order_id: currentOrderId,
          quantity: qty,
          input_length_raw: lenRaw,
          input_length_unit: lenUnit,
          input_length_ft: lengthFt,
          chargeable_length_ft: chargeableFt,
          area_sqm: chargeableFt,
          rate_applied: rate,
          line_total: lineTotal,
          item_type: 'track',
          sale_unit: 'track',
          blind_type: trackType,
          product_name: trackType,
          fabric_deducted: false,
        }).select('id').single()
        if (trkErr) throw trkErr
        const recipe = findRecipeForBlindType(editData.recipes, trackType)
        const componentSource = recipe?.recipe_items?.length
          ? recipe.recipe_items.map(item => ({
              name: item.inv_variants?.name,
              variantId: item.variant_id || item.inv_variants?.id || null,
              unit: item.inv_variants?.unit || 'pcs',
              isWidthDependent: Boolean(item.is_width_dependent),
              quantityPerUnit: Number(item.quantity_per_unit || 0),
            }))
          : (TRACK_RECIPES[trackType] || []).map(name => ({ name, variantId: null, unit: 'pcs', isWidthDependent: false, quantityPerUnit: 0 }))
        const comps = componentSource.map((component, idx) => ({
          order_id: currentOrderId,
          order_item_id: oiRow.id,
          variant_id: component.variantId || null,
          component_name: component.variantId ? null : component.name,
          planned_qty: idx === 0 ? chargeableFt * qty : (component.isWidthDependent ? chargeableFt * qty : (component.quantityPerUnit || 0) * qty),
          unit: idx === 0 ? 'ft' : (component.unit || 'pcs'),
          is_width_dependent: component.isWidthDependent,
          is_extra: false,
          deducted: false,
        }))
        if (comps.length) await db.from('order_components').insert(comps)
        continue
      }

      const mainType = document.getElementById(`eni-main-${nid}`)?.value
      const subType  = document.getElementById(`eni-sub-${nid}`)?.value
      const fabId    = document.getElementById(`eni-fabric-${nid}`)?.value
      const w_cm     = parseFloat(document.getElementById(`eni-w-${nid}`)?.value)
      const h_cm     = parseFloat(document.getElementById(`eni-h-${nid}`)?.value)
      const qty      = parseFloat(document.getElementById(`eni-q-${nid}`)?.value)

      if (!mainType || !subType || isNaN(w_cm) || isNaN(h_cm) || isNaN(qty) || qty <= 0) continue

      const fabOpt = document.querySelector(`#eni-fabric-${nid} option[value="${fabId}"]`)
      const rate   = parseFloat(fabOpt?.dataset?.rate) || 0
      const rollW  = parseFloat(fabOpt?.dataset?.width) || 0
      const area   = (w_cm/100) * (h_cm/100) * qty
      const lineTotal = area * rate
      newTotal += lineTotal

      const { data: oiRow, error: oiErr } = await db.from('order_items').insert({
        order_id:        currentOrderId,
        variant_id:      fabId || null,
        width_cm:        w_cm,
        height_cm:       h_cm,
        area_sqm:        area,
        quantity:        qty,
        rate_applied:    rate,
        line_total:      lineTotal,
        item_type:       'finished_goods',
        blind_type:      subType,
        fabric_deducted: false,
      }).select('id').single()
      if (oiErr) throw oiErr

      // Insert components from recipe
      const recipe = findRecipeForBlindType(editData.recipes, subType)
      if (recipe?.recipe_items?.length) {
        const comps = recipe.recipe_items.map(item => ({
          order_id:           currentOrderId,
          order_item_id:      oiRow.id,
          variant_id:         item.variant_id,
          planned_qty:        item.is_width_dependent ? (w_cm / 100) * qty : item.quantity_per_unit * qty,
          is_width_dependent: item.is_width_dependent,
          unit:               item.inv_variants?.unit || 'pcs',
          is_extra:           false,
          deducted:           false,
        }))
        await db.from('order_components').insert(comps)
      }

    }

    // 5. Recalculate total_amount
    // Re-fetch remaining items to sum accurately. FG revenue is area * selling rate;
    // component amounts are cost only and must not be added to revenue.
    const { data: remainingItems } = await db.from('order_items').select('item_type, area_sqm, rate_applied, line_total').eq('order_id', currentOrderId)
    const finalTotal = computeOrderRevenueFromItems(remainingItems || [])
    await db.from('orders').update({ total_amount: finalTotal }).eq('id', currentOrderId)

    await logActivity('update', 'order', currentOrderId, currentOrder.order_uid, { action: 'edited items and details' })
    toast('Order updated successfully')
    closeModal()
    setTimeout(() => window.location.reload(), 800)
  } catch (err) {
    showAlert('edit-alert', err.message)
    disable('eo-save-btn', false)
  }
}

// ── Inventory movements (post-execute) ──────────────────────────────────────
async function loadMovements() {
  const refs = [currentOrderId, currentOrder?.order_uid].filter(Boolean)
  const { data } = await db
    .from('inv_movements')
    .select('*, inv_rolls(batch_code, inv_variants(name))')
    .in('reference', refs)
    .order('created_at')

  if (!data?.length) return
  const netByKey = new Map()
  for (const m of data) {
    const key = `${m.roll_id || ''}|${m.variant_id || ''}|${m.unit || 'm'}`
    const signedQty = m.movement_type === 'outflow' ? -Math.abs(Number(m.quantity || 0)) : Math.abs(Number(m.quantity || 0))
    const row = netByKey.get(key) || { ...m, quantity: 0 }
    row.quantity += signedQty
    row.created_at = m.created_at
    netByKey.set(key, row)
  }
  const activeRows = [...netByKey.values()].filter(m => Math.abs(Number(m.quantity || 0)) > 0.0001)
  if (!activeRows.length) {
    hide('movements-section')
    html('movements-body', '')
    return
  }
  show('movements-section')
  html('movements-body', activeRows.map(m => `
    <tr>
      <td class="fw-600" style="font-family:monospace;">${esc(m.inv_rolls?.batch_code || '—')}</td>
      <td>${esc(m.inv_rolls?.inv_variants?.name || '—')}</td>
      <td><span class="badge ${m.quantity < 0 ? 'badge-warning' : 'badge-success'}">${m.quantity < 0 ? 'outflow' : 'inflow'}</span></td>
      <td class="fw-600" style="color:${m.quantity < 0 ? '#ef4444' : '#10b981'};">${m.quantity > 0 ? '+' : ''}${fmtN(m.quantity)} ${esc(m.unit || 'm')}</td>
      <td class="text-muted">${fmtDateTime(m.created_at)}</td>
    </tr>`).join(''))
}

// ── Financial Summary ─────────────────────────────────────────────────────────
async function renderFinancialSummary() {
  if (!canViewMoney()) {
    hide('financial-summary')
    html('financial-summary', '')
    return
  }
  // Show financial summary at ALL stages for full visibility

  // Recalculate cost for executed/completed orders, or compute live for others
  if (['executed', 'completed'].includes(orderStatus(currentOrder))) {
    await calculateAndStoreOrderCost(currentOrderId)
    const { data: refreshed } = await db.from('orders').select('cost_amount').eq('id', currentOrderId).single()
    if (refreshed) currentOrder.cost_amount = refreshed.cost_amount
  } else {
    // For non-executed orders, calculate cost live from item data
    let liveFabricCost = 0
    let liveComponentCost = 0
    for (const it of currentItems) {
      const itemType = it.item_type || 'finished_goods'
      if (itemType === 'finished_goods') {
        const purchaseRate = Number(it.inv_variants?.purchase_rate || 0)
        const fabricWidth  = Number(it.inv_variants?.width_m || 0)
        const costSqm      = (fabricWidth > 0 && purchaseRate > 0) ? (purchaseRate / fabricWidth) : Number(it.inv_variants?.base_rate_sqm || 0)
        const area         = Number(it.area_sqm || 0)
        const mult         = (it.blind_type || '').startsWith('Sheer Dimout') ? 2 : 1
        liveFabricCost += area * costSqm * mult
      } else if (itemType === 'raw_material' || itemType === 'resale') {
        liveFabricCost += resaleBillQty(it) * directPurchaseRate(it)
      }
      // Component cost (track sections stored in ft — convert to metres for rate calc)
      const itemComps = currentComponents.filter(c => c.order_item_id === it.id)
      liveComponentCost += itemComps.reduce((s, c) => {
        const qty  = Number(c.actual_qty ?? c.planned_qty ?? 0)
        const rate = Number(c.inv_variants?.purchase_rate || 0)
        const qtyM = (c.unit || 'pcs') === 'ft' ? qty * 0.3048 : qty
        return s + qtyM * rate
      }, 0)
    }
    currentOrder.cost_amount = liveFabricCost + liveComponentCost
  }

  const sellingPrice = computeOrderRevenueFromItems(currentItems)
  if (Math.abs(sellingPrice - Number(currentOrder.total_amount || 0)) > 0.01) {
    currentOrder.total_amount = sellingPrice
    const { error: revenueErr } = await db.from('orders').update({ total_amount: sellingPrice }).eq('id', currentOrderId)
    if (revenueErr) console.warn('Unable to refresh order revenue:', revenueErr.message)
  }
  currentOrder.cost_amount = computeOrderCostFromItems(currentItems, currentComponents)
  const costAmount   = Number(currentOrder.cost_amount  || 0)
  const netProfit    = sellingPrice - costAmount
  const margin       = sellingPrice > 0 ? ((netProfit / sellingPrice) * 100).toFixed(1) : '—'

  const types = [...new Set(currentItems.map(it => it.item_type || 'finished_goods'))]
  const hasTrack   = types.includes('track')
  const hasFG      = types.includes('finished_goods')
  const hasRM      = types.includes('raw_material')
  const hasResale  = types.includes('resale')
  const isMixed    = types.length > 1
  let revenueLabel, costLabel
  if (isMixed) {
    revenueLabel = 'Mixed order revenue'
    costLabel    = 'Mixed order cost'
  } else if (hasTrack) {
    revenueLabel = 'Track sales revenue'
    costLabel    = 'Track material cost'
  } else if (hasResale) {
    revenueLabel = 'Resale revenue'
    costLabel    = 'Purchase cost'
  } else if (hasRM) {
    revenueLabel = 'Raw material revenue'
    costLabel    = 'Material cost'
  } else {
    revenueLabel = 'Fabric sales revenue'
    costLabel    = 'Fabric + components'
  }

  show('financial-summary')
  html('financial-summary', `
    <div class="card" style="padding:16px 20px;">
      <div class="fw-600 mb-3" style="font-size:15px;display:flex;align-items:center;gap:8px;">
        <i class="fa-solid fa-chart-line" style="color:#6366f1;"></i> Financial Summary
      </div>
      <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
        <div class="stat-card">
          <div>
            <div class="stat-label">Selling Price</div>
            <div class="stat-value">${fmt$(sellingPrice)}</div>
            <div class="text-xs text-muted" style="margin-top:2px;">${revenueLabel}</div>
          </div>
          <div class="stat-icon icon-violet"><i class="fa-solid fa-indian-rupee-sign"></i></div>
        </div>
        <div class="stat-card">
          <div>
            <div class="stat-label">Order Cost</div>
            <div class="stat-value">${fmt$(costAmount)}</div>
            <div class="text-xs text-muted" style="margin-top:2px;">${costLabel}</div>
          </div>
          <div class="stat-icon icon-red"><i class="fa-solid fa-receipt"></i></div>
        </div>
        <div class="stat-card">
          <div>
            <div class="stat-label">Net Profit</div>
            <div class="stat-value" style="color:${netProfit >= 0 ? '#059669' : '#ef4444'};">${fmt$(netProfit)}</div>
            <div class="text-xs" style="margin-top:2px;color:${netProfit >= 0 ? '#059669' : '#ef4444'};">Margin: ${margin}%</div>
          </div>
          <div class="stat-icon icon-green"><i class="fa-solid fa-chart-line"></i></div>
        </div>
      </div>
    </div>`)
}

function downloadOrderPDF() {
  openQuoteEditor()
}

function quoteInputDate(value) {
  const textValue = String(value || '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(textValue)) return textValue
  return new Date().toISOString().slice(0, 10)
}

function quoteDisplayDate(value) {
  const textValue = quoteInputDate(value)
  const [year, month, day] = textValue.split('-')
  return `${day}.${month}.${year}`
}

function quotePlainNumber(value, decimals = 2) {
  const n = Number(value || 0)
  if (!isFinite(n)) return decimals ? '0.00' : '0'
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function quoteRateNumber(value) {
  const n = Number(value || 0)
  if (!isFinite(n)) return '0'
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)
}

function parseQuoteNumber(value) {
  const cleaned = String(value || '').replace(/[^0-9.-]/g, '')
  const n = Number(cleaned)
  return isFinite(n) ? n : 0
}

function quoteMultilineHtml(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map(line => esc(line))
    .join('<br>')
}

function quoteUnitLabel(unit) {
  const textValue = String(unit || '').trim()
  if (!textValue) return 'PCS'
  if (normalizedSaleUnit(textValue) === 'sqm') return 'SQM'
  return textValue.toUpperCase()
}

function quoteCustomerName(o = currentOrder) {
  return o?.customers?.name || o?.customer_name || o?.dealer_name || 'Unknown Customer'
}

function quoteCustomerBlock(o = currentOrder) {
  const c = o?.customers || {}
  const lines = [
    quoteCustomerName(o),
    c.address,
    [c.city, c.state].filter(Boolean).join(', '),
    c.phone ? `Phone: ${c.phone}` : '',
    c.gstin ? `GST No. ${c.gstin}` : '',
  ].filter(Boolean)
  return lines.join('\n')
}

function defaultQuoteNo(o = currentOrder) {
  const uid = o?.order_uid || o?.id?.substring(0, 8)?.toUpperCase() || ''
  return o?.invoice_number || o?.source_bill_no || (uid ? `TV/${uid}` : '')
}

function quoteDescriptionFromLine(line) {
  const details = [...(line.details || [])]
  if (line.isTrackItem) {
    details.push(`Dimensions: ${fmtMeasure(line.chargeableFt, 1)} ft per track`)
  } else if (line.isSqmBilling) {
    if (line.hasDimensions) {
      details.push(`Dimensions: ${fmtMeasure(line.widthCm, 2)} cm x ${fmtMeasure(line.heightCm, 2)} cm`)
    } else {
      details.push(`Dimensions: ${fmtMeasure(line.sqmPerBlind, 3)} SQM per item`)
    }
  }
  if (line.isSqmBilling) {
    const unit = line.itemType === 'finished_goods' ? 'pcs' : 'items'
    details.push(`Quantity: ${fmtMeasure(line.quantity, 3)} ${unit}`)
  }
  return [line.name, ...details].filter(Boolean).join('\n')
}

function quoteLineSqm(line) {
  return line?.isSqmBilling ? Number(line.totalSqm || 0) : 0
}

function quoteQtyFromLine(line) {
  if (line.isTrackItem) return Number(line.quantity || 0)
  if (line.isSqmBilling) return Number(line.totalSqm || 0)
  return Number(line.quantity || 0)
}

function quoteHsnFromLine(line) {
  if (line.isSqmBilling || line.itemType === 'finished_goods') return '63061200'
  return ''
}

function buildQuoteDefaults() {
  const o = currentOrder
  const saved = currentQuoteForm && typeof currentQuoteForm === 'object' ? currentQuoteForm : {}
  const generatedLines = buildBillingLines(currentItems).map(line => {
    const qty = quoteQtyFromLine(line)
    const amount = Number(line.total || 0)
    const rate = qty > 0 && Math.abs((qty * Number(line.rate || 0)) - amount) > 0.01
      ? amount / qty
      : Number(line.rate || 0)
    return {
      description: quoteDescriptionFromLine(line),
      hsn: quoteHsnFromLine(line),
      qty,
      unit: quoteUnitLabel(billingRateUnit(line)),
      price: rate,
      sqm: quoteLineSqm(line),
    }
  })
  const savedRows = Array.isArray(saved.rows) ? saved.rows : []
  const rows = savedRows.length
    ? savedRows.map((row, idx) => mergeSavedQuoteRow(row, generatedLines[idx]))
    : generatedLines
  const terms = { ...QUOTE_DEFAULT_TERMS, ...(saved.terms || {}) }
  const bank = { ...QUOTE_COMPANY.bank, ...(saved.bank || {}) }

  return {
    quoteNo: saved.quoteNo || defaultQuoteNo(o),
    quoteDate: quoteInputDate(saved.quoteDate || o.invoice_date || o.order_date || o.created_at),
    billingAddress: saved.billingAddress || quoteCustomerBlock(o),
    deliveryAddress: saved.deliveryAddress || quoteCustomerBlock(o),
    intro1: saved.intro1 || 'We thank you for the kind courtesies extended by your good selves and the interest shown in the VISTA products.',
    intro2: saved.intro2 || 'With reference to above subject, we are pleased to offer our best possible quote and other terms & conditions',
    rows,
    cgstRate: saved.cgstRate ?? 9,
    sgstRate: saved.sgstRate ?? 9,
    terms,
    bank,
  }
}

function quoteDescriptionHasDimensions(description) {
  return /^Dimensions:/im.test(String(description || ''))
}

function mergeSavedQuoteRow(savedRow = {}, generatedRow = null) {
  const row = { ...savedRow }
  if (generatedRow && !quoteDescriptionHasDimensions(row.description)) {
    const dimensionLines = String(generatedRow.description || '')
      .split(/\r?\n/)
      .filter(line => /^Dimensions:/i.test(line))
    if (dimensionLines.length) {
      row.description = [row.description, ...dimensionLines].filter(Boolean).join('\n')
    }
  }
  if (row.sqm == null && generatedRow?.sqm != null) row.sqm = generatedRow.sqm
  return row
}

function renderQuoteLineEditor(row, idx) {
  return `<tr data-quote-line data-sqm="${Number(row.sqm || 0)}">
    <td style="width:58px;text-align:center;color:#64748b;font-size:12px;">
      <span data-quote-sr>${idx + 1}</span>
      <button type="button" onclick="removeQuoteEditorLine(this)" title="Remove line" style="margin-left:4px;border:0;background:transparent;color:#ef4444;cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
    </td>
    <td><textarea data-field="description" rows="3" oninput="updateQuoteEditorTotals()" style="width:100%;min-width:220px;">${esc(row.description)}</textarea></td>
    <td><input data-field="hsn" value="${esc(row.hsn)}" style="width:105px;"></td>
    <td><input data-field="qty" type="number" min="0" step="0.001" value="${quoteRateNumber(row.qty)}" oninput="updateQuoteEditorTotals()" style="width:92px;text-align:right;"></td>
    <td><input data-field="unit" value="${esc(row.unit)}" style="width:72px;text-align:center;text-transform:uppercase;"></td>
    <td><input data-field="price" type="number" min="0" step="0.01" value="${quoteRateNumber(row.price)}" oninput="updateQuoteEditorTotals()" style="width:96px;text-align:right;"></td>
    <td data-quote-amount style="text-align:right;font-weight:700;white-space:nowrap;">0.00</td>
  </tr>`
}

function openQuoteEditor() {
  if (!currentOrder) return
  const data = buildQuoteDefaults()
  openModal(`Quote #${esc(currentOrder.order_uid || currentOrder.id.substring(0, 8).toUpperCase())}`, `
    <div class="alert alert-info show" style="margin-bottom:14px;">
      Review or adjust these fields before generating the customer quote. Generating saves this quote version to download history without changing production order items.
    </div>
    <div class="form-row cols-2">
      <div class="form-group"><label>PI / Quote No.</label><input id="quote-no" value="${esc(data.quoteNo)}"></div>
      <div class="form-group"><label>Quote Date</label><input id="quote-date" type="date" value="${esc(data.quoteDate)}"></div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group"><label>To / Billing Address</label><textarea id="quote-billing-address" rows="6">${esc(data.billingAddress)}</textarea></div>
      <div class="form-group"><label>Delivery Address</label><textarea id="quote-delivery-address" rows="6">${esc(data.deliveryAddress)}</textarea></div>
    </div>
    <div class="form-group"><label>Opening Line 1</label><input id="quote-intro-1" value="${esc(data.intro1)}"></div>
    <div class="form-group"><label>Opening Line 2</label><input id="quote-intro-2" value="${esc(data.intro2)}"></div>

    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin:16px 0 8px;">
      <div class="fw-600">Quote Items</div>
      <button class="btn btn-ghost btn-sm" type="button" onclick="addQuoteEditorLine()"><i class="fa-solid fa-plus"></i> Add Line</button>
    </div>
    <div class="table-wrap" style="max-height:320px;overflow:auto;border:1px solid #e5e7eb;border-radius:8px;">
      <table style="min-width:820px;margin:0;">
        <thead><tr>
          <th>SR.NO.</th><th>Description</th><th>HSN/SAC</th><th>Qty</th><th>Unit</th><th>Price</th><th>Amount</th>
        </tr></thead>
        <tbody id="quote-lines-body">${data.rows.map(renderQuoteLineEditor).join('')}</tbody>
      </table>
    </div>

    <div class="form-row cols-2" style="margin-top:14px;">
      <div>
        <div class="fw-600" style="margin-bottom:8px;">Terms &amp; Conditions</div>
        <div class="form-group"><label>Payment 1</label><input id="quote-term-payment-1" value="${esc(data.terms.payment1)}"></div>
        <div class="form-group"><label>Payment 2</label><input id="quote-term-payment-2" value="${esc(data.terms.payment2)}"></div>
        <div class="form-group"><label>Installation</label><input id="quote-term-installation" value="${esc(data.terms.installation)}"></div>
        <div class="form-group"><label>Delivery</label><input id="quote-term-delivery" value="${esc(data.terms.delivery)}"></div>
      </div>
      <div>
        <div class="fw-600" style="margin-bottom:8px;">Totals &amp; Bank</div>
        <div class="form-row cols-2">
          <div class="form-group"><label>CGST %</label><input id="quote-cgst-rate" type="number" min="0" step="0.01" value="${data.cgstRate}" oninput="updateQuoteEditorTotals()"></div>
          <div class="form-group"><label>SGST %</label><input id="quote-sgst-rate" type="number" min="0" step="0.01" value="${data.sgstRate}" oninput="updateQuoteEditorTotals()"></div>
        </div>
        <div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin-bottom:12px;background:#f8fafc;">
          <div style="display:flex;justify-content:space-between;"><span>Total SQM</span><strong id="quote-editor-total-sqm">0</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Total Amount</span><strong id="quote-editor-subtotal">0.00</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>CGST</span><strong id="quote-editor-cgst">0.00</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>SGST</span><strong id="quote-editor-sgst">0.00</strong></div>
          <div style="display:flex;justify-content:space-between;border-top:1px solid #e2e8f0;margin-top:6px;padding-top:6px;"><span>Final Amount</span><strong id="quote-editor-final">0.00</strong></div>
        </div>
        <div class="form-group"><label>A/c. Name</label><input id="quote-bank-account-name" value="${esc(data.bank.accountName)}"></div>
        <div class="form-group"><label>Bank Name</label><input id="quote-bank-name" value="${esc(data.bank.bankName)}"></div>
        <div class="form-group"><label>Branch</label><input id="quote-bank-branch" value="${esc(data.bank.branch)}"></div>
        <div class="form-row cols-2">
          <div class="form-group"><label>A/c No.</label><input id="quote-bank-account-no" value="${esc(data.bank.accountNo)}"></div>
          <div class="form-group"><label>IFSC</label><input id="quote-bank-ifsc" value="${esc(data.bank.ifsc)}"></div>
        </div>
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="printQuoteFromEditor()"><i class="fa-solid fa-print"></i> Generate Quote</button>
    </div>
  `, true)
  setTimeout(updateQuoteEditorTotals, 0)
}

function collectQuoteEditorRows() {
  return [...document.querySelectorAll('[data-quote-line]')]
    .map(row => {
      const qty = parseQuoteNumber(row.querySelector('[data-field="qty"]')?.value)
      const price = parseQuoteNumber(row.querySelector('[data-field="price"]')?.value)
      const unit = row.querySelector('[data-field="unit"]')?.value?.trim() || ''
      const storedSqm = parseQuoteNumber(row.dataset.sqm)
      const sqm = normalizedSaleUnit(unit) === 'sqm' ? qty : storedSqm
      return {
        description: row.querySelector('[data-field="description"]')?.value?.trim() || '',
        hsn: row.querySelector('[data-field="hsn"]')?.value?.trim() || '',
        qty,
        unit,
        price,
        amount: qty * price,
        sqm,
      }
    })
    .filter(row => row.description || row.qty || row.price)
}

function renumberQuoteEditorLines() {
  ;[...document.querySelectorAll('[data-quote-line]')].forEach((row, idx) => {
    const sr = row.querySelector('[data-quote-sr]')
    if (sr) sr.textContent = idx + 1
  })
}

function addQuoteEditorLine() {
  const body = document.getElementById('quote-lines-body')
  if (!body) return
  const idx = body.querySelectorAll('[data-quote-line]').length
  body.insertAdjacentHTML('beforeend', renderQuoteLineEditor({
    description: '',
    hsn: '',
    qty: 1,
    unit: 'PCS',
    price: 0,
    sqm: 0,
  }, idx))
  updateQuoteEditorTotals()
}

function removeQuoteEditorLine(btn) {
  btn?.closest('[data-quote-line]')?.remove()
  renumberQuoteEditorLines()
  updateQuoteEditorTotals()
}

function quoteEditorTotals(rows = collectQuoteEditorRows()) {
  const subtotal = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const totalSqm = rows.reduce((sum, row) => sum + quoteRowSqm(row), 0)
  const cgstRate = parseQuoteNumber(document.getElementById('quote-cgst-rate')?.value)
  const sgstRate = parseQuoteNumber(document.getElementById('quote-sgst-rate')?.value)
  const cgst = subtotal * (cgstRate / 100)
  const sgst = subtotal * (sgstRate / 100)
  return { subtotal, totalSqm, cgstRate, sgstRate, cgst, sgst, finalAmount: subtotal + cgst + sgst }
}

function quoteRowSqm(row) {
  const storedSqm = Number(row?.sqm || 0)
  if (storedSqm > 0) return storedSqm
  return normalizedSaleUnit(row?.unit) === 'sqm' ? Number(row?.qty || 0) : 0
}

function updateQuoteEditorTotals() {
  const rowEls = [...document.querySelectorAll('[data-quote-line]')]
  rowEls.forEach(row => {
    const qty = parseQuoteNumber(row.querySelector('[data-field="qty"]')?.value)
    const price = parseQuoteNumber(row.querySelector('[data-field="price"]')?.value)
    const amountEl = row.querySelector('[data-quote-amount]')
    if (amountEl) amountEl.textContent = quotePlainNumber(qty * price)
  })
  const totals = quoteEditorTotals()
  text('quote-editor-total-sqm', quotePlainNumber(totals.totalSqm, 3).replace(/\.000$/, ''))
  text('quote-editor-subtotal', quotePlainNumber(totals.subtotal))
  text('quote-editor-cgst', quotePlainNumber(totals.cgst))
  text('quote-editor-sgst', quotePlainNumber(totals.sgst))
  text('quote-editor-final', quotePlainNumber(totals.finalAmount))
}

function readQuoteEditorValue(id) {
  return document.getElementById(id)?.value?.trim() || ''
}

function collectQuoteEditorData() {
  const rows = collectQuoteEditorRows()
  const totals = quoteEditorTotals(rows)
  return {
    quoteNo: readQuoteEditorValue('quote-no') || defaultQuoteNo(currentOrder),
    quoteDate: readQuoteEditorValue('quote-date') || quoteInputDate(),
    billingAddress: readQuoteEditorValue('quote-billing-address'),
    deliveryAddress: readQuoteEditorValue('quote-delivery-address'),
    intro1: readQuoteEditorValue('quote-intro-1'),
    intro2: readQuoteEditorValue('quote-intro-2'),
    rows,
    cgstRate: totals.cgstRate,
    sgstRate: totals.sgstRate,
    totals,
    terms: {
      payment1: readQuoteEditorValue('quote-term-payment-1'),
      payment2: readQuoteEditorValue('quote-term-payment-2'),
      installation: readQuoteEditorValue('quote-term-installation'),
      delivery: readQuoteEditorValue('quote-term-delivery'),
    },
    bank: {
      accountName: readQuoteEditorValue('quote-bank-account-name'),
      bankName: readQuoteEditorValue('quote-bank-name'),
      branch: readQuoteEditorValue('quote-bank-branch'),
      accountNo: readQuoteEditorValue('quote-bank-account-no'),
      ifsc: readQuoteEditorValue('quote-bank-ifsc'),
    },
  }
}

function quotePrintRows(rows) {
  return rows.map((row, idx) => `<tr>
    <td class="center">${idx + 1}</td>
    <td class="description">${quoteMultilineHtml(row.description)}</td>
    <td class="center">${esc(row.hsn)}</td>
    <td class="num">${quotePlainNumber(row.qty, 3).replace(/\.000$/, '')}</td>
    <td class="center">${esc(row.unit)}</td>
    <td class="num">${quotePlainNumber(row.price)}</td>
    <td class="num">${quotePlainNumber(row.amount)}</td>
  </tr>`).join('')
}

function quotePrintHtml(data) {
  const uid = currentOrder?.order_uid || currentOrder?.id?.substring(0, 8)?.toUpperCase() || ''
  const totalSqm = Number(data?.totals?.totalSqm ?? (data?.rows || []).reduce((sum, row) => sum + quoteRowSqm(row), 0))
  return `<!DOCTYPE html><html><head>
    <meta charset="UTF-8"><title>Quote ${esc(data.quoteNo || uid)}</title>
    <style>
      *{box-sizing:border-box;}
      body{margin:0;background:#f1f5f9;color:#111;font-family:Arial,Helvetica,sans-serif;font-size:12px;}
      .sheet{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:12mm 13mm;}
      .company{text-align:center;border:1px solid #111;border-bottom:0;padding:5px 8px;line-height:1.35;}
      .company h1{font-size:18px;margin:0 0 2px;letter-spacing:.2px;}
      .company div{font-size:11px;}
      .quote-title{text-align:center;border:1px solid #111;font-size:18px;font-weight:700;padding:5px 0;margin:0 0 6px;}
      .meta{display:grid;grid-template-columns:1fr 1fr;border:1px solid #111;border-bottom:0;}
      .meta div{padding:5px 7px;font-weight:700;}
      .meta div:last-child{text-align:right;}
      .address-grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #111;margin-bottom:8px;}
      .address-box{min-height:94px;padding:6px 8px;line-height:1.42;border-right:1px solid #111;}
      .address-box:last-child{border-right:0;}
      .address-title{font-weight:700;margin-bottom:4px;}
      .intro{margin:0 0 8px;line-height:1.45;}
      table{width:100%;border-collapse:collapse;}
      th,td{border:1px solid #111;padding:5px 6px;vertical-align:top;}
      th{font-size:11px;text-align:center;font-weight:700;background:#fff;}
      .center{text-align:center;}
      .num{text-align:right;white-space:nowrap;}
      .description{white-space:normal;line-height:1.35;min-width:250px;}
      .totals td{font-weight:700;}
      .totals .label{text-align:left;}
      .terms-bank{display:grid;grid-template-columns:1.35fr 1fr;margin-top:10px;gap:18px;}
      .section-title{font-weight:700;text-decoration:underline;margin-bottom:6px;}
      .terms table,.bank table{font-size:11px;}
      .terms td,.bank td{border:0;padding:3px 4px;}
      .terms td:first-child,.bank td:first-child{font-weight:700;white-space:nowrap;}
      .signature{display:flex;justify-content:flex-end;margin-top:26px;font-size:11px;}
      .signature div{text-align:center;min-width:170px;}
      @page{size:A4;margin:8mm;}
      @media print{body{background:#fff;}.sheet{width:auto;min-height:auto;margin:0;padding:0;}}
    </style>
  </head><body>
    <div class="sheet">
      <div class="company">
        <h1>${esc(QUOTE_COMPANY.name)}</h1>
        <div>${esc(QUOTE_COMPANY.address1)}</div>
        <div>${esc(QUOTE_COMPANY.address2)}</div>
        <div>${esc(QUOTE_COMPANY.emailLine)}</div>
        <div>${esc(QUOTE_COMPANY.gstin)}</div>
      </div>
      <div class="quote-title">QUOTE</div>
      <div class="meta">
        <div>PI No. ${esc(data.quoteNo)}</div>
        <div>Date: ${quoteDisplayDate(data.quoteDate)}</div>
      </div>
      <div class="address-grid">
        <div class="address-box"><div class="address-title">To,</div>${quoteMultilineHtml(data.billingAddress)}</div>
        <div class="address-box"><div class="address-title">Delivery Address:</div>${quoteMultilineHtml(data.deliveryAddress)}</div>
      </div>
      <p class="intro">Dear Sir,</p>
      ${data.intro1 ? `<p class="intro">${esc(data.intro1)}</p>` : ''}
      ${data.intro2 ? `<p class="intro">${esc(data.intro2)}</p>` : ''}
      <table>
        <thead><tr>
          <th style="width:42px;">SR.NO.</th>
          <th>DESCRIPTION</th>
          <th style="width:90px;">HSN/SAC CODE</th>
          <th style="width:72px;">QTY</th>
          <th style="width:64px;">UNIT</th>
          <th style="width:82px;">PRICE</th>
          <th style="width:96px;">AMOUNT</th>
        </tr></thead>
        <tbody>
          ${quotePrintRows(data.rows)}
          <tr class="totals"><td colspan="5" style="border-left:1px solid #fff;border-bottom:1px solid #fff;"></td><td class="label">Total SQM</td><td class="num">${quotePlainNumber(totalSqm, 3).replace(/\.000$/, '')}</td></tr>
          <tr class="totals"><td colspan="5" style="border-left:1px solid #fff;border-bottom:1px solid #fff;"></td><td class="label">Total Amount</td><td class="num">${quotePlainNumber(data.totals.subtotal)}</td></tr>
          <tr class="totals"><td colspan="5" style="border-left:1px solid #fff;border-bottom:1px solid #fff;"></td><td class="label">CGST</td><td class="num">${quotePlainNumber(data.totals.cgst)}</td></tr>
          <tr class="totals"><td colspan="5" style="border-left:1px solid #fff;border-bottom:1px solid #fff;"></td><td class="label">SGST</td><td class="num">${quotePlainNumber(data.totals.sgst)}</td></tr>
          <tr class="totals"><td colspan="5" style="border-left:1px solid #fff;"></td><td class="label">Final Amount</td><td class="num">${quotePlainNumber(data.totals.finalAmount)}</td></tr>
        </tbody>
      </table>
      <div class="terms-bank">
        <div class="terms">
          <div class="section-title">TERMS &amp; CONDITIONS</div>
          <table>
            <tr><td>Payment</td><td>: ${esc(data.terms.payment1)}</td></tr>
            <tr><td></td><td>: ${esc(data.terms.payment2)}</td></tr>
            <tr><td>Installation</td><td>: ${esc(data.terms.installation)}</td></tr>
            <tr><td>Delivery</td><td>: ${esc(data.terms.delivery)}</td></tr>
          </table>
        </div>
        <div class="bank">
          <div class="section-title">Our Bank Details</div>
          <table>
            <tr><td>A/c. Name</td><td>${esc(data.bank.accountName)}</td></tr>
            <tr><td>Bank Name</td><td>${esc(data.bank.bankName)}</td></tr>
            <tr><td>Branch</td><td>${esc(data.bank.branch)}</td></tr>
            <tr><td>A/c No.</td><td>${esc(data.bank.accountNo)}</td></tr>
            <tr><td>IFSC</td><td>${esc(data.bank.ifsc)}</td></tr>
          </table>
        </div>
      </div>
      <div class="signature"><div>For ${esc(QUOTE_COMPANY.name)}<br><br><br>Authorised Signatory</div></div>
    </div>
  </body></html>`
}

async function saveQuoteFormData(data) {
  const payload = {
    order_id: currentOrderId,
    form_data: data,
    updated_at: new Date().toISOString(),
    updated_by: currentProfile?.id || null,
  }
  const { error } = await db.from('order_quote_forms').upsert(payload, { onConflict: 'order_id' })
  if (error) {
    if (/order_quote_forms|relation .* does not exist|schema cache/i.test(error.message || '')) {
      console.warn('Quote/proforma form was not saved. Run migration 033_order_quote_forms_and_downloads.sql:', error.message)
      return false
    }
    throw error
  }
  currentQuoteForm = data
  return true
}

async function saveQuoteDownload(data, htmlText) {
  const { data: saved, error } = await db.from('order_quote_downloads')
    .insert({
      order_id: currentOrderId,
      quote_no: data.quoteNo || null,
      document_type: 'quote',
      form_data: data,
      html: htmlText,
      created_by: currentProfile?.id || null,
    })
    .select('id, order_id, quote_no, document_type, form_data, html, created_at, created_by')
    .single()

  if (error) {
    if (/order_quote_downloads|relation .* does not exist|schema cache/i.test(error.message || '')) {
      console.warn('Quote download history was not saved. Run migration 033_order_quote_forms_and_downloads.sql:', error.message)
      return null
    }
    throw error
  }

  currentQuoteDownloads = [saved, ...currentQuoteDownloads]
  updateQuoteDownloadsButton()
  return saved
}

async function printQuoteFromEditor() {
  const data = collectQuoteEditorData()
  if (!data.rows.length) return toast('Add at least one quote item before generating.', 'error')

  const win = window.open('', '_blank', 'width=950,height=800')
  if (!win) return toast('Allow popups to generate the quote.', 'error')
  const htmlText = quotePrintHtml(data)

  try {
    await saveQuoteFormData(data)
    await saveQuoteDownload(data, htmlText)
    toast('Quote saved to download history')
  } catch (err) {
    toast(`Quote generated, but history save failed: ${err.message}`, 'error')
  }

  win.document.write(htmlText)
  win.document.close()
  setTimeout(() => win.print(), 500)
}

function openQuoteDownloads() {
  const rows = currentQuoteDownloads || []
  openModal('Quote Downloads', `
    ${rows.length ? `
      <div class="table-wrap" style="max-height:360px;overflow:auto;border:1px solid #e5e7eb;border-radius:8px;">
        <table style="margin:0;">
          <thead><tr><th>Generated</th><th>Quote No.</th><th style="text-align:right;">Action</th></tr></thead>
          <tbody>${rows.map(row => `
            <tr>
              <td>${fmtDateTime(row.created_at)}</td>
              <td>${esc(row.quote_no || row.form_data?.quoteNo || '-')}</td>
              <td style="text-align:right;">
                <button class="btn btn-secondary btn-sm" onclick="redownloadQuote('${esc(row.id)}')">
                  <i class="fa-solid fa-download"></i> Redownload
                </button>
              </td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
    ` : `<div class="empty-state" style="padding:26px;text-align:center;color:#64748b;">No quote downloads saved for this order yet.</div>`}
  `, true)
}

function redownloadQuote(downloadId) {
  const item = currentQuoteDownloads.find(row => row.id === downloadId)
  if (!item) return toast('Download record was not found.', 'error')
  const win = window.open('', '_blank', 'width=950,height=800')
  if (!win) return toast('Allow popups to redownload the quote.', 'error')
  win.document.write(item.html || quotePrintHtml(item.form_data))
  win.document.close()
  setTimeout(() => win.print(), 500)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sourceLabel(source) {
  if (source === 'excel_outflow')  return 'Excel sale'
  if (source === 'excel_inquiry')  return 'Excel inquiry'
  return 'Manual'
}

function fmtN(n) {
  const v = Number(n || 0)
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '')
}

function showAlert(id, msg, type = 'error') {
  const el = document.getElementById(id)
  if (!el) return
  el.className = `alert alert-${type} show`
  el.textContent = msg
}

function showLoadError(err) {
  console.error('Order detail failed:', err)
  hide('loading')
  show('content')
  text('order-title', 'Order could not load')
  html('order-badge', '<span class="badge badge-error">error</span>')
  html('order-info', '')
  html('admin-actions', '')
  html('items-list', '')
  html('financial-summary', '')
  const detail = err?.message || String(err || 'Unknown error')
  showAlert('detail-alert', `This order could not load: ${detail}`)
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

init().catch(showLoadError)
