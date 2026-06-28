/*
  Production queue controller.
  Used by executer-role users to see processing orders and mark work complete.
  It intentionally exposes only production actions, not admin inventory tools.
*/

let currentProfile   = null
let processingOrders = []
let completedOrders  = []
let supportsExecutorAssignment = true

const TRACK_RECIPES = {
  'Super Track': [
    'SECTION NON-FERROUS SUPER TRACK',
    'SUPER TRACK- RUNNER',
    'BRACKET WALL SUPER TRACK',
    'BRACKET CEILING-SUPER TRACK',
    'END CAP SUPER TRACK',
  ],
  'Jumbo Track': [
    'AL SECTION NON-FERROUS JUMBO TRACK',
    'RUNNER FOR JUMBO TRACK',
    'BRACKET FOR JUMBO TRACK',
    'CEILING BRACKET FOR JUMBO TRACK',
    'END CAP FOR JUMBO TRACK',
  ],
  'M Track': [
    'ALU SECTION NON-FERROUS M TRACK',
    'Runner for M Track',
    'Bracket Wall for M Track',
    'Bracket Ceiling for M Track',
    'End Cap for M Track',
  ],
}

async function hydrateOrderItemsWithVariants(items) {
  if (!items?.length) return items || []

  const variantIds = [...new Set(items.map(it => it.variant_id).filter(Boolean))]
  if (!variantIds.length) return items

  const [variantRes, rollRes] = await Promise.all([
    db.from('inv_variants')
      .select('id, name, width_m, unit, purchase_rate, inv_products(name, inv_categories(name))')
      .in('id', variantIds),
    db.from('inv_rolls')
      .select('id, variant_id, batch_code, remaining_length, status')
      .in('variant_id', variantIds),
  ])

  if (variantRes.error) throw variantRes.error
  if (rollRes.error) throw rollRes.error

  const rollsByVariant = new Map()
  for (const roll of (rollRes.data || [])) {
    const arr = rollsByVariant.get(roll.variant_id) || []
    arr.push(roll)
    rollsByVariant.set(roll.variant_id, arr)
  }

  const variantMap = new Map((variantRes.data || []).map(v => [
    v.id,
    { ...v, inv_rolls: rollsByVariant.get(v.id) || [] },
  ]))

  return items.map(it => ({ ...it, inv_variants: it.variant_id ? (variantMap.get(it.variant_id) || null) : null }))
}

async function fetchProcessingOrdersWithItems() {
  const extendedSelect = `
    id, order_uid, dealer_name, customer_name, status, total_amount, created_at, order_date, notes,
    assigned_executor_id, assigned_at, assigned_by, executed_by, executed_at,
    customers!cust_id(name, phone)
  `
  const basicSelect = `
    id, order_uid, dealer_name, customer_name, status, total_amount, created_at, order_date, notes,
    customers!cust_id(name, phone)
  `

  let query = db.from('orders').select(extendedSelect)
    .eq('status', 'processing')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  let { data: orders, error } = await query

  if (error && /assigned_executor_id|executed_by|executed_at|assigned_at|assigned_by/i.test(error.message || '')) {
    supportsExecutorAssignment = false
    let fallback = db.from('orders').select(basicSelect)
      .eq('status', 'processing')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    ;({ data: orders, error } = await fallback)
  }

  if (error) return { data: [], error }
  if (!orders?.length) return { data: [], error: null }

  const orderIds = orders.map(o => o.id)
  const measurementFields = ', input_width_raw, input_width_unit, input_height_raw, input_height_unit, input_length_raw, input_length_unit, input_length_ft, chargeable_length_ft'
  let itemResult = await db
    .from('order_items')
    .select('id, order_id, variant_id, quantity, width_cm, height_cm, area_sqm, product_name, blind_type, item_type, roll_id' + measurementFields)
    .in('order_id', orderIds)
    .order('created_at', { ascending: true })
  if (itemResult.error && /input_width_raw|input_width_unit|input_height_raw|input_height_unit|input_length_raw|input_length_unit|input_length_ft|chargeable_length_ft/i.test(itemResult.error.message || '')) {
    itemResult = await db
      .from('order_items')
      .select('id, order_id, variant_id, quantity, width_cm, height_cm, area_sqm, product_name, blind_type, item_type, roll_id')
      .in('order_id', orderIds)
      .order('created_at', { ascending: true })
  }
  const { data: items, error: itemErr } = itemResult

  if (itemErr) return { data: orders.map(o => ({ ...o, order_items: [] })), error: itemErr }

  const hydratedItems = await hydrateOrderItemsWithVariants(items || [])
  const byOrder = new Map()
  for (const item of hydratedItems) {
    const arr = byOrder.get(item.order_id) || []
    arr.push(item)
    byOrder.set(item.order_id, arr)
  }

  return {
    data: orders.map(o => ({ ...o, order_items: byOrder.get(o.id) || [] })),
    error: null,
  }
}

