/*
  Create page controller.
  - Create Purchase Order creates pending stock orders; inventory is received from the stock order detail page.
  - Create Order is embedded from create-order.html but resized to avoid nested form scrolling.
  - Supplier/category/product/variant creation happens inline so reports and profiles stay connected.
*/

let categories = []
let products = []
let variants = []
let suppliers = []
let inwardSupplierNames = []
let selectedSupplier = null
let isNewSupplier = false
let supplierDropOpen = false
let stockItems = []
let stockItemSeq = 0
let currentProfile = null
const itemState = {}
const STOCK_DRAFT_KEY = 'vista_create_stock_draft_v1'
const STOCK_ORDER_FORM_IDS = [
  'stock-party-order-no',
  'stock-dispatch-date',
  'stock-mode-despatch',
  'stock-gst-no',
  'stock-contact-person',
  'stock-tel',
  'stock-invoice-to',
  'stock-delivery-address',
  'stock-dealer-ref',
  'stock-order-type',
  'stock-freight',
  'stock-payment-terms',
  'stock-installation',
  'stock-special-instructions',
]
const STOCK_ORDER_FORM_DEFAULTS = {
  'stock-dispatch-date': 'Immediate',
  'stock-mode-despatch': 'By Courier',
  'stock-freight': 'Inclusive',
}

