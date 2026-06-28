// ── State ─────────────────────────────────────────────────────────────────────
/*
  Inventory page controller.
  Owns the visible inventory tree: categories -> products -> variants -> rolls.
  It reads from the canonical inv_* tables, renders stock/value cards, supports
  add-stock and edit flows, and exports the current inventory view to Excel.
*/

let isAdmin = false
let isAdminOrStaff = false
let allVariants = []   // [{...inv_variants row, inv_products:{...}, inv_rolls:[...]}]
let allCutPieces = []
let allCategories = []
let allFGItems = []    // fg_stock rows
let masterPages = []
let masterRoots = []
let masterSyncItems = []
let masterRootIdByVariantId = new Map()
let expandedVariants  = new Set()
let expandedCategories = new Set()
const ROLL_UNITS = ['m', 'ft', 'cm']
let currentUnit = (() => { const u = getPreferredUnit(); return ROLL_UNITS.includes(u) ? u : 'm' })()

// ── localStorage expand state ─────────────────────────────────────────────────
const INV_STATE_KEY = 'inv_expand_v2'

function loadExpandState() {
  try {
    const raw = localStorage.getItem(INV_STATE_KEY)
    if (!raw) return
    const { cats = [], vars = [] } = JSON.parse(raw)
    expandedCategories = new Set(cats)
    expandedVariants   = new Set(vars)
  } catch { /* ignore */ }
}

function saveExpandState() {
  try {
    localStorage.setItem(INV_STATE_KEY, JSON.stringify({
      cats: [...expandedCategories],
      vars: [...expandedVariants],
    }))
  } catch { /* ignore */ }
}

// ── Excel Export ──────────────────────────────────────────────────────────────
function exportInventoryExcel() {
  // Split variants into 3 groups matching the input Excel format
  const fabricVariants = allVariants.filter(v => isFabric(v))
  const mtrPartsVariants = allVariants.filter(v => !isFabric(v) && !isFinishedGoodsCategory(v.category) && v.unit === 'm')
  const pcsPartsVariants = allVariants.filter(v => !isFabric(v) && !isFinishedGoodsCategory(v.category) && v.unit !== 'm')

  // ── Sheet 1: Fabrics (MTR) ──────────────────────────────────
  const fabHeaders = ['Stock Group', 'Stock Category', 'Style', 'Shade', 'Product Code', 'Width', 'Measurement Unit', 'Batch', 'Quantity (m)', 'Remaining (m)', 'Rate', 'Stock Value', 'Purchase Bill No', 'Purchase Date']
  const fabRows = [fabHeaders]
  // Sort by category, then product, then variant
  const sortedFab = [...fabricVariants].sort((a, b) =>
    (a.category?.name || '').localeCompare(b.category?.name || '') ||
    (a.product?.name || '').localeCompare(b.product?.name || '') ||
    (a.name || '').localeCompare(b.name || '')
  )
  for (const v of sortedFab) {
    const style = v.product?.name || ''
    // Extract shade from variant name by removing the style prefix
    let shade = v.name || ''
    if (shade.toLowerCase().startsWith(style.toLowerCase())) {
      shade = shade.slice(style.length).trim()
    }
    const productCode = `${v.category?.name?.replace(' Fabrics', '') || ''} ${v.name} ${v.width_m || ''} Mtr`.replace(/\s+/g, ' ').trim()
    if (v.rolls.length > 0) {
      for (const r of v.rolls) {
        fabRows.push([
          'Blinds',
          v.category?.name || '',
          style,
          shade,
          productCode,
          v.width_m || '',
          'MTR',
          r.batch_code || '',
          Number(r.original_length || 0),
          Number(r.remaining_length || 0),
          Number(r.purchase_rate || v.purchase_rate || 0),
          Number(r.stock_value || 0),
          r.bill_no || '',
          r.inward_date || '',
        ])
      }
    } else {
      // Zero-stock variant — still list it
      fabRows.push([
        'Blinds',
        v.category?.name || '',
        style,
        shade,
        productCode,
        v.width_m || '',
        'MTR',
        '',
        0,
        0,
        Number(v.purchase_rate || 0),
        0,
        '',
        '',
      ])
    }
  }
  const fabCols = [
    { wch: 10 }, // Stock Group
    { wch: 24 }, // Stock Category
    { wch: 28 }, // Style
    { wch: 18 }, // Shade
    { wch: 50 }, // Product Code
    { wch: 8 },  // Width
    { wch: 8 },  // Unit
    { wch: 10 }, // Batch
    { wch: 14 }, // Quantity
    { wch: 14 }, // Remaining
    { wch: 10 }, // Rate
    { wch: 14 }, // Stock Value
    { wch: 22 }, // Bill No
    { wch: 14 }, // Date
  ]

  // ── Sheet 2: Parts in Meters ────────────────────────────────
  const mtrHeaders = ['Stock Group', 'Stock Category', 'Product Code', 'Measurement Unit', 'Batch', 'Quantity (m)', 'Remaining (m)', 'Rate', 'Stock Value', 'Purchase Bill No', 'Purchase Date']
  const mtrRows = [mtrHeaders]
  const sortedMtr = [...mtrPartsVariants].sort((a, b) =>
    (a.category?.name || '').localeCompare(b.category?.name || '') ||
    (a.name || '').localeCompare(b.name || '')
  )
  for (const v of sortedMtr) {
    const catPrefix = v.product?.name || v.category?.name || ''
    const productCode = `${catPrefix}-${v.name}`.trim()
    if (v.rolls.length > 0) {
      for (const r of v.rolls) {
        mtrRows.push([
          'Blinds',
          v.category?.name || '',
          productCode,
          'MTR',
          r.batch_code || '',
          Number(r.original_length || 0),
          Number(r.remaining_length || 0),
          Number(r.purchase_rate || v.purchase_rate || 0),
          Number(r.stock_value || 0),
          r.bill_no || '',
          r.inward_date || '',
        ])
      }
    } else {
      mtrRows.push([
        'Blinds',
        v.category?.name || '',
        productCode,
        'MTR',
        '',
        0,
        0,
        Number(v.purchase_rate || 0),
        0,
        '',
        '',
      ])
    }
  }
  const mtrCols = [
    { wch: 10 }, // Stock Group
    { wch: 40 }, // Stock Category
    { wch: 60 }, // Product Code
    { wch: 8 },  // Unit
    { wch: 16 }, // Batch
    { wch: 14 }, // Quantity
    { wch: 14 }, // Remaining
    { wch: 10 }, // Rate
    { wch: 14 }, // Stock Value
    { wch: 22 }, // Bill No
    { wch: 14 }, // Date
  ]

  // ── Sheet 3: Parts in Pieces ────────────────────────────────
  const pcsHeaders = ['Stock Group', 'Stock Category', 'Product Code', 'Measurement Unit', 'Batch', 'Quantity', 'Remaining', 'Rate', 'Stock Value', 'Purchase Bill No', 'Purchase Date']
  const pcsRows = [pcsHeaders]
  const sortedPcs = [...pcsPartsVariants].sort((a, b) =>
    (a.category?.name || '').localeCompare(b.category?.name || '') ||
    (a.name || '').localeCompare(b.name || '')
  )
  for (const v of sortedPcs) {
    const catPrefix = v.product?.name || v.category?.name || ''
    const productCode = `${catPrefix}-${v.name}`.trim()
    if (v.rolls.length > 0) {
      for (const r of v.rolls) {
        pcsRows.push([
          'Blinds',
          v.category?.name || '',
          productCode,
          'Pcs',
          r.batch_code || '',
          Number(r.original_length || 0),
          Number(r.remaining_length || 0),
          Number(r.purchase_rate || v.purchase_rate || 0),
          Number(r.stock_value || 0),
          r.bill_no || '',
          r.inward_date || '',
        ])
      }
    } else {
      pcsRows.push([
        'Blinds',
        v.category?.name || '',
        productCode,
        'Pcs',
        '',
        0,
        0,
        Number(v.purchase_rate || 0),
        0,
        '',
        '',
      ])
    }
  }
  const pcsCols = [
    { wch: 10 }, // Stock Group
    { wch: 40 }, // Stock Category
    { wch: 60 }, // Product Code
    { wch: 8 },  // Unit
    { wch: 16 }, // Batch
    { wch: 14 }, // Quantity
    { wch: 14 }, // Remaining
    { wch: 10 }, // Rate
    { wch: 14 }, // Stock Value
    { wch: 22 }, // Bill No
    { wch: 14 }, // Date
  ]
  const ok = exportWorkbook([
    { name: 'Main Data for MTR Fabrics', rows: fabRows, cols: fabCols },
    { name: 'Main Data for MTR - parts', rows: mtrRows, cols: mtrCols },
    { name: 'Main Data for Pcs', rows: pcsRows, cols: pcsCols },
  ], `Vista-Inventory-${todayStamp()}.xlsx`)
  if (ok) toast('Inventory exported to Excel')
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const profile = await initSidebar()
    if (!profile) return
    isAdminOrStaff = true
    isAdmin = true
    if (isAdminOrStaff) { show('add-stock-btn'); show('add-variant-btn') }

    loadExpandState()
    renderUnitToggle()
    document.getElementById('search-input').addEventListener('input', renderTree)
    document.getElementById('page-filter')?.addEventListener('change', handleMasterPageFilterChange)
    document.getElementById('cat-filter').addEventListener('change', renderTree)
    document.getElementById('status-filter').addEventListener('change', renderTree)
    document.getElementById('sort-filter')?.addEventListener('change', renderTree)

    await loadData()
    show('content')
  } catch (err) {
    console.error('Inventory init error:', err)
    toast(err.message || 'Failed to load inventory', 'error')
  } finally {
    hide('loading')
  }
}

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadData() {
  const [catRes, varRes, fgRes, pageRes, rootRes, syncRes, cutPieceRes] = await Promise.all([
    db.from('inv_categories').select('id, name, sub_group').order('name'),
    db.from('inv_variants')
      .select(`
        id, name, width_m, unit, base_rate_sqm, purchase_rate,
        inv_products(id, name, category_id, inv_categories(id, name, sub_group)),
        inv_rolls(id, batch_code, original_length, remaining_length, unit,
          purchase_rate, status, inward_date, bill_no, supplier, stock_value, notes, created_at)
      `)
      .order('name'),
    db.from('fg_stock').select('*').order('name'),
    db.from('master_pages').select('id, name, sort_order').order('sort_order').order('name'),
    db.from('master_nodes').select('id, page_id, name, normalized_name, sort_order').is('parent_id', null).order('sort_order').order('name'),
    db.from('master_inventory_sync_items').select('root_id, variant_id, is_active').eq('is_active', true),
    db.from('fabric_cut_pieces')
      .select('id, variant_id, source_roll_id, source_order_id, source_order_item_id, source_wastage_log_id, width_m, length_m, remaining_length_m, unit, status, created_from, notes, created_at, created_by')
      .order('created_at', { ascending: false }),
  ])

  if (catRes.error) { toast(catRes.error.message, 'error'); return }
  if (varRes.error) { toast(varRes.error.message, 'error'); return }
  if (fgRes.error)  console.warn('fg_stock load error (run migration 023?):', fgRes.error.message)
  if (pageRes.error) console.warn('master_pages load error (run updated migration 003?):', pageRes.error.message)
  if (rootRes.error) console.warn('master_nodes root load error:', rootRes.error.message)
  if (syncRes.error) console.warn('master_inventory_sync_items load error:', syncRes.error.message)
  if (cutPieceRes.error) console.warn('fabric_cut_pieces load error (run migration 007?):', cutPieceRes.error.message)

  allCategories = catRes.data || []
  allCutPieces = cutPieceRes.error ? [] : (cutPieceRes.data || [])
  allVariants   = (varRes.data || []).map(v => ({
    ...v,
    rolls: v.inv_rolls || [],
    cutPieces: allCutPieces.filter(p => p.variant_id === v.id),
    product: v.inv_products,
    category: v.inv_products?.inv_categories,
  }))
  allFGItems = fgRes.data || []
  masterPages = pageRes.data || []
  masterRoots = rootRes.data || []
  masterSyncItems = syncRes.error ? [] : (syncRes.data || [])
  masterRootIdByVariantId = new Map(masterSyncItems.map(item => [item.variant_id, item.root_id]))

  renderMasterFilters()
  applyInventoryDeepLink()
}