async function fetchCompletedOrdersWithItems() {
  const extendedSelect = `
    id, order_uid, dealer_name, customer_name, status, total_amount, created_at, order_date, notes,
    assigned_executor_id, assigned_at, assigned_by, executed_by, executed_at,
    customers!cust_id(name, phone)
  `
  const basicSelect = `
    id, order_uid, dealer_name, customer_name, status, total_amount, created_at, order_date, notes,
    customers!cust_id(name, phone)
  `

  let query = db.from('orders').select(extendedSelect)
    .in('status', ['executed', 'completed'])
    .is('deleted_at', null)
    .order('executed_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  let { data: orders, error } = await query

  if (error && /assigned_executor_id|executed_by|executed_at|assigned_at|assigned_by/i.test(error.message || '')) {
    supportsExecutorAssignment = false
    let fallback = db.from('orders').select(basicSelect)
      .in('status', ['executed', 'completed'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    ;({ data: orders, error } = await fallback)

  }

  if (error) return { data: [], error }
  if (!orders?.length) return { data: [], error: null }

  const orderIds = orders.map(o => o.id)
  const measurementFields = ', input_width_raw, input_width_unit, input_height_raw, input_height_unit, input_length_raw, input_length_unit, input_length_ft, chargeable_length_ft'
  let itemResult = await db
    .from('order_items')
    .select('id, order_id, variant_id, quantity, width_cm, height_cm, area_sqm, product_name, blind_type, item_type, roll_id' + measurementFields)
    .in('order_id', orderIds)
    .order('created_at', { ascending: true })
  if (itemResult.error && /input_width_raw|input_width_unit|input_height_raw|input_height_unit|input_length_raw|input_length_unit|input_length_ft|chargeable_length_ft/i.test(itemResult.error.message || '')) {
    itemResult = await db
      .from('order_items')
      .select('id, order_id, variant_id, quantity, width_cm, height_cm, area_sqm, product_name, blind_type, item_type, roll_id')
      .in('order_id', orderIds)
      .order('created_at', { ascending: true })
  }
  const { data: items, error: itemErr } = itemResult

  if (itemErr) return { data: orders.map(o => ({ ...o, order_items: [] })), error: itemErr }

  const hydratedItems = await hydrateOrderItemsWithVariants(items || [])
  const byOrder = new Map()
  for (const item of hydratedItems) {
    const arr = byOrder.get(item.order_id) || []
    arr.push(item)
    byOrder.set(item.order_id, arr)
  }

  return {
    data: orders.map(o => ({ ...o, order_items: byOrder.get(o.id) || [] })),
    error: null,
  }
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

async function fetchOrderItemsForCost(orderId) {
  const { data: items, error } = await db
    .from('order_items')
    .select('variant_id, height_cm, width_cm, quantity, area_sqm, blind_type, item_type')
    .eq('order_id', orderId)

  if (error) return { data: [], error }
  if (!items?.length) return { data: [], error: null }

  const variantIds = [...new Set(items.map(it => it.variant_id).filter(Boolean))]
  if (!variantIds.length) return { data: items, error: null }

  const { data: variants, error: variantErr } = await db
    .from('inv_variants')
    .select('id, purchase_rate, width_m')
    .in('id', variantIds)

  if (variantErr) return { data: items, error: variantErr }

  const variantMap = new Map((variants || []).map(v => [v.id, v]))
  return {
    data: items.map(it => ({ ...it, inv_variants: it.variant_id ? (variantMap.get(it.variant_id) || null) : null })),
    error: null,
  }
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
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

function renderDimensionPill(label, primary, secondary = '') {
  return `<span class="text-muted">${label}: <strong>${primary}</strong>${secondary ? ` <span style="color:#94a3b8;">(${secondary})</span>` : ''}</span>`
}

function renderItemMeasurements(it) {
  const qty = Number(it.quantity || 1)
  if (it.item_type === 'track') {
    const chargeableFt = Number(it.chargeable_length_ft || it.area_sqm || 0)
    const inputFt = Number(it.input_length_ft || 0)
    const totalFt = chargeableFt * qty
    const inputHtml = it.input_length_raw
      ? renderDimensionPill('Input', `${fmtMeasure(it.input_length_raw, 3)} ${esc(it.input_length_unit || '')}`, `${fmtMeasure(inputFt || chargeableFt, 3)} ft | ${fmtMeasure((inputFt || chargeableFt) * 0.3048, 3)} m`)
      : ''
    return `
      ${renderDimensionPill('Track Qty', `${fmtMeasure(qty)} track${qty !== 1 ? 's' : ''}`)}
      ${inputHtml}
      ${chargeableFt > 0 ? renderDimensionPill('Chargeable / Track', `${fmtMeasure(chargeableFt, 1)} ft`, `${lengthAlternatesFromFt(chargeableFt)} | rounded`) : ''}
      ${totalFt > 0 ? renderDimensionPill('Total Cut', `${fmtMeasure(totalFt, 1)} ft`, `${fmtMeasure(totalFt * 0.3048, 3)} m`) : ''}`
  }

  const isFG = (it.item_type || 'finished_goods') === 'finished_goods'
  if (isFG && it.width_cm && it.height_cm) {
    const wCm = Number(it.width_cm)
    const hCm = Number(it.height_cm)
    const widthInput = it.input_width_raw ? `Input ${fmtMeasure(it.input_width_raw, 3)} ${esc(it.input_width_unit || '')} | ` : ''
    const heightInput = it.input_height_raw ? `Input ${fmtMeasure(it.input_height_raw, 3)} ${esc(it.input_height_unit || '')} | ` : ''
    const areaSqm = (wCm / 100) * (hCm / 100) * qty
    return `
      ${renderDimensionPill('Width', `${fmtMeasure(wCm, 2)} cm`, `${widthInput}${lengthAlternatesFromCm(wCm)}`)}
      ${renderDimensionPill('Height', `${fmtMeasure(hCm, 2)} cm`, `${heightInput}${lengthAlternatesFromCm(hCm)}`)}
      ${renderDimensionPill('Qty', fmtMeasure(qty))}
      ${renderDimensionPill('Area', `${fmtMeasure(areaSqm, 3)} m²`, `${fmtMeasure(areaSqm * 10.7639, 2)} ft²`)}`
  }

  const unit = it.sale_unit || it.inv_variants?.unit || 'pcs'
  return renderDimensionPill('Quantity', `${fmtMeasure(qty, 3)} ${esc(unit)}`)
}

async function init() {
  const profile = await initSidebar()
  if (!profile) return
  currentProfile = profile
  await loadQueue()
  hide('loading'); show('content')
}

// ── Queue ────────────────────────────────────────────────────────────────────
async function loadQueue() {
  const [processingRes, completedRes] = await Promise.all([
    fetchProcessingOrdersWithItems(),
    fetchCompletedOrdersWithItems(),
  ])

  if (processingRes.error) { toast(processingRes.error.message, 'error'); return }
  if (completedRes.error) { toast(completedRes.error.message, 'error'); return }
  processingOrders = processingRes.data || []
  completedOrders = completedRes.data || []

  text('queue-count', processingOrders.length
    ? `${processingOrders.length} order${processingOrders.length !== 1 ? 's' : ''} waiting to be made`
    : 'No orders in queue')

  if (!processingOrders.length) {
    html('queue-list', `
      <div class="card" style="text-align:center;padding:48px 24px;color:#9ca3af;">
        <i class="fa-solid fa-check-circle" style="font-size:40px;margin-bottom:12px;color:#10b981;display:block;"></i>
        <div style="font-size:16px;font-weight:600;margin-bottom:4px;">All caught up!</div>
        <div style="font-size:13px;">No orders are currently in processing status.</div>
      </div>${renderCompletedSection()}`)
    return
  }

  html('queue-list', `${processingOrders.map(o => renderOrderCard(o)).join('')}${renderCompletedSection()}`)
}

function renderOrderCard(o) {
  const customer  = o.customers?.name || o.dealer_name || o.customer_name || 'Unknown Customer'
  const uid       = o.order_uid || ('#' + o.id.substring(0,8).toUpperCase())
  const items     = o.order_items || []
  const itemCount = items.length

  const fabricItems  = items.filter(it => (it.item_type || 'finished_goods') === 'finished_goods')
  const totalFabricM = fabricItems.reduce((s, it) => {
    const multiplier = (it.blind_type || '').startsWith('Sheer Dimout') ? 2 : 1
    return s + (Number(it.height_cm||0)/100) * Number(it.quantity||1) * multiplier
  }, 0)

  const itemSummary = items.slice(0, 3).map(it => {
    const isTrack = it.item_type === 'track'
    const varName = it.product_name || it.blind_type || it.inv_variants?.name || 'Item'
    const dims    = isTrack
      ? (it.area_sqm ? `${Number(it.area_sqm).toFixed(1)} ft chargeable` : '')
      : (it.width_cm && it.height_cm ? `${Number(it.width_cm).toFixed(0)}×${Number(it.height_cm).toFixed(0)} cm` : '')
    return `<div class="text-xs text-muted" style="margin-top:2px;">
      <i class="fa-solid fa-circle" style="font-size:5px;vertical-align:middle;margin-right:4px;color:${isTrack ? '#7c3aed' : '#6366f1'};"></i>
      ${isTrack ? '<i class="fa-solid fa-ruler-horizontal" style="font-size:9px;margin-right:2px;"></i>' : ''}${esc(varName)}${dims ? ` — ${dims}` : ''} × ${it.quantity}
    </div>`
  }).join('')
  const moreItems = itemCount > 3 ? `<div class="text-xs text-muted" style="margin-top:4px;">+${itemCount - 3} more…</div>` : ''

  return `
  <div class="card" style="margin-bottom:12px;cursor:pointer;transition:box-shadow .15s;"
       onclick="viewOrder('${o.id}')"
       onmouseenter="this.style.boxShadow='0 4px 16px rgba(0,0,0,.1)'"
       onmouseleave="this.style.boxShadow=''">
    <div style="padding:16px 20px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap;">
            <span class="fw-600" style="font-family:monospace;font-size:13px;color:#6366f1;">${esc(uid)}</span>
            <span class="badge badge-processing">Processing</span>
            <span class="text-xs text-muted">${fmtDate(o.order_date || o.created_at)}</span>
            ${totalFabricM > 0 ? `<span class="text-xs" style="background:#ede9fe;color:#7c3aed;padding:2px 8px;border-radius:999px;font-weight:600;">${totalFabricM.toFixed(2)}m fabric</span>` : ''}
          </div>
          <div class="fw-600" style="font-size:15px;margin-bottom:6px;">${esc(customer)}</div>
          ${o.notes ? `<div class="text-xs text-muted" style="margin-bottom:6px;"><i class="fa-solid fa-note-sticky" style="margin-right:4px;"></i>${esc(o.notes)}</div>` : ''}
          ${itemSummary}${moreItems}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;">
          <div class="text-xs text-muted">${itemCount} item${itemCount !== 1 ? 's' : ''}</div>
          <span class="text-xs" style="color:#6366f1;">Click to open →</span>
        </div>
      </div>
    </div>
  </div>`
}

function renderCompletedSection() {
  if (!supportsExecutorAssignment && !completedOrders.length) {
    return `
      <div style="margin-top:24px;">
        <div class="card" style="padding:16px 18px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;">
          Run migration <code>008_order_executor_assignment.sql</code> in Supabase to enable executer assignment and per-executer history.
        </div>
      </div>`
  }

  const heading = 'Completed Orders'
  const subtitle = `${completedOrders.length} executed/completed order${completedOrders.length !== 1 ? 's' : ''}`

  const body = !completedOrders.length
    ? `<div class="card" style="text-align:center;padding:28px 24px;color:#9ca3af;">
        <div style="font-size:14px;font-weight:600;margin-bottom:4px;">No completed orders yet</div>
        <div style="font-size:13px;">Executed jobs assigned to this executer will appear here.</div>
      </div>`
    : completedOrders.map(o => renderCompletedOrderCard(o)).join('')

  return `
    <div style="margin-top:24px;">
      <div class="page-header" style="margin-bottom:12px;">
        <div>
          <h2 style="font-size:18px;margin:0 0 4px;">${heading}</h2>
          <p style="margin:0;color:#64748b;">${subtitle}</p>
        </div>
      </div>
      ${body}
    </div>`
}

function renderCompletedOrderCard(o) {
  const customer = o.customers?.name || o.dealer_name || o.customer_name || 'Unknown Customer'
  const items = o.order_items || []
  const itemCount = items.length
  const doneAt = o.executed_at || o.created_at
  return `
    <div class="card" style="margin-bottom:12px;cursor:pointer;opacity:.96;" onclick="window.location.href='order-detail.html?id=${o.id}'">
      <div style="padding:16px 20px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap;">
            <span class="badge badge-success">${esc(String(o.status || '').toLowerCase())}</span>
            <span class="text-xs text-muted">${fmtDateTime(doneAt)}</span>
          </div>
          <div class="fw-600" style="font-size:15px;margin-bottom:4px;">${esc(customer)}</div>
          <div class="text-xs text-muted">${itemCount} item${itemCount !== 1 ? 's' : ''}</div>
        </div>
        <div class="fw-600" style="color:#059669;">${fmt$(Number(o.total_amount || 0))}</div>
      </div>
    </div>`
}

// ── Full-Page Order Detail ───────────────────────────────────────────────────
async function viewOrder(orderId) {
  const o = processingOrders.find(x => x.id === orderId)
  if (!o) return

  html('detail-body', '<div class="loading-center" style="padding:60px;"><div class="spinner spinner-lg"></div></div>')
  document.getElementById('queue-view').style.display  = 'none'
  document.getElementById('detail-view').style.display = ''
  window.scrollTo(0, 0)

  const orderVariantIds = [...new Set((o.order_items || []).map(it => it.variant_id || it.inv_variants?.id).filter(Boolean))]

  // Load components, wastage logs, cut pieces, and recipes in parallel
  const [compsRes, wastageRes, cutPiecesRes, recipesRes] = await Promise.all([
    fetchOrderComponentsWithVariants(orderId),
    db.from('wastage_logs')
      .select('id, order_item_id, variant_id, roll_id, source_piece_id, created_piece_id, cut_length_m, used_length_m, cut_width_m, used_width_m')
      .eq('order_id', orderId),
    orderVariantIds.length
      ? db.from('fabric_cut_pieces')
          .select('id, variant_id, source_roll_id, source_order_id, source_order_item_id, width_m, length_m, remaining_length_m, unit, status, notes, created_at')
          .in('variant_id', orderVariantIds)
          .eq('status', 'available')
          .gt('remaining_length_m', 0)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    db.from('product_recipes')
      .select('id, blind_type, recipe_items(id, variant_id, quantity_per_unit, is_width_dependent, inv_variants(id, name, unit, purchase_rate))')
      .eq('is_active', true),
  ])

  const customer   = o.customers?.name || o.dealer_name || o.customer_name || 'Unknown Customer'
  const uid        = o.order_uid || ('#' + o.id.substring(0,8).toUpperCase())
  const items      = o.order_items || []
  let   comps      = compsRes.data  || []
  if (compsRes.error) console.warn('Executer components:', compsRes.error.message)
  if (cutPiecesRes.error) console.warn('Cut pieces unavailable:', cutPiecesRes.error.message)
  const wastage    = wastageRes.data || []
  const cutPieces  = cutPiecesRes.data || []
  const allRecipes = recipesRes.data || []

  // ── Component population ─────────────────────────────────────────────────────
  // Track which order_items already have DB components
  const existingItemIds = new Set(comps.map(c => c.order_item_id).filter(Boolean))

  // For items with NO DB components, compute them from recipe in-memory
  // and also try to persist them to order_components for future loads
  const newCompRows = []
  const inMemoryCompsByItemId = {}   // {item_id: [{...comp-like obj}]}

  for (const it of items) {
    if (existingItemIds.has(it.id)) continue   // Already in DB — skip

    const itemType = it.item_type || 'finished_goods'
    const blindType = it.blind_type || it.product_name
    const recipe    = findRecipeForBlindType(allRecipes, blindType)

    if (itemType === 'track') {
      const chargeableFt = Number(it.area_sqm || 0)
      const qty          = Number(it.quantity || 1)
      const componentSource = recipe?.recipe_items?.length
        ? recipe.recipe_items.map(ri => ({
            name: ri.inv_variants?.name || ri.component_name || 'Component',
            variantId: ri.variant_id || ri.inv_variants?.id || null,
            unit: ri.inv_variants?.unit || 'pcs',
            isWidthDependent: Boolean(ri.is_width_dependent),
            quantityPerUnit: Number(ri.quantity_per_unit || 0),
            inv_variants: ri.inv_variants || null,
          }))
        : (TRACK_RECIPES[blindType] || []).map(name => ({
            name,
            variantId: null,
            unit: null,
            isWidthDependent: false,
            quantityPerUnit: 0,
            inv_variants: null,
          }))

      if (!componentSource.length) continue

      inMemoryCompsByItemId[it.id] = []

      componentSource.forEach((component, idx) => {
        const plannedQty = idx === 0
          ? chargeableFt * qty
          : (component.isWidthDependent ? chargeableFt * qty : component.quantityPerUnit * qty)
        const unit = idx === 0 ? 'ft' : (component.unit || 'pcs')
        const tempId = `tmp-${it.id}-track-${idx}`

        inMemoryCompsByItemId[it.id].push({
          id:                 tempId,
          order_id:           orderId,
          order_item_id:      it.id,
          variant_id:         component.variantId,
          component_name:     component.variantId ? null : component.name,
          planned_qty:        plannedQty,
          actual_qty:         null,
          is_width_dependent: component.isWidthDependent,
          unit,
          deducted:           false,
          is_extra:           false,
          isTemp:             true,
          inv_variants:       component.inv_variants,
        })

        newCompRows.push({
          order_id:           orderId,
          order_item_id:      it.id,
          variant_id:         component.variantId,
          component_name:     component.variantId ? null : component.name,
          planned_qty:        plannedQty,
          unit,
          is_width_dependent: component.isWidthDependent,
          is_extra:           false,
          deducted:           false,
        })
      })
      continue
    }

    if (itemType !== 'finished_goods') continue

    // No recipe found — nothing we can do
    if (!recipe || !Array.isArray(recipe.recipe_items) || !recipe.recipe_items.length) continue

    const w_cm = Number(it.width_cm || 0)
    const qty  = Number(it.quantity  || 1)

    inMemoryCompsByItemId[it.id] = []

    for (const ri of recipe.recipe_items) {
      const plannedQty = ri.is_width_dependent
        ? Number(ri.quantity_per_unit || 0) * w_cm * qty
        : Number(ri.quantity_per_unit || 0) * qty

      // In-memory object shaped like an order_components row
      inMemoryCompsByItemId[it.id].push({
        id:                 `tmp-${it.id}-${ri.variant_id}`,
        order_id:           orderId,
        order_item_id:      it.id,
        variant_id:         ri.variant_id,
        planned_qty:        plannedQty,
        actual_qty:         null,
        is_width_dependent: ri.is_width_dependent,
        unit:               ri.inv_variants?.unit || 'pcs',
        deducted:           false,
        isTemp:             true,
        inv_variants:       ri.inv_variants || null,
      })

      // Also queue for DB insert
      newCompRows.push({
        order_id:           orderId,
        order_item_id:      it.id,
        variant_id:         ri.variant_id,
        planned_qty:        plannedQty,
        unit:               ri.inv_variants?.unit || 'pcs',
        is_width_dependent: ri.is_width_dependent,
        is_extra:           false,
        deducted:           false,
      })
    }
  }

  // Try to persist to DB (non-blocking — don't wait to show UI)
  if (newCompRows.length > 0) {
    db.from('order_components')
      .insert(newCompRows)
      .select('id')
      .then(async ({ data: insertedIds }) => {
        if (insertedIds?.length) {
          const freshCompRes = await fetchOrderComponentsWithVariants(orderId)
          const inserted = freshCompRes.data || []
          // Replace in-memory comps with real DB rows (they now have real IDs)
          inserted.forEach(c => {
            const arr = inMemoryCompsByItemId[c.order_item_id]
            if (arr) {
              const idx = arr.findIndex(x => x.variant_id === c.variant_id)
              if (idx !== -1) arr[idx] = c  // swap temp with real
            }
          })
        }
      })
      .catch(e => console.warn('order_components auto-insert failed:', e.message))
  }

  // Merge DB comps + in-memory comps
  const allComps = [...comps]
  Object.values(inMemoryCompsByItemId).forEach(arr => allComps.push(...arr))

  text('detail-order-title', `${uid} — ${esc(customer)}`)
  text('detail-order-sub',   `${fmtDateTime(o.order_date || o.created_at)} · ${items.length} item${items.length !== 1 ? 's' : ''}`)

  window._pendingExecData = window._pendingExecData || {}
  window._pendingExecData[orderId] = { comps: allComps, wastage, cutPieces, items, inMemoryCompsByItemId }

  // ── Item rows ──
  const itemsHtml = items.map(it => {
    const isFG      = (it.item_type || 'finished_goods') === 'finished_goods'
    const isTrack   = it.item_type === 'track'
    const isSheerDimout  = (it.blind_type || '').startsWith('Sheer Dimout')
    const fabricMultiplier = isSheerDimout ? 2 : 1
    const varName        = it.product_name || it.blind_type || it.inv_variants?.name || 'Item'
    const rollWidth      = it.inv_variants?.width_m
    const existingWaste  = wastage.find(w => w.order_item_id === it.id)
    const selectedRollId = existingWaste?.roll_id || it.roll_id
    const selectedPieceId = existingWaste?.source_piece_id || null
    const itemComps = allComps.filter(c => c.order_item_id === it.id)
    const measurementsHtml = renderItemMeasurements(it)

    // ── Track item render ──
    if (isTrack) {
      const trackType      = it.blind_type || 'Track'
      const chargeableFt   = Number(it.area_sqm || 0)  // stored chargeable feet
      const qty            = Number(it.quantity || 1)
      const rate           = Number(it.rate_applied || 0)
      const trackComps     = itemComps
      const totalTrackFt   = chargeableFt * qty
      const fmtTrackQty    = n => n % 1 === 0 ? n.toFixed(0) : parseFloat(n.toFixed(3)).toString()
      return `
      <div class="exec-item-card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
          <i class="fa-solid fa-ruler-horizontal" style="color:#6366f1;"></i>
          <div class="fw-600" style="font-size:14px;">${esc(trackType)}</div>
          <span style="background:#ede9fe;color:#7c3aed;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">M Tracks</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;margin-bottom:10px;">
          <span class="text-muted">Track Qty: <strong>${fmtTrackQty(qty)} track${qty !== 1 ? 's' : ''}</strong></span>
          ${chargeableFt > 0 ? `<span class="text-muted">Length / Track: <strong>${fmtTrackQty(chargeableFt)} ft</strong></span>` : ''}
          ${totalTrackFt > 0 ? `<span class="text-muted">Total Track Length: <strong>${fmtTrackQty(totalTrackFt)} ft</strong></span>` : ''}
          ${measurementsHtml}
          ${rate > 0 ? `<span class="text-muted">Rate: <strong>₹${rate.toFixed(2)}/track</strong></span>` : ''}
          ${rate > 0 ? `<span style="color:#059669;font-weight:700;">Total: ${fmt$(Number(it.line_total || qty * rate || 0))}</span>` : ''}
        </div>
        ${trackComps.length > 0 ? `
        <div style="margin-top:6px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin-bottom:6px;">
            <i class="fa-solid fa-list-check" style="margin-right:4px;"></i>Raw Materials Used
          </div>
          ${trackComps.map(c => {
            const compName  = c.inv_variants?.name || c.component_name || 'Component'
            const compUnit  = c.unit || c.inv_variants?.unit || 'pcs'
            const planned   = Number(c.planned_qty || 0)
            const actual    = c.actual_qty ?? planned
            const isDone    = !!c.deducted
            const isTrackLength = compUnit === 'ft'
            const plannedDisplay = isTrackLength
              ? `${fmtTrackQty(planned)} ft (${fmtMeasure(planned * 0.3048, 3)} m)`
              : `${fmtTrackQty(planned)} ${esc(compUnit)}`
            const inputValue = fmtTrackQty(Number(actual || 0))
            const inputUnit = isTrackLength ? 'ft' : compUnit
            return `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:5px;margin-bottom:4px;flex-wrap:wrap;">
              <i class="fa-solid fa-box" style="color:#6366f1;font-size:10px;flex-shrink:0;"></i>
              <span style="font-size:12px;flex:1;min-width:140px;font-weight:600;">${esc(compName)}</span>
              <span style="font-size:11px;color:#64748b;white-space:nowrap;">Recommended: <strong>${plannedDisplay}</strong></span>
              <div style="display:flex;align-items:center;gap:4px;">
                <input type="number" id="comp-actual-${c.id}"
                  value="${inputValue}" step="0.001" min="0" placeholder="Qty used"
                  onchange="saveActualComponentQty('${orderId}','${c.id}', this.value, '${inputUnit}')"
                  style="width:90px;padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;${isDone ? 'background:#f0fdf4;color:#059669;font-weight:600;' : ''}"
                  ${isDone ? 'disabled' : ''}>
                <span style="font-size:11px;color:#6b7280;">${esc(inputUnit)}</span>
                ${isDone ? '<span style="color:#10b981;font-weight:600;font-size:11px;">✓</span>' : ''}
              </div>
            </div>`
          }).join('')}
        </div>` : `
        <div style="font-size:12px;color:#9ca3af;background:#fafafa;padding:8px 10px;border-radius:5px;">
          No components found — components will appear here once the order is reloaded.
        </div>`}
      </div>`
    }

    // ── Finished goods / raw material render ──
    const plannedCutLength = existingWaste?.cut_length_m
      ?? (isFG && it.height_cm && it.quantity
          ? (Number(it.height_cm)/100) * Number(it.quantity) * fabricMultiplier
          : 0)
    const plannedCutWidthM  = existingWaste?.cut_width_m
      ?? (rollWidth || (it.width_cm ? Number(it.width_cm)/100 : 0))
    const plannedCutWidthCm = (plannedCutWidthM * 100).toFixed(1)

    const inStockRolls = isFG
      ? (it.inv_variants?.inv_rolls || [])
          .filter(r => r.status === 'in_stock' && r.remaining_length > 0)
          .sort((a, b) => b.remaining_length - a.remaining_length)
      : []

    const itemVariantId = it.inv_variants?.id || it.variant_id
    const availablePieces = isFG
      ? cutPieces
          .filter(p => p.variant_id === itemVariantId && p.status === 'available' && Number(p.remaining_length_m || 0) > 0)
          .filter(p => !plannedCutLength || Number(p.remaining_length_m || 0) + 0.0001 >= plannedCutLength)
          .filter(p => !it.width_cm || Number(p.width_m || 0) + 0.0001 >= Number(it.width_cm) / 100)
          .sort((a, b) => (Number(a.width_m || 0) - Number(b.width_m || 0)) || (Number(a.remaining_length_m || 0) - Number(b.remaining_length_m || 0)))
      : []
    const sourceValue = selectedPieceId ? `piece:${selectedPieceId}` : (selectedRollId ? `roll:${selectedRollId}` : '')

    const rollPickerHtml = (inStockRolls.length > 0 || availablePieces.length > 0) ? `
      <div style="margin-top:8px;">
        <div class="cut-label" style="margin-bottom:3px;">Fabric source:</div>
        <select class="roll-select" id="source-pick-${it.id}" onchange="saveActualCutValue('${orderId}','${it.id}','source', this.value)">
          <option value="">Auto-select fresh roll</option>
          ${inStockRolls.map(r => `<option value="${r.id}" ${selectedRollId === r.id ? 'selected' : ''}>
            ${esc(r.batch_code || 'Roll')} — ${Number(r.remaining_length).toFixed(2)}m remaining
          </option>`).join('')}
          ${availablePieces.length ? `<optgroup label="Cut pieces">
            ${availablePieces.map(p => `<option value="piece:${p.id}" ${sourceValue === `piece:${p.id}` ? 'selected' : ''}>
              ${Number(p.width_m || 0).toFixed(3)}m x ${Number(p.remaining_length_m || 0).toFixed(3)}m cut piece
            </option>`).join('')}
          </optgroup>` : ''}
        </select>
      </div>` : (isFG && !inStockRolls.length ? `<div class="text-xs" style="color:#ef4444;margin-top:6px;">⚠ No rolls in stock</div>` : '')

    return `
    <div class="exec-item-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:180px;">
          <div class="fw-600" style="font-size:14px;">${esc(varName)}</div>
          ${it.inv_variants?.name && isFG ? `<div class="text-xs text-muted">Fabric: ${esc(it.inv_variants.name)}${rollWidth ? ` (${rollWidth}m wide)` : ''}</div>` : ''}
          ${isSheerDimout ? `<div class="text-xs" style="color:#7c3aed;font-weight:600;margin-top:2px;">× 2 cloth (sheer dimout)</div>` : ''}
          <div class="text-xs text-muted" style="margin-top:4px;">
            ${it.width_cm && it.height_cm ? `${Number(it.width_cm).toFixed(0)} × ${Number(it.height_cm).toFixed(0)} cm` : ''}
            ${it.quantity > 1 ? ` × ${it.quantity} blinds` : ''}
          </div>
          ${measurementsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;margin-top:8px;">${measurementsHtml}</div>` : ''}
          ${rollPickerHtml}
        </div>
        ${isFG && plannedCutLength > 0 ? `
        <div class="cut-input-grid" style="min-width:260px;flex:1;max-width:380px;">
          <div class="cut-input-block">
            <div class="cut-label">Cut Width</div>
            <div class="cut-planned">Planned: ${plannedCutWidthCm} cm</div>
            <div class="cut-label" style="margin-bottom:2px;">Actual (cm):</div>
            <input type="number" id="actual-width-${it.id}" value="${plannedCutWidthCm}"
              step="0.1" min="0" placeholder="${plannedCutWidthCm}"
              onchange="saveActualCutValue('${orderId}','${it.id}','width_cm', this.value)">
          </div>
          <div class="cut-input-block">
            <div class="cut-label">Cut Length</div>
            <div class="cut-planned">Planned: ${plannedCutLength.toFixed(3)} m</div>
            <div class="cut-label" style="margin-bottom:2px;">Actual (m):</div>
            <input type="number" id="actual-cut-${it.id}" value="${plannedCutLength.toFixed(3)}"
              step="0.001" min="0" placeholder="${plannedCutLength.toFixed(3)}"
              onchange="saveActualCutValue('${orderId}','${it.id}','length_m', this.value)">
          </div>
        </div>` : ''}
      </div>
    </div>`
  }).join('')

  // ── Component table — only show non-track (FG/RM) components here; track components shown inline above ──
  const fgComps = allComps.filter(c => {
    const parentItem = items.find(it => it.id === c.order_item_id)
    return !parentItem || parentItem.item_type !== 'track'
  })
  const fgCompGroups = aggregateOrderComponents(fgComps)
  if (window._pendingExecData?.[orderId]) window._pendingExecData[orderId].aggregatedComps = fgCompGroups
  let compsHtml = ''
  if (fgCompGroups.length) {
    compsHtml = `
    <div class="card" style="margin-bottom:1rem;">
      <div class="card-header">
        <h3 style="font-size:14px;margin:0;">
          <i class="fa-solid fa-puzzle-piece" style="margin-right:6px;color:#6366f1;"></i>
          Hardware Components — Enter Actual Quantities Used
        </h3>
        <span style="font-size:12px;color:#64748b;">${fgCompGroups.length} component type${fgCompGroups.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="table-wrap">
        <table style="font-size:12px;">
          <thead><tr>
            <th>Component</th>
            <th class="tr">Type</th>
            <th class="tr">Recommended</th>
            <th class="tr" style="min-width:220px;">Actually Used</th>
            <th>Status</th>
          </tr></thead>
          <tbody>
            ${fgCompGroups.map(c => {
              const planned  = Number(c.planned_qty)
              const actual   = c.actual_qty ?? planned
              const isDone   = !!c.deducted
              const fmtN     = n => n % 1 === 0 ? n.toFixed(0) : parseFloat(n.toFixed(3)).toString()
              const compName = c.inv_variants?.name || c.component_name || '—'
              return `<tr>
                <td><strong>${esc(compName)}</strong></td>
                <td style="color:#6b7280;font-size:11px;">${c.is_width_dependent ? 'Width-based' : 'Fixed'}</td>
                <td class="tr" style="color:#64748b;">${fmtN(planned)}</td>
                <td class="tr">
                  <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end;flex-wrap:wrap;">
                    <input class="comp-input" type="number" id="comp-actual-${c.id}"
                      value="${fmtN(actual)}" step="0.001" min="0"
                      onchange="saveActualComponentQty('${orderId}','${c.id}', this.value)"
                      ${isDone ? 'disabled style="background:#f0fdf4;color:#059669;font-weight:600;width:80px;"' : 'style="width:80px;"'}>
                    ${!isDone ? `<button
                        onclick="setCompSameAsRecommended('${orderId}', 'comp-actual-${c.id}', '${c.id}', ${planned})"
                        style="font-size:11px;padding:3px 8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;color:#059669;cursor:pointer;white-space:nowrap;flex-shrink:0;"
                        title="Use the recommended quantity">
                        Same as recommended
                      </button>` : ''}
                  </div>
                </td>
                <td>${isDone ? '<span style="color:#10b981;font-weight:600;">✓ Done</span>' : '<span style="color:#f59e0b;">Pending</span>'}</td>
              </tr>`
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`
  } else {
    // If all items are tracks, their components are shown inline — no separate warning needed
    const hasOnlyTracks = items.every(it => it.item_type === 'track')
    if (!hasOnlyTracks) {
      compsHtml = `
      <div class="card" style="margin-bottom:1rem;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;">
        <div style="font-size:13px;color:#92400e;">
          <i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;"></i>
          No hardware components found for this order. If these blind types require components, make sure the recipe is set up with the correct items.
        </div>
      </div>`
    }
  }

  const componentTypeCount = aggregateOrderComponents(allComps).length

  html('detail-body', `
    <div class="card" style="padding:16px;margin-bottom:1rem;">
      <div class="info-grid">
        <div><div class="text-xs text-muted">Customer</div><div class="fw-600">${esc(customer)}</div></div>
        <div><div class="text-xs text-muted">Order Date</div><div class="fw-600">${fmtDateTime(o.order_date || o.created_at)}</div></div>
        <div><div class="text-xs text-muted">Items</div><div class="fw-600">${items.length} blind${items.length !== 1 ? 's' : ''}</div></div>
        <div><div class="text-xs text-muted">Components</div><div class="fw-600">${componentTypeCount} type${componentTypeCount !== 1 ? 's' : ''}</div></div>
      </div>
      ${o.notes ? `<div class="text-sm" style="margin-top:10px;padding:8px 12px;background:#f8fafc;border-radius:6px;"><span class="text-muted">Notes: </span>${esc(o.notes)}</div>` : ''}
    </div>

    <div class="fw-600" style="font-size:15px;margin-bottom:10px;">Items — Enter Actual Cut Dimensions</div>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#92400e;">
      <i class="fa-solid fa-scissors" style="margin-right:6px;"></i>
      Edit <strong>Actual Cut Width</strong> and <strong>Actual Cut Length</strong> if they differ from planned. Select which roll to cut from when multiple rolls are available.
    </div>
    ${itemsHtml}

    ${compsHtml}

    <div class="card" style="padding:16px;margin-top:0.5rem;">
      <div class="form-group" style="margin-bottom:12px;">
        <label>Execution Notes (optional)</label>
        <input id="exec-notes" placeholder="e.g. Ready for pickup, packed in box 3">
      </div>
      <div id="exec-error" class="alert alert-error" style="display:none;margin-bottom:12px;"></div>
      <div style="display:flex;gap:12px;justify-content:flex-end;align-items:center;">
        <button class="btn btn-secondary" onclick="backToQueue()">← Back to Queue</button>
        <button class="btn btn-primary" id="exec-btn"
          onclick="captureAndExecute('${orderId}','${esc(customer)}')"
          style="background:#10b981;border-color:#10b981;font-size:15px;padding:10px 24px;">
          <i class="fa-solid fa-bolt"></i> Execute &amp; Deduct Inventory
        </button>
      </div>
    </div>
  `)
}

// ── Same as Recommended button handler ───────────────────────────────────────
function renderComponentUseRow(c, orderId) {
  const planned = Number(c.planned_qty || 0)
  const actual  = c.actual_qty ?? planned
  const isDone  = !!c.deducted
  const fmtN    = n => n % 1 === 0 ? n.toFixed(0) : parseFloat(n.toFixed(3)).toString()
  return `
    <div style="display:grid;grid-template-columns:minmax(160px,1fr) auto auto auto;gap:8px;align-items:center;padding:8px 10px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;">
      <div>
        <div class="fw-600" style="font-size:13px;">${esc(c.inv_variants?.name || 'Component')}</div>
        <div class="text-xs text-muted">${esc(c.unit || c.inv_variants?.unit || 'pcs')}</div>
      </div>
      <div style="text-align:right;">
        <div class="cut-label" style="margin:0;">Recommended</div>
        <div class="fw-600" style="font-size:13px;">${fmtN(planned)}</div>
      </div>
      <div style="text-align:right;">
        <div class="cut-label" style="margin:0 0 2px;">Actually Used</div>
        <input class="comp-input" type="number" id="comp-actual-${c.id}"
          value="${fmtN(actual)}" step="0.001" min="0"
          onchange="saveActualComponentQty('${orderId}','${c.id}', this.value)"
          ${isDone ? 'disabled style="background:#f0fdf4;color:#059669;font-weight:600;width:86px;"' : 'style="width:86px;"'}>
      </div>
      <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end;">
        ${!isDone ? `<button
            onclick="setCompSameAsRecommended('${orderId}', 'comp-actual-${c.id}', '${c.id}', ${planned})"
            style="font-size:11px;padding:4px 8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;color:#059669;cursor:pointer;white-space:nowrap;"
            title="Use the recommended quantity">
            Same as recommended
          </button>` : '<span style="color:#10b981;font-weight:600;font-size:12px;">Done</span>'}
      </div>
    </div>`
}

function componentGroupKey(c) {
  return c.variant_id || `name:${(c.component_name || c.inv_variants?.name || '').toLowerCase()}|${c.unit || c.inv_variants?.unit || 'pcs'}`
}

function aggregateOrderComponents(components = []) {
  const grouped = new Map()
  for (const c of components) {
    const key = componentGroupKey(c)
    if (!grouped.has(key)) {
      grouped.set(key, {
        ...c,
        id: `agg-${key.replace(/[^a-z0-9_-]/gi, '_')}`,
        planned_qty: 0,
        actual_qty: 0,
        hasActual: false,
        childRows: [],
      })
    }
    const g = grouped.get(key)
    g.planned_qty += Number(c.planned_qty || 0)
    if (c.actual_qty != null) {
      g.actual_qty += Number(c.actual_qty || 0)
      g.hasActual = true
    }
    g.deducted = g.childRows.length ? (g.deducted && c.deducted) : Boolean(c.deducted)
    g.childRows.push(c)
  }
  return [...grouped.values()].map(g => ({ ...g, actual_qty: g.hasActual ? g.actual_qty : null }))
}

function setCompSameAsRecommended(orderId, inputId, componentId, recommendedQty) {
  const inp = document.getElementById(inputId)
  if (inp) inp.value = recommendedQty % 1 === 0 ? recommendedQty.toFixed(0) : parseFloat(recommendedQty.toFixed(3)).toString()
  saveActualComponentQty(orderId, componentId, recommendedQty)
}

async function saveActualComponentQty(orderId, componentId, rawValue, inputUnit = null) {
  let actualQty = parseFloat(rawValue)
  if (isNaN(actualQty) || actualQty < 0) return

  const execData = window._pendingExecData?.[orderId]
  const group = execData?.aggregatedComps?.find(c => c.id === componentId)
  if (group?.childRows?.length) {
    const plannedTotal = Number(group.planned_qty || 0)
    for (const child of group.childRows) {
      const share = plannedTotal > 0 ? Number(child.planned_qty || 0) / plannedTotal : 1 / group.childRows.length
      await saveActualComponentQty(orderId, child.id, actualQty * share, inputUnit)
    }
    group.actual_qty = actualQty
    return
  }
  const comp = execData?.comps?.find(c => c.id === componentId)
  if (inputUnit === 'm' && (comp?.unit || comp?.inv_variants?.unit) === 'ft') {
    actualQty = actualQty / 0.3048
  }

  // Only update DB for real (non-temp) component IDs
  if (!String(componentId).startsWith('tmp-')) {
    await db.from('order_components').update({ actual_qty: actualQty }).eq('id', componentId)
  }
  // Always update in-memory so captureAndExecute picks up the new value
  if (comp) comp.actual_qty = actualQty
  if (!String(componentId).startsWith('tmp-')) {
    await calculateAndStoreOrderCost(orderId)
  }
}

function buildWastagePayloadForItem(orderId, it, existing = {}) {
  const isSheerDimout = (it.blind_type || '').startsWith('Sheer Dimout')
  const mult = isSheerDimout ? 2 : 1
  const defaultLen = it.height_cm ? (Number(it.height_cm) / 100) * Number(it.quantity || 1) * mult : 0
  const defaultCutWidth = it.inv_variants?.width_m || (it.width_cm ? Number(it.width_cm) / 100 : null)
  const usedWidth = it.width_cm ? Number(it.width_cm) / 100 : defaultCutWidth
  return {
    order_id: orderId,
    order_item_id: it.id,
    variant_id: it.inv_variants?.id || it.variant_id,
    roll_id: existing.roll_id || it.roll_id || null,
    source_piece_id: existing.source_piece_id || null,
    cut_length_m: Number(existing.cut_length_m || defaultLen || 0),
    used_length_m: Number(existing.used_length_m || existing.cut_length_m || defaultLen || 0),
    cut_width_m: existing.cut_width_m ?? defaultCutWidth,
    used_width_m: existing.used_width_m ?? usedWidth,
  }
}

function parseFabricSourceValue(value, execData) {
  const raw = String(value || '')
  if (!raw) return { type: 'auto', id: null, rollId: null, piece: null }
  if (raw.startsWith('piece:')) {
    const id = raw.slice('piece:'.length)
    const piece = (execData?.cutPieces || []).find(p => p.id === id) || null
    return { type: 'piece', id, rollId: piece?.source_roll_id || null, piece }
  }
  const id = raw.startsWith('roll:') ? raw.slice('roll:'.length) : raw
  return { type: 'roll', id, rollId: id, piece: null }
}

async function saveActualCutValue(orderId, itemId, field, rawValue) {
  const execData = window._pendingExecData?.[orderId]
  const it = execData?.items?.find(x => x.id === itemId)
  if (!it || (it.item_type || 'finished_goods') !== 'finished_goods') return
  if (!it.inv_variants?.id && !it.variant_id) return

  const existing = execData.wastage?.find(w => w.order_item_id === itemId) || {}
  const payload = buildWastagePayloadForItem(orderId, it, existing)
  const update = {}

  if (field === 'length_m') {
    const lengthM = parseFloat(rawValue)
    if (isNaN(lengthM) || lengthM <= 0) return
    payload.cut_length_m = lengthM
    payload.used_length_m = lengthM
    update.cut_length_m = lengthM
    update.used_length_m = lengthM
  } else if (field === 'width_cm') {
    const widthCm = parseFloat(rawValue)
    if (isNaN(widthCm) || widthCm <= 0) return
    payload.cut_width_m = widthCm / 100
    update.cut_width_m = widthCm / 100
    if (!payload.used_width_m) payload.used_width_m = widthCm / 100
  } else if (field === 'roll_id' || field === 'source') {
    const source = parseFabricSourceValue(rawValue, execData)
    if (source.type === 'piece') {
      payload.source_piece_id = source.id
      payload.roll_id = source.rollId
      update.source_piece_id = source.id
      update.roll_id = source.rollId
      if (source.piece?.width_m) {
        payload.cut_width_m = Number(source.piece.width_m)
        update.cut_width_m = Number(source.piece.width_m)
        const widthInput = document.getElementById(`actual-width-${itemId}`)
        if (widthInput) widthInput.value = (Number(source.piece.width_m) * 100).toFixed(1)
      }
    } else if (source.type === 'roll') {
      payload.source_piece_id = null
      payload.roll_id = source.id
      update.source_piece_id = null
      update.roll_id = source.id
    } else {
      payload.source_piece_id = null
      payload.roll_id = null
      update.source_piece_id = null
      update.roll_id = null
    }
  } else {
    return
  }

  try {
    let saved = null
    if (existing.id) {
      const { data, error } = await db.from('wastage_logs')
        .update(update)
        .eq('id', existing.id)
        .select('id, order_item_id, variant_id, roll_id, source_piece_id, created_piece_id, cut_length_m, used_length_m, cut_width_m, used_width_m')
        .single()
      if (error) throw error
      saved = data
    } else {
      const { data, error } = await db.from('wastage_logs')
        .insert(payload)
        .select('id, order_item_id, variant_id, roll_id, source_piece_id, created_piece_id, cut_length_m, used_length_m, cut_width_m, used_width_m')
        .single()
      if (error) throw error
      saved = data
    }

    execData.wastage = execData.wastage || []
    const idx = execData.wastage.findIndex(w => w.order_item_id === itemId)
    if (idx === -1) execData.wastage.push(saved)
    else execData.wastage[idx] = { ...execData.wastage[idx], ...saved }
  } catch (err) {
    console.warn('saveActualCutValue failed:', err)
    const errEl = document.getElementById('exec-error')
    if (errEl) {
      errEl.style.display = ''
      errEl.textContent = err.message || 'Could not save fabric cut details'
    } else {
      toast(err.message || 'Could not save fabric cut details', 'error')
    }
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

function backToQueue() {
  document.getElementById('detail-view').style.display = 'none'
  document.getElementById('queue-view').style.display  = ''
  window.scrollTo(0, 0)
}

// ── Capture → Execute ────────────────────────────────────────────────────────
function captureAndExecute(orderId, customerLabel) {
  const execData = window._pendingExecData?.[orderId]
  if (execData) {
    execData.capturedComps  = (execData.comps || []).map(c => {
      const inp = document.getElementById(`comp-actual-${c.id}`)
      let actualQty = inp ? parseFloat(inp.value) : (c.actual_qty ?? c.planned_qty)
      return { id: c.id, actual_qty: actualQty }
    })
    execData.capturedCuts   = {}
    execData.capturedWidths = {}
    execData.capturedRolls  = {}
    execData.capturedSources = {}
    ;(execData.items || []).forEach(it => {
      const cutInp   = document.getElementById(`actual-cut-${it.id}`)
      const widthInp = document.getElementById(`actual-width-${it.id}`)
      const sourceSel = document.getElementById(`source-pick-${it.id}`)
      if (cutInp?.value)   execData.capturedCuts[it.id]   = parseFloat(cutInp.value)
      if (widthInp?.value) execData.capturedWidths[it.id] = parseFloat(widthInp.value) / 100  // cm → m
      if (sourceSel?.value) {
        execData.capturedSources[it.id] = sourceSel.value
        const source = parseFabricSourceValue(sourceSel.value, execData)
        if (source.rollId) execData.capturedRolls[it.id] = source.rollId
      }
    })
  }
  executeOrder(orderId, customerLabel)
}

// ── Execute Order ─────────────────────────────────────────────────────────────
async function executeOrder(orderId, customerLabel) {
  const btn     = document.getElementById('exec-btn')
  const errEl   = document.getElementById('exec-error')
  const showErr = msg => { if (errEl) { errEl.style.display = ''; errEl.textContent = msg } }
  if (errEl) errEl.style.display = 'none'
  if (btn)   { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Executing…' }

  let success = false

  try {
    const notes     = val('exec-notes') || null
    const execData  = window._pendingExecData?.[orderId]
    const capturedCuts   = execData?.capturedCuts   || {}
    const capturedWidths = execData?.capturedWidths || {}
    const capturedRolls  = execData?.capturedRolls  || {}
    const capturedSources = execData?.capturedSources || {}
    const stepError = (step, error) => {
      if (!error) return
      throw new Error(`${step}: ${error.message || String(error)}`)
    }

    // Save actual component quantities — temp IDs need INSERT, real IDs need UPDATE
    const tempInserts = []
    for (const u of (execData?.capturedComps || [])) {
      if (isNaN(u.actual_qty)) continue
      if (String(u.id).startsWith('tmp-')) {
        const allC = execData.comps.find(c => c.id === u.id)
        if (allC) {
          tempInserts.push({
            order_id:           orderId,
            order_item_id:      allC.order_item_id,
            variant_id:         allC.variant_id,
            planned_qty:        allC.planned_qty,
            actual_qty:         u.actual_qty,
            unit:               allC.unit,
            is_width_dependent: allC.is_width_dependent,
            is_extra:           false,
            deducted:           false,
          })
        }
      } else {
        const { error } = await db.from('order_components').update({ actual_qty: u.actual_qty }).eq('id', u.id)
        stepError('Saving component quantity failed', error)
      }
    }
    if (tempInserts.length > 0) {
      const { error } = await db.from('order_components').insert(tempInserts)
      stepError('Saving generated component rows failed', error)
    }

    // Save cut dimensions to wastage_logs
    for (const it of (execData?.items || [])) {
      const isFG = (it.item_type || 'finished_goods') === 'finished_goods'
      if (!isFG || !it.inv_variants?.id) continue

      const mult       = (it.blind_type || '').startsWith('Sheer Dimout') ? 2 : 1
      const defaultLen = it.height_cm ? (Number(it.height_cm) / 100) * Number(it.quantity || 1) * mult : 0
      const defaultWid = it.inv_variants?.width_m || (it.width_cm ? Number(it.width_cm) / 100 : 0)
      const cutLen = !isNaN(capturedCuts[it.id])   ? capturedCuts[it.id]   : defaultLen
      const cutWid = !isNaN(capturedWidths[it.id]) ? capturedWidths[it.id] : defaultWid
      const wastageRow = execData?.wastage?.find(w => w.order_item_id === it.id)
      const source = parseFabricSourceValue(capturedSources[it.id], execData)
      const sourceRollId = source.rollId || capturedRolls[it.id] || null
      const sourcePieceId = source.type === 'piece' ? source.id : null
      const sourceCutWidth = source.type === 'piece' && source.piece?.width_m ? Number(source.piece.width_m) : cutWid

      if (wastageRow) {
        const update = {}
        if (!isNaN(capturedCuts[it.id])   && capturedCuts[it.id]   > 0) { update.cut_length_m = capturedCuts[it.id]; update.used_length_m = capturedCuts[it.id] }
        if ((!isNaN(capturedWidths[it.id]) && capturedWidths[it.id] > 0) || source.type === 'piece') {
          update.cut_width_m  = sourceCutWidth
          update.used_width_m = it.width_cm ? Number(it.width_cm) / 100 : sourceCutWidth
        }
        if (source.type !== 'auto') {
          update.roll_id = sourceRollId
          update.source_piece_id = sourcePieceId
        }
        if (Object.keys(update).length) {
          const { error } = await db.from('wastage_logs').update(update).eq('id', wastageRow.id)
          stepError('Saving fabric cut details failed', error)
        }
      } else if (cutLen > 0) {
        const { error } = await db.from('wastage_logs').insert({
          order_id: orderId, order_item_id: it.id, variant_id: it.inv_variants.id,
          roll_id: sourceRollId || it.roll_id || null,
          source_piece_id: sourcePieceId,
          cut_length_m: cutLen, used_length_m: cutLen,
          cut_width_m: sourceCutWidth > 0 ? sourceCutWidth : null,
          used_width_m: it.width_cm ? Number(it.width_cm) / 100 : (sourceCutWidth > 0 ? sourceCutWidth : null),
        })
        stepError('Saving fabric cut details failed', error)
      }
    }

    // Update roll_id on order_items
    for (const [itemId, rollId] of Object.entries(capturedRolls)) {
      if (rollId) {
        const { error } = await db.from('order_items').update({ roll_id: rollId }).eq('id', itemId)
        stepError('Saving selected roll failed', error)
      }
    }

    // Call execute_order RPC
    const { data: result, error: execErr } = await db.rpc('execute_order', {
      p_order_id:    orderId,
      p_executor_id: currentProfile.id,
    })
    if (execErr) {
      showErr(`Executing order failed: ${execErr.message}`)
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Execute &amp; Deduct Inventory' }
      return
    }

    success = true
    const fab  = result?.fabric_items_deducted ?? 0
    const comp = result?.components_deducted   ?? 0
    const pieces = result?.cut_pieces_created ?? 0
    const { error: statusErr } = await db.from('orders').update({
      status: 'executed',
      executed_by: currentProfile.id,
      executed_at: new Date().toISOString(),
    }).eq('id', orderId)
    stepError('Marking order executed failed', statusErr)
    toast(`Order executed! ${fab} fabric item${fab!==1?'s':''}, ${comp} component${comp!==1?'s':''}, ${pieces} cut piece${pieces!==1?'s':''} created.`)
    if (window._pendingExecData) delete window._pendingExecData[orderId]

    db.from('execution_logs').insert({ order_id: orderId, executed_by: currentProfile.id, notes }).catch(() => {})
    await calculateAndStoreOrderCost(orderId)
    await logActivity('execute', 'order', orderId, `#${orderId.substring(0,8)}`, {
      status: { old: 'processing', new: 'executed' },
      executed_by: currentProfile.full_name || currentProfile.username,
      fabric_deducted: fab, notes,
    })
  } catch (err) {
    console.error('executeOrder error:', err)
    showErr(err.message || 'An unexpected error occurred')
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Execute &amp; Deduct Inventory' }
  } finally {
    if (success) setTimeout(() => window.location.reload(), 800)
  }
}

// ── Cost calculation (stored to orders.cost_amount for admin view) ────────────
async function calculateAndStoreOrderCost(orderId) {
  const [wastageRes, compsRes, itemsRes] = await Promise.all([
    db.from('wastage_logs')
      .select('cut_length_m, cut_width_m, roll_id, variant_id')
      .eq('order_id', orderId),
    fetchOrderComponentsForCost(orderId),
    fetchOrderItemsForCost(orderId),
  ])

  if (compsRes.error) console.warn('Executer component cost hydration:', compsRes.error.message)
  if (itemsRes.error) console.warn('Executer order item cost hydration:', itemsRes.error.message)

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
  const variantMeta = Object.fromEntries((variantRateRes.data || []).map(v => [v.id, {
    purchase_rate: Number(v.purchase_rate || 0),
    width_m: Number(v.width_m || 0),
  }]))

  let fabricCost = wastageRows.reduce((s, w) => {
    const rate = rollRates[w.roll_id] || variantMeta[w.variant_id]?.purchase_rate || 0
    return s + Number(w.cut_length_m || 0) * rate
  }, 0)

  const items = itemsRes.data || []

  // Fallback: if wastage_logs gave zero, derive FG fabric cost from order_items dimensions.
  if (fabricCost === 0) {
    fabricCost = items.reduce((s, it) => {
      if ((it.item_type || 'finished_goods') !== 'finished_goods') return s
      const mult   = (it.blind_type || '').startsWith('Sheer Dimout') ? 2 : 1
      const cutLen = (Number(it.height_cm || 0) / 100) * Number(it.quantity || 1) * mult
      return s + cutLen * Number(it.inv_variants?.purchase_rate || 0)
    }, 0)
  }

  const rawMaterialCost = items.reduce((s, it) => {
    if (!['raw_material', 'resale'].includes(it.item_type || 'finished_goods')) return s
    const qty = Number(it.area_sqm || it.quantity || 0)
    return s + qty * Number(it.inv_variants?.purchase_rate || 0)
  }, 0)

  const componentCost = (compsRes.data || []).reduce((s, c) => {
    const qty  = Number(c.actual_qty ?? c.planned_qty ?? 0)
    const rate = Number(c.inv_variants?.purchase_rate || 0)
    const unit = c.unit || 'pcs'
    const qtyForRate = unit === 'ft' ? qty * 0.3048 : qty
    return s + qtyForRate * rate
  }, 0)

  const totalCost = fabricCost + componentCost + rawMaterialCost
  const { error } = await db.from('orders').update({ cost_amount: totalCost }).eq('id', orderId)
  if (error) console.warn('Unable to store executer order cost:', error.message)
}

init()