function norm(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function safeArg(value) {
  return encodeURIComponent(String(value ?? ''))
}

async function insertWithRlsFallback(table, payload, selectCols = '*') {
  return db.from(table).insert(payload).select(selectCols).single()
}

function switchCreateTab(tab) {
  const activeTab = ['stock', 'order', 'tickets'].includes(tab) ? tab : 'stock'
  const stockTab = document.getElementById('tab-stock')
  const orderTab = document.getElementById('tab-order')
  const ticketsTab = document.getElementById('tab-tickets')
  const stockBtn = document.getElementById('tab-btn-stock')
  const orderBtn = document.getElementById('tab-btn-order')
  const ticketsBtn = document.getElementById('tab-btn-tickets')
  if (stockTab) stockTab.style.display = activeTab === 'stock' ? '' : 'none'
  if (orderTab) orderTab.style.display = activeTab === 'order' ? '' : 'none'
  if (ticketsTab) ticketsTab.style.display = activeTab === 'tickets' ? '' : 'none'
  stockBtn?.classList.toggle('active', activeTab === 'stock')
  orderBtn?.classList.toggle('active', activeTab === 'order')
  ticketsBtn?.classList.toggle('active', activeTab === 'tickets')
  const url = new URL(window.location.href)
  url.searchParams.set('tab', activeTab)
  window.history.replaceState(null, '', url.toString())
  if (activeTab === 'order') requestOrderFrameHeight()
  if (activeTab === 'tickets') requestTicketsFrameHeight()
}

function enterTicketConversionMode(ticketId) {
  if (!ticketId) return
  document.body.classList.add('ticket-conversion-mode')
  document.getElementById('content')?.classList.add('ticket-conversion-content')
  const url = new URL(window.location.href)
  url.searchParams.set('tab', 'order')
  url.searchParams.set('ticket', ticketId)
  window.history.replaceState(null, '', url.toString())
  let rail = document.getElementById('ticket-conversion-rail')
  if (!rail) {
    rail = document.createElement('div')
    rail.id = 'ticket-conversion-rail'
    rail.className = 'ticket-conversion-rail'
    document.body.appendChild(rail)
  }
  rail.innerHTML = `
    <div class="conversion-rail-tab"><i class="fa-solid fa-bars"></i></div>
    <div class="conversion-rail-panel">
      <div class="conversion-rail-title">Ticket Order</div>
      <button class="conversion-rail-btn" onclick="exitTicketConversionMode('tickets')">
        <i class="fa-solid fa-ticket"></i><span>Back to Tickets</span>
      </button>
      <button class="conversion-rail-btn" onclick="exitTicketConversionMode('create')">
        <i class="fa-solid fa-table-columns"></i><span>Show Create</span>
      </button>
    </div>`
}

function exitTicketConversionMode(target = 'create') {
  document.body.classList.remove('ticket-conversion-mode')
  document.getElementById('content')?.classList.remove('ticket-conversion-content')
  document.getElementById('ticket-conversion-rail')?.remove()
  const url = new URL(window.location.href)
  url.searchParams.delete('ticket')
  window.history.replaceState(null, '', url.toString())
  if (target === 'tickets') {
    const ticketFrame = document.getElementById('tickets-frame')
    if (ticketFrame) ticketFrame.src = 'tickets.html?embed=1'
    switchCreateTab('tickets')
    return
  }
  const orderFrame = document.getElementById('create-order-frame')
  if (orderFrame) orderFrame.src = 'create-order.html?embed=1'
  switchCreateTab('order')
}

async function init() {
  const profile = await initSidebar()
  if (!profile) return
  currentProfile = profile
  if (document.getElementById('bill-date')) document.getElementById('bill-date').value = new Date().toISOString().slice(0, 10)
  applyStockOrderFormDefaults()
  await loadCreateData()
  if (!restoreStockDraft()) addStockItem()
  setupStockDraftAutosave()
  document.addEventListener('click', e => {
    if (!e.target.closest('#supplier-select-wrap')) closeSupplierDropdown()
    if (!e.target.closest('.stock-smart-select')) closeItemDropdowns()
  })
  window.addEventListener('message', e => {
    if (e.data?.type !== 'create-order-height') return
    const frame = document.getElementById('create-order-frame')
    if (frame) frame.style.height = `${Math.max(720, Number(e.data.height || 0) + 12)}px`
  })
  window.addEventListener('message', e => {
    if (e.data?.type === 'tickets-height') {
      const frame = document.getElementById('tickets-frame')
      if (frame) frame.style.height = `${Math.max(720, Number(e.data.height || 0) + 12)}px`
      return
    }
    if (e.data?.type === 'open-create-order-ticket' && e.data.ticketId) {
      const frame = document.getElementById('create-order-frame')
      if (frame) frame.src = `create-order.html?embed=1&ticket=${encodeURIComponent(e.data.ticketId)}`
      enterTicketConversionMode(e.data.ticketId)
      switchCreateTab('order')
    }
  })
  const requestedTab = new URLSearchParams(window.location.search).get('tab')
  if (['order', 'stock', 'tickets'].includes(requestedTab)) {
    switchCreateTab(requestedTab)
  }
  applyCreateOrderTicketParam()
  hide('loading')
  show('content')
}

function configureSalesCreateView() {
  document.getElementById('tab-btn-stock')?.remove()
  const stockTab = document.getElementById('tab-stock')
  if (stockTab) stockTab.remove()
  const heroText = document.querySelector('.workspace-hero p')
  if (heroText) heroText.textContent = 'Generate quotations or capture a new customer requirement ticket.'
}

function configureExecuterCreateView() {
  window.location.href = 'tickets.html'
}

async function loadCreateData() {
  const [catRes, prodRes, varRes, supRes, inwardSupRes] = await Promise.all([
    db.from('inv_categories').select('*').order('name'),
    db.from('inv_products').select('*').order('name'),
    db.from('inv_variants').select('*').order('name'),
    db.from('suppliers').select('*').order('name'),
    db.from('inv_rolls').select('supplier').not('supplier', 'is', null),
  ])
  if (catRes.error) toast(catRes.error.message, 'error')
  if (prodRes.error) toast(prodRes.error.message, 'error')
  if (varRes.error) toast(varRes.error.message, 'error')
  if (supRes.error) console.warn('suppliers load error:', supRes.error.message)
  if (inwardSupRes.error) console.warn('inward suppliers load error:', inwardSupRes.error.message)
  categories = catRes.data || []
  products = prodRes.data || []
  variants = varRes.data || []
  suppliers = supRes.data || []
  inwardSupplierNames = [...new Set((inwardSupRes.data || []).map(row => String(row.supplier || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
  renderSupplierList('')
  renderMasterCategoryOptions()
}

function requestOrderFrameHeight() {
  const frame = document.getElementById('create-order-frame')
  frame?.contentWindow?.postMessage({ type: 'request-create-order-height' }, '*')
}

function requestTicketsFrameHeight() {
  const frame = document.getElementById('tickets-frame')
  frame?.contentWindow?.postMessage({ type: 'request-tickets-height' }, '*')
}

function createOrderFrameSrc() {
  const ticketId = new URLSearchParams(window.location.search).get('ticket')
  return `create-order.html?embed=1${ticketId ? `&ticket=${encodeURIComponent(ticketId)}` : ''}`
}

function applyCreateOrderTicketParam() {
  const frame = document.getElementById('create-order-frame')
  if (!frame) return
  const nextSrc = createOrderFrameSrc()
  if (!frame.getAttribute('src')?.endsWith(nextSrc)) frame.src = nextSrc
  const ticketId = new URLSearchParams(window.location.search).get('ticket')
  if (ticketId) enterTicketConversionMode(ticketId)
}

function closeCreateOrderPanel() {
  document.body.classList.remove('ticket-conversion-mode')
  document.getElementById('content')?.classList.remove('ticket-conversion-content')
  document.getElementById('ticket-conversion-rail')?.remove()
  switchCreateTab('stock')
}

function onCreateOrderComplete(orderId) {
  const frame = document.getElementById('create-order-frame')
  if (frame) frame.src = 'create-order.html?embed=1'
  if (!orderId) return
  window.location.href = `order-detail.html?id=${orderId}`
}

function supplierDetails(s) {
  return [s.phone, s.city, s.state, s.gstin].filter(Boolean).join(' | ')
}

function renderSupplierList(q = '') {
  const query = norm(q)
  const byName = new Map()
  suppliers.forEach(s => byName.set(norm(s.name), s))
  inwardSupplierNames.forEach(name => {
    const key = norm(name)
    if (!byName.has(key)) byName.set(key, { id: `legacy:${safeArg(name)}`, name, phone: null, city: null, state: null, gstin: null, isLegacy: true })
  })
  const rows = [...byName.values()].filter(s =>
    !query || norm(s.name).includes(query) || norm(s.phone).includes(query) || norm(s.city).includes(query)
  )
  const list = document.getElementById('supplier-list')
  if (!list) return
  if (!rows.length) {
    list.innerHTML = `<div style="padding:12px 14px;font-size:13px;color:#94a3b8;">No suppliers found</div>`
    return
  }
  list.innerHTML = rows.slice(0, 80).map(s => `
    <div class="smart-option" onmousedown="selectSupplier('${s.id}')">
      <div class="fw-600">${esc(s.name)}</div>
      <div class="text-xs text-muted">${esc(supplierDetails(s))}</div>
    </div>
  `).join('')
}

function toggleSupplierDropdown() {
  if (supplierDropOpen) closeSupplierDropdown()
  else openSupplierDropdown()
}

function openSupplierDropdown() {
  const dd = document.getElementById('supplier-dropdown')
  if (dd) dd.style.display = 'block'
  supplierDropOpen = true
  document.getElementById('supplier-search-input')?.focus()
  renderSupplierList(document.getElementById('supplier-search-input')?.value || '')
}

function closeSupplierDropdown() {
  const dd = document.getElementById('supplier-dropdown')
  if (dd) dd.style.display = 'none'
  supplierDropOpen = false
}

function selectSupplier(id) {
  selectedSupplier = suppliers.find(s => s.id === id)
    || inwardSupplierNames.map(name => ({ id: `legacy:${safeArg(name)}`, name, isLegacy: true })).find(s => s.id === id)
    || null
  closeSupplierDropdown()
  if (!selectedSupplier) return
  document.getElementById('supplier-placeholder').style.display = 'none'
  document.getElementById('supplier-selected').style.display = ''
  text('supplier-sel-name', selectedSupplier.name)
  text('supplier-sel-details', supplierDetails(selectedSupplier) || 'Supplier profile selected')
  const input = document.getElementById('supplier-search-input')
  if (input) input.value = ''
  renderSupplierList('')
  saveStockDraft()
}

function clearSupplier() {
  selectedSupplier = null
  document.getElementById('supplier-selected').style.display = 'none'
  document.getElementById('supplier-placeholder').style.display = ''
  saveStockDraft()
}

function applyStockOrderFormDefaults() {
  for (const [id, value] of Object.entries(STOCK_ORDER_FORM_DEFAULTS)) {
    const el = document.getElementById(id)
    if (el && !el.value) el.value = value
  }
}

function toggleNewSupplier(newMode) {
  isNewSupplier = newMode
  document.getElementById('supplier-search-section').style.display = newMode ? 'none' : ''
  document.getElementById('supplier-new-section').style.display = newMode ? '' : 'none'
  document.getElementById('supplier-new-btn').style.display = newMode ? 'none' : ''
  document.getElementById('supplier-search-btn').style.display = newMode ? '' : 'none'
  if (newMode) clearSupplier()
  saveStockDraft()
}

function supplierPayload() {
  return {
    name: val('ns-name').trim(),
    contact_person: val('ns-contact-person') || null,
    phone: val('ns-phone') || null,
    phone2: val('ns-phone2') || null,
    email: val('ns-email') || null,
    gstin: val('ns-gstin') || null,
    address: val('ns-address') || null,
    city: val('ns-city') || null,
    state: val('ns-state') || null,
    notes: val('ns-notes') || null,
  }
}

async function ensureSupplier() {
  if (!isNewSupplier) return selectedSupplier
  const payload = supplierPayload()
  const hasAnySupplierDetail = Object.values(payload).some(Boolean)
  if (!hasAnySupplierDetail) return null
  if (!payload.name) throw new Error('Supplier name is required')
  const existing = suppliers.find(s => norm(s.name) === norm(payload.name))
  if (existing) return existing

  let currentPayload = { ...payload }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await insertWithRlsFallback('suppliers', currentPayload)
    if (!result.error) {
      suppliers.push(result.data)
      selectedSupplier = result.data
      return result.data
    }
    const missingColumn = String(result.error.message || '').match(/'([^']+)' column/i)?.[1]
    if (!missingColumn || !(missingColumn in currentPayload)) throw result.error
    delete currentPayload[missingColumn]
  }
  throw new Error('Could not create supplier')
}

function addStockItem() {
  stockItemSeq += 1
  const id = stockItemSeq
  stockItems.push(id)
  itemState[id] = { category: null, variant: null, open: null }
  renderStockItems()
  saveStockDraft()
}

function removeStockItem(id) {
  if (stockItems.length === 1) return
  stockItems = stockItems.filter(x => x !== id)
  delete itemState[id]
  renderStockItems()
  saveStockDraft()
}

function renderStockItems() {
  const container = document.getElementById('stock-items')
  if (!container) return
  container.innerHTML = stockItems.map((id, idx) => buildStockItemCard(id, idx + 1)).join('')
  updateStockSummary()
}

function buildStockItemCard(id, position) {
  const state = itemState[id] || {}
  return `
    <div class="item-card" id="stock-item-${id}" style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;background:#fff;">
      <div class="item-card-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span>Item ${position}</span>
        <button class="btn btn-ghost btn-sm" style="color:#ef4444" onclick="removeStockItem(${id})" ${stockItems.length === 1 ? 'disabled' : ''}>
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
      <div class="form-row cols-2" style="margin-bottom:12px;">
        ${dropdownHtml(id, 'category', 'Category *', state.category?.name || 'Search or create category...')}
        ${dropdownHtml(id, 'variant', 'Variant / Material Name *', state.variant?.name || 'Search or create variant...')}
      </div>
      <div class="form-row cols-3" style="margin-bottom:12px;">
        <div class="form-group"><label>Batch Code</label><input id="batch-${id}" value="${esc(valOr(`batch-${id}`, ''))}" placeholder="Blank = bill + item number"></div>
        <div class="form-group"><label>Line Notes</label><input id="line-notes-${id}" value="${esc(valOr(`line-notes-${id}`, ''))}" placeholder="Optional"></div>
        <div></div>
      </div>
      <div class="form-row cols-4">
        <div class="form-group"><label>Quantity *</label><input id="qty-${id}" type="number" step="0.01" min="0" value="${esc(valOr(`qty-${id}`, ''))}" oninput="updateStockSummary()" placeholder="e.g. 75"></div>
        <div class="form-group">
          <label>Unit *</label>
          <select id="unit-${id}" onchange="updateStockSummary()">
            ${unitOptions(state.variant?.unit || valOr(`unit-${id}`, defaultUnit(id)))}
          </select>
        </div>
        <div class="form-group"><label>Rate *</label><input id="rate-${id}" type="number" step="0.01" min="0" value="${esc(valOrFilled(`rate-${id}`, state.variant?.purchase_rate || ''))}" oninput="updateStockSummary()" placeholder="per m or per pcs"></div>
        <div class="form-group"><label>Fabric Width (m)</label><input id="width-${id}" type="number" step="0.01" min="0" value="${esc(valOrFilled(`width-${id}`, state.variant?.width_m || ''))}" placeholder="e.g. 2.3"></div>
      </div>
    </div>
  `
}

function dropdownHtml(id, type, label, placeholder) {
  return `
    <div class="form-group stock-smart-select" id="${type}-select-${id}">
      <label>${label}</label>
      <div class="smart-select">
        <div class="smart-trigger" onclick="toggleItemDropdown(${id}, '${type}')">${esc(placeholder)}</div>
        <div class="smart-menu" id="${type}-menu-${id}">
          <input id="${type}-search-${id}" placeholder="Search ${type}..." oninput="renderItemOptions(${id}, '${type}', this.value)">
          <div id="${type}-options-${id}"></div>
        </div>
      </div>
    </div>
  `
}

function unitOptions(selected = 'pcs') {
  return ['m', 'sqm', 'pcs', 'ft', 'set', 'nos'].map(u => `<option value="${u}" ${u === selected ? 'selected' : ''}>${u}</option>`).join('')
}

function valOr(id, fallback) {
  const el = document.getElementById(id)
  return el ? el.value : fallback
}

function valOrFilled(id, fallback) {
  const current = valOr(id, '')
  return current === '' || current == null ? fallback : current
}

function defaultUnit(id) {
  return itemState[id]?.variant?.unit || 'pcs'
}

function onItemTypeChange(id) {
  itemState[id] = { category: null, variant: null, open: null }
  renderStockItems()
  saveStockDraft()
}

function toggleItemDropdown(id, type) {
  const state = itemState[id]
  const menu = document.getElementById(`${type}-menu-${id}`)
  const isOpen = menu?.style.display === 'block'
  closeItemDropdowns()
  if (!isOpen && menu) {
    state.open = type
    menu.style.display = 'block'
    document.getElementById(`${type}-search-${id}`)?.focus()
    renderItemOptions(id, type, document.getElementById(`${type}-search-${id}`)?.value || '')
  }
}

function closeItemDropdowns() {
  document.querySelectorAll('.smart-menu').forEach(el => { el.style.display = 'none' })
  Object.values(itemState).forEach(s => { s.open = null })
}

function renderItemOptions(id, type, q = '') {
  if (type === 'category') renderCategoryOptions(id, q)
  if (type === 'variant') renderVariantOptions(id, q)
}

function optionHtml(label, sub, onclick) {
  return `<div class="smart-option" onmousedown="${onclick}">
    <div class="fw-600">${esc(label)}</div>
    ${sub ? `<div class="text-xs text-muted">${esc(sub)}</div>` : ''}
  </div>`
}

function createOptionHtml(label, onclick) {
  return `<div class="smart-option create-option" onmousedown="${onclick}">
    <i class="fa-solid fa-plus"></i> Create "${esc(label)}"
  </div>`
}

function renderCategoryOptions(id, q = '') {
  const query = norm(q)
  const rows = categories.filter(c => !query || norm(c.name).includes(query))
  let out = rows.map(c => optionHtml(c.name, c.sub_group, `selectCategoryForItem(${id}, '${c.id}')`)).join('')
  if (query && !rows.some(c => norm(c.name) === query)) out += createOptionHtml(q, `createCategoryForItem(${id}, '${safeArg(q)}')`)
  html(`category-options-${id}`, out || '<div class="smart-empty">No categories found</div>')
}

function categoryMatchesType(category, type) {
  return true
}

function renderMasterCategoryOptions() {
  const list = document.getElementById('master-category-list')
  if (!list) return
  list.innerHTML = categories
    .map(c => `<option value="${esc(c.name)}"></option>`)
    .join('')
  const unit = document.getElementById('master-unit')
  if (unit && !unit.value) unit.value = 'pcs'
}

function selectCategoryForItem(id, categoryId) {
  const state = itemState[id]
  state.category = categories.find(c => c.id === categoryId) || null
  state.variant = null
  closeItemDropdowns()
  renderStockItems()
  saveStockDraft()
}

async function createCategoryForItem(id, encodedName) {
  const name = decodeURIComponent(encodedName).trim()
  if (!name) return
  const { data, error } = await db.from('inv_categories')
    .upsert({ name, normalized_name: norm(name), sub_group: 'Master' }, { onConflict: 'normalized_name' })
    .select('*').single()
  if (error) { toast(error.message, 'error'); return }
  categories = categories.filter(c => c.id !== data.id).concat(data)
  selectCategoryForItem(id, data.id)
}

function renderVariantOptions(id, q = '') {
  const state = itemState[id]
  const query = norm(q)
  const categoryProductIds = new Set(
    products
      .filter(p => state.category && p.category_id === state.category.id)
      .map(p => p.id)
  )
  const rows = variants.filter(v => categoryProductIds.has(v.product_id) && (!query || norm(v.name).includes(query)))
  let out = rows.map(v => optionHtml(v.name, variantSub(v), `selectVariantForItem(${id}, '${v.id}')`)).join('')
  if (state.category && query && !rows.some(v => norm(v.name) === query)) out += createOptionHtml(q, `createVariantForItem(${id}, '${safeArg(q)}')`)
  html(`variant-options-${id}`, out || '<div class="smart-empty">Select/create a category first</div>')
}

async function ensureCatalogCategory(name, type) {
  const existing = categories.find(c => categoryMatchesType(c, type) && norm(c.name) === norm(name))
  if (existing) return existing
  const { data, error } = await db.from('inv_categories')
    .upsert({ name, normalized_name: norm(name), sub_group: type }, { onConflict: 'normalized_name' })
    .select('*').single()
  if (error) throw error
  categories = categories.filter(c => c.id !== data.id).concat(data)
  return data
}

async function ensureCatalogProduct(category, name) {
  const existing = products.find(p => p.category_id === category.id && norm(p.name) === norm(name))
  if (existing) return existing
  const { data, error } = await db.from('inv_products')
    .upsert({
      category_id: category.id,
      name,
      normalized_name: norm(name),
    }, { onConflict: 'category_id,normalized_name' })
    .select('*')
    .single()
  if (error) throw error
  products = products.filter(p => p.id !== data.id).concat(data)
  return data
}

async function ensureCatalogVariant(product, name, unit, width, rate) {
  const payload = {
    product_id: product.id,
    name,
    normalized_name: norm(name),
    unit,
    width_m: width || null,
    purchase_rate: rate || null,
    base_rate_sqm: width && rate ? rate / width : null,
  }
  const { data, error } = await db.from('inv_variants')
    .upsert(payload, { onConflict: 'product_id,normalized_name' })
    .select('*')
    .single()
  if (error) throw error
  variants = variants.filter(v => v.id !== data.id).concat(data)
  return data
}

async function saveStockMaster() {
  hideAlert('stock-alert')
  const btn = document.getElementById('save-master-btn')
  const type = 'Master'
  const categoryName = val('master-category').trim()
  const productName = val('master-product').trim()
  const variantName = val('master-variant').trim() || productName
  const unit = val('master-unit') || 'pcs'
  const width = Number(val('master-width') || 0) || null
  const rate = Number(val('master-rate') || 0) || null

  if (!categoryName) { showAlert('stock-alert', 'Master category is required'); return }

  if (btn) {
    btn.disabled = true
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Creating...'
  }
  try {
    const category = await ensureCatalogCategory(categoryName, type)
    let product = null
    if (productName) {
      product = await ensureCatalogProduct(category, productName)
      await ensureCatalogVariant(product, variantName, unit, width, rate)
    }
    await logActivity('create', 'stock_master', product?.id || category.id, productName ? `${categoryName} / ${productName}` : categoryName, {
      category: categoryName,
      product: productName || null,
      variant: productName ? variantName : null,
      unit,
    })
    toast(productName ? 'Stock master created' : 'Category master created')
    ;['master-category', 'master-product', 'master-variant', 'master-width', 'master-rate'].forEach(id => {
      const el = document.getElementById(id)
      if (el) el.value = ''
    })
    renderMasterCategoryOptions()
  } catch (err) {
    showAlert('stock-alert', err.message || String(err))
  } finally {
    if (btn) {
      btn.disabled = false
      btn.innerHTML = '<i class="fa-solid fa-layer-group"></i> Create Master'
    }
  }
}

function variantSub(v) {
  return `${v.unit || ''}${v.width_m ? ' | width ' + v.width_m + 'm' : ''}${v.purchase_rate ? ' | rate ' + fmt$(v.purchase_rate) : ''}`
}

function selectVariantForItem(id, variantId) {
  const state = itemState[id]
  state.variant = variants.find(v => v.id === variantId) || null
  closeItemDropdowns()
  renderStockItems()
  saveStockDraft()
}

async function createVariantForItem(id, encodedName) {
  const state = itemState[id]
  const name = decodeURIComponent(encodedName).trim()
  if (!name || !state.category) return
  let product = products.find(p => p.category_id === state.category.id && norm(p.name) === norm(name))
  if (!product) {
    const productResult = await db.from('inv_products')
      .upsert({
        category_id: state.category.id,
        name,
        normalized_name: norm(name),
      }, { onConflict: 'category_id,normalized_name' })
      .select('*')
      .single()
    if (productResult.error) { toast(productResult.error.message, 'error'); return }
    product = productResult.data
    products = products.filter(p => p.id !== product.id).concat(product)
  }
  const unit = valOr(`unit-${id}`, defaultUnit(id))
  const width = Number(valOr(`width-${id}`, 0)) || null
  const rate = Number(valOr(`rate-${id}`, 0)) || null
  const { data, error } = await db.from('inv_variants')
    .upsert({
      product_id: product.id,
      name,
      normalized_name: norm(name),
      unit,
      width_m: width,
      purchase_rate: rate,
      base_rate_sqm: width && rate ? rate / width : null,
    }, { onConflict: 'product_id,normalized_name' })
    .select('*').single()
  if (error) { toast(error.message, 'error'); return }
  variants = variants.filter(v => v.id !== data.id).concat(data)
  selectVariantForItem(id, data.id)
}

function collectItemRows() {
  return stockItems.map((id, idx) => {
    const state = itemState[id]
    return {
      id,
      lineNo: idx + 1,
      category: state.category,
      variant: state.variant,
      batch: val(`batch-${id}`),
      qty: Number(val(`qty-${id}`) || 0),
      unit: val(`unit-${id}`) || defaultUnit(id),
      rate: Number(val(`rate-${id}`) || 0),
      width: Number(val(`width-${id}`) || 0) || null,
      notes: val(`line-notes-${id}`) || null,
    }
  })
}

function collectStockOrderFormData(supplier, stockOrderUid) {
  const data = {}
  STOCK_ORDER_FORM_IDS.forEach(id => {
    data[id.replace(/^stock-/, '').replace(/-/g, '_')] = val(id).trim()
  })
  return {
    ...data,
    stock_order_uid: stockOrderUid,
    supplier: supplier ? {
      id: supplier.isLegacy ? null : supplier.id,
      name: supplier.name || '',
      contact_person: supplier.contact_person || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      gstin: supplier.gstin || '',
      address: supplier.address || '',
      city: supplier.city || '',
      state: supplier.state || '',
    } : null,
  }
}

function stockOrderUid() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `STK-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${String(d.getMilliseconds()).padStart(3, '0')}`
}

function updateStockSummary() {
  const rows = collectItemRows()
  const totalQty = rows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0)
  const totalValue = rows.reduce((sum, r) => sum + ((Number(r.qty) || 0) * (Number(r.rate) || 0)), 0)
  text('stock-summary', `${rows.length} item${rows.length === 1 ? '' : 's'} | Qty ${totalQty.toFixed(2)} | Value ${fmt$(totalValue)}`)
  saveStockDraft()
}

function setupStockDraftAutosave() {
  clearStockDraft()
}

function saveStockDraft() {
}

function restoreStockDraft() {
  clearStockDraft()
  return false
}

function clearStockDraft() {
  try { localStorage.removeItem(STOCK_DRAFT_KEY) } catch {}
}

async function ensureItemEntities(row) {
  if (!row.category) {
    const q = val(`category-search-${row.id}`).trim()
    if (q) await createCategoryForItem(row.id, safeArg(q))
  }
  if (!itemState[row.id].variant) {
    const q = val(`variant-search-${row.id}`).trim()
    if (q) await createVariantForItem(row.id, safeArg(q))
  }
  return {
    ...row,
    category: itemState[row.id].category,
    variant: itemState[row.id].variant,
  }
}

async function saveStock() {
  hideAlert('stock-alert')
  const billNo = val('bill-no').trim() || `LOOSE-${new Date().toISOString().slice(0, 10)}-${Date.now().toString().slice(-5)}`
  const billDate = val('bill-date') || new Date().toISOString().slice(0, 10)

  const btn = document.getElementById('save-stock-btn')
  btn.disabled = true
  btn.innerHTML = '<span class="spinner spinner-sm"></span> Creating...'
  let createdStockOrderId = null
  let cleanupCreatedStockOrder = false

  try {
    const supplier = await ensureSupplier() || { id: null, name: 'Loose Stock', isLegacy: true }
    const currentUserId = AUTH.currentUserId()

    const rows = []
    for (const raw of collectItemRows()) {
      const row = await ensureItemEntities(raw)
      if (!row.category) throw new Error(`Item ${row.lineNo}: select or create a category`)
      if (!row.variant) throw new Error(`Item ${row.lineNo}: select or create a variant`)
      if (!row.qty || row.qty <= 0) throw new Error(`Item ${row.lineNo}: quantity must be more than zero`)
      if (row.rate < 0) throw new Error(`Item ${row.lineNo}: rate cannot be negative`)
      rows.push(row)
    }

    const uid = stockOrderUid()
    const totalValue = rows.reduce((sum, row) => sum + ((Number(row.qty) || 0) * (Number(row.rate) || 0)), 0)
    const { data: stockOrder, error: orderErr } = await db.from('stock_orders').insert({
      stock_order_uid: uid,
      supplier_id: supplier.isLegacy ? null : supplier.id,
      supplier_name: supplier.name,
      status: 'pending',
      bill_no: billNo,
      bill_date: billDate,
      notes: val('stock-notes') || null,
      order_form_data: collectStockOrderFormData(supplier, uid),
      total_amount: totalValue,
      created_by: currentUserId,
    }).select('id, stock_order_uid').single()
    if (orderErr) throw orderErr
    createdStockOrderId = stockOrder.id
    cleanupCreatedStockOrder = true

    const itemPayload = rows.map(row => ({
      stock_order_id: stockOrder.id,
      line_no: row.lineNo,
      item_type: 'Master',
      category_id: row.category.id,
      category_name: row.category.name,
      variant_id: row.variant.id,
      variant_name: row.variant.name,
      batch_code: row.batch || null,
      quantity: row.qty,
      unit: row.unit,
      rate: row.rate,
      width_m: row.width,
      line_total: row.qty * row.rate,
      notes: row.notes,
    }))
    const { error: itemsErr } = await db.from('stock_order_items').insert(itemPayload)
    if (itemsErr) throw itemsErr
    cleanupCreatedStockOrder = false

    await logActivity('create', 'stock_order', stockOrder.id, stockOrder.stock_order_uid, {
      supplier: supplier.name,
      items: rows.length,
      total_value: totalValue,
    })
    toast(`Created stock order ${stockOrder.stock_order_uid}`)
    clearStockDraft()
    resetStockForm()
    window.location.href = `stock-order-detail.html?id=${stockOrder.id}`
  } catch (err) {
    if (cleanupCreatedStockOrder && createdStockOrderId) {
      try { await db.from('stock_orders').delete().eq('id', createdStockOrderId) } catch {}
    }
    showAlert('stock-alert', err.message || String(err))
  } finally {
    btn.disabled = false
    btn.innerHTML = 'Create Stock Order'
  }
}

function resetStockForm() {
  clearStockDraft()
  clearSupplier()
  toggleNewSupplier(false)
  ;['ns-name','ns-contact-person','ns-phone','ns-phone2','ns-email','ns-gstin','ns-address','ns-city','ns-state','ns-notes','bill-no','stock-notes', ...STOCK_ORDER_FORM_IDS].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.value = ''
  })
  document.getElementById('bill-date').value = new Date().toISOString().slice(0, 10)
  applyStockOrderFormDefaults()
  stockItems = []
  Object.keys(itemState).forEach(k => delete itemState[k])
  addStockItem()
}

init()