function applyInventoryDeepLink() {
  const params = new URLSearchParams(window.location.search)
  const variantId = params.get('variant')
  const q = params.get('q')
  if (q) {
    const input = document.getElementById('search-input')
    if (input) input.value = q
  }
  if (variantId) {
    const v = allVariants.find(x => x.id === variantId)
    if (v) {
      if (v.category?.id) expandedCategories.add(v.category.id)
      expandedVariants.add(v.id)
      saveExpandState()
    }
  }
  renderTree()
  if (variantId) {
    setTimeout(() => {
      const row = document.getElementById(`var-row-${variantId}`)
      if (!row) return
      row.scrollIntoView({ behavior: 'smooth', block: 'center' })
      row.style.boxShadow = '0 0 0 3px rgba(79,70,229,.22)'
      row.style.borderRadius = '12px'
      setTimeout(() => { row.style.boxShadow = ''; row.style.borderRadius = '' }, 2200)
    }, 150)
  }
}

function renderMasterFilters() {
  const pageSel = document.getElementById('page-filter')
  const masterSel = document.getElementById('cat-filter')
  if (!pageSel || !masterSel) return

  const currentPage = pageSel.value
  const currentMaster = masterSel.value
  pageSel.innerHTML = '<option value="">All Master Pages</option>' +
    [...masterPages]
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || (a.name || '').localeCompare(b.name || ''))
      .map(page => `<option value="${page.id}" ${page.id === currentPage ? 'selected' : ''}>${esc(page.name)}</option>`)
      .join('')

  const rootOptions = [...masterRoots]
    .filter(root => !pageSel.value || root.page_id === pageSel.value)
    .sort((a, b) => masterRootCompare(a, b, a.name, b.name))
  const hasCurrentMaster = rootOptions.some(root => root.id === currentMaster)
  masterSel.innerHTML = '<option value="">All Masters</option>' +
    rootOptions
      .map(root => `<option value="${root.id}" ${root.id === currentMaster && hasCurrentMaster ? 'selected' : ''}>${esc(root.name)}</option>`)
      .join('')
  if (currentMaster && !hasCurrentMaster) masterSel.value = ''
}

function handleMasterPageFilterChange() {
  renderMasterFilters()
  renderTree()
}

function selectedInventoryPageId() {
  return document.getElementById('page-filter')?.value || ''
}

function selectedInventoryRootId() {
  return document.getElementById('cat-filter')?.value || ''
}

function inventoryMatchesMasterFilters(variantOrCategory) {
  const pageId = selectedInventoryPageId()
  const rootId = selectedInventoryRootId()
  if (!pageId && !rootId) return true
  const root = variantOrCategory?.product || variantOrCategory?.category
    ? masterRootForVariant(variantOrCategory)
    : masterRootForCategory(variantOrCategory)
  if (rootId) return root?.id === rootId
  if (pageId) return root?.page_id === pageId
  return true
}

function normInventoryName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function stockQty(v, status = 'in_stock') {
  return v.rolls
    .filter(r => !status || r.status === status)
    .reduce((sum, r) => sum + Number(r.remaining_length || 0), 0)
}

function stockValue(v, status = 'in_stock') {
  return v.rolls
    .filter(r => !status || r.status === status)
    .reduce((sum, r) => sum + (Number(r.stock_value || 0) || Number(r.remaining_length || 0) * Number(r.purchase_rate || v.purchase_rate || 0)), 0)
}

function cutPiecesForVariant(variantId, status = null) {
  return allCutPieces.filter(p => p.variant_id === variantId && (!status || p.status === status))
}

function cutPiecesForRoll(rollId, status = null) {
  return allCutPieces.filter(p => p.source_roll_id === rollId && (!status || p.status === status))
}

function cutPieceArea(piece) {
  return Number(piece.width_m || 0) * Number(piece.remaining_length_m || 0)
}

function masterRootForCategory(category) {
  const catName = normInventoryName(category?.name || '')
  if (!catName) return null
  return masterRoots.find(root => {
    const rootName = normInventoryName(root.name)
    return catName === rootName || catName.startsWith(`${rootName} `) || catName.includes(rootName)
  }) || null
}

function masterRootById(rootId) {
  return masterRoots.find(root => root.id === rootId) || null
}

function masterRootForVariant(variant) {
  return masterRootById(masterRootIdByVariantId.get(variant?.id)) || masterRootForCategory(variant?.category)
}

function masterRootForSection(section) {
  const linkedVariantRoot = (section?.variants || [])
    .map(masterRootForVariant)
    .find(Boolean)
  return linkedVariantRoot || masterRootForCategory(section?.cat)
}

function masterPageSortForRoot(root) {
  if (!root) return 999999
  const page = masterPages.find(item => item.id === root.page_id)
  if (!root.page_id) {
    const maxPageSort = masterPages.reduce((max, page) => Math.max(max, Number(page.sort_order || 0)), 0)
    return maxPageSort + 1000
  }
  return Number(page?.sort_order ?? 999999)
}

function masterRootCompare(rootA, rootB, fallbackA = '', fallbackB = '') {
  return masterPageSortForRoot(rootA) - masterPageSortForRoot(rootB) ||
    Number(rootA?.sort_order ?? 9999) - Number(rootB?.sort_order ?? 9999) ||
    (rootA?.name || fallbackA || '').localeCompare(rootB?.name || fallbackB || '')
}

function categoryCompare(a, b) {
  const rootA = masterRootForCategory(a)
  const rootB = masterRootForCategory(b)
  return masterRootCompare(rootA, rootB, a?.name || '', b?.name || '') ||
    (a?.name || '').localeCompare(b?.name || '')
}

function variantCompare(a, b, sortMode = 'structure', status = 'in_stock') {
  if (sortMode === 'stock') return stockQty(b, status) - stockQty(a, status) || variantCompare(a, b, 'name', status)
  if (sortMode === 'value') return stockValue(b, status) - stockValue(a, status) || variantCompare(a, b, 'name', status)
  const rootA = masterRootForVariant(a)
  const rootB = masterRootForVariant(b)
  const rootOrder = masterRootCompare(rootA, rootB, a.category?.name || '', b.category?.name || '')
  if (rootOrder) return rootOrder
  return (a.product?.name || '').localeCompare(b.product?.name || '') ||
    (a.name || '').localeCompare(b.name || '') ||
    Number(a.width_m || 0) - Number(b.width_m || 0)
}

function inventorySectionCompare(a, b, sortMode = 'structure') {
  const rootA = masterRootForSection(a)
  const rootB = masterRootForSection(b)
  const rootOrder = masterRootCompare(rootA, rootB, a.cat?.name || '', b.cat?.name || '')
  if (rootOrder) return rootOrder
  if (sortMode === 'name') return (a.cat?.name || '').localeCompare(b.cat?.name || '')
  return categoryCompare(a.cat, b.cat) ||
    (a.cat?.name || '').localeCompare(b.cat?.name || '')
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function isFabric(v) { return v.category?.sub_group === 'Fabric' }

function isFinishedGoodsCategory(category) {
  return ['fg', 'finished goods'].includes(String(category?.sub_group || '').toLowerCase())
}

function categoryMatchesSubgroup() {
  return true
}

function variantAreaSqm(v) {
  const rollW = v.width_m || 0
  const rollArea = v.rolls.filter(r => r.status === 'in_stock')
    .reduce((s, r) => s + Number(r.remaining_length || 0) * rollW, 0)
  const pieceArea = cutPiecesForVariant(v.id, 'available').reduce((s, p) => s + cutPieceArea(p), 0)
  return rollArea + pieceArea
}

function renderStats(filteredVariants, filteredFGItems, subgroupF) {
  const variants = filteredVariants ?? allVariants
  const fgItems  = filteredFGItems  ?? allFGItems
  const isFGOnly = subgroupF === 'FG'

  // Fabric: total in-stock sqm
  const fabricSqm = variants
    .filter(isFabric)
    .reduce((s, v) => s + variantAreaSqm(v), 0)

  // Components: sum of in-stock quantities for non-fabric variants
  const componentUnits = variants
    .filter(v => !isFabric(v))
    .flatMap(v => v.rolls.filter(r => r.status === 'in_stock'))
    .reduce((s, r) => s + Number(r.remaining_length || 0), 0)

  // FG: total units across all fg items
  const fgTotalUnits = fgItems.reduce((s, x) => s + Number(x.quantity || 0), 0)
  const fgItemCount  = fgItems.length

  // Total stock value: variants + fg items
  const variantValue = variants
    .flatMap(v => v.rolls.filter(r => r.status === 'in_stock'))
    .reduce((s, r) => {
      const v = Number(r.stock_value || 0) || (Number(r.remaining_length || 0) * Number(r.purchase_rate || 0))
      return s + v
    }, 0)
  const fgValue = fgItems.reduce((s, x) => s + (Number(x.purchase_cost || 0) * Number(x.quantity || 0)), 0)
  const totalValue = variantValue + fgValue

  // Low stock: variants below threshold + FG items with qty < 3
  const lowVariants = variants.filter(v => {
    const rem = v.rolls.filter(r => r.status === 'in_stock')
      .reduce((s, r) => s + Number(r.remaining_length || 0), 0)
    const threshold = isFabric(v) ? 37.5 : (v.unit === 'm' ? 10 : 10)
    return rem > 0 && rem < threshold
  })
  const lowFG = fgItems.filter(x => Number(x.quantity) > 0 && Number(x.quantity) < 3)
  const lowCount = lowVariants.length + lowFG.length

  const fmt = n => n % 1 === 0 ? n.toLocaleString('en-IN') : n.toFixed(1)

  // ── Card 1: Fabric SQM  —or—  FG item count when FG-only ──────────────────
  const card1 = isFGOnly ? `
    <div class="stat-card">
      <div>
        <div class="stat-label">Finished Good Items</div>
        <div class="stat-value">${fgItemCount}</div>
        <div class="text-xs text-muted" style="margin-top:2px;">distinct SKUs</div>
      </div>
      <div class="stat-icon icon-green"><i class="fa-solid fa-tag"></i></div>
    </div>` : `
    <div class="stat-card">
      <div>
        <div class="stat-label">Stock Area</div>
        <div class="stat-value">${fabricSqm.toFixed(0)}</div>
        <div class="text-xs text-muted" style="margin-top:2px;">sq metres in stock</div>
      </div>
      <div class="stat-icon icon-green"><i class="fa-solid fa-ruler-combined"></i></div>
    </div>`

  // ── Card 2: Component units  —or—  FG total units when FG-only ────────────
  const card2 = isFGOnly ? `
    <div class="stat-card">
      <div>
        <div class="stat-label">Total Units</div>
        <div class="stat-value">${fmt(fgTotalUnits)}</div>
        <div class="text-xs text-muted" style="margin-top:2px;">finished goods in stock</div>
      </div>
      <div class="stat-icon icon-indigo"><i class="fa-solid fa-boxes-stacked"></i></div>
    </div>` : `
    <div class="stat-card">
      <div>
        <div class="stat-label">Stock Units</div>
        <div class="stat-value">${fmt(componentUnits)}</div>
        <div class="text-xs text-muted" style="margin-top:2px;">non-area stock in hand</div>
      </div>
      <div class="stat-icon icon-indigo"><i class="fa-solid fa-boxes-stacked"></i></div>
    </div>`

  html('inv-stats', `
    ${card1}
    ${card2}
    <div class="stat-card">
      <div>
        <div class="stat-label">Total Value</div>
        <div class="stat-value" style="font-size:1.1rem;">₹${totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
        <div class="text-xs text-muted" style="margin-top:2px;">of visible inventory</div>
      </div>
      <div class="stat-icon icon-blue"><i class="fa-solid fa-indian-rupee-sign"></i></div>
    </div>
    <div class="stat-card">
      <div>
        <div class="stat-label">Low Stock</div>
        <div class="stat-value" style="color:${lowCount ? '#f59e0b' : 'inherit'}">${lowCount}</div>
        <div class="text-xs text-muted" style="margin-top:2px;">items below threshold</div>
      </div>
      <div class="stat-icon icon-amber"><i class="fa-solid fa-triangle-exclamation"></i></div>
    </div>
  `)
}

// ── Unit toggle ───────────────────────────────────────────────────────────────
function renderUnitToggle() {
  html('unit-toggle', ROLL_UNITS.map(u =>
    `<button class="unit-btn ${u === currentUnit ? 'active' : ''}" onclick="switchUnit('${u}')">${u.toUpperCase()}</button>`
  ).join(''))
}

function switchUnit(u) {
  currentUnit = u
  setPreferredUnit(u)
  renderUnitToggle()
  renderTree()
}

// ── Tree rendering ────────────────────────────────────────────────────────────
function renderTree() {
  const query     = val('search-input').trim()
  const statusF   = document.getElementById('status-filter').value
  const subgroupF = ''
  const sortMode  = document.getElementById('sort-filter')?.value || 'structure'

  const showFG      = false
  const showVariants = true

  // ── Filter variants ──
  let variants = []
  let emptyCategories = []
  // statsVariants = category/subgroup/search filtered but NOT status filtered
  // (so stats always show totals for the type/category selected, not just "in stock" items)
  let statsVariants = []
  if (showVariants) {
    const shouldShowEmptyCategories = !subgroupF && !statusF
    emptyCategories = shouldShowEmptyCategories
      ? allCategories.filter(c => {
          if (!categoryMatchesSubgroup(c, subgroupF)) return false
          if (!inventoryMatchesMasterFilters(c)) return false
          if (query && !inventoryTextMatches(`${c.name} ${c.sub_group || ''}`, query)) return false
          return true
        })
      : []

    statsVariants = allVariants.filter(v => {
      if (!categoryMatchesSubgroup(v.category, subgroupF)) return false
      if (!inventoryMatchesMasterFilters(v)) return false
      return true
    })
    if (query) {
      statsVariants = inventorySearch(statsVariants, query, variantSearchText)
    }
  }

  if (showVariants) {
    variants = statsVariants.filter(v => {
      const rolls = statusF ? v.rolls.filter(r => r.status === statusF) : v.rolls
      const pieceStatus = statusF === 'in_stock' ? 'available' : (statusF === 'depleted' ? 'depleted' : null)
      const pieces = statusF ? cutPiecesForVariant(v.id, pieceStatus) : cutPiecesForVariant(v.id)
      return !statusF || rolls.length > 0 || pieces.length > 0
    })
  }

  // ── Filter FG items ──
  let fgItems = []
  if (showFG) {
    fgItems = allFGItems
    if (query) {
      fgItems = fgItems.filter(x =>
        inventoryTextMatches(`${x.name || ''} ${x.code || ''} ${x.description || ''} ${x.bill_no || ''} ${x.supplier || ''} ${x.notes || ''} ${x.unit || ''}`, query)
      )
    }
  }

  // Stats use category-filtered variants (ignoring status filter) so numbers are always meaningful
  renderStats(statsVariants, fgItems, subgroupF)

  if (!variants.length && !fgItems.length && !emptyCategories.length) {
    html('inv-tree', `<div class="empty-state" style="padding:40px;text-align:center;color:#9ca3af;">No inventory items match your filters.</div>`)
    return
  }

  // ── Build variant category sections ──
  let treeHTML = ''
  if (showVariants) {
    const groups = new Map()
    for (const c of emptyCategories) {
      groups.set(c.id, { cat: c, variants: [] })
    }
    for (const v of variants) {
      const key = v.category?.id || 'unknown'
      if (!groups.has(key)) groups.set(key, { cat: v.category, variants: [] })
      groups.get(key).variants.push(v)
    }
    const sections = [...groups.values()].sort((a, b) => inventorySectionCompare(a, b, sortMode))
    // When a search query is active, force all matching categories open so results are visible
    if (query) {
      sections.forEach(g => expandedCategories.add(g.cat?.id || 'unknown'))
      variants.forEach(v => expandedVariants.add(v.id))
      saveExpandState()
    }
    treeHTML += sections.map(g => ({
      ...g,
      variants: [...g.variants].sort((a, b) => variantCompare(a, b, sortMode, statusF)),
    })).map(g => renderCategorySection(g, statusF)).join('')
  }

  // ── Append FG section at bottom ──
  if (fgItems.length) {
    if (query) expandedCategories.add(FG_CAT_ID)
    treeHTML += renderFGSection(fgItems)
  }

  html('inv-tree', treeHTML)
}

function renderCategorySection({ cat, variants }, statusF) {
  const catId = cat?.id || 'unknown'
  const catName = cat?.name || 'Uncategorized'
  const isOpen = expandedCategories.has(catId)

  const allInStockRolls = variants.flatMap(v => v.rolls.filter(r => r.status === 'in_stock'))
  const totalBatches    = variants.reduce((s, v) => s + v.rolls.length, 0)
  const inStockBatches  = allInStockRolls.length

  const totalValue = allInStockRolls.reduce((s, r) => {
    const val = Number(r.stock_value || 0) || (Number(r.remaining_length || 0) * Number(r.purchase_rate || 0))
    return s + val
  }, 0)

  const isFabCat = variants.some(v => isFabric(v))
  let summaryChips = ''
  let catSummary   = `${variants.length} variant${variants.length !== 1 ? 's' : ''} &bull; ${inStockBatches}/${totalBatches} batches in stock`

  if (isFabCat) {
    const totalSqm    = variants.filter(isFabric).reduce((s, v) => s + variantAreaSqm(v), 0)
    const totalMeters = variants.filter(isFabric).flatMap(v => v.rolls.filter(r => r.status === 'in_stock'))
      .reduce((s, r) => s + Number(r.remaining_length || 0), 0)
    summaryChips = `
      <span style="background:#ede9fe;color:#7c3aed;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;">${totalSqm.toFixed(0)} sqm</span>
      <span style="background:#dbeafe;color:#1d4ed8;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;">${totalMeters.toFixed(1)} m</span>`
  } else {
    const totalQty = allInStockRolls.reduce((s, r) => s + Number(r.remaining_length || 0), 0)
    const qtyUnit  = variants.find(v => v.unit)?.unit || 'pcs'
    summaryChips = `
      <span style="background:#dbeafe;color:#1d4ed8;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;">${totalQty % 1 === 0 ? totalQty.toFixed(0) : totalQty.toFixed(2)} ${esc(qtyUnit)}</span>`
  }

  summaryChips += `
      <span style="background:#dcfce7;color:#166534;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;">₹${Number(totalValue).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>`

  return `
  <div class="inv-category-section" id="cat-sec-${catId}">
    <div class="inv-category-header" onclick="toggleCategory('${catId}')">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <i class="fa-solid fa-chevron-right inv-chevron ${isOpen ? 'rotated' : ''}" id="chevron-cat-${catId}"></i>
        <span class="fw-600" style="font-size:15px;">${esc(catName)}</span>
        ${summaryChips}
        <span class="text-xs text-muted">${catSummary}</span>
      </div>
      ${isAdmin ? `
        <button class="btn btn-ghost btn-sm" style="color:#ef4444;margin-left:auto;" onclick="event.stopPropagation();deleteCategory('${catId}','${safeArg(catName)}')" title="Delete category">
          <i class="fa-solid fa-trash"></i>
        </button>
      ` : ''}
    </div>
    <div class="inv-category-body ${isOpen ? '' : 'd-none'}" id="cat-body-${catId}">
      ${variants.length
        ? variants.map(v => renderVariantRow(v, statusF)).join('')
        : '<div class="text-xs text-muted" style="padding:12px 40px;">No variants added yet.</div>'}
    </div>
  </div>`
}

function renderVariantRow(v, statusF) {
  const filteredRolls = statusF ? v.rolls.filter(r => r.status === statusF) : v.rolls
  const inStock = v.rolls.filter(r => r.status === 'in_stock')
  const totalRem = inStock.reduce((s, r) => s + Number(r.remaining_length || 0), 0)
  const availablePieces = cutPiecesForVariant(v.id, 'available')
  const pieceAreaSqm = availablePieces.reduce((s, p) => s + cutPieceArea(p), 0)
  const isExpanded = expandedVariants.has(v.id)
  const isFab = isFabric(v)
  const widthDisp = v.width_m ? `${v.width_m}m` : '—'
  // Fabric: low stock if < 0.5 rolls (37.5m); track/parts: < 5m or < 10 pcs
  const lowStockThreshold = isFab ? 37.5 : (v.unit === 'm' ? 5 : 10)
  const lowStock = totalRem > 0 && totalRem < lowStockThreshold
  const batchWord = isFab ? 'roll' : 'batch'
  const areaSqm = isFab && v.width_m ? (totalRem * v.width_m) + pieceAreaSqm : null

  return `
  <div class="inv-variant-row" id="var-row-${v.id}">
    <div class="inv-variant-header">
      <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;cursor:pointer;" onclick="toggleVariant('${v.id}')">
        <i class="fa-solid fa-chevron-right inv-chevron ${isExpanded ? 'rotated' : ''}" id="chevron-${v.id}"></i>
        <div style="min-width:0;">
          <div class="fw-600" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(v.name)}</div>
          <div class="text-xs text-muted">${esc(v.product?.name || '')} &bull; ${isFab ? `${filteredRolls.length} roll${filteredRolls.length !== 1 ? 's' : ''}${availablePieces.length ? ` &bull; ${availablePieces.length} cut piece${availablePieces.length !== 1 ? 's' : ''}` : ''}` : `${filteredRolls.length} ${batchWord}${filteredRolls.length !== 1 ? 's' : ''}`}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:16px;flex-shrink:0;">
        <div class="text-xs text-muted" style="text-align:right;">
          ${isFab && v.width_m ? `<div>Width: <strong>${widthDisp}</strong></div>` : ''}
          ${v.base_rate_sqm ? `<div>Rate: <strong>₹${Number(v.base_rate_sqm).toFixed(2)}/sqm</strong></div>` : (v.purchase_rate ? `<div>Rate: <strong>₹${Number(v.purchase_rate).toFixed(2)}/${v.unit}</strong></div>` : '')}
          <div>Remaining: <strong style="color:${lowStock ? '#f59e0b' : '#059669'}">${isFab ? `${totalRem.toFixed(1)} m rolls` : fmtQty(totalRem, v.unit)}</strong>${areaSqm !== null ? ` <span style="color:#6b7280;">= ${areaSqm.toFixed(1)} sqm</span>` : ''}</div>
          ${isFab && pieceAreaSqm > 0 ? `<div>Cut pieces: <strong>${pieceAreaSqm.toFixed(2)} sqm</strong></div>` : ''}
        </div>
        <div style="display:flex;gap:4px;">
          ${isAdminOrStaff ? `
            <button class="btn btn-ghost btn-sm" onclick="openVariantHistoryModal('${v.id}')" title="View movement history">
              <i class="fa-solid fa-clock-rotate-left"></i>
            </button>
          ` : ''}
          ${isAdmin ? `
            <button class="btn btn-ghost btn-sm" style="color:#ef4444" onclick="deleteVariantStock('${v.id}','${safeArg(v.name)}')" title="Delete stock item">
              <i class="fa-solid fa-trash"></i>
            </button>
          ` : ''}
        </div>
      </div>
    </div>
    <div class="inv-rolls-body ${isExpanded ? '' : 'd-none'}" id="rolls-body-${v.id}">
      ${renderRollsTable(filteredRolls, v.id, statusF)}
    </div>
  </div>`
}

function renderRollsTable(rolls, variantId, statusF = '') {
  const v = allVariants.find(x => x.id === variantId)
  const pieceStatus = statusF === 'in_stock' ? 'available' : (statusF === 'depleted' ? 'depleted' : null)
  const pieces = cutPiecesForVariant(variantId, pieceStatus)
  if (!rolls.length && !pieces.length) {
    return `<div class="text-xs text-muted" style="padding:12px 40px;">No batches or cut pieces match current filter.</div>`
  }
  const fab = isFabric(v)
  const rows = [
    ...rolls.flatMap(r => [renderRollRow(r, variantId), ...cutPiecesForRoll(r.id, pieceStatus).map(p => renderCutPieceRow(p, variantId))]),
    ...pieces.filter(p => !p.source_roll_id || !rolls.some(r => r.id === p.source_roll_id)).map(p => renderCutPieceRow(p, variantId)),
  ].join('')
  return `
  <div class="table-wrap" style="margin:0 0 8px 40px;">
    <table style="font-size:13px;">
      <thead><tr>
        <th>Batch Code</th>
        <th>Inward Date</th>
        <th>Bill / Supplier</th>
        <th>Original</th>
        <th>Remaining${fab && v?.width_m ? ' (+ Area)' : ''}</th>
        <th>Rate</th>
        <th>Status</th>
        ${(isAdminOrStaff || isAdmin) ? '<th style="text-align:right;">Actions</th>' : ''}
      </tr></thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>`
}

function renderRollRow(r, variantId) {
  const v = allVariants.find(x => x.id === variantId)
  const vUnit = v?.unit || r.unit || 'm'
  const isDepleted = r.status === 'depleted'
  const origLen = Number(r.original_length || 0)
  const remLen  = Number(r.remaining_length || 0)
  // For fabric show rolls; for others show raw quantity in current display unit
  const origDisp = isFabric(v)
    ? `${origLen.toFixed(1)} m`
    : fmtQty(r.original_length, vUnit)
  const remDisp = fmtQty(r.remaining_length, vUnit)
  const pct = r.original_length > 0
    ? Math.min(100, (Number(r.remaining_length) / Number(r.original_length)) * 100)
    : 0
  let barColor = pct > 50 ? 'fill-green' : pct > 20 ? 'fill-amber' : 'fill-red'
  const encodedBatch = encodeURIComponent(String(r.batch_code || 'this stock row'))

  return `<tr>
    <td class="fw-600" style="font-family:monospace;">${esc(r.batch_code)}</td>
    <td class="text-muted">${r.inward_date || '—'}</td>
    <td class="text-muted text-xs">
      ${r.bill_no ? `<div>${esc(r.bill_no)}</div>` : ''}
      ${r.supplier ? `<div>${esc(r.supplier)}</div>` : ''}
      ${!r.bill_no && !r.supplier ? '—' : ''}
    </td>
    <td class="text-muted">${origDisp}</td>
    <td>
      <div style="display:flex;align-items:center;gap:8px;">
        <div>
          ${isFabric(v)
            ? `<span class="fw-600">${Number(r.remaining_length || 0).toFixed(2)} m</span>
               ${v?.width_m ? `<div class="text-xs text-muted">× ${v.width_m}m wide = ${(Number(r.remaining_length || 0) * v.width_m).toFixed(2)} sqm</div>` : ''}`
            : `<span class="fw-600">${remDisp}</span>`}
        </div>
        <div class="progress" style="min-width:48px;">
          <div class="progress-fill ${barColor}" style="width:${pct.toFixed(0)}%"></div>
        </div>
      </div>
    </td>
    <td class="text-muted">${r.purchase_rate ? fmt$(Number(r.purchase_rate)) + '/' + (r.unit || 'm') : '—'}</td>
    <td><span class="badge ${isDepleted ? 'badge-exhausted' : 'badge-active'}">${isDepleted ? 'Depleted' : 'In Stock'}</span></td>
    ${(isAdminOrStaff || isAdmin) ? `
      <td style="text-align:right;white-space:nowrap;">
        <div style="display:flex;justify-content:flex-end;gap:4px;">
          ${isAdminOrStaff ? `
            <button class="btn btn-ghost btn-sm" onclick="openEditRollModal('${r.id}','${variantId}')" title="Edit stock row">
              <i class="fa-solid fa-pen"></i>
            </button>
          ` : ''}
          ${isAdmin ? `
            <button class="btn btn-ghost btn-sm" style="color:#ef4444" onclick="deleteRoll('${r.id}','${encodedBatch}','${variantId}')" title="Delete stock row">
              <i class="fa-solid fa-trash"></i>
            </button>
          ` : ''}
        </div>
      </td>
    ` : ''}
  </tr>`
}

function renderCutPieceRow(piece, variantId) {
  const v = allVariants.find(x => x.id === variantId)
  const remaining = Number(piece.remaining_length_m || 0)
  const area = cutPieceArea(piece)
  const statusClass = piece.status === 'available' ? 'badge-active' : 'badge-exhausted'
  const sourceOrder = piece.source_order_id ? piece.source_order_id.slice(0, 8).toUpperCase() : null
  return `<tr style="background:#f8fafc;">
    <td class="fw-600" style="font-family:monospace;color:#475569;">
      <i class="fa-solid fa-scissors" style="margin-right:6px;color:#f59e0b;"></i>Cut Piece
    </td>
    <td class="text-muted">${piece.created_at ? fmtDate(piece.created_at) : '-'}</td>
    <td class="text-muted text-xs">
      ${sourceOrder ? `<div>From order ${esc(sourceOrder)}</div>` : '<div>Generated piece</div>'}
      ${piece.source_roll_id ? `<div>Source roll linked</div>` : ''}
    </td>
    <td class="text-muted">${Number(piece.width_m || 0).toFixed(3)}m x ${Number(piece.length_m || 0).toFixed(3)}m</td>
    <td>
      <span class="fw-600">${Number(piece.width_m || 0).toFixed(3)}m x ${remaining.toFixed(3)}m</span>
      <div class="text-xs text-muted">${area.toFixed(3)} sqm available</div>
    </td>
    <td class="text-muted">Generated</td>
    <td><span class="badge ${statusClass}">${esc(piece.status || 'available')}</span></td>
    ${(isAdminOrStaff || isAdmin) ? '<td></td>' : ''}
  </tr>`
}

// ── Collapse / expand ─────────────────────────────────────────────────────────
function toggleCategory(catId) {
  const body = document.getElementById(`cat-body-${catId}`)
  const icon = document.getElementById(`chevron-cat-${catId}`)
  if (!body) return
  if (expandedCategories.has(catId)) {
    expandedCategories.delete(catId)
    body.classList.add('d-none')
    icon?.classList.remove('rotated')
  } else {
    expandedCategories.add(catId)
    body.classList.remove('d-none')
    icon?.classList.add('rotated')
  }
  saveExpandState()
}

function toggleVariant(varId) {
  const body    = document.getElementById(`rolls-body-${varId}`)
  const chevron = document.getElementById(`chevron-${varId}`)
  if (!body) return
  if (expandedVariants.has(varId)) {
    expandedVariants.delete(varId)
    body.classList.add('d-none')
    chevron?.classList.remove('rotated')
  } else {
    expandedVariants.add(varId)
    body.classList.remove('d-none')
    chevron?.classList.add('rotated')
  }
  saveExpandState()
}

function expandAll() {
  allCategories.forEach(c => expandedCategories.add(c.id))
  allVariants.forEach(v => expandedVariants.add(v.id))
  saveExpandState()
  renderTree()
}

function collapseAll() {
  expandedCategories.clear()
  expandedVariants.clear()
  saveExpandState()
  renderTree()
}

async function deleteCategory(categoryId, encodedName) {
  const name = decodeURIComponent(encodedName || 'this category')
  const categoryVariants = allVariants.filter(v => v.category?.id === categoryId)
  const variantCount = categoryVariants.length
  const rollCount = categoryVariants
    .reduce((sum, v) => sum + (v.rolls?.length || 0), 0)
  const movementCount = await countMovementsForVariants(categoryVariants.map(v => v.id))

  const message = rollCount > 0
    ? `Delete stock category "${name}"?\n\nThis category contains ${variantCount} variant${variantCount !== 1 ? 's' : ''}, ${rollCount} stock row${rollCount !== 1 ? 's' : ''}, and ${movementCount} report/history movement${movementCount !== 1 ? 's' : ''}. Deleting it will remove them from inventory, reports, and movement history.`
    : `Delete category "${name}"?\n\nThis category contains ${variantCount} variant${variantCount !== 1 ? 's' : ''}. Deleting it will also delete its products and variants.`
  if (!confirm(message)) return

  const cleanup = await deleteInventoryLedgerForVariants(categoryVariants.map(v => v.id))
  if (cleanup) { toast(cleanup, 'error'); return }

  const { error } = await db.from('inv_categories').delete().eq('id', categoryId)
  if (error) {
    toast(error.message, 'error')
    return
  }
  expandedCategories.delete(categoryId)
  categoryVariants.forEach(v => expandedVariants.delete(v.id))
  await logActivity('delete', 'category', categoryId, name, { variants: variantCount, stock_rows: rollCount, movements: movementCount })
  toast('Stock category deleted and report history removed')
  await loadData()
}

// ── Add Stock — master-based variant restock ─────
let restockType  = 'stock'
let restockItems = []
const rsSelVar   = {}         // {rowId: variant obj | null}
const rsVarDropOpen = {}      // {rowId: bool}
const rsQtyUnit  = {}         // {rowId: 'm' | 'ft'} — unit for fabric qty input

function openRestockModal(preselectedVariantId) {
  const preV = preselectedVariantId ? allVariants.find(v => v.id === preselectedVariantId) : null
  restockType = 'stock'
  restockItems = [{ id: Date.now() }]
  Object.keys(rsSelVar).forEach(k => delete rsSelVar[k])
  Object.keys(rsVarDropOpen).forEach(k => delete rsVarDropOpen[k])
  Object.keys(rsQtyUnit).forEach(k => delete rsQtyUnit[k])

  openModal('Add Stock', `
    <div id="restock-alert" class="alert alert-error"></div>

    <!-- Master inventory section -->
    <div id="rs-stock-section">
      <div class="form-row cols-2" style="margin-bottom:4px;">
        <div class="form-group">
          <label>Bill / Invoice No.</label>
          <input id="rs-bill" placeholder="e.g. INV-2024-001">
        </div>
        <div class="form-group">
          <label>Supplier</label>
          <input id="rs-supplier" placeholder="e.g. Fabric Mills Ltd." value="Vista Furnishing Limited">
        </div>
      </div>
      <div class="form-row cols-2" style="margin-bottom:12px;">
        <div class="form-group">
          <label>Inward Date</label>
          <input id="rs-date" type="date" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div class="form-group">
          <label>Notes</label>
          <input id="rs-notes" placeholder="Optional notes for all items">
        </div>
      </div>
      <div style="border-top:1px solid var(--border);margin-bottom:12px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span class="fw-600" style="font-size:13px;">Items</span>
        <button class="btn btn-ghost btn-sm" onclick="addRestockRow()">
          <i class="fa-solid fa-plus"></i> Add Another Item
        </button>
      </div>
      <div id="rs-items-wrap"></div>
    </div>

    <!-- Finished Goods section -->
    <div id="rs-fg-section" style="display:none;">
      <div id="fg-alert" class="alert alert-error"></div>
      <div class="form-row cols-2">
        <div class="form-group">
          <label>Item Code <span style="color:#ef4444">*</span></label>
          <input id="fg-code" placeholder="e.g. FG-001" style="text-transform:uppercase;">
        </div>
        <div class="form-group">
          <label>Name <span style="color:#ef4444">*</span></label>
          <input id="fg-name" placeholder="e.g. Motorised Roller Blind 120cm">
        </div>
      </div>
      <div class="form-group">
        <label>Description</label>
        <input id="fg-desc" placeholder="Optional — colour, size, spec…">
      </div>
      <div class="form-row cols-2">
        <div class="form-group">
          <label>Purchase Date</label>
          <input id="fg-date" type="date" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div class="form-group">
          <label>Purchase Cost (₹)</label>
          <input id="fg-cost" type="number" step="0.01" min="0" placeholder="0.00">
        </div>
      </div>
      <div class="form-row cols-2">
        <div class="form-group">
          <label>Quantity <span style="color:#ef4444">*</span></label>
          <input id="fg-qty" type="number" step="0.001" min="0" placeholder="0">
        </div>
        <div class="form-group">
          <label>Unit</label>
          <select id="fg-unit">
            ${['pcs','set','nos','box','m','sqm'].map(u => `<option value="${u}">${u}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <input id="fg-notes" placeholder="Optional notes">
      </div>
    </div>

    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="rs-save-btn" onclick="saveRestockOrFG()">
        <i class="fa-solid fa-plus"></i> Add Stock
      </button>
    </div>
  `, true)

  renderRestockRows(preselectedVariantId)

  // Close var dropdowns on outside click
  document.addEventListener('click', onRsOutsideClick)
}

function onRsOutsideClick(e) {
  if (!e.target.closest('[id^="rs-var-select-"]') && !e.target.closest('[id^="rs-var-drop-"]')) {
    Object.keys(rsVarDropOpen).forEach(k => closeRsVarDrop(k))
  }
}

function setRestockType(type) {
  restockType = type
  ;['fabric','parts','fg'].forEach(t => {
    document.getElementById(`rst-${t}`)?.classList.toggle('active', t === type)
  })
  const stockSec = document.getElementById('rs-stock-section')
  const fgSec    = document.getElementById('rs-fg-section')
  const saveBtn  = document.getElementById('rs-save-btn')
  if (type === 'fg') {
    if (stockSec) stockSec.style.display = 'none'
    if (fgSec)    fgSec.style.display = ''
    if (saveBtn)  saveBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Item'
  } else {
    if (stockSec) stockSec.style.display = ''
    if (fgSec)    fgSec.style.display = 'none'
    if (saveBtn)  saveBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Stock'
    // Re-render rows filtered for new type
    restockItems = [{ id: Date.now() }]
    Object.keys(rsSelVar).forEach(k => delete rsSelVar[k])
    Object.keys(rsVarDropOpen).forEach(k => delete rsVarDropOpen[k])
    Object.keys(rsQtyUnit).forEach(k => delete rsQtyUnit[k])
    renderRestockRows(null)
  }
}

// ── Variant searchable dropdown per row ───────────────────────────────────────

function getVarsForCurrentType() {
  return allVariants
}

function renderRsVarList(rowId, query) {
  const listEl = document.getElementById(`rs-var-list-${rowId}`)
  if (!listEl) return
  const vars = getVarsForCurrentType()
  const filtered = query
    ? inventorySearch(vars, query, variantSearchText)
    : vars

  if (!filtered.length) {
    listEl.innerHTML = `<div style="padding:12px 14px;font-size:13px;color:#9ca3af;">No variants found</div>`
    return
  }

  // Group by category for clarity
  const grouped = new Map()
  for (const v of filtered) {
    const catName = v.category?.name || 'Other'
    if (!grouped.has(catName)) grouped.set(catName, [])
    grouped.get(catName).push(v)
  }

  let h = ''
  for (const [catName, items] of grouped) {
    h += `<div style="padding:5px 12px 3px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;background:#f9fafb;border-bottom:1px solid #f3f4f6;">${esc(catName)}</div>`
    for (const v of items) {
      const stockRolls = v.rolls.filter(r => r.status === 'in_stock')
      const stockQty   = stockRolls.reduce((s, r) => s + Number(r.remaining_length || 0), 0)
      const stockStr   = stockQty > 0 ? `${stockQty % 1 === 0 ? stockQty : stockQty.toFixed(1)} ${v.unit} in stock` : '<span style="color:#ef4444">no stock</span>'
      const rateStr    = v.purchase_rate ? ` · ₹${Number(v.purchase_rate).toFixed(0)}/${v.unit}` : ''
      h += `<div onmousedown="selectRsVar(${rowId},'${v.id}')"
                 style="padding:9px 14px;cursor:pointer;border-bottom:1px solid #f9fafb;font-size:13px;">
        <div class="fw-600">${esc(v.name)}</div>
        <div class="text-xs text-muted">${stockStr}${rateStr}</div>
      </div>`
    }
  }
  listEl.innerHTML = h
}

function openRsVarDrop(rowId) {
  Object.keys(rsVarDropOpen).forEach(k => { if (k != rowId) closeRsVarDrop(k) })
  const drop = document.getElementById(`rs-var-drop-${rowId}`)
  if (drop) drop.style.display = 'flex'
  document.getElementById(`rs-var-search-${rowId}`)?.focus()
  rsVarDropOpen[rowId] = true
  renderRsVarList(rowId, '')
}

function closeRsVarDrop(rowId) {
  const drop = document.getElementById(`rs-var-drop-${rowId}`)
  if (drop) drop.style.display = 'none'
  rsVarDropOpen[rowId] = false
}

function toggleRsVarDrop(rowId) {
  if (rsVarDropOpen[rowId]) closeRsVarDrop(rowId); else openRsVarDrop(rowId)
}

function selectRsVar(rowId, varId) {
  const v = allVariants.find(x => x.id === varId)
  if (!v) return
  rsSelVar[rowId] = v
  closeRsVarDrop(rowId)

  const trigger = document.getElementById(`rs-var-trigger-${rowId}`)
  if (trigger) {
    trigger.innerHTML = `
      <span class="fw-600" style="color:#111;">${esc(v.name)}</span>
      <span class="text-xs text-muted" style="margin-left:8px;">${esc(v.category?.name || '')}</span>
      <i class="fa-solid fa-times" style="margin-left:auto;color:#9ca3af;" onclick="clearRsVar(${rowId});event.stopPropagation();"></i>`
    trigger.style.color = ''
  }

  // Update unit toggle for fabric, or plain label for others
  const qtyUnitWrap = document.getElementById(`rs-qty-unit-toggle-${rowId}`)
  if (qtyUnitWrap) {
    if (isFabric(v)) {
      const u = rsQtyUnit[rowId] || 'm'
      qtyUnitWrap.outerHTML = `<div id="rs-qty-unit-toggle-${rowId}" style="display:flex;border:1px solid var(--border);border-radius:6px;overflow:hidden;flex-shrink:0;">
        <button type="button" onclick="setRsQtyUnit(${rowId},'m')" id="rs-qu-m-${rowId}" style="padding:0 8px;height:36px;border:none;font-size:12px;font-weight:600;cursor:pointer;background:${u==='m'?'var(--accent)':'#fff'};color:${u==='m'?'#fff':'var(--text-muted)'};transition:background .15s;">M</button>
        <button type="button" onclick="setRsQtyUnit(${rowId},'ft')" id="rs-qu-ft-${rowId}" style="padding:0 8px;height:36px;border:none;border-left:1px solid var(--border);font-size:12px;font-weight:600;cursor:pointer;background:${u==='ft'?'var(--accent)':'#fff'};color:${u==='ft'?'#fff':'var(--text-muted)'};transition:background .15s;">FT</button>
      </div>`
    } else {
      qtyUnitWrap.outerHTML = `<span id="rs-qty-unit-toggle-${rowId}" style="font-size:12px;color:var(--text-muted);padding:0 4px;">${v.unit.toUpperCase()}</span>`
    }
  }
  const qtyInput = document.getElementById(`rs-qty-${rowId}`)
  if (qtyInput && isFabric(v) && !qtyInput.value) qtyInput.value = 75
  // Prefill rate
  const rateInput = document.getElementById(`rs-rate-${rowId}`)
  if (rateInput && !rateInput.value && v.purchase_rate) rateInput.value = Number(v.purchase_rate).toFixed(2)
}

function clearRsVar(rowId) {
  rsSelVar[rowId] = null
  const trigger = document.getElementById(`rs-var-trigger-${rowId}`)
  if (trigger) {
    trigger.innerHTML = `<span style="color:#9ca3af;">Search variant…</span><i class="fa-solid fa-chevron-down" style="margin-left:auto;color:#9ca3af;font-size:12px;"></i>`
  }
  const qtyUnitWrap = document.getElementById(`rs-qty-unit-toggle-${rowId}`)
  if (qtyUnitWrap) qtyUnitWrap.outerHTML = `<span id="rs-qty-unit-toggle-${rowId}" style="font-size:12px;color:var(--text-muted);padding:0 4px;">?</span>`
}

function renderRestockRows(preselectedVariantId) {
  const wrap = document.getElementById('rs-items-wrap')
  if (!wrap) return
  wrap.innerHTML = restockItems.map((item, idx) => {
    const preV = (idx === 0 && preselectedVariantId)
      ? allVariants.find(x => x.id === preselectedVariantId)
      : null
    // Pre-select variant if provided
    if (preV && !rsSelVar[item.id]) rsSelVar[item.id] = preV

    const selV = rsSelVar[item.id]
    const unitDisp = selV ? (selV.unit === 'm' ? currentUnit.toUpperCase() : selV.unit.toUpperCase()) : '?'
    const triggerContent = selV
      ? `<span class="fw-600" style="color:#111;">${esc(selV.name)}</span>
         <span class="text-xs text-muted" style="margin-left:8px;">${esc(selV.category?.name || '')}</span>
         <i class="fa-solid fa-times" style="margin-left:auto;color:#9ca3af;" onclick="clearRsVar(${item.id});event.stopPropagation();"></i>`
      : `<span style="color:#9ca3af;">Search variant…</span><i class="fa-solid fa-chevron-down" style="margin-left:auto;color:#9ca3af;font-size:12px;"></i>`

    return `
    <div class="rs-item-row" id="rs-row-${item.id}" style="background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;position:relative;">
      ${restockItems.length > 1 ? `<button class="btn btn-ghost btn-sm" style="position:absolute;top:8px;right:8px;color:#ef4444;padding:2px 6px;" onclick="removeRestockRow(${item.id})" title="Remove">
        <i class="fa-solid fa-times"></i>
      </button>` : ''}

      <!-- Searchable variant dropdown -->
      <div class="form-group" style="margin-bottom:8px;" id="rs-var-select-${item.id}">
        <label style="font-size:12px;">Variant <span style="color:#ef4444">*</span></label>
        <div style="position:relative;">
          <div id="rs-var-trigger-${item.id}"
               onclick="toggleRsVarDrop(${item.id})"
               style="display:flex;align-items:center;gap:6px;padding:9px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;background:#fff;font-size:13px;min-height:40px;">
            ${triggerContent}
          </div>
          <div id="rs-var-drop-${item.id}"
               style="display:none;position:absolute;top:calc(100% + 2px);left:0;right:0;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:300;max-height:260px;flex-direction:column;">
            <div style="padding:7px 10px;border-bottom:1px solid var(--border);flex-shrink:0;">
              <input id="rs-var-search-${item.id}"
                     placeholder="Search by name, category…"
                     oninput="renderRsVarList(${item.id},this.value)"
                     autocomplete="off"
                     style="width:100%;border:none;outline:none;font-size:13px;background:transparent;">
            </div>
            <div id="rs-var-list-${item.id}" style="overflow-y:auto;flex:1;"></div>
          </div>
        </div>
      </div>

      <div class="form-row cols-3">
        <div class="form-group" style="margin-bottom:0;">
          <label style="font-size:12px;">Batch Code <span style="color:#ef4444">*</span></label>
          <input id="rs-batch-${item.id}" placeholder="e.g. R-042" style="text-transform:uppercase;" value="${esc(item._batch || '')}">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label style="font-size:12px;">Quantity <span style="color:#ef4444">*</span></label>
          <div style="display:flex;gap:4px;align-items:center;">
            <input id="rs-qty-${item.id}" type="number" step="0.01" min="0.01" placeholder="e.g. 75" value="${item._qty !== undefined ? item._qty : (preV && isFabric(preV) ? 75 : '')}" style="flex:1;min-width:0;">
            ${selV && isFabric(selV) ? `<div id="rs-qty-unit-toggle-${item.id}" style="display:flex;border:1px solid var(--border);border-radius:6px;overflow:hidden;flex-shrink:0;">
              <button type="button" onclick="setRsQtyUnit(${item.id},'m')" id="rs-qu-m-${item.id}" style="padding:0 8px;height:36px;border:none;font-size:12px;font-weight:600;cursor:pointer;background:${(rsQtyUnit[item.id]||'m')==='m'?'var(--accent)':'#fff'};color:${(rsQtyUnit[item.id]||'m')==='m'?'#fff':'var(--text-muted)'};transition:background .15s;">M</button>
              <button type="button" onclick="setRsQtyUnit(${item.id},'ft')" id="rs-qu-ft-${item.id}" style="padding:0 8px;height:36px;border:none;border-left:1px solid var(--border);font-size:12px;font-weight:600;cursor:pointer;background:${(rsQtyUnit[item.id]||'m')==='ft'?'var(--accent)':'#fff'};color:${(rsQtyUnit[item.id]||'m')==='ft'?'#fff':'var(--text-muted)'};transition:background .15s;">FT</button>
            </div>` : `<span id="rs-qty-unit-toggle-${item.id}" style="font-size:12px;color:var(--text-muted);padding:0 4px;">${unitDisp}</span>`}
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label style="font-size:12px;">Rate (per unit)</label>
          <input id="rs-rate-${item.id}" type="number" step="0.01" min="0" placeholder="e.g. 250"
                 value="${item._rate !== undefined ? item._rate : (preV?.purchase_rate ? Number(preV.purchase_rate).toFixed(2) : '')}">
        </div>
      </div>
    </div>`
  }).join('')

  // Re-init drop state for new rows
  restockItems.forEach(item => {
    if (rsVarDropOpen[item.id] === undefined) rsVarDropOpen[item.id] = false
  })
}

function setRsQtyUnit(rowId, unit) {
  rsQtyUnit[rowId] = unit
  const mBtn  = document.getElementById(`rs-qu-m-${rowId}`)
  const ftBtn = document.getElementById(`rs-qu-ft-${rowId}`)
  if (mBtn)  { mBtn.style.background  = unit === 'm'  ? 'var(--accent)' : '#fff'; mBtn.style.color  = unit === 'm'  ? '#fff' : 'var(--text-muted)' }
  if (ftBtn) { ftBtn.style.background = unit === 'ft' ? 'var(--accent)' : '#fff'; ftBtn.style.color = unit === 'ft' ? '#fff' : 'var(--text-muted)' }
}

function saveRestockInputState() {
  restockItems.forEach(item => {
    const batchEl = document.getElementById(`rs-batch-${item.id}`)
    const qtyEl   = document.getElementById(`rs-qty-${item.id}`)
    const rateEl  = document.getElementById(`rs-rate-${item.id}`)
    if (batchEl) item._batch = batchEl.value
    if (qtyEl)   item._qty   = qtyEl.value
    if (rateEl)  item._rate  = rateEl.value
  })
}

function addRestockRow() {
  saveRestockInputState()
  restockItems.push({ id: Date.now() })
  renderRestockRows(null)
}

function removeRestockRow(itemId) {
  saveRestockInputState()
  restockItems = restockItems.filter(r => r.id !== itemId)
  delete rsSelVar[itemId]
  delete rsVarDropOpen[itemId]
  delete rsQtyUnit[itemId]
  renderRestockRows(null)
}

async function saveRestockOrFG() {
  if (restockType === 'fg') {
    await saveFGItem('')
    document.removeEventListener('click', onRsOutsideClick)
    return
  }
  await saveRestock()
  document.removeEventListener('click', onRsOutsideClick)
}

async function saveRestock() {
  hideAlert('restock-alert')
  const billNo   = val('rs-bill') || null
  const supplier = val('rs-supplier') || null
  const date     = val('rs-date') || null
  const notes    = val('rs-notes') || null

  for (const item of restockItems) {
    const v         = rsSelVar[item.id]
    const batchCode = (document.getElementById(`rs-batch-${item.id}`)?.value || '').trim().toUpperCase()
    const rawQty    = parseFloat(document.getElementById(`rs-qty-${item.id}`)?.value)
    if (!v)                          { showAlert('restock-alert', 'Please select a variant for all items'); return }
    if (!batchCode)                  { showAlert('restock-alert', 'Batch code is required for all items'); return }
    if (isNaN(rawQty) || rawQty <= 0) { showAlert('restock-alert', `Valid quantity required for batch "${batchCode}"`); return }
  }

  disable('rs-save-btn')

  let anyError = false
  for (const item of restockItems) {
    const variant   = rsSelVar[item.id]
    const variantId = variant.id
    const batchCode = document.getElementById(`rs-batch-${item.id}`).value.trim().toUpperCase()
    const rawQty    = parseFloat(document.getElementById(`rs-qty-${item.id}`).value)
    const rate      = parseFloat(document.getElementById(`rs-rate-${item.id}`).value) || null

    const vUnit    = variant?.unit || 'm'
    const inputUnit = (vUnit === 'm' && rsQtyUnit[item.id]) ? rsQtyUnit[item.id] : (vUnit === 'm' ? 'm' : vUnit)
    const qty   = vUnit === 'm' ? cvtUnit(rawQty, inputUnit, 'm') : rawQty

    const { data, error } = await db.rpc('restock_roll', {
      p_variant_id:  variantId,
      p_batch_code:  batchCode,
      p_length:      qty,
      p_unit:        vUnit,
      p_rate:        rate,
      p_inward_date: date,
      p_bill_no:     billNo,
      p_supplier:    supplier,
      p_note:        notes,
    })

    if (error) {
      const msg = error.code === '23505'
        ? `Batch code "${batchCode}" already exists.`
        : error.message
      showAlert('restock-alert', msg)
      disable('rs-save-btn', false)
      anyError = true
      break
    }

    await logActivity('stock_receive', 'roll', data?.id, batchCode, {
      variant: variant?.name,
      quantity: { new: qty },
      unit: vUnit,
      rate,
      bill_no: billNo,
    })
  }

  if (!anyError) {
    toast(`${restockItems.length} item${restockItems.length > 1 ? 's' : ''} added successfully`)
    closeModal()
    await loadData()
  }
}

// kept for backward-compat with any inline onchange="" references
function updateRestockQtyLabel() {}
function updateRsUnit() {}

// ── Add New Variant (full hierarchy) ─────────────────────────────────────────
function openAddVariantModal() {
  const catOptions = allCategories.map(c =>
    `<option value="${c.id}">${esc(c.name)}</option>`
  ).join('')

  openModal('Create Stock Master', `
    <div id="av-alert" class="alert alert-error"></div>
    <p class="text-sm text-muted" style="margin-bottom:12px;">Create a category-only master, or add a blank product/variant that appears in inventory without stock.</p>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Category <span style="color:#ef4444">*</span></label>
        <select id="av-cat" onchange="onCatChange()">
          <option value="">Select…</option>${catOptions}
          <option value="__new">+ New Category</option>
        </select>
      </div>
      <div class="form-group" id="av-newcat-wrap" style="display:none;">
        <label>New Category Name</label>
        <input id="av-newcat" placeholder="e.g. Roller Blinds">
      </div>
    </div>
    <div class="form-group">
      <label>Product Name <span class="text-xs text-muted">(blank creates only the category)</span></label>
      <input id="av-product" placeholder="e.g. Screen Classic">
    </div>
    <div class="form-group">
      <label>Variant Name <span class="text-xs text-muted">(blank = same as product)</span></label>
      <input id="av-name" placeholder="Full variant name">
    </div>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Roll Width (m) <span class="text-xs text-muted">fabric only</span></label>
        <input id="av-width" type="number" step="0.001" min="0" placeholder="e.g. 2.3">
      </div>
      <div class="form-group">
        <label>Unit <span style="color:#ef4444">*</span></label>
        <select id="av-unit">
          <option value="m">m (metres)</option>
          <option value="pcs">pcs</option>
          <option value="set">set</option>
          <option value="nos">nos</option>
          <option value="sqm">sqm</option>
          <option value="other">other</option>
        </select>
      </div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Purchase Rate (per unit)</label>
        <input id="av-rate" type="number" step="0.01" min="0" placeholder="e.g. 500">
      </div>
      <div class="form-group">
        <label>Base Rate / SQM</label>
        <input id="av-sqmrate" type="number" step="0.01" min="0" placeholder="auto-calc from width">
      </div>
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveNewVariant()">Create Master</button>
    </div>
  `)
}

function onCatChange() {
  const wrap = document.getElementById('av-newcat-wrap')
  if (wrap) wrap.style.display = document.getElementById('av-cat').value === '__new' ? '' : 'none'
}

async function saveNewVariant() {
  hideAlert('av-alert')
  let catId = document.getElementById('av-cat').value
  const type = 'Master'
  const newCatName = val('av-newcat')
  const productName = val('av-product').trim()
  const variantName = val('av-name').trim() || productName
  const widthM = parseFloat(document.getElementById('av-width').value) || null
  const unit = document.getElementById('av-unit').value
  const rate = parseFloat(document.getElementById('av-rate').value) || null
  let sqmRate = parseFloat(document.getElementById('av-sqmrate').value) || null

  if (catId === '__new') {
    if (!newCatName) { showAlert('av-alert', 'New category name is required'); return }
    catId = ''
  }
  if (!catId && !newCatName) { showAlert('av-alert', 'Please select or create a category'); return }
  // Auto-calc base_rate_sqm if width + rate provided
  if (!sqmRate && rate && widthM && widthM > 0) sqmRate = Number((rate / widthM).toFixed(4))

  try {
    // 1. Ensure category
    if (!catId) {
      const { data, error } = await db
        .from('inv_categories')
        .upsert({ name: newCatName, normalized_name: newCatName.toLowerCase().trim(), sub_group: type }, { onConflict: 'normalized_name' })
        .select('id, name, sub_group').single()
      if (error) throw error
      catId = data.id
      allCategories.push(data)
    } else {
      const selectedCategory = allCategories.find(c => c.id === catId)
      if (selectedCategory && !selectedCategory.sub_group) {
        await db.from('inv_categories').update({ sub_group: type }).eq('id', catId)
      }
    }

    if (!productName) {
      await logActivity('create', 'category', catId, newCatName || allCategories.find(c => c.id === catId)?.name || 'Category', { type })
      toast('Category master created')
      closeModal()
      await loadData()
      return
    }

    // 2. Ensure product
    const { data: prod, error: prodErr } = await db
      .from('inv_products')
      .upsert({ category_id: catId, name: productName, normalized_name: productName.toLowerCase().trim() }, { onConflict: 'category_id,normalized_name' })
      .select('id').single()
    if (prodErr) throw prodErr

    // 3. Insert variant
    const { data: variant, error: varErr } = await db
      .from('inv_variants')
      .insert({
        product_id: prod.id,
        name: variantName,
        normalized_name: variantName.toLowerCase().trim(),
        width_m: widthM,
        unit,
        base_rate_sqm: sqmRate,
        purchase_rate: rate,
      })
      .select('id').single()
    if (varErr) {
      if (varErr.code === '23505') throw new Error('A variant with this name already exists under the same product.')
      throw varErr
    }

    await logActivity('create', 'roll', variant.id, variantName, { product: productName, unit })
    toast('Variant created. Use "Restock" to add the first stock roll.')
    closeModal()
    await loadData()
  } catch (err) {
    showAlert('av-alert', err.message)
  }
}

// ── Edit Variant ──────────────────────────────────────────────────────────────
function openEditVariantModal(variantId) {
  const v = allVariants.find(x => x.id === variantId)
  if (!v) return

  openModal('Edit Variant', `
    <div id="ev-alert" class="alert alert-error"></div>
    <div class="form-group">
      <label>Variant Name</label>
      <input id="ev-name" value="${esc(v.name)}">
    </div>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Roll Width (m)</label>
        <input id="ev-width" type="number" step="0.001" min="0" value="${v.width_m || ''}">
      </div>
      <div class="form-group">
        <label>Unit</label>
        <select id="ev-unit">
          ${['m','pcs','set','nos','sqm','sqft','other'].map(u =>
            `<option value="${u}" ${v.unit === u ? 'selected' : ''}>${u}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Purchase Rate (per unit)</label>
        <input id="ev-rate" type="number" step="0.01" min="0" value="${v.purchase_rate || ''}">
      </div>
      <div class="form-group">
        <label>Base Rate / SQM</label>
        <input id="ev-sqmrate" type="number" step="0.01" min="0" value="${v.base_rate_sqm || ''}">
      </div>
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveVariantEdit('${variantId}')">Save Changes</button>
    </div>
  `)
}

async function saveVariantEdit(variantId) {
  hideAlert('ev-alert')
  const name = val('ev-name').trim()
  const widthM = parseFloat(document.getElementById('ev-width').value) || null
  const unit = document.getElementById('ev-unit').value
  const rate = parseFloat(document.getElementById('ev-rate').value) || null
  const sqmRate = parseFloat(document.getElementById('ev-sqmrate').value) || null

  if (!name) { showAlert('ev-alert', 'Variant name is required'); return }

  const { error } = await db.from('inv_variants').update({
    name,
    normalized_name: name.toLowerCase().trim(),
    width_m: widthM,
    unit,
    purchase_rate: rate,
    base_rate_sqm: sqmRate,
  }).eq('id', variantId)

  if (error) { showAlert('ev-alert', error.message); return }
  await logActivity('update', 'roll', variantId, name, {})
  toast('Variant updated')
  closeModal()
  await loadData()
}

// ── Edit Roll ─────────────────────────────────────────────────────────────────
function openEditRollModal(rollId, variantId) {
  const v = allVariants.find(x => x.id === variantId)
  const r = v?.rolls.find(x => x.id === rollId)
  if (!r) return

  const vUnit = v?.unit || r.unit || 'm'
  // For metric rolls, show in the user's preferred display unit; for others, show raw value
  const remDisp = vUnit === 'm'
    ? cvtUnit(Number(r.remaining_length || 0), 'm', currentUnit).toFixed(3)
    : Number(r.remaining_length || 0).toString()
  const remLabel = vUnit === 'm' ? currentUnit.toUpperCase() : vUnit

  openModal('Edit Roll', `
    <div id="er-alert" class="alert alert-error"></div>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Batch Code</label>
        <input id="er-batch" value="${esc(r.batch_code)}" style="text-transform:uppercase;">
      </div>
      <div class="form-group">
        <label>Inward Date</label>
        <input id="er-date" type="date" value="${r.inward_date || ''}">
      </div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Bill / Invoice No.</label>
        <input id="er-bill" value="${esc(r.bill_no || '')}">
      </div>
      <div class="form-group">
        <label>Supplier</label>
        <input id="er-supplier" value="${esc(r.supplier || '')}">
      </div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Purchase Rate (per ${vUnit})</label>
        <input id="er-rate" type="number" step="0.01" min="0" value="${r.purchase_rate || ''}">
      </div>
      <div class="form-group">
        <label>Adjust Remaining (${remLabel})</label>
        <input id="er-remaining" type="number" step="0.001" min="0" value="${remDisp}" data-vunit="${vUnit}">
      </div>
    </div>
    <div class="form-group">
      <label>Notes</label>
      <input id="er-notes" value="${esc(r.notes || '')}">
    </div>
    <p class="text-xs text-muted" style="margin-top:4px;">Adjusting remaining will create an "adjustment" movement in the ledger.</p>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveRollEdit('${rollId}','${variantId}')">Save</button>
    </div>
  `)
}

async function saveRollEdit(rollId, variantId) {
  hideAlert('er-alert')
  const v = allVariants.find(x => x.id === variantId)
  const r = v?.rolls.find(x => x.id === rollId)
  if (!r) return
  const currentUserId = AUTH.currentUserId()

  const batchCode = val('er-batch').toUpperCase()
  const date      = val('er-date') || null
  const billNo    = val('er-bill') || null
  const supplier  = val('er-supplier') || null
  const rate      = parseFloat(document.getElementById('er-rate').value) || null
  const notes     = val('er-notes') || null
  const rawRem    = parseFloat(document.getElementById('er-remaining').value)

  if (!batchCode) { showAlert('er-alert', 'Batch code required'); return }
  if (isNaN(rawRem) || rawRem < 0) { showAlert('er-alert', 'Invalid remaining length'); return }

  const vUnit = v?.unit || 'm'
  // For metric rolls convert display unit → m; for other units store as-is
  const newRemaining = vUnit === 'm' ? cvtUnit(rawRem, currentUnit, 'm') : rawRem
  if (Number(r.original_length || 0) > 0 && newRemaining > Number(r.original_length || 0)) {
    showAlert('er-alert', 'Remaining cannot be more than original stock')
    return
  }
  const oldRemaining = Number(r.remaining_length || 0)
  const delta = Number((newRemaining - oldRemaining).toFixed(6))
  // Depleted threshold: 0.1 for fabric metres, 0 for counted units
  const depletedThreshold = vUnit === 'm' ? 0.1 : 0
  const newStatus = newRemaining <= depletedThreshold ? 'depleted' : 'in_stock'

  const { error } = await db.from('inv_rolls').update({
    batch_code:       batchCode,
    inward_date:      date,
    bill_no:          billNo,
    supplier,
    purchase_rate:    rate,
    remaining_length: newRemaining,
    status:           newStatus,
    notes,
  }).eq('id', rollId)

  if (error) { showAlert('er-alert', error.message); return }

  // Log adjustment movement if remaining changed
  if (Math.abs(delta) > 0.001) {
    await db.from('inv_movements').insert({
      roll_id:       rollId,
      variant_id:    variantId,
      movement_type: 'adjustment',
      quantity:      delta,
      performed_by:  currentUserId,
      unit:          vUnit,
      note:          `Manual adjustment via UI: ${oldRemaining} → ${newRemaining} ${vUnit}`,
    })
    await logActivity('stock_adjust', 'roll', rollId, batchCode, {
      remaining_length: { old: oldRemaining, new: newRemaining },
    })
  }

  toast('Roll updated')
  closeModal()
  await loadData()
}

// ── Delete Roll ───────────────────────────────────────────────────────────────
async function deleteRoll(rollId, encodedBatchCode, variantId) {
  const batchCode = decodeURIComponent(encodedBatchCode || 'this stock row')
  const v = allVariants.find(x => x.id === variantId)
  const movementCount = await countMovementsForRolls([rollId])
  if (!confirm(`Delete stock row "${batchCode}"?\n\nThis will remove ${movementCount} report/history movement${movementCount !== 1 ? 's' : ''} for ${v?.name || 'this item'} and cannot be undone.`)) return
  const pieceDel = await db.from('fabric_cut_pieces').delete().eq('source_roll_id', rollId)
  if (pieceDel.error) { toast(pieceDel.error.message, 'error'); return }
  const moveDel = await db.from('inv_movements').delete().eq('roll_id', rollId)
  if (moveDel.error) { toast(moveDel.error.message, 'error'); return }
  const { error } = await db.from('inv_rolls').delete().eq('id', rollId)
  if (error) { toast(error.message, 'error'); return }
  await logActivity('delete', 'roll', rollId, batchCode, { variant: v?.name || null, movements: movementCount })
  toast('Stock row deleted and reports updated')
  await loadData()
}

async function deleteVariantStock(variantId, encodedName) {
  const name = decodeURIComponent(encodedName || 'this stock item')
  const v = allVariants.find(x => x.id === variantId)
  if (!v) return

  const rollCount = v.rolls?.length || 0
  const movementCount = await countMovementsForVariants([variantId])
  const message = `Delete stock item "${name}"?\n\nThis will remove ${rollCount} stock row${rollCount !== 1 ? 's' : ''} and ${movementCount} report/history movement${movementCount !== 1 ? 's' : ''}. It will disappear from inventory, reports, and order stock dropdowns. This cannot be undone.`
  if (!confirm(message)) return

  const cleanup = await deleteInventoryLedgerForVariants([variantId])
  if (cleanup) { toast(cleanup, 'error'); return }

  const { error } = await db.from('inv_variants').delete().eq('id', variantId)
  if (error) { toast(error.message, 'error'); return }

  expandedVariants.delete(variantId)
  await deleteEmptyProduct(v.product?.id)
  await logActivity('delete', 'variant', variantId, name, { stock_rows: rollCount, movements: movementCount })
  toast('Stock item deleted and reports updated')
  await loadData()
}

async function deleteInventoryLedgerForVariants(variantIds) {
  const ids = (variantIds || []).filter(Boolean)
  if (!ids.length) return ''

  const { error: moveErr } = await db.from('inv_movements').delete().in('variant_id', ids)
  if (moveErr) return moveErr.message

  const { error: rollErr } = await db.from('inv_rolls').delete().in('variant_id', ids)
  if (rollErr) return rollErr.message

  return ''
}

async function countMovementsForVariants(variantIds) {
  const ids = (variantIds || []).filter(Boolean)
  if (!ids.length) return 0
  const { count, error } = await db
    .from('inv_movements')
    .select('id', { count: 'exact', head: true })
    .in('variant_id', ids)
  if (error) {
    console.warn('movement count failed:', error.message)
    return 0
  }
  return count || 0
}

async function countMovementsForRolls(rollIds) {
  const ids = (rollIds || []).filter(Boolean)
  if (!ids.length) return 0
  const { count, error } = await db
    .from('inv_movements')
    .select('id', { count: 'exact', head: true })
    .in('roll_id', ids)
  if (error) {
    console.warn('movement count failed:', error.message)
    return 0
  }
  return count || 0
}

async function deleteEmptyProduct(productId) {
  if (!productId) return
  const { count, error } = await db
    .from('inv_variants')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)
  if (error || count) return
  await db.from('inv_products').delete().eq('id', productId)
}

// ── Movement history ──────────────────────────────────────────────────────────
async function openVariantHistoryModal(variantId) {
  const v = allVariants.find(x => x.id === variantId)
  openModal(`History — ${v?.name || 'Variant'}`, `<div class="spinner" style="margin:20px auto;"></div>`)

  const [movementRes, pieceRes] = await Promise.all([
    db
      .from('inv_movements')
      .select('*')
      .eq('variant_id', variantId)
      .order('created_at', { ascending: false })
      .limit(100),
    db
      .from('fabric_cut_pieces')
      .select('id, variant_id, source_roll_id, source_order_id, width_m, length_m, remaining_length_m, status, created_at, created_by')
      .eq('variant_id', variantId)
      .order('created_at', { ascending: false }),
  ])

  if (movementRes.error) { html('modal-body', `<p class="text-muted">${movementRes.error.message}</p>`); return }
  if (pieceRes.error) console.warn('cut piece history failed:', pieceRes.error.message)

  const pieceMovements = (pieceRes.data || []).map(p => ({
    id: `piece-${p.id}`,
    roll_id: p.source_roll_id,
    variant_id: p.variant_id,
    movement_type: 'cut_piece_created',
    quantity: Number(p.width_m || 0) * Number(p.length_m || 0),
    unit: 'sqm',
    rate: null,
    reference: p.source_order_id ? `Order ${p.source_order_id.slice(0, 8).toUpperCase()}` : '',
    note: `${Number(p.width_m || 0).toFixed(3)}m x ${Number(p.length_m || 0).toFixed(3)}m piece created`,
    performed_by: p.created_by,
    created_at: p.created_at,
    _isCutPiece: true,
  }))
  const rows = [...(movementRes.data || []), ...pieceMovements]

  if (!rows.length) {
    html('modal-body', `<p class="text-muted text-sm" style="padding:16px;">No movement history yet.</p>`)
    return
  }

  const movements = collapseDuplicateMovements(rows).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  const performerIds = [...new Set(movements.map(m => m.performed_by).filter(Boolean))]
  let performerNames = {}
  if (performerIds.length) {
    const { data: profileRows, error: profileErr } = await db
      .from('profiles')
      .select('id, full_name, username')
      .in('id', performerIds)
    if (profileErr) {
      console.warn('movement performer lookup failed:', profileErr.message)
    } else {
      performerNames = Object.fromEntries((profileRows || []).map(p => [p.id, p.full_name || p.username || p.id]))
    }
  }

  const typeColors = { inflow: '#059669', restock: '#2563eb', outflow: '#ef4444', adjustment: '#f59e0b', cut_piece_created: '#7c3aed' }

  html('modal-body', `
    <div class="table-wrap" style="max-height:400px;overflow-y:auto;">
      <table style="font-size:13px;">
        <thead><tr>
          <th>Date</th>
          <th>Type</th>
          <th>Qty</th>
          <th>Rate</th>
          <th>Reference</th>
          <th>By</th>
        </tr></thead>
        <tbody>
          ${movements.map(m => `<tr>
            <td class="text-muted">${fmtDateTime(m.created_at)}</td>
            <td><span style="color:${typeColors[m.movement_type] || '#6b7280'};font-weight:600;text-transform:capitalize;">${esc(String(m.movement_type || '').replace(/_/g, ' '))}</span></td>
            <td class="fw-600" style="color:${m.quantity >= 0 ? '#059669' : '#ef4444'}">${m.quantity >= 0 ? '+' : ''}${Number(m.quantity).toFixed(3)} ${m.unit || ''}</td>
            <td class="text-muted">${m.rate ? fmt$(m.rate) : '—'}</td>
            <td class="text-muted text-xs">${esc(m.reference || m.note || '—')}${m._duplicateCount > 1 ? ` <span class="badge">${m._duplicateCount}x</span>` : ''}</td>
            <td class="text-muted text-xs">${esc(performerNames[m.performed_by] || '—')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
    </div>
  `)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function collapseDuplicateMovements(rows) {
  const groups = new Map()
  for (const m of rows || []) {
    const isRollback = String(m.note || '').startsWith('Order rollback:')
    const createdBucket = isRollback ? '' : String(m.created_at || '').slice(0, 19)
    const key = [
      createdBucket,
      m.movement_type || '',
      m.variant_id || '',
      m.roll_id || '',
      Number(m.quantity || 0),
      m.unit || '',
      Number(m.rate || 0),
      m.reference || '',
      m.note || '',
      m.performed_by || '',
    ].join('|')
    const existing = groups.get(key)
    if (existing) {
      existing._duplicateCount += 1
    } else {
      groups.set(key, { ...m, _duplicateCount: 1 })
    }
  }
  return [...groups.values()]
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function safeArg(value) {
  return encodeURIComponent(String(value ?? ''))
}

function normText(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactText(s) {
  return normText(s).replace(/\s+/g, '')
}

function inventoryTextMatches(text, query) {
  const q = normText(query)
  if (!q) return true
  const hay = normText(text)
  const hayCompact = compactText(text)
  const qCompact = compactText(query)
  if (hay.includes(q) || (qCompact && hayCompact.includes(qCompact))) return true
  return q.split(' ').filter(Boolean).every(token =>
    hay.includes(token) || hayCompact.includes(token)
  )
}

function inventorySearchScore(text, query) {
  if (!inventoryTextMatches(text, query)) return 0
  const hay = normText(text)
  const q = normText(query)
  if (hay === q) return 100
  if (hay.startsWith(q)) return 95
  if (hay.includes(q)) return 85
  const tokens = q.split(' ').filter(Boolean)
  if (!tokens.length) return 100
  const matched = tokens.filter(t => hay.includes(t) || compactText(text).includes(t)).length
  return 50 + Math.round((matched / tokens.length) * 30)
}

function inventorySearch(items, query, getText) {
  const q = normText(query)
  if (!q) return items
  return items
    .map(item => ({ item, score: inventorySearchScore(getText(item), q) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.item)
}

function variantSearchText(v) {
  const root = masterRootForVariant(v)
  const page = root ? masterPages.find(item => item.id === root.page_id) : null
  return [
    v.name,
    v.product?.name,
    v.category?.name,
    v.category?.sub_group,
    root?.name,
    page?.name,
    v.unit,
    v.width_m,
    v.purchase_rate,
    ...(v.rolls || []).flatMap(r => [
      r.batch_code,
      r.status,
      r.bill_no,
      r.supplier,
      r.notes,
      r.inward_date,
      r.unit,
      r.purchase_rate,
      r.remaining_length,
      r.original_length,
    ]),
    ...(v.cutPieces || []).flatMap(p => [
      'cut piece',
      p.status,
      p.width_m,
      p.length_m,
      p.remaining_length_m,
      p.source_order_id,
      p.notes,
    ]),
  ].filter(x => x != null && x !== '').join(' ')
}

function nameTokensForLinkCheck(s) {
  const generic = new Set([
    'roller', 'blind', 'blinds', 'fabric', 'fabrics', 'translucent', 'blackout',
    'screen', 'opaque', 'opeque', 'mtr', 'meter', 'metre', 'width', 'white',
    'grey', 'gray', 'ivory', 'beige', 'light', 'dark',
  ])
  return normText(s)
    .split(' ')
    .filter(t => t.length >= 3 && !generic.has(t) && !/^\d+$/.test(t))
}

function hasMeaningfulNameOverlap(productName, variantName) {
  const productTokens = nameTokensForLinkCheck(productName)
  const variantTokens = nameTokensForLinkCheck(variantName)
  if (!productTokens.length || !variantTokens.length) return true
  return productTokens.some(p => variantTokens.some(v => p === v || p.includes(v) || v.includes(p)))
}

function isFabricCategoryInput(catId, newCatName, type) {
  if (type === 'Fabric') return true
  const cat = allCategories.find(c => c.id === catId)
  const label = `${cat?.name || ''} ${cat?.sub_group || ''} ${newCatName || ''}`
  return normText(label).includes('fabric')
}

// Display a quantity correctly: metric units get unit-toggle conversion, others show raw + unit label
function fmtQty(value, variantUnit) {
  const n = Number(value || 0)
  if (variantUnit === 'm') return fmtMeasureM(n, currentUnit)
  // For pcs / set / nos / sqm / sqft / other — just show the number and label
  return n % 1 === 0 ? `${n} ${variantUnit}` : `${n.toFixed(2)} ${variantUnit}`
}

// Whether to show the unit toggle for a given variant unit
function isMetricUnit(u) { return u === 'm' }

// ── Finished Goods (Resale) ───────────────────────────────────────────────────

const FG_CAT_ID = '__fg__'   // synthetic id for expand state

function renderFGSection(items) {
  const isOpen = expandedCategories.has(FG_CAT_ID)

  const totalQty   = items.reduce((s, x) => s + Number(x.quantity || 0), 0)
  const totalValue = items.reduce((s, x) => s + (Number(x.purchase_cost || 0) * Number(x.quantity || 0)), 0)
  const lowCount   = items.filter(x => Number(x.quantity) > 0 && Number(x.quantity) < 3).length

  const rows = items.map(item => {
    const noStock  = Number(item.quantity) <= 0
    const lowStock = Number(item.quantity) > 0 && Number(item.quantity) < 3
    const stockColor = noStock ? '#ef4444' : lowStock ? '#f59e0b' : '#059669'
    const qty = Number(item.quantity)
    const qtyDisp = qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(2)
    return `
    <div class="inv-variant-row" style="padding:10px 40px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div style="min-width:0;flex:1;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="fw-600" style="font-family:monospace;font-size:12px;color:#6b7280;">${esc(item.code)}</span>
            <span class="fw-600">${esc(item.name)}</span>
            ${item.description ? `<span class="text-xs text-muted">${esc(item.description)}</span>` : ''}
          </div>
          <div class="text-xs text-muted" style="margin-top:2px;">
            ${item.purchase_date ? `Purchased: ${item.purchase_date}` : ''}
            ${item.bill_no ? ` · Bill: <strong style="font-family:monospace;">${esc(item.bill_no)}</strong>` : ''}
            ${item.supplier ? ` · ${esc(item.supplier)}` : ''}
            ${item.notes ? ` · ${esc(item.notes)}` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:16px;flex-shrink:0;">
          <div class="text-xs" style="text-align:right;">
            ${item.purchase_cost != null ? `<div class="text-muted">Cost: <strong>₹${Number(item.purchase_cost).toFixed(2)}/${esc(item.unit)}</strong></div>` : ''}
            <div>Qty: <strong style="color:${stockColor};">${qtyDisp} ${esc(item.unit)}</strong></div>
          </div>
          <div style="display:flex;gap:4px;">
            ${isAdminOrStaff ? `
              <button class="btn btn-ghost btn-sm" onclick="openEditFGModal('${item.id}')" title="Edit item">
                <i class="fa-solid fa-pen"></i>
              </button>
            ` : ''}
            ${isAdmin ? `
              <button class="btn btn-ghost btn-sm" style="color:#ef4444" onclick="deleteFGItem('${item.id}','${esc(item.name)}')" title="Delete item">
                <i class="fa-solid fa-trash"></i>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    </div>`
  }).join('')

  return `
  <div class="inv-category-section" id="cat-sec-${FG_CAT_ID}">
    <div class="inv-category-header" onclick="toggleCategory('${FG_CAT_ID}')">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <i class="fa-solid fa-chevron-right inv-chevron ${isOpen ? 'rotated' : ''}" id="chevron-cat-${FG_CAT_ID}"></i>
        <span class="fw-600" style="font-size:15px;">Finished Goods</span>
        <span style="background:#fef9c3;color:#854d0e;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;">${items.length} item${items.length !== 1 ? 's' : ''}</span>
        <span style="background:#dcfce7;color:#166534;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;">${totalQty % 1 === 0 ? totalQty.toFixed(0) : totalQty.toFixed(1)} units</span>
        <span style="background:#dcfce7;color:#166534;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;">₹${totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
        ${lowCount ? `<span style="background:#fef3c7;color:#92400e;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;">${lowCount} low stock</span>` : ''}
        <span class="text-xs text-muted">Resale items purchased ready-made</span>
      </div>
    </div>
    <div class="inv-category-body ${isOpen ? '' : 'd-none'}" id="cat-body-${FG_CAT_ID}">
      ${rows}
    </div>
  </div>`
}


function openAddFGModal(prefill) {
  const item = prefill || {}
  const isEdit = !!item.id
  openModal(isEdit ? 'Edit Finished Good Item' : 'Add Finished Good Item', `
    <div id="fg-alert" class="alert alert-error"></div>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Item Code <span style="color:#ef4444">*</span></label>
        <input id="fg-code" placeholder="e.g. FG-001" style="text-transform:uppercase;" value="${esc(item.code || '')}">
      </div>
      <div class="form-group">
        <label>Name <span style="color:#ef4444">*</span></label>
        <input id="fg-name" placeholder="e.g. Motorised Roller Blind 120cm" value="${esc(item.name || '')}">
      </div>
    </div>
    <div class="form-group">
      <label>Description</label>
      <input id="fg-desc" placeholder="Optional — colour, size, spec…" value="${esc(item.description || '')}">
    </div>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Purchase Date</label>
        <input id="fg-date" type="date" value="${item.purchase_date || new Date().toISOString().slice(0,10)}">
      </div>
      <div class="form-group">
        <label>Purchase Cost (₹)</label>
        <input id="fg-cost" type="number" step="0.01" min="0" placeholder="0.00" value="${item.purchase_cost != null ? item.purchase_cost : ''}">
      </div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Bill / Invoice No.</label>
        <input id="fg-bill" placeholder="e.g. INV-2024-001" value="${esc(item.bill_no || '')}">
      </div>
      <div class="form-group">
        <label>Supplier</label>
        <input id="fg-supplier" placeholder="Supplier name" value="${esc(item.supplier || '')}">
      </div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Quantity <span style="color:#ef4444">*</span></label>
        <input id="fg-qty" type="number" step="0.001" min="0" placeholder="0" value="${item.quantity != null ? item.quantity : ''}">
      </div>
      <div class="form-group">
        <label>Unit</label>
        <select id="fg-unit">
          ${['pcs','set','nos','box','m','sqm'].map(u =>
            `<option value="${u}" ${(item.unit||'pcs')===u?'selected':''}>${u}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Notes</label>
      <input id="fg-notes" placeholder="Optional notes" value="${esc(item.notes || '')}">
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="fg-save-btn" onclick="saveFGItem('${item.id||''}')">
        <i class="fa-solid fa-check"></i> ${isEdit ? 'Save Changes' : 'Add Item'}
      </button>
    </div>
  `, true)
}

function openEditFGModal(id) {
  const item = allFGItems.find(x => x.id === id)
  if (item) openAddFGModal(item)
}

async function saveFGItem(existingId) {
  hideAlert('fg-alert')
  const code     = (document.getElementById('fg-code')?.value || '').trim().toUpperCase()
  const name     = (document.getElementById('fg-name')?.value || '').trim()
  const desc     = (document.getElementById('fg-desc')?.value || '').trim() || null
  const date     = document.getElementById('fg-date')?.value || null
  const cost     = parseFloat(document.getElementById('fg-cost')?.value)
  const qty      = parseFloat(document.getElementById('fg-qty')?.value)
  const unit     = document.getElementById('fg-unit')?.value || 'pcs'
  const bill_no  = (document.getElementById('fg-bill')?.value || '').trim() || null
  const supplier = (document.getElementById('fg-supplier')?.value || '').trim() || null
  const notes    = (document.getElementById('fg-notes')?.value || '').trim() || null

  if (!code) { showAlert('fg-alert', 'Item Code is required'); return }
  if (!name) { showAlert('fg-alert', 'Name is required'); return }
  if (isNaN(qty) || qty < 0) { showAlert('fg-alert', 'Valid quantity is required'); return }

  // button id differs between unified modal (rs-save-btn) and standalone edit modal (fg-save-btn)
  const saveBtnId = document.getElementById('rs-save-btn') ? 'rs-save-btn' : 'fg-save-btn'
  disable(saveBtnId)

  const payload = {
    code,
    name,
    description: desc,
    purchase_date: date || null,
    purchase_cost: isNaN(cost) ? null : cost,
    quantity: qty,
    unit,
    bill_no,
    supplier,
    notes,
    updated_at: new Date().toISOString(),
  }

  let error
  if (existingId) {
    ;({ error } = await db.from('fg_stock').update(payload).eq('id', existingId))
  } else {
    payload.created_by = AUTH.currentUserId()
    ;({ error } = await db.from('fg_stock').insert(payload))
  }

  if (error) { showAlert('fg-alert', error.message); disable(saveBtnId, false); return }

  toast(existingId ? 'Item updated' : 'Item added')
  closeModal()
  await loadData()
}

async function deleteFGItem(id, name) {
  if (!confirm(`Delete "${name}"?\n\nThis cannot be undone.`)) return
  const { error } = await db.from('fg_stock').delete().eq('id', id)
  if (error) { toast(error.message, 'error'); return }
  toast('Item deleted')
  await loadData()
}


init()
