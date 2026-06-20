// ── Constants ─────────────────────────────────────────────────────────────────
/*
  Create order controller.
  Builds a multi-line order form, loads sellable inventory variants, calculates
  dimensions/area, and submits orders through the current database order flow.
  Stock deduction should remain server-side through RPC/database logic.
*/

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

const BLIND_TYPE_TREE = {
  'Roller Blinds': [
    'Roller Blinds Without Headrail',
    'Roller Blinds With Headrail',
    'Roller Blinds With Plain Cassette',
    'Roller Blinds With Decorative Cassette',
  ],
  'Vertical Blinds': ['Vertical Blinds'],
  'Roman Blinds': ['Roman Blinds'],
  'Sheer Dimout Blinds': [
    'Sheer Dimout Blinds Classic Mechanism with Plain Cassette',
    'Sheer Dimout Blinds Classic Mechanism with Decorative Cassette',
    'Sheer Dimout Blinds Premium Mechanism with Plain Cassette',
    'Sheer Dimout Blinds Premium Mechanism with Decorative Cassette',
  ],
  'S Contour Blinds': ['S-Contour Blinds'],
  'Cellular Blinds': ['Cellular Blinds'],
  'Wooden Venetian Blinds': ['Wooden Venetian Blinds'],
  'Aluminium Venetian Blinds': ['Aluminium Venetian Blinds'],
}

const BLIND_FABRIC_MAP = {
  'Roller Blinds':         ['Roller Blind Fabrics'],
  'Vertical Blinds':       ['Vertical Blind Fabrics', 'Vertical Fabrics'],
  'Roman Blinds':          ['Roller Blind Fabrics'],
  'Sheer Dimout Blinds':   ['Sheer Dimout Fabrics'],
  'S Contour Blinds':      ['S-Contour Fabrics'],
  'Cellular Blinds':       ['Roller Blind Fabrics'],
  'Wooden Venetian Blinds': [],
  'Aluminium Venetian Blinds': [],
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

function fabricCategoryIdsFor(mainType) {
  const catNames = BLIND_FABRIC_MAP[mainType] || []
  return allCategories
    .filter(c => !isHiddenOrderCategory(c) && catNames.some(name => categoryMatchesName(c, name)))
    .map(c => c.id)
}

// ── RRP helpers ───────────────────────────────────────────────────────────────
const RRP_SUBTYPE_COL = {
  'Roller Blinds Without Headrail':         'rrp_wo_headrail',
  'Roller Blinds With Headrail':            'rrp_w_headrail',
  'Roller Blinds With Plain Cassette':      'rrp_w_plain_cassette',
  'Roller Blinds With Decorative Cassette': 'rrp_w_dec_cassette',
}

function normRRP(s) {
  return rrpAliasText(s).replace(/[^a-z0-9]/g, '')
}

function lookupRRP(variantName, subType, productName) {
  if (!subType) return null
  const col = RRP_SUBTYPE_COL[subType]
  if (!col) return null

  function tryName(name) {
    if (!name) return null
    const n = normRRP(name)
    // 1. Exact normalised match
    let e = allRRP.find(r => normRRP(r.fabric_name) === n)
    if (e) return e
    // 2. Substring match in either direction (handles "BAMBERG" inside "VIOLET, SKYLER, ORIBI, ELENA, BAMBERG"
    //    and "CLASSIC SCREEN 8% BEIGE" containing "CLASSIC SCREEN 8%")
    e = allRRP.find(r => {
      const rn = normRRP(r.fabric_name)
      return rn.length >= 4 && (n.startsWith(rn) || n.includes(rn) || rn.includes(n))
    })
    if (e) return e
    // 3. Comma-split: RRP entry may list several names like "VIOLET, SKYLER, ORIBI, ELENA, BAMBERG"
    e = allRRP.find(r => {
      return r.fabric_name.split(',').map(p => normRRP(p)).some(p => p.length >= 3 && (p === n || n.includes(p) || p.includes(n)))
    })
    if (e) return e
    // 4. Strip parentheticals / suffixes from RRP name (e.g. "SERENE (TRANSLUCENT)" → "SERENE",
    //    "SOLETO N B/O" → "SOLETO N", "WONDER DESIGN - PRINTED B/O" → "WONDER DESIGN")
    e = allRRP.find(r => {
      const core = normRRP(r.fabric_name.replace(/\s*[\(\-\/].*$/, '').trim())
      return core.length >= 4 && (n === core || n.startsWith(core) || n.includes(core) || core.includes(n))
    })
    return e || null
  }

  // Try product name first (most reliable for colour variants like "CLASSIC SCREEN 8%")
  let entry = tryName(productName) || tryName(variantName)

  // Last resort: extract a percentage from either name and match by pct within the RRP list
  if (!entry) {
    const pctMatch = (productName || variantName || '').match(/(\d+)\s*%/)
    if (pctMatch) {
      const pct = pctMatch[1] + '%'
      entry = allRRP.find(r => r.fabric_name.includes(pct))
    }
  }

  if (!entry) return null
  return entry[col] != null ? Number(entry[col]) : null
}

const RRP_SHORT_TOKENS = new Set(['ds'])

function rrpAliasText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\bds\s+op(?:aq|eq)ue\b/g, ' dsopaque ')
    .replace(/\bsolar(?:is)?\b/g, ' srs ')
    .replace(/\bsilver\s+backing\b/g, ' aluminium backing ')
    .replace(/\bvenice\b/g, ' venice soleto ')
    .replace(/\bmurano\b/g, ' murano soleto ')
    .replace(/\bnovel\b/g, ' noble ')
    .replace(/\bcroma\s*luxe\b/g, ' cromaluxe ')
    .replace(/\bdash\s*luxe\b/g, ' dashluxe ')
    .replace(/\bdiamond\s*luxe\b/g, ' diamondluxe ')
    .replace(/\btri\s*luxe\b/g, ' triluxe ')
}

function normRRPSearch(s) {
  return rrpAliasText(s)
    .replace(/(\d+(?:\.\d+)?)\s*%/g, ' pct$1 ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:mtr|meter|metre|mt|m)\b/g, ' ')
    .replace(/\b(?!pct\d+\b)[a-z]{1,5}\s*[-/]?\s*\d{1,3}\b/g, ' ')
    .replace(/\b\d{2,4}\b/g, ' ')
    .replace(/\b(?:roller|blind|blinds|fabric|fabrics|sheer|dimout|vertical|roman|contour|cellular|wooden|venetian|aluminium|aluminum|blackout|translucent|screen|opaque|opeque|new|printed|classic|series|mtr|meter|metre|shade|shades)\b/g, ' ')
    .replace(/[^a-z0-9%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function rrpTokens(s) {
  return normRRPSearch(s).split(' ').filter(t => t.length >= 3 || RRP_SHORT_TOKENS.has(t) || /%$/.test(t))
}

function rrpPercentTokens(s) {
  return rrpTokens(s).filter(t => /^pct\d+(?:\.\d+)?$/.test(t))
}

function readRRPPriceMap(entry) {
  if (!entry) return {}
  if (entry.price_map && typeof entry.price_map === 'object') return entry.price_map
  if (typeof entry.price_map === 'string') {
    try { return JSON.parse(entry.price_map) || {} } catch { return {} }
  }
  return {}
}

function rrpPriceForSubtype(entry, subType) {
  if (!entry || !subType) return null
  const priceMap = readRRPPriceMap(entry)
  const direct = priceMap[subType]
  if (direct != null && direct !== '') return Number(direct)

  const wanted = normRRP(subType)
  const key = Object.keys(priceMap).find(k => normRRP(k) === wanted)
    || Object.keys(priceMap).find(k => {
      const nk = normRRP(k)
      return nk && (wanted.includes(nk) || nk.includes(wanted))
    })
  if (key && priceMap[key] != null && priceMap[key] !== '') return Number(priceMap[key])

  const col = RRP_SUBTYPE_COL[subType]
  if (col && entry[col] != null) return Number(entry[col])

  const fallback = Object.values(priceMap).find(v => v != null && v !== '')
  return fallback != null ? Number(fallback) : null
}

function blindTypeMatches(entryType, mainType, subType) {
  if (!entryType) return true
  const e = normRRP(entryType)
  const m = normRRP(mainType)
  const s = normRRP(subType)
  return !m || e === m || m.includes(e) || e.includes(m) || (s && (s.includes(e) || e.includes(s)))
}

function scoreRRPName(entryName, searchName) {
  if (!entryName || !searchName) return 0
  const entryParts = String(entryName).split(',').map(p => p.trim()).filter(Boolean)
  const candidates = entryParts.length ? entryParts : [entryName]
  let best = 0

  for (const candidate of candidates) {
    const eCompact = normRRP(candidate)
    const sCompact = normRRP(searchName)
    if (!eCompact || !sCompact) continue
    if (eCompact === sCompact) best = Math.max(best, 100)
    if (eCompact.length >= 4 && (sCompact.includes(eCompact) || eCompact.includes(sCompact))) best = Math.max(best, 88)

    const eTokens = rrpTokens(candidate)
    const sTokens = rrpTokens(searchName)
    if (!eTokens.length || !sTokens.length) continue
    const ePct = rrpPercentTokens(candidate)
    const sPct = rrpPercentTokens(searchName)
    if (ePct.length && sPct.length && !ePct.some(t => sPct.includes(t))) continue
    const matches = eTokens.filter(t => sTokens.includes(t) || sTokens.some(st => st.includes(t) || t.includes(st)))
    let score = Math.round((matches.length / eTokens.length) * 80)
    if (matches.length >= 2) score += Math.min(12, (matches.length - 1) * 8)
    if (ePct.length && ePct.some(t => sPct.includes(t))) score += 18
    best = Math.max(best, score)
  }

  return best
}

function lookupRRPAll(variantName, subType, productName, mainType, extraNames = []) {
  if (!subType) return null

  function tryName(name) {
    if (!name) return null
    let best = null
    let bestScore = 0
    for (const entry of allRRP) {
      if (!blindTypeMatches(entry.blind_type, mainType, subType)) continue
      const price = rrpPriceForSubtype(entry, subType)
      if (price == null || Number.isNaN(price)) continue
      const score = scoreRRPName(entry.fabric_name, name)
      if (score > bestScore) {
        best = entry
        bestScore = score
      }
    }
    return bestScore >= 45 ? best : null
  }

  const candidateNames = [
    ...extraNames,
    productName,
    variantName,
  ].map(v => String(v || '').trim()).filter(Boolean)

  let entry = null
  for (const name of candidateNames) {
    entry = tryName(name)
    if (entry) break
  }

  if (!entry) {
    const joinedNames = candidateNames.join(' ')
    const pctMatch = joinedNames.match(/(\d+)\s*%/)
    if (pctMatch) {
      const pct = pctMatch[1] + '%'
      entry = allRRP.find(r => blindTypeMatches(r.blind_type, mainType, subType)
        && r.fabric_name.includes(pct)
        && rrpPriceForSubtype(r, subType) != null)
    }
  }

  if (!entry && !candidateNames.length) {
    const matches = allRRP.filter(r => blindTypeMatches(r.blind_type, mainType, subType)
      && rrpPriceForSubtype(r, subType) != null)
    if (matches.length === 1) entry = matches[0]
  }

  if (!entry) return null
  return rrpPriceForSubtype(entry, subType)
}

function rrpLookupNamesForItem(i) {
  const pc = selProductCode[i]
  const v = selFabVar[i]
  const names = []
  if (pc?.code) names.push(pc.code)
  if (pc?.stock_category) names.push(`${pc.stock_category} ${pc.code || ''}`)
  if (v?.product?.name) names.push(v.product.name)
  return names
}

function selectedPriceMode(i) {
  if (document.getElementById(`mode-dp-${i}`)?.checked) return 'dp'
  if (document.getElementById(`mode-rrp-${i}`)?.checked) return 'rrp'
  return null
}

function resolveRRPRateForItem(i) {
  const subType = val(`subtype-${i}`)
  const mainType = val(`maintype-${i}`)
  const v = selFabVar[i]
  return lookupRRPAll(v?.name, subType, selFabProd[i]?.name, mainType, rrpLookupNamesForItem(i))
}

function setRateFromRRP(i, mode, showError = false) {
  const rrpRate = resolveRRPRateForItem(i)
  if (rrpRate === null) {
    if (showError) toast('No RRP found for this item. Check Product Code, fabric, blind type, or the RRP page.', 'error')
    setRRPModeRadio(i, null)
    return false
  }
  const rateInput = document.getElementById(`rate-${i}`)
  if (rateInput) {
    rateInput.value = mode === 'dp' ? Math.round(rrpRate / 2) : rrpRate
    setRRPModeRadio(i, mode)
    calcItem(i)
    return true
  }
  return false
}

function applyPriceMode(i, mode) {
  setRateFromRRP(i, mode, true)
}

function onRateManualInput(i) {
  // When user manually types a rate, clear the RRP/DP radio so it's not misleading
  const rrpRadio = document.getElementById(`mode-rrp-${i}`)
  const dpRadio  = document.getElementById(`mode-dp-${i}`)
  if (rrpRadio) rrpRadio.checked = false
  if (dpRadio)  dpRadio.checked  = false
  calcItem(i)
}

function setRRPModeRadio(i, mode) {
  const rrpRadio = document.getElementById(`mode-rrp-${i}`)
  const dpRadio  = document.getElementById(`mode-dp-${i}`)
  if (rrpRadio) rrpRadio.checked = mode === 'rrp'
  if (dpRadio)  dpRadio.checked  = mode === 'dp'
  // mode === null clears both (neither is checked)
}

function openOrderStockMasterModal() {
  const catOptions = allCategories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')
  openModal('Create Stock Master', `
    <div id="osm-alert" class="alert alert-error"></div>
    <p class="text-sm text-muted" style="margin-bottom:12px;">Create a category-only master, or add a blank product/variant without stock.</p>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Item Type <span style="color:#ef4444">*</span></label>
        <select id="osm-type">
          <option value="Fabric">Fabric</option>
          <option value="Parts">Parts / Hardware</option>
          <option value="FG">Finished Goods</option>
        </select>
      </div>
      <div class="form-group">
        <label>Category <span style="color:#ef4444">*</span></label>
        <select id="osm-cat" onchange="document.getElementById('osm-newcat-wrap').style.display = this.value === '__new' ? '' : 'none'">
          <option value="">Select...</option>
          ${catOptions}
          <option value="__new">+ New Category</option>
        </select>
      </div>
    </div>
    <div class="form-group" id="osm-newcat-wrap" style="display:none;">
      <label>New Category Name</label>
      <input id="osm-newcat" placeholder="e.g. Roller Blind Fabrics">
    </div>
    <div class="form-group">
      <label>Product Name <span class="text-xs text-muted">(blank creates only the category)</span></label>
      <input id="osm-product" placeholder="e.g. Classic Screen 5%">
    </div>
    <div class="form-group">
      <label>Variant Name <span class="text-xs text-muted">(blank = same as product)</span></label>
      <input id="osm-variant" placeholder="e.g. Classic Screen 5% Grey">
    </div>
    <div class="form-row cols-3">
      <div class="form-group">
        <label>Unit</label>
        <select id="osm-unit">
          ${['m','sqm','pcs','ft','set','nos'].map(u => `<option value="${u}">${u}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Width (m)</label><input id="osm-width" type="number" step="0.01" min="0" placeholder="Optional"></div>
      <div class="form-group"><label>Purchase Rate</label><input id="osm-rate" type="number" step="0.01" min="0" placeholder="Optional"></div>
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="osm-save-btn" onclick="saveOrderStockMaster()">Create Master</button>
    </div>
  `)
}

async function saveOrderStockMaster() {
  hideAlert('osm-alert')
  let catId = val('osm-cat')
  const type = val('osm-type') || 'Fabric'
  const newCatName = val('osm-newcat').trim()
  const productName = val('osm-product').trim()
  const variantName = val('osm-variant').trim() || productName
  const unit = val('osm-unit') || (type === 'Fabric' ? 'm' : 'pcs')
  const width = Number(val('osm-width') || 0) || null
  const rate = Number(val('osm-rate') || 0) || null

  if (catId === '__new') catId = ''
  if (!catId && !newCatName) { showAlert('osm-alert', 'Select or create a category'); return }

  const btn = document.getElementById('osm-save-btn')
  if (btn) {
    btn.disabled = true
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Creating...'
  }
  try {
    let category = allCategories.find(c => c.id === catId) || null
    if (!category) {
      const { data, error } = await db.from('inv_categories')
        .upsert({ name: newCatName, normalized_name: newCatName.toLowerCase().trim(), sub_group: type }, { onConflict: 'normalized_name' })
        .select('id, name, sub_group')
        .single()
      if (error) throw error
      category = data
      allCategories.push(category)
    }

    if (!productName) {
      await logActivity('create', 'category', category.id, category.name, { type })
      toast('Category master created')
      closeModal()
      return
    }

    let product = allProducts.find(p => p.category_id === category.id && normCatalogName(p.name) === normCatalogName(productName))
    if (!product) {
      const { data, error } = await db.from('inv_products')
        .upsert({ category_id: category.id, name: productName, normalized_name: productName.toLowerCase().trim() }, { onConflict: 'category_id,normalized_name' })
        .select('id, name, category_id')
        .single()
      if (error) throw error
      product = data
      allProducts.push(product)
    }

    const { data: variant, error: variantErr } = await db.from('inv_variants')
      .upsert({
        product_id: product.id,
        name: variantName,
        normalized_name: variantName.toLowerCase().trim(),
        unit,
        width_m: width,
        purchase_rate: rate,
        base_rate_sqm: width && rate ? rate / width : null,
      }, { onConflict: 'product_id,normalized_name' })
      .select('id, name, product_id, width_m, base_rate_sqm, unit, purchase_rate')
      .single()
    if (variantErr) throw variantErr

    const nextVariant = { ...variant, rolls: [], product, category }
    allVariants = allVariants.filter(v => v.id !== nextVariant.id).concat(nextVariant)
    allDirectItems = buildDirectOrderItems()
    await logActivity('create', 'stock_master', variant.id, `${category.name} / ${productName}`, { category: category.name, product: productName, variant: variantName, unit })
    toast('Stock master created')
    closeModal()
  } catch (err) {
    showAlert('osm-alert', err.message || String(err))
  } finally {
    if (btn) {
      btn.disabled = false
      btn.innerHTML = 'Create Master'
    }
  }
}

// ── State ─────────────────────────────────────────────────────────────────────
let allCategories = []
let allProducts   = []
let allVariants   = []
let allRecipes    = []
let allCustomers  = []
let allFGItems    = []   // fg_stock rows
let allDirectItems = []  // fg_stock + inventory variants marked as finished goods
let allRRP        = []   // rrp_entries - retail prices for all blind families
let allProductCodes = []
let itemCount     = 0
let selectedCustomer = null
let isNewCustomer    = false
let currentProfile   = null
let custDropOpen     = false
let activeTicket      = null
const ORDER_DRAFT_KEY = 'vista_create_order_draft_v1'
const QUOTE_DEFAULT_TERMS = {
  payment1: '50% Advance',
  payment2: 'Balance 50% within 7 days after installation',
  installation: 'Final measurements & Installation done by our Technician.',
  delivery: '7 to 8 days from the date of order processed with confirm PO',
}
const QUOTE_DEFAULT_BANK = {
  accountName: 'Timbervision LLP',
  bankName: 'HDFC Bank',
  branch: 'New Panvel East',
  accountNo: '50200111292252',
  ifsc: 'HDFC0000256',
}

function isSalesRole() {
  return currentProfile?.role === 'sales'
}

function canSeeMoney() {
  return !isSalesRole()
}

function canSeeCostDetails() {
  return !isSalesRole()
}

// Per-item fabric selection state (keyed by item index i)
const fabProdDropOpen = {}   // {i: bool}
const fabVarDropOpen  = {}   // {i: bool}
const selFabProd      = {}   // {i: product obj | null}
const selFabVar       = {}   // {i: variant obj | null}
const selRoll         = {}   // {i: roll_id | null}
const selTrackType    = {}   // {i: 'Super Track'|'Jumbo Track'|'M Track'|null}
const selFGItem       = {}   // {i: fg_stock obj | null}
const fgItemDropOpen  = {}   // {i: bool}
const selProductCode  = {}   // {i: product_codes row | null}
const productCodeDropOpen = {} // {i: bool}
const fgDimRowCounters = {}  // {i: last dimension row number}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const isEmbed = new URLSearchParams(window.location.search).get('embed') === '1'

  let profile
  if (isEmbed) {
    // In embed mode skip initSidebar entirely — it would render a full sidebar
    // inside the iframe causing the cascading sidebar visual bug.
    const session = await AUTH.requireAuth()
    if (!session) return
    profile = await AUTH.profile(session.user.id)
    if (!profile) return

    // Strip the app shell so the iframe renders as a plain content pane
    document.getElementById('sidebar')?.remove()
    document.querySelector('.back-link')?.remove()
    const app = document.querySelector('.app')
    if (app) {
      app.style.display = 'block'
      app.style.height = 'auto'
      app.style.overflow = 'visible'
    }
    document.documentElement.style.overflow = 'visible'
    document.documentElement.style.background = '#f8fafc'
    document.body.style.overflow = 'visible'
    document.body.style.background = '#f8fafc'
    const main = document.querySelector('.main')
    if (main) {
      main.style.height = 'auto'
      main.style.overflow = 'visible'
      main.style.padding = '0'
    }
    const content = document.getElementById('content')
    if (content) {
      content.style.maxWidth = 'none'
      content.style.margin = '0'
      content.style.width = '100%'
    }
  } else {
    profile = await initSidebar()
    if (!profile) return
  }

  currentProfile = profile
  if (isSalesRole()) document.getElementById('order-master-btn')?.remove()
  document.getElementById('order-date').value = new Date().toISOString().slice(0, 10)
  setFieldValue('quote-date', quoteInputDate())
  const [inventoryCatalog, recRes, recipeItemsRes, custRes, rrpRes, codeRes] = await Promise.all([
    INVENTORY_SOURCE.loadCatalog({ includeCosts: !isSalesRole() }),
    db.from('product_recipes')
      .select('id, blind_type')
      .eq('is_active', true)
      .order('blind_type'),
    db.from('recipe_items')
      .select('id, recipe_id, variant_id, quantity_per_unit, is_width_dependent, sort_order'),
    CUSTOMER_SOURCE.loadCustomers(),
    db.from('rrp_entries').select('*').order('blind_type').order('sort_order'),
    db.from('product_codes').select('id, stock_category, code, is_active').eq('is_active', true).order('stock_category').order('code'),
  ])

  if (inventoryCatalog.errors.categories) console.error('Categories:', inventoryCatalog.errors.categories)
  if (inventoryCatalog.errors.products)   console.error('Products:', inventoryCatalog.errors.products)
  if (inventoryCatalog.errors.variants)   console.error('Variants:', inventoryCatalog.errors.variants)
  if (inventoryCatalog.errors.fgStock)    console.warn('Finished goods:', inventoryCatalog.errors.fgStock.message)
  if (recRes.error)  toast(recRes.error.message, 'error')
  if (recipeItemsRes.error) console.warn('Recipe items:', recipeItemsRes.error.message)
  if (codeRes.error) console.warn('Product codes:', codeRes.error.message)

  allCategories = inventoryCatalog.categories
  allProducts   = inventoryCatalog.products
  allVariants   = inventoryCatalog.variants
  allCustomers  = (custRes.data || []).map(CUSTOMER_SOURCE.normalize)
  allFGItems    = inventoryCatalog.fgStock
  allDirectItems = buildDirectOrderItems()
  allRRP        = rrpRes.data  || []
  allProductCodes = codeRes.data || []
  const variantsById = new Map(allVariants.map(v => [v.id, v]))
  const recipeItems = recipeItemsRes.data || []
  allRecipes    = (recRes.data || []).map(r => ({
    ...r,
    recipe_items: recipeItems
      .filter(ri => ri.recipe_id === r.id)
      .map(ri => ({ ...ri, inv_variants: variantsById.get(ri.variant_id) || null }))
      .sort((a, b) => a.sort_order - b.sort_order),
  }))

  renderNewCustomerForm()
  renderCustomerDropdown()
  await loadTicketPrefill()
  if (!restoreOrderDraft()) addItem()
  setupOrderDraftAutosave()

  // Close all dropdowns when clicking outside
  document.addEventListener('click', e => {
    if (!e.target.closest('[id^="fab-prod-select-"]') && !e.target.closest('[id^="fab-prod-drop-"]')) {
      Object.keys(fabProdDropOpen).forEach(i => closeFabProdDrop(i))
    }
    if (!e.target.closest('[id^="fab-var-select-"]') && !e.target.closest('[id^="fab-var-drop-"]')) {
      Object.keys(fabVarDropOpen).forEach(i => closeFabVarDrop(i))
    }
    if (!e.target.closest('[id^="fgi-select-"]') && !e.target.closest('[id^="fgi-drop-"]')) {
      Object.keys(fgItemDropOpen).forEach(i => closeFGIDrop(i))
    }
    if (!e.target.closest('[id^="pc-select-"]') && !e.target.closest('[id^="pc-drop-"]')) {
      Object.keys(productCodeDropOpen).forEach(i => closeProductCodeDrop(i))
    }
    if (!e.target.closest('#cust-select-wrap')) closeCustDropdown()
  })

  hide('loading')
  show('content')
  applyCreateOrderRoleVisibility()
  setupEmbedAutoHeight()
}

function applyCreateOrderRoleVisibility() {
  if (!isSalesRole()) return

  if (!document.getElementById('sales-role-hide-money-style')) {
    const style = document.createElement('style')
    style.id = 'sales-role-hide-money-style'
    style.textContent = `
      [id^="purchase-rate-info-"],
      [id^="rm-cost-info-"],
      [id^="fgi-cost-info-"],
      [id^="rm-margin-badge-"],
      [id^="margin-badge-"],
      [id^="fgi-margin-badge-"] {
        display: none !important;
      }
    `
    document.head.appendChild(style)
  }

}

function setupEmbedAutoHeight() {
  const isEmbed = new URLSearchParams(window.location.search).get('embed') === '1'
  if (!isEmbed || !window.parent || window.parent === window) return
  const sendHeight = () => {
    const height = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.querySelector('.main')?.scrollHeight || 0
    )
    window.parent.postMessage({ type: 'create-order-height', height }, '*')
  }
  window.addEventListener('message', e => {
    if (e.data?.type === 'request-create-order-height') sendHeight()
  })
  if ('ResizeObserver' in window) {
    new ResizeObserver(sendHeight).observe(document.body)
  }
  setTimeout(sendHeight, 0)
  setTimeout(sendHeight, 300)
}

// ── Customer — searchable dropdown ───────────────────────────────────────────
function renderNewCustomerForm() {
  const wrap = document.getElementById('cust-new-section')
  if (!wrap) return
  wrap.innerHTML = `
    ${CUSTOMER_SOURCE.formFields('nc', {}, { nameLabel: 'Full Name' })}
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
      <button class="btn btn-secondary btn-sm" type="button" onclick="toggleNewCustomer(false)">Back to Profiles</button>
      <button class="btn btn-primary btn-sm" type="button" id="save-customer-profile-btn" onclick="saveFilledCustomerProfile()">
        <i class="fa-solid fa-address-card"></i> Save Profile
      </button>
    </div>`
}

function renderCustomerDropdown() {
  const select = document.getElementById('cust-select')
  if (!select) {
    renderCustomerList('')
    return
  }
  const current = selectedCustomer?.id || ''
  select.innerHTML = '<option value="">Select a customer...</option>' + allCustomers.map(c => {
    const label = [c.name, c.phone, c.city].filter(Boolean).join(' - ')
    return `<option value="${esc(c.id)}">${esc(label)}</option>`
  }).join('')
  select.value = current
}

function renderCustomerList(q) {
  const matches = CUSTOMER_SOURCE.filter(allCustomers, q)
  const listEl = document.getElementById('cust-list')
  if (!listEl) return
  if (!matches.length) {
    listEl.innerHTML = `<div style="padding:12px 14px;font-size:13px;color:#9ca3af;">No customers found</div>`
    return
  }
  listEl.innerHTML = matches.slice(0, 50).map(c => `
    <div class="cust-option"
         onmousedown="selectCustomer(${JSON.stringify(c).replace(/"/g, '&quot;')})"
         style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:13px;">
      <div class="fw-600">${esc(c.name)}</div>
      <div class="text-xs text-muted">${[c.phone, c.city].filter(Boolean).join(' · ')}</div>
    </div>`).join('')
}

function filterCustomerList(q) { renderCustomerList(q) }
function selectCustomerById(id) {
  if (!id) {
    clearCustomer()
    return
  }
  const customer = allCustomers.find(c => c.id === id)
  if (customer) selectCustomer(customer)
}
function openCustDropdown() {
  const dd = document.getElementById('cust-dropdown')
  if (dd) dd.style.display = ''
  custDropOpen = true
  document.getElementById('cust-search-input')?.focus()
}
function closeCustDropdown() {
  const dd = document.getElementById('cust-dropdown')
  if (dd) dd.style.display = 'none'
  custDropOpen = false
}
function toggleCustDropdown() {
  if (custDropOpen) closeCustDropdown(); else openCustDropdown()
}
function selectCustomer(c) {
  selectedCustomer = c
  closeCustDropdown()
  const searchInput = document.getElementById('cust-search-input')
  if (searchInput) searchInput.value = ''
  const customerSelect = document.getElementById('cust-select')
  if (customerSelect) customerSelect.value = c.id
  renderCustomerList('')
  const sel = document.getElementById('cust-selected')
  sel.style.display = ''
  text('cust-sel-name', c.name)
  text('cust-sel-details', [c.phone, c.city, c.state].filter(Boolean).join(' · '))
  fillQuoteAddressFromCustomer(c)
  const placeholder = document.getElementById('cust-placeholder')
  if (placeholder) placeholder.style.display = 'none'
  saveOrderDraft()
}
function clearCustomer() {
  selectedCustomer = null
  const customerSelect = document.getElementById('cust-select')
  if (customerSelect) customerSelect.value = ''
  document.getElementById('cust-selected').style.display = 'none'
  const placeholder = document.getElementById('cust-placeholder')
  if (placeholder) placeholder.style.display = ''
  saveOrderDraft()
}
function toggleNewCustomer(newMode) {
  isNewCustomer = newMode
  const searchSec = document.getElementById('cust-search-section')
  const newSec    = document.getElementById('cust-new-section')
  const newBtn    = document.getElementById('cust-new-btn')
  const backBtn   = document.getElementById('cust-search-btn')
  if (newMode) {
    if (!newSec.innerHTML.trim()) renderNewCustomerForm()
    searchSec.style.display = 'none'; newSec.style.display = ''
    newBtn.style.display = 'none'; backBtn.style.display = ''
  } else {
    newSec.style.display = 'none'; searchSec.style.display = ''
    newBtn.style.display = ''; backBtn.style.display = 'none'
  }
  saveOrderDraft()
}

async function saveFilledCustomerProfile() {
  hideAlert('order-alert')
  const payload = CUSTOMER_SOURCE.readForm('nc', { createdBy: currentProfile?.id })
  if (!payload.name) {
    showAlert('order-alert', 'Customer name is required before saving profile')
    return null
  }
  disable('save-customer-profile-btn')
  const { data, error } = await CUSTOMER_SOURCE.insertCustomer(payload)
  disable('save-customer-profile-btn', false)
  if (error) {
    showAlert('order-alert', error.message)
    return null
  }
  const customer = CUSTOMER_SOURCE.normalize(data)
  allCustomers = [...allCustomers.filter(c => c.id !== customer.id), customer]
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  selectedCustomer = customer
  isNewCustomer = false
  renderCustomerDropdown()
  toggleNewCustomer(false)
  selectCustomer(customer)
  toast('Customer profile saved')
  return customer
}

// ── Add / Remove Items ────────────────────────────────────────────────────────
function addItem() {
  itemCount++
  const i = itemCount
  selFabProd[i] = null; selFabVar[i] = null; selRoll[i] = null
  fabProdDropOpen[i] = false; fabVarDropOpen[i] = false
  selTrackType[i] = null
  selFGItem[i] = null; fgItemDropOpen[i] = false
  selProductCode[i] = null; productCodeDropOpen[i] = false
  fgDimRowCounters[i] = 1
  const div = document.createElement('div')
  div.className = 'item-card'
  div.id = `item-${i}`
  div.innerHTML = buildItemHTML(i)
  document.getElementById('items-container').appendChild(div)
  renumberItemCards()
  updateGrand()
}

function removeItem(i) {
  document.getElementById(`item-${i}`)?.remove()
  delete selFabProd[i]; delete selFabVar[i]; delete selRoll[i]
  delete fabProdDropOpen[i]; delete fabVarDropOpen[i]
  delete selTrackType[i]
  delete selFGItem[i]; delete fgItemDropOpen[i]
  delete selProductCode[i]; delete productCodeDropOpen[i]
  delete fgDimRowCounters[i]
  renumberItemCards()
  updateGrand()
}

function renumberItemCards() {
  document.querySelectorAll('#items-container .item-card').forEach((card, index) => {
    const label = card.querySelector('.item-title')
    if (label) label.textContent = `Item ${index + 1}`
  })
}

function dimUnitOptions(selected = 'cm') {
  return DIM_UNITS.map(u => `<option value="${u}" ${u === selected ? 'selected' : ''}>${u}</option>`).join('')
}

function fmtPlainNumber(n, decimals = 3) {
  const v = Number(n || 0)
  if (!Number.isFinite(v)) return '0'
  return v % 1 === 0 ? v.toFixed(0) : parseFloat(v.toFixed(decimals)).toString()
}

function buildFGDimensionRowHTML(i, rowId, canRemove = false) {
  return `
    <div class="fg-dimension-row" data-row-id="${rowId}">
      <div class="form-group" style="margin:0;">
        <label>Quantity</label>
        <input id="q-${i}-${rowId}" type="number" min="0" step="any" value="1" oninput="calcItem(${i})">
      </div>
      <div class="form-group" style="margin:0;">
        <label>Width <span style="color:#ef4444">*</span></label>
        <div style="display:flex;gap:4px;">
          <input id="w-${i}-${rowId}" type="number" min="0.01" step="0.01" oninput="calcItem(${i})" style="flex:1;">
          <select id="wu-${i}-${rowId}" style="width:70px;" onchange="calcItem(${i})">${dimUnitOptions()}</select>
        </div>
      </div>
      <div class="form-group" style="margin:0;">
        <label>Height / Drop <span style="color:#ef4444">*</span></label>
        <div style="display:flex;gap:4px;">
          <input id="h-${i}-${rowId}" type="number" min="0.01" step="0.01" oninput="calcItem(${i})" style="flex:1;">
          <select id="hu-${i}-${rowId}" style="width:70px;" onchange="calcItem(${i})">${dimUnitOptions()}</select>
        </div>
      </div>
      <div class="form-group" style="margin:0;">
        <label>SQM</label>
        <input id="sqm-${i}-${rowId}" readonly class="fg-sqm-output" value="0.000">
      </div>
      <button class="btn btn-ghost btn-sm fg-dimension-remove" type="button"
              onclick="removeFGDimensionRow(${i}, ${rowId})"
              ${canRemove ? '' : 'style="visibility:hidden;" aria-hidden="true" tabindex="-1"'}>
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>`
}

function buildItemHTML(i) {
  const dimOpts = dimUnitOptions()

  const rmCatOpts = allCategories
    .filter(c => !['fg', 'finished goods'].includes(String(c.sub_group || '').toLowerCase()) && !isHiddenOrderCategory(c))
    .map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')

  const mainTypeOpts = Object.keys(BLIND_TYPE_TREE)
    .filter(t => !HIDDEN_ORDER_MAIN_TYPES.has(t))
    .map(t => `<option value="${t}">${esc(t)}</option>`).join('')

  return `
  <div class="item-card-header">
    <span class="item-title">Item ${i}</span>
    <button class="btn btn-ghost btn-sm" style="color:#ef4444" onclick="removeItem(${i})">
      <i class="fa-solid fa-trash"></i>
    </button>
  </div>

  <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
    <button id="type-fg-${i}" class="type-toggle-btn active" onclick="setItemType(${i},'fg')">
      <i class="fa-solid fa-blinds"></i> Finished Goods
    </button>
    <button id="type-rm-${i}" class="type-toggle-btn" onclick="setItemType(${i},'rm')">
      <i class="fa-solid fa-boxes-stacked"></i> Raw Material
    </button>
    <button id="type-track-${i}" class="type-toggle-btn" onclick="setItemType(${i},'track')">
      <i class="fa-solid fa-ruler-horizontal"></i> Track
    </button>
    <button id="type-resale-${i}" class="type-toggle-btn" onclick="setItemType(${i},'resale')">
      <i class="fa-solid fa-tag"></i> Direct Order
    </button>
  </div>

  <div class="form-group" style="margin-bottom:14px;" id="pc-select-${i}">
    <label>Product Code</label>
    <div style="position:relative;">
      <div id="pc-trigger-${i}"
           style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border);border-radius:8px;cursor:pointer;background:#fff;font-size:14px;color:#9ca3af;user-select:none;"
           onclick="toggleProductCodeDrop(${i})">
        <span id="pc-placeholder-${i}">Select product code…</span>
        <i class="fa-solid fa-chevron-down" style="color:#9ca3af;flex-shrink:0;font-size:12px;"></i>
      </div>
      <div id="pc-sel-card-${i}"
           style="display:none;margin-top:6px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <div>
            <div class="fw-600 text-sm" id="pc-sel-code-${i}"></div>
            <div class="text-xs text-muted" id="pc-sel-category-${i}"></div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="clearProductCode(${i})" style="color:#6b7280;padding:2px 6px;font-size:16px;line-height:1;">×</button>
        </div>
      </div>
      <div id="pc-drop-${i}"
           style="display:none;position:absolute;top:calc(100% + 2px);left:0;right:0;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:180;">
        <div style="padding:8px 10px;border-bottom:1px solid var(--border);">
          <input id="pc-search-${i}" placeholder="Search product code or category…"
                 oninput="renderProductCodeList(${i},this.value)"
                 autocomplete="off"
                 style="width:100%;border:none;outline:none;font-size:13px;background:transparent;">
        </div>
        <div id="pc-list-${i}" style="max-height:240px;overflow-y:auto;"></div>
      </div>
    </div>
  </div>

  <!-- ── Finished Goods section ── -->
  <div id="fg-section-${i}">
    <div class="form-row cols-2" style="margin-bottom:12px;">
      <div class="form-group" style="margin:0;">
        <label>Blind Type <span style="color:#ef4444">*</span></label>
        <select id="maintype-${i}" onchange="onMainTypeChange(${i})">
          <option value="">Select type…</option>
          ${mainTypeOpts}
        </select>
      </div>
      <div class="form-group" style="margin:0;">
        <label>Sub-Type / Mechanism <span style="color:#ef4444">*</span></label>
        <select id="subtype-${i}" onchange="onSubTypeChange(${i})" disabled>
          <option value="">Select…</option>
        </select>
      </div>
    </div>

    <!-- Fabric Product (shown after main type selected) -->
    <div id="fab-prod-wrap-${i}" class="form-group" style="margin-bottom:12px;display:none;">
      <label>Fabric Product <span style="color:#ef4444">*</span></label>
      <div style="position:relative;" id="fab-prod-select-${i}">
        <div id="fab-prod-trigger-${i}"
             style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border);border-radius:8px;cursor:pointer;background:#fff;font-size:14px;color:#9ca3af;user-select:none;"
             onclick="toggleFabProdDrop(${i})">
          <span id="fab-prod-placeholder-${i}">Select fabric product…</span>
          <i class="fa-solid fa-chevron-down" style="color:#9ca3af;flex-shrink:0;font-size:12px;"></i>
        </div>
        <div id="fab-prod-sel-card-${i}"
             style="display:none;margin-top:6px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div class="fw-600 text-sm" id="fab-prod-sel-name-${i}"></div>
              <div class="text-xs text-muted" id="fab-prod-sel-info-${i}"></div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="clearFabProd(${i})" style="color:#6b7280;padding:2px 6px;font-size:16px;line-height:1;">×</button>
          </div>
        </div>
        <div id="fab-prod-drop-${i}"
             style="display:none;position:absolute;top:calc(100% + 2px);left:0;right:0;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:150;">
          <div style="padding:8px 10px;border-bottom:1px solid var(--border);">
            <input id="fab-prod-search-${i}" placeholder="Search product…"
                   oninput="onFabProdSearch(${i},this.value)"
                   autocomplete="off"
                   style="width:100%;border:none;outline:none;font-size:13px;background:transparent;">
          </div>
          <div id="fab-prod-list-${i}" style="max-height:220px;overflow-y:auto;"></div>
        </div>
      </div>
    </div>

    <!-- Fabric Variant (shown after product selected) -->
    <div id="fab-var-wrap-${i}" class="form-group" style="margin-bottom:12px;display:none;">
      <label>Fabric Variant <span style="color:#ef4444">*</span></label>
      <div style="position:relative;" id="fab-var-select-${i}">
        <div id="fab-var-trigger-${i}"
             style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border);border-radius:8px;cursor:pointer;background:#fff;font-size:14px;color:#9ca3af;user-select:none;"
             onclick="toggleFabVarDrop(${i})">
          <span id="fab-var-placeholder-${i}">Select variant…</span>
          <i class="fa-solid fa-chevron-down" style="color:#9ca3af;flex-shrink:0;font-size:12px;"></i>
        </div>
        <div id="fab-var-sel-card-${i}"
             style="display:none;margin-top:6px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div class="fw-600 text-sm" id="fab-var-sel-name-${i}"></div>
              <div class="text-xs text-muted" id="fab-var-sel-info-${i}"></div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="clearFabVar(${i})" style="color:#6b7280;padding:2px 6px;font-size:16px;line-height:1;">×</button>
          </div>
        </div>
        <div id="fab-var-drop-${i}"
             style="display:none;position:absolute;top:calc(100% + 2px);left:0;right:0;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:150;">
          <div style="padding:8px 10px;border-bottom:1px solid var(--border);">
            <input id="fab-var-search-${i}" placeholder="Search variant…"
                   oninput="onFabVarSearch(${i},this.value)"
                   autocomplete="off"
                   style="width:100%;border:none;outline:none;font-size:13px;background:transparent;">
          </div>
          <div id="fab-var-list-${i}" style="max-height:220px;overflow-y:auto;"></div>
        </div>
      </div>
      <div id="fabric-warn-${i}" style="color:#ef4444;font-size:11px;margin-top:4px;display:none;"></div>
    </div>

    <!-- Roll Picker (shown after variant selected, when multiple rolls exist) -->
    <div id="roll-pick-wrap-${i}" style="margin-bottom:12px;display:none;">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:6px;">
        <i class="fa-solid fa-layer-group" style="margin-right:4px;"></i>Pick Roll to Cut From
      </div>
      <div id="roll-pick-${i}"></div>
    </div>

    <!-- Selling Rate + Cost Rate (shown when fabric variant is selected) -->
    <div id="rate-section-${i}" style="margin-bottom:12px;display:none;">
      <!-- Purchase rate per meter info -->
      <div id="purchase-rate-info-${i}" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:7px 12px;margin-bottom:6px;">
        <i class="fa-solid fa-receipt" style="color:#3b82f6;font-size:12px;"></i>
        <span style="font-size:12px;color:#1e40af;font-weight:500;">Purchase Rate:</span>
        <span id="purchase-rate-val-${i}" style="font-size:13px;font-weight:700;color:#1d4ed8;">—</span>
        <span style="color:#93c5fd;margin:0 4px;">→</span>
        <span style="font-size:12px;color:#78350f;font-weight:500;">Cost / m²:</span>
        <span id="cost-rate-val-${i}" style="font-size:13px;font-weight:700;color:#92400e;">—</span>
        <span style="font-size:10px;color:#b45309;">(purchase ÷ width)</span>
      </div>
      <!-- Price mode (RRP / DP) + rate + discount row -->
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:8px 12px;">
        <i class="fa-solid fa-tag" style="color:#059669;font-size:12px;"></i>
        <!-- RRP / DP selector -->
        <div style="display:flex;gap:6px;align-items:center;" id="price-mode-wrap-${i}">
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px;font-weight:600;color:#059669;">
            <input type="radio" name="price-mode-${i}" id="mode-rrp-${i}" value="rrp"
                   onchange="applyPriceMode(${i},'rrp')"
                   style="accent-color:#059669;cursor:pointer;">
            RRP
          </label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px;font-weight:600;color:#7c3aed;">
            <input type="radio" name="price-mode-${i}" id="mode-dp-${i}" value="dp"
                   onchange="applyPriceMode(${i},'dp')"
                   style="accent-color:#7c3aed;cursor:pointer;">
            DP
          </label>
        </div>
        <span style="color:#d1d5db;margin:0 2px;">|</span>
        <span style="font-size:12px;color:#374151;font-weight:500;">Rate (₹/m²):</span>
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="color:#6b7280;font-size:13px;">₹</span>
          <input type="number" id="rate-${i}" step="0.01" min="0"
                 style="width:110px;padding:5px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:13px;"
                 oninput="onRateManualInput(${i})" placeholder="0.00">
          <span class="text-xs text-muted">/ m²</span>
        </div>
        <span style="color:#d1d5db;margin:0 2px;">|</span>
        <span style="font-size:12px;color:#374151;font-weight:500;">Discount:</span>
        <div style="display:flex;align-items:center;gap:4px;">
          <input type="number" id="disc-${i}" step="0.1" min="0" max="100"
                 style="width:68px;padding:5px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:13px;"
                 oninput="calcItem(${i})" placeholder="0">
          <span class="text-xs text-muted">%</span>
        </div>
        <span id="margin-badge-${i}" style="margin-left:auto;font-size:11px;padding:2px 8px;border-radius:999px;font-weight:700;display:none;"></span>
      </div>
    </div>

    <div class="fg-dimensions-wrap" style="margin-bottom:12px;">
      <div class="fg-dimensions-head">
        <span>Blind Dimensions</span>
        <button class="btn btn-secondary btn-sm" type="button" onclick="addFGDimensionRow(${i})">
          <i class="fa-solid fa-plus"></i> Add Row
        </button>
      </div>
      <div id="fg-dim-rows-${i}" class="fg-dimension-rows">
        ${buildFGDimensionRowHTML(i, 1, false)}
      </div>
    </div>

    <div id="sub-${i}" class="item-subtotal"></div>

    <div id="bom-wrap-${i}" style="display:none;margin-top:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:6px 0;"
           onclick="toggleBOM(${i})">
        <span class="text-xs fw-600" style="text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);">
          <i class="fa-solid fa-list-check" style="margin-right:4px;"></i>Components
        </span>
        <i class="fa-solid fa-chevron-down text-xs text-muted" id="bom-chevron-${i}"></i>
      </div>
      <div id="bom-body-${i}" class="d-none"></div>
    </div>
  </div>

  <!-- ── Raw Material section ── -->
  <div id="rm-section-${i}" style="display:none;">
    <div class="form-row cols-2" style="margin-bottom:12px;">
      <div class="form-group" style="margin:0;">
        <label>Category <span style="color:#ef4444">*</span></label>
        <select id="rm-cat-${i}" onchange="onRMCatChange(${i})">
          <option value="">Select…</option>
          ${rmCatOpts}
        </select>
      </div>
      <div class="form-group" style="margin:0;">
        <label>Product <span style="color:#ef4444">*</span></label>
        <select id="rm-prod-${i}" onchange="onRMProdChange(${i})" disabled>
          <option value="">Select…</option>
        </select>
      </div>
    </div>
    <div class="form-row cols-2" style="margin-bottom:12px;">
      <div class="form-group" style="margin:0;">
        <label>Variant <span style="color:#ef4444">*</span></label>
        <select id="rm-var-${i}" onchange="calcRMItem(${i})" disabled>
          <option value="">Select…</option>
        </select>
      </div>
      <div class="form-group" style="margin:0;">
        <label>Quantity <span style="color:#ef4444">*</span></label>
        <div style="display:flex;gap:4px;">
          <input id="rm-qty-${i}" type="number" min="0.001" step="0.001" oninput="calcRMItem(${i})" style="flex:1;" placeholder="0">
          <select id="rm-unit-${i}" style="width:80px;" onchange="calcRMItem(${i})">
            <option value="m">m</option>
            <option value="pcs">pcs</option>
            <option value="set">set</option>
            <option value="nos">nos</option>
            <option value="sqm">sqm</option>
            <option value="ft">ft</option>
          </select>
        </div>
      </div>
    </div>
    <div id="rm-rate-wrap-${i}" style="display:none;margin-bottom:12px;">
      <div id="rm-cost-info-${i}" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:7px 12px;margin-bottom:6px;">
        <i class="fa-solid fa-receipt" style="color:#3b82f6;font-size:12px;"></i>
        <span style="font-size:12px;color:#1e40af;font-weight:500;">Purchase Rate:</span>
        <span id="rm-cost-val-${i}" style="font-size:13px;font-weight:700;color:#1d4ed8;">—</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:8px 12px;">
        <i class="fa-solid fa-tag" style="color:#059669;font-size:12px;"></i>
        <span style="font-size:12px;font-weight:500;">Selling Rate <span id="rm-rate-unit-${i}" style="color:#6b7280;">(₹/unit)</span>:</span>
        <span style="color:#6b7280;font-size:13px;">₹</span>
        <input type="number" id="rm-rate-${i}" step="0.01" min="0" oninput="calcRMItem(${i})"
               style="width:120px;padding:5px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:13px;" placeholder="0.00">
        <span id="rm-margin-badge-${i}" style="margin-left:auto;font-size:11px;padding:2px 8px;border-radius:999px;font-weight:700;display:none;"></span>
      </div>
    </div>
    <div id="rm-sub-${i}" class="item-subtotal"></div>
  </div>

  <!-- ── M Tracks section ── -->
  <div id="track-section-${i}" style="display:none;">
    <div class="form-group" style="margin-bottom:12px;">
      <label>Track Type <span style="color:#ef4444">*</span></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="ttype-super-${i}" class="type-toggle-btn" onclick="setTrackType(${i},'Super Track')">Super Track</button>
        <button id="ttype-jumbo-${i}" class="type-toggle-btn" onclick="setTrackType(${i},'Jumbo Track')">Jumbo Track</button>
        <button id="ttype-m-${i}" class="type-toggle-btn" onclick="setTrackType(${i},'M Track')">M Track</button>
      </div>
    </div>

    <div class="form-row cols-2" style="margin-bottom:12px;">
      <div class="form-group" style="margin:0;">
        <label>Quantity <span style="color:#ef4444">*</span></label>
        <input id="trk-qty-${i}" type="number" min="1" step="1" value="1" oninput="calcTrackItem(${i})">
      </div>
      <div class="form-group" style="margin:0;">
        <label>Length <span style="color:#ef4444">*</span></label>
        <div style="display:flex;gap:4px;">
          <input id="trk-len-${i}" type="number" min="0.01" step="0.01" oninput="calcTrackItem(${i})" style="flex:1;" placeholder="0">
          <select id="trk-unit-${i}" style="width:70px;" onchange="calcTrackItem(${i})">
            <option value="in">in</option>
            <option value="ft">ft</option>
            <option value="m">m</option>
            <option value="cm">cm</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Calculation breakdown (shown when length is entered) -->
    <div id="trk-calc-${i}" style="display:none;margin-bottom:12px;"></div>

    <!-- Selling rate input (shown when track type is selected) -->
    <div id="trk-rate-wrap-${i}" style="display:none;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:8px 12px;">
        <i class="fa-solid fa-tag" style="color:#059669;font-size:12px;"></i>
        <span style="font-size:12px;font-weight:500;">Selling Rate (₹/track):</span>
        <span style="color:#6b7280;font-size:13px;">₹</span>
        <input type="number" id="trk-rate-${i}" step="0.01" min="0" oninput="calcTrackItem(${i})"
               style="width:110px;padding:5px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:13px;" placeholder="0.00">
        <span class="text-xs text-muted">/ track</span>
      </div>
    </div>

    <div id="trk-sub-${i}" class="item-subtotal"></div>

    <!-- Raw material components list -->
    <div id="trk-components-${i}" style="display:none;margin-top:10px;"></div>
  </div>

  <!-- ── Resale Item section ── -->
  <div id="resale-section-${i}" style="display:none;">
    <!-- Item searchable dropdown -->
    <div class="form-group" style="margin-bottom:12px;">
      <label>Finished Good / Resale Item <span style="color:#ef4444">*</span></label>
      <div style="position:relative;" id="fgi-select-${i}">
        <div id="fgi-trigger-${i}"
             style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border);border-radius:8px;cursor:pointer;background:#fff;font-size:14px;color:#9ca3af;user-select:none;"
             onclick="toggleFGIDrop(${i})">
          <span id="fgi-placeholder-${i}">Select item…</span>
          <i class="fa-solid fa-chevron-down" style="color:#9ca3af;flex-shrink:0;font-size:12px;"></i>
        </div>
        <div id="fgi-sel-card-${i}"
             style="display:none;margin-top:6px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div class="fw-600 text-sm" id="fgi-sel-name-${i}"></div>
              <div class="text-xs text-muted" id="fgi-sel-info-${i}"></div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="clearFGIItem(${i})" style="color:#6b7280;padding:2px 6px;font-size:16px;line-height:1;">×</button>
          </div>
        </div>
        <div id="fgi-drop-${i}"
             style="display:none;position:absolute;top:calc(100% + 2px);left:0;right:0;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:150;">
          <div style="padding:8px 10px;border-bottom:1px solid var(--border);">
            <input id="fgi-search-${i}" placeholder="Search by code or name…"
                   oninput="onFGISearch(${i},this.value)"
                   autocomplete="off"
                   style="width:100%;border:none;outline:none;font-size:13px;background:transparent;">
          </div>
          <div id="fgi-list-${i}" style="max-height:220px;overflow-y:auto;"></div>
        </div>
      </div>
    </div>

    <!-- Rate + Qty row (shown after item selected) -->
    <div id="fgi-rate-wrap-${i}" style="display:none;margin-bottom:12px;">
      <!-- Purchase cost reference -->
      <div id="fgi-cost-info-${i}" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:7px 12px;margin-bottom:6px;">
        <i class="fa-solid fa-receipt" style="color:#3b82f6;font-size:12px;"></i>
        <span style="font-size:12px;color:#1e40af;font-weight:500;">Purchase Cost:</span>
        <span id="fgi-cost-val-${i}" style="font-size:13px;font-weight:700;color:#1d4ed8;">—</span>
      </div>
      <!-- Selling rate input -->
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:8px 12px;">
        <i class="fa-solid fa-tag" style="color:#059669;font-size:12px;"></i>
        <span style="font-size:12px;font-weight:500;">Selling Rate <span id="fgi-rate-unit-${i}" style="color:#6b7280;">(₹/pcs)</span>:</span>
        <span style="color:#6b7280;font-size:13px;">₹</span>
        <input type="number" id="fgi-rate-${i}" step="0.01" min="0" oninput="calcResaleItem(${i})"
               style="width:120px;padding:5px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:13px;" placeholder="0.00">
        <span id="fgi-margin-badge-${i}" style="margin-left:auto;font-size:11px;padding:2px 8px;border-radius:999px;font-weight:700;display:none;"></span>
      </div>
    </div>

    <div id="fgi-qty-wrap-${i}" style="display:none;margin-bottom:12px;">
      <div class="form-row cols-3">
        <div class="form-group" style="margin:0;">
          <label>Quantity <span style="color:#ef4444">*</span></label>
          <input id="fgi-qty-${i}" type="number" min="0.001" step="0.001" value="1" oninput="calcResaleItem(${i})">
        </div>
        <div class="form-group" style="margin:0;">
          <label>Width</label>
          <div style="display:flex;gap:4px;">
            <input id="fgi-w-${i}" type="number" min="0.01" step="0.01" oninput="calcResaleItem(${i})" style="flex:1;" placeholder="Optional">
            <select id="fgi-wu-${i}" style="width:70px;" onchange="calcResaleItem(${i})">${dimOpts}</select>
          </div>
        </div>
        <div class="form-group" style="margin:0;">
          <label>Length</label>
          <div style="display:flex;gap:4px;">
            <input id="fgi-h-${i}" type="number" min="0.01" step="0.01" oninput="calcResaleItem(${i})" style="flex:1;" placeholder="Optional">
            <select id="fgi-hu-${i}" style="width:70px;" onchange="calcResaleItem(${i})">${dimOpts}</select>
          </div>
        </div>
      </div>
    </div>

    <div id="resale-sub-${i}" class="item-subtotal"></div>
  </div>`
}

// ── Item type toggle ──────────────────────────────────────────────────────────
function addFGDimensionRow(i, seed = {}) {
  const wrap = document.getElementById(`fg-dim-rows-${i}`)
  if (!wrap) return
  const next = (fgDimRowCounters[i] || wrap.querySelectorAll('.fg-dimension-row').length || 1) + 1
  fgDimRowCounters[i] = next
  wrap.insertAdjacentHTML('beforeend', buildFGDimensionRowHTML(i, next, true))
  if (seed.qty != null) setFieldValue(`q-${i}-${next}`, seed.qty)
  if (seed.wRaw != null) setFieldValue(`w-${i}-${next}`, seed.wRaw)
  if (seed.hRaw != null) setFieldValue(`h-${i}-${next}`, seed.hRaw)
  if (seed.wUnit) setFieldValue(`wu-${i}-${next}`, seed.wUnit)
  if (seed.hUnit) setFieldValue(`hu-${i}-${next}`, seed.hUnit)
  calcItem(i)
}

function removeFGDimensionRow(i, rowId) {
  const wrap = document.getElementById(`fg-dim-rows-${i}`)
  if (!wrap) return
  const rows = wrap.querySelectorAll('.fg-dimension-row')
  if (rows.length <= 1) return
  wrap.querySelector(`.fg-dimension-row[data-row-id="${rowId}"]`)?.remove()
  calcItem(i)
}

function readFGDimensionRows(i) {
  const rows = [...document.querySelectorAll(`#fg-dim-rows-${i} .fg-dimension-row`)]
  return rows.map((rowEl, index) => {
    const rowId = rowEl.dataset.rowId
    const qtyRaw = parseFloat(document.getElementById(`q-${i}-${rowId}`)?.value)
    const wRaw = parseFloat(document.getElementById(`w-${i}-${rowId}`)?.value)
    const hRaw = parseFloat(document.getElementById(`h-${i}-${rowId}`)?.value)
    const wUnit = document.getElementById(`wu-${i}-${rowId}`)?.value || 'cm'
    const hUnit = document.getElementById(`hu-${i}-${rowId}`)?.value || 'cm'
    const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 0
    const hasWidth = Number.isFinite(wRaw) && wRaw > 0
    const hasHeight = Number.isFinite(hRaw) && hRaw > 0
    const w_cm = hasWidth ? cvtUnit(wRaw, wUnit, 'cm') : NaN
    const h_cm = hasHeight ? cvtUnit(hRaw, hUnit, 'cm') : NaN
    const w_m = Number.isFinite(w_cm) ? w_cm / 100 : NaN
    const h_m = Number.isFinite(h_cm) ? h_cm / 100 : NaN
    const areaSqm = qty > 0 && Number.isFinite(w_m) && Number.isFinite(h_m) ? w_m * h_m * qty : 0
    const out = document.getElementById(`sqm-${i}-${rowId}`)
    if (out) out.value = areaSqm > 0 ? areaSqm.toFixed(3) : '0.000'
    return { rowId, index: index + 1, qty, qtyRaw, wRaw, hRaw, wUnit, hUnit, w_cm, h_cm, w_m, h_m, areaSqm, hasWidth, hasHeight }
  })
}

function setItemType(i, type) {
  const fgSec     = document.getElementById(`fg-section-${i}`)
  const rmSec     = document.getElementById(`rm-section-${i}`)
  const trackSec  = document.getElementById(`track-section-${i}`)
  const resaleSec = document.getElementById(`resale-section-${i}`)
  const fgBtn     = document.getElementById(`type-fg-${i}`)
  const rmBtn     = document.getElementById(`type-rm-${i}`)
  const trackBtn  = document.getElementById(`type-track-${i}`)
  const resaleBtn = document.getElementById(`type-resale-${i}`)

  fgSec.style.display     = type === 'fg'     ? '' : 'none'
  rmSec.style.display     = type === 'rm'     ? '' : 'none'
  trackSec.style.display  = type === 'track'  ? '' : 'none'
  resaleSec.style.display = type === 'resale' ? '' : 'none'

  fgBtn?.classList.toggle('active',     type === 'fg')
  rmBtn?.classList.toggle('active',     type === 'rm')
  trackBtn?.classList.toggle('active',  type === 'track')
  resaleBtn?.classList.toggle('active', type === 'resale')

  if (type === 'resale') renderFGIList(i, '')
  updateGrand()
}

// ── Product code picker ──────────────────────────────────────────────────────
function renderProductCodeList(i, query = '') {
  const listEl = document.getElementById(`pc-list-${i}`)
  if (!listEl) return
  const q = query.toLowerCase().trim()
  const matches = (q
    ? allProductCodes.filter(item =>
        (item.code || '').toLowerCase().includes(q) ||
        (item.stock_category || '').toLowerCase().includes(q)
      )
    : allProductCodes
  ).slice(0, 120)

  if (!matches.length) {
    listEl.innerHTML = `<div style="padding:12px 14px;font-size:13px;color:#9ca3af;">No product codes found. Run migration 013_product_codes.sql, then refresh.</div>`
    return
  }

  listEl.innerHTML = matches.map(item => `
    <div onmousedown="selectProductCode(${i},'${item.id}')"
         style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:13px;">
      <div class="fw-600">${esc(item.code)}</div>
      <div class="text-xs text-muted">${esc(item.stock_category || '')}</div>
    </div>
  `).join('')
}

function toggleProductCodeDrop(i) {
  if (productCodeDropOpen[i]) closeProductCodeDrop(i); else openProductCodeDrop(i)
}

function openProductCodeDrop(i) {
  Object.keys(productCodeDropOpen).forEach(k => { if (k != i) closeProductCodeDrop(k) })
  const drop = document.getElementById(`pc-drop-${i}`)
  if (drop) drop.style.display = ''
  document.getElementById(`pc-search-${i}`)?.focus()
  productCodeDropOpen[i] = true
  renderProductCodeList(i, document.getElementById(`pc-search-${i}`)?.value || '')
}

function closeProductCodeDrop(i) {
  const drop = document.getElementById(`pc-drop-${i}`)
  if (drop) drop.style.display = 'none'
  productCodeDropOpen[i] = false
}

function selectProductCode(i, id) {
  const item = allProductCodes.find(x => x.id === id)
  if (!item) return
  selProductCode[i] = item
  closeProductCodeDrop(i)
  document.getElementById(`pc-trigger-${i}`).style.display = 'none'
  const card = document.getElementById(`pc-sel-card-${i}`)
  if (card) card.style.display = ''
  text(`pc-sel-code-${i}`, item.code)
  text(`pc-sel-category-${i}`, item.stock_category || 'Product code selected')
  const mode = selectedPriceMode(i)
  const rateInput = document.getElementById(`rate-${i}`)
  if (mode || !rateInput?.value) setRateFromRRP(i, mode || 'rrp', false)
  else calcItem(i)
  saveOrderDraft()
}

async function loadTicketPrefill() {
  const ticketId = new URLSearchParams(window.location.search).get('ticket')
  if (!ticketId) return

  const { data, error } = await db
    .from('order_tickets')
    .select(`id, ticket_uid, cust_id, status, requirement_notes, customer_name, customer_mobile, inquiry_for, location, customers!cust_id(${CUSTOMER_SOURCE.SELECT})`)
    .eq('id', ticketId)
    .single()

  if (error) {
    console.warn('ticket prefill load error:', error.message)
    showAlert('order-alert', /order_tickets/i.test(error.message || '')
      ? 'Run migration 023_order_tickets.sql in Supabase before converting tickets.'
      : error.message)
    return
  }
  if (!data || !['open', 'followup', 'order_confirmed'].includes(data.status)) {
    showAlert('order-alert', 'This ticket is not open for conversion.')
    return
  }

  activeTicket = data
  const customer = data.customers ? CUSTOMER_SOURCE.normalize(data.customers) : allCustomers.find(c => c.id === data.cust_id)
  if (customer) {
    selectCustomer(customer)
  } else {
    toggleNewCustomer(true)
    setFieldValue('nc-name', data.customer_name || '')
    setFieldValue('nc-phone', data.customer_mobile || '')
  }
  const ticketNotes = [
    displayTicketUid(data),
    data.inquiry_for ? `Inquiry: ${data.inquiry_for}` : '',
    data.location ? `Location: ${data.location}` : '',
    data.requirement_notes,
  ].filter(Boolean).join(' - ')
  setFieldValue('order-notes', ticketNotes)

  const heading = document.querySelector('.page-header h1')
  if (heading) heading.textContent = `Convert ${displayTicketUid(data)}`
  const sub = document.querySelector('.page-header p')
  if (sub) sub.textContent = 'Add order items and submit when the ticket is confirmed.'
}

function clearProductCode(i) {
  selProductCode[i] = null
  const trigger = document.getElementById(`pc-trigger-${i}`)
  if (trigger) trigger.style.display = ''
  const card = document.getElementById(`pc-sel-card-${i}`)
  if (card) card.style.display = 'none'
  closeProductCodeDrop(i)
  calcItem(i)
  saveOrderDraft()
}

// ── FG flow: main type → sub-type → fabric product → variant → roll ──────────
function onMainTypeChange(i) {
  const mainType = val(`maintype-${i}`)
  const subSel = document.getElementById(`subtype-${i}`)
  subSel.innerHTML = '<option value="">Select…</option>'
  subSel.disabled = true

  // Reset fabric selections
  clearFabProd(i)
  document.getElementById(`fab-prod-wrap-${i}`).style.display = 'none'

  if (!mainType) { calcItem(i); return }

  const subTypes = BLIND_TYPE_TREE[mainType] || []
  subSel.innerHTML = '<option value="">Select…</option>' +
    subTypes.map(s => `<option value="${s}">${esc(s)}</option>`).join('')
  subSel.disabled = false

  // Show fabric product section if this type uses fabric
  const catNames = BLIND_FABRIC_MAP[mainType] || []
  if (catNames.length) {
    document.getElementById(`fab-prod-wrap-${i}`).style.display = ''
    populateFabProdList(i, mainType)
  } else {
    document.getElementById(`fab-prod-wrap-${i}`).style.display = 'none'
    document.getElementById(`fab-var-wrap-${i}`).style.display = 'none'
    document.getElementById(`roll-pick-wrap-${i}`).style.display = 'none'
    const rateSection = document.getElementById(`rate-section-${i}`)
    if (rateSection) rateSection.style.display = val(`subtype-${i}`) ? '' : 'none'
  }
  calcItem(i)
}

function onSubTypeChange(i) {
  const mainType = val(`maintype-${i}`)
  const catNames = BLIND_FABRIC_MAP[mainType] || []
  const rateSection = document.getElementById(`rate-section-${i}`)
  if (rateSection && !catNames.length) {
    rateSection.style.display = val(`subtype-${i}`) ? '' : 'none'
  }
  const mode = selectedPriceMode(i) || 'rrp'
  setRateFromRRP(i, mode, false)
  calcItem(i)
}

// Build the product list for the dropdown
function populateFabProdList(i, mainType) {
  const catIds = fabricCategoryIdsFor(mainType)
  const products = allProducts.filter(p => catIds.includes(p.category_id))
  renderFabProdList(i, products, '')
}

function renderFabProdList(i, products, query) {
  const lower = query.toLowerCase()
  const filtered = query
    ? products.filter(p => {
        if (p.name.toLowerCase().includes(lower)) return true
        return allVariants.some(v => !isHiddenOrderVariant(v) && v.product_id === p.id && v.name.toLowerCase().includes(lower))
      })
    : products
  const listEl = document.getElementById(`fab-prod-list-${i}`)
  if (!listEl) return
  if (!filtered.length) {
    listEl.innerHTML = `<div style="padding:12px 14px;font-size:13px;color:#9ca3af;">No products found</div>`
    return
  }
  listEl.innerHTML = filtered.map(p => {
    const vars = allVariants.filter(v => !isHiddenOrderVariant(v) && v.product_id === p.id)
    const inStock = vars.filter(v => (v.rolls||[]).some(r => r.status === 'in_stock' && r.remaining_length > 0))
    return `<div onmousedown="selectFabProdById(${i},'${p.id}')"
                 style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:13px;">
      <div class="fw-600">${esc(p.name)}</div>
      <div class="text-xs text-muted">${vars.length} variant${vars.length!==1?'s':''} · ${inStock.length} with stock</div>
    </div>`
  }).join('')
}

function selectFabProdById(i, prodId) {
  const p = allProducts.find(x => x.id === prodId)
  if (p) selectFabProd(i, p)
}

function onFabProdSearch(i, q) {
  const mainType = val(`maintype-${i}`)
  const catIds = fabricCategoryIdsFor(mainType)
  const products = allProducts.filter(p => catIds.includes(p.category_id))
  renderFabProdList(i, products, q)
}

function toggleFabProdDrop(i) {
  if (fabProdDropOpen[i]) closeFabProdDrop(i)
  else openFabProdDrop(i)
}
function openFabProdDrop(i) {
  // Close all other prod drops
  Object.keys(fabProdDropOpen).forEach(k => { if (k != i) closeFabProdDrop(k) })
  Object.keys(fabVarDropOpen).forEach(k => closeFabVarDrop(k))
  document.getElementById(`fab-prod-drop-${i}`).style.display = ''
  document.getElementById(`fab-prod-search-${i}`)?.focus()
  fabProdDropOpen[i] = true
}
function closeFabProdDrop(i) {
  const el = document.getElementById(`fab-prod-drop-${i}`)
  if (el) el.style.display = 'none'
  fabProdDropOpen[i] = false
}

function selectFabProd(i, prod) {
  selFabProd[i] = prod
  closeFabProdDrop(i)
  // Update trigger display
  document.getElementById(`fab-prod-trigger-${i}`).style.display = 'none'
  const card = document.getElementById(`fab-prod-sel-card-${i}`)
  card.style.display = ''
  text(`fab-prod-sel-name-${i}`, prod.name)
  const vars = allVariants.filter(v => !isHiddenOrderVariant(v) && v.product_id === prod.id)
  const stockCount = vars.filter(v => (v.rolls||[]).some(r => r.status === 'in_stock' && r.remaining_length > 0)).length
  text(`fab-prod-sel-info-${i}`, `${vars.length} variant${vars.length!==1?'s':''} · ${stockCount} with stock`)

  // Reset and show variant section
  clearFabVar(i)
  document.getElementById(`fab-var-wrap-${i}`).style.display = ''
  populateFabVarList(i, prod.id, '')
  saveOrderDraft()
}

function clearFabProd(i) {
  selFabProd[i] = null
  clearFabVar(i)
  const trigger = document.getElementById(`fab-prod-trigger-${i}`)
  if (trigger) trigger.style.display = ''
  const card = document.getElementById(`fab-prod-sel-card-${i}`)
  if (card) card.style.display = 'none'
  closeFabProdDrop(i)
  document.getElementById(`fab-var-wrap-${i}`)?.style && (document.getElementById(`fab-var-wrap-${i}`).style.display = 'none')
  document.getElementById(`roll-pick-wrap-${i}`)?.style && (document.getElementById(`roll-pick-wrap-${i}`).style.display = 'none')
  calcItem(i)
  saveOrderDraft()
}

// ── Fabric Variant dropdown ───────────────────────────────────────────────────
function populateFabVarList(i, prodId, query) {
  const vars = allVariants.filter(v => !isHiddenOrderVariant(v) && v.product_id === prodId)
  renderFabVarList(i, vars, query)
}

function renderFabVarList(i, vars, query) {
  const lower = query.toLowerCase()
  const filtered = query ? vars.filter(v => v.name.toLowerCase().includes(lower)) : vars
  const listEl = document.getElementById(`fab-var-list-${i}`)
  if (!listEl) return
  if (!filtered.length) {
    listEl.innerHTML = `<div style="padding:12px 14px;font-size:13px;color:#9ca3af;">No variants found</div>`
    return
  }
  listEl.innerHTML = filtered.map(v => {
    const stockRolls = (v.rolls||[]).filter(r => r.status === 'in_stock' && r.remaining_length > 0)
    const totalStockM = stockRolls.reduce((s, r) => s + Number(r.remaining_length||0), 0)
    const rollW = v.width_m || 0
    const wStr = rollW ? `${rollW}m wide · ` : ''
    const purchaseRate = Number(v.purchase_rate || 0)
    const costSqm = (rollW > 0 && purchaseRate > 0) ? (purchaseRate / rollW) : Number(v.base_rate_sqm || 0)
    const rateStr = purchaseRate > 0 ? `₹${purchaseRate.toFixed(0)}/m (₹${costSqm.toFixed(0)}/m²) · ` : ''
    const stockStr = totalStockM > 0 ? `${totalStockM.toFixed(1)}m in stock` : 'OUT OF STOCK'
    const color = totalStockM <= 0 ? 'color:#ef4444' : ''
    return `<div onmousedown="selectFabVarById(${i},'${v.id}')"
                 style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:13px;${color}">
      <div class="fw-600">${esc(v.name)}</div>
      <div class="text-xs text-muted">${wStr}${rateStr}${stockStr}</div>
    </div>`
  }).join('')
}

function selectFabVarById(i, varId) {
  const v = allVariants.find(x => x.id === varId)
  if (v) selectFabVar(i, v)
}

function onFabVarSearch(i, q) {
  const prod = selFabProd[i]
  if (!prod) return
  const vars = allVariants.filter(v => !isHiddenOrderVariant(v) && v.product_id === prod.id)
  renderFabVarList(i, vars, q)
}

function toggleFabVarDrop(i) {
  if (fabVarDropOpen[i]) closeFabVarDrop(i)
  else openFabVarDrop(i)
}
function openFabVarDrop(i) {
  Object.keys(fabProdDropOpen).forEach(k => closeFabProdDrop(k))
  Object.keys(fabVarDropOpen).forEach(k => { if (k != i) closeFabVarDrop(k) })
  document.getElementById(`fab-var-drop-${i}`).style.display = ''
  document.getElementById(`fab-var-search-${i}`)?.focus()
  fabVarDropOpen[i] = true
}
function closeFabVarDrop(i) {
  const el = document.getElementById(`fab-var-drop-${i}`)
  if (el) el.style.display = 'none'
  fabVarDropOpen[i] = false
}

function selectFabVar(i, v) {
  selFabVar[i] = v
  selRoll[i] = null
  closeFabVarDrop(i)
  // Update trigger display
  document.getElementById(`fab-var-trigger-${i}`).style.display = 'none'
  const card = document.getElementById(`fab-var-sel-card-${i}`)
  card.style.display = ''
  text(`fab-var-sel-name-${i}`, v.name)
  const stockRolls = (v.rolls||[]).filter(r => r.status === 'in_stock' && r.remaining_length > 0)
  const totalM = stockRolls.reduce((s, r) => s + Number(r.remaining_length||0), 0)
  const rollW = v.width_m || 0
  const sqm = rollW > 0 ? totalM * rollW : totalM
  text(`fab-var-sel-info-${i}`,
    totalM > 0
      ? `${rollW ? rollW + 'm wide · ' : ''}${totalM.toFixed(1)}m available (${sqm.toFixed(1)} sqm)`
      : 'No stock available')

  // Show roll picker
  renderRollPicker(i, v)
  // Show and prefill selling rate + cost rate
  const rateSection = document.getElementById(`rate-section-${i}`)
  if (rateSection) rateSection.style.display = ''
  const rateInput = document.getElementById(`rate-${i}`)
  // Auto-fill rate from RRP and select the RRP radio if a match exists
  const rrpApplied = setRateFromRRP(i, selectedPriceMode(i) || 'rrp', false)
  if (!rrpApplied && rateInput) {
    setRRPModeRadio(i, null)
  }
  // Show purchase rate per meter
  const purchaseRateEl = document.getElementById(`purchase-rate-val-${i}`)
  const purchaseRate = Number(v.purchase_rate || 0)
  if (purchaseRateEl) {
    purchaseRateEl.textContent = purchaseRate > 0 ? `₹${purchaseRate.toFixed(2)}/m` : 'Not set'
  }
  // Show computed cost per sqm (purchase_rate ÷ fabric_width)
  const costRateEl = document.getElementById(`cost-rate-val-${i}`)
  if (costRateEl) {
    const costSqm = (rollW > 0 && purchaseRate > 0) ? (purchaseRate / rollW) : Number(v.base_rate_sqm || 0)
    costRateEl.textContent = costSqm > 0 ? `₹${costSqm.toFixed(2)}/m²` : 'Not set'
  }
  calcItem(i)
}

function clearFabVar(i) {
  selFabVar[i] = null
  selRoll[i] = null
  const trigger = document.getElementById(`fab-var-trigger-${i}`)
  if (trigger) trigger.style.display = ''
  const card = document.getElementById(`fab-var-sel-card-${i}`)
  if (card) card.style.display = 'none'
  closeFabVarDrop(i)
  const rollWrap = document.getElementById(`roll-pick-wrap-${i}`)
  if (rollWrap) rollWrap.style.display = 'none'
  const rateSection = document.getElementById(`rate-section-${i}`)
  if (rateSection) rateSection.style.display = 'none'
  setRRPModeRadio(i, null)
  const rateInput = document.getElementById(`rate-${i}`)
  if (rateInput) rateInput.value = ''
  calcItem(i)
}

function selectRoll(i, rollId) {
  selRoll[i] = rollId || null
  calcItem(i)
}

function renderRollPicker(i, variant) {
  const rolls = (variant.rolls || []).filter(r => r.status === 'in_stock' && r.remaining_length > 0)
  const wrap = document.getElementById(`roll-pick-wrap-${i}`)
  const container = document.getElementById(`roll-pick-${i}`)
  if (!wrap || !container) return

  if (rolls.length <= 1) {
    // Only one roll — no need to show picker
    if (rolls.length === 1) selRoll[i] = rolls[0].id
    wrap.style.display = 'none'
    return
  }

  wrap.style.display = ''
  container.innerHTML = `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;border:1px solid var(--border);margin-bottom:4px;cursor:pointer;background:#f9fafb;">
      <input type="radio" name="roll-sel-${i}" value="" checked onchange="selectRoll(${i},null)">
      <span>
        <span class="fw-600 text-sm">Auto</span>
        <span class="text-xs text-muted" style="margin-left:6px;">Smallest roll first (system picks)</span>
      </span>
    </label>
    ${rolls.sort((a, b) => b.remaining_length - a.remaining_length).map(r => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;border:1px solid var(--border);margin-bottom:4px;cursor:pointer;">
      <input type="radio" name="roll-sel-${i}" value="${r.id}" onchange="selectRoll(${i},'${r.id}')">
      <span>
        <span class="fw-600 text-sm">${esc(r.batch_code)}</span>
        <span class="text-xs text-muted" style="margin-left:6px;">
          ${Number(r.remaining_length).toFixed(2)}m remaining
          <span style="color:#9ca3af;">(orig ${Number(r.original_length).toFixed(2)}m)</span>
        </span>
      </span>
    </label>`).join('')}`
}

// ── RM flow ───────────────────────────────────────────────────────────────────
function onRMCatChange(i) {
  const catId  = val(`rm-cat-${i}`)
  const prodSel = document.getElementById(`rm-prod-${i}`)
  const varSel  = document.getElementById(`rm-var-${i}`)
  const rateWrap = document.getElementById(`rm-rate-wrap-${i}`)
  prodSel.innerHTML = '<option value="">Select…</option>'
  varSel.innerHTML  = '<option value="">Select…</option>'
  prodSel.disabled = true; varSel.disabled = true
  if (rateWrap) rateWrap.style.display = 'none'
  const rateInput = document.getElementById(`rm-rate-${i}`)
  if (rateInput) rateInput.value = ''
  if (!catId) { calcRMItem(i); return }
  const prods = allProducts.filter(p => p.category_id === catId)
  prodSel.innerHTML = '<option value="">Select…</option>' +
    prods.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')
  prodSel.disabled = false
  calcRMItem(i)
}

function onRMProdChange(i) {
  const prodId = val(`rm-prod-${i}`)
  const varSel  = document.getElementById(`rm-var-${i}`)
  const rateWrap = document.getElementById(`rm-rate-wrap-${i}`)
  varSel.innerHTML = '<option value="">Select…</option>'
  varSel.disabled = true
  if (rateWrap) rateWrap.style.display = 'none'
  const rateInput = document.getElementById(`rm-rate-${i}`)
  if (rateInput) rateInput.value = ''
  if (!prodId) { calcRMItem(i); return }
  const vars = allVariants.filter(v => !isHiddenOrderVariant(v) && v.product_id === prodId)
  varSel.innerHTML = '<option value="">Select…</option>' +
    vars.map(v => {
      const rate = v.purchase_rate ? ` — ₹${Number(v.purchase_rate).toFixed(2)}/${v.unit}` : ''
      return `<option value="${v.id}" data-unit="${v.unit}" data-purchase-rate="${v.purchase_rate || 0}" data-name="${esc(v.name)}">${esc(v.name)}${rate}</option>`
    }).join('')
  varSel.disabled = false
  calcRMItem(i)
}

function calcRMItem(i) {
  const varSel = document.getElementById(`rm-var-${i}`)
  const varOpt = varSel?.options[varSel.selectedIndex]
  const varId = varSel?.value
  const rateWrap = document.getElementById(`rm-rate-wrap-${i}`)
  const rateInput = document.getElementById(`rm-rate-${i}`)
  const rateUnit = document.getElementById(`rm-rate-unit-${i}`)
  const costVal = document.getElementById(`rm-cost-val-${i}`)
  const badge = document.getElementById(`rm-margin-badge-${i}`)
  const showCosts = canSeeCostDetails()

  if (varOpt && varId) {
    const unit = varOpt.dataset.unit || 'm'
    document.getElementById(`rm-unit-${i}`).value = unit
    const purchaseRate = parseFloat(varOpt.dataset.purchaseRate) || 0
    if (rateUnit) rateUnit.textContent = `(₹/${unit})`
    if (costVal) costVal.textContent = `₹${purchaseRate.toFixed(2)}/${unit}`
    if (rateWrap) rateWrap.style.display = ''
    if (rateInput && !rateInput.value) rateInput.value = purchaseRate ? purchaseRate.toFixed(2) : ''
  } else {
    if (rateWrap) rateWrap.style.display = 'none'
    if (badge) badge.style.display = 'none'
  }

  const qty = parseFloat(document.getElementById(`rm-qty-${i}`)?.value) || 0
  const unit = val(`rm-unit-${i}`) || 'm'
  const purchaseRate = parseFloat(varOpt?.dataset?.purchaseRate) || 0
  const sellRate = parseFloat(rateInput?.value) || 0
  const total = qty * sellRate

  if (showCosts && badge && varId && sellRate > 0 && purchaseRate > 0) {
    const margin = ((sellRate - purchaseRate) / sellRate) * 100
    const color = margin >= 20 ? '#059669' : margin >= 10 ? '#d97706' : '#ef4444'
    const bg = margin >= 20 ? '#d1fae5' : margin >= 10 ? '#fef3c7' : '#fee2e2'
    badge.style.display = ''
    badge.style.color = color
    badge.style.background = bg
    badge.textContent = `Margin: ${margin.toFixed(1)}%`
  } else if (badge) {
    badge.style.display = 'none'
  }

  const subEl = document.getElementById(`rm-sub-${i}`)
  if (subEl) {
    if (!varId || qty <= 0 || sellRate <= 0) {
      subEl.innerHTML = `<span style="color:#9ca3af;">Select item, set quantity and selling rate</span>`
    } else {
      subEl.innerHTML = `
        <span>Qty: <strong>${qty} ${unit}</strong></span>
        ${showCosts ? `<span>Purchase: <strong>₹${purchaseRate.toFixed(2)}/${unit}</strong></span>` : ''}
        <span>Selling: <strong>₹${sellRate.toFixed(2)}/${unit}</strong></span>
        <span>Total: <strong style="color:#059669;">₹${total.toFixed(2)}</strong></span>`
    }
  }
  updateGrand()
}

// ── Track flow ────────────────────────────────────────────────────────────────
function trkToFeet(value, unit) {
  const v = parseFloat(value) || 0
  switch (unit) {
    case 'in': return v / 12
    case 'ft': return v
    case 'm':  return v * 3.28084
    case 'cm': return v / 30.48
    default:   return v
  }
}

function trkCeilHalf(feet) {
  return Math.ceil(feet * 2) / 2
}

function setTrackType(i, type) {
  selTrackType[i] = type
  ;['Super Track', 'Jumbo Track', 'M Track'].forEach(t => {
    const key = t === 'Super Track' ? 'super' : t === 'Jumbo Track' ? 'jumbo' : 'm'
    document.getElementById(`ttype-${key}-${i}`)?.classList.toggle('active', t === type)
  })
  document.getElementById(`trk-rate-wrap-${i}`).style.display = ''
  renderTrackComponents(i)
  calcTrackItem(i)
}

function renderTrackComponents(i) {
  const trackType  = selTrackType[i]
  const container  = document.getElementById(`trk-components-${i}`)
  if (!container) return
  const recipe = findRecipeForBlindType(allRecipes, trackType)
  const components = recipe?.recipe_items?.length
    ? recipe.recipe_items.map(item => item.inv_variants?.name || item.component_name).filter(Boolean)
    : TRACK_RECIPES[trackType]
  if (!components?.length) { container.style.display = 'none'; return }

  container.style.display = ''
  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;padding:6px 0;cursor:pointer;"
         onclick="toggleTrackComponents(${i})">
      <span class="text-xs fw-600" style="text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);">
        <i class="fa-solid fa-list-check" style="margin-right:4px;"></i>Raw Materials Needed
      </span>
      <i class="fa-solid fa-chevron-down text-xs text-muted" id="trk-comp-chevron-${i}"></i>
    </div>
    <div id="trk-comp-body-${i}" class="d-none">
      ${components.map(name => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:5px;margin-bottom:4px;font-size:12px;">
          <i class="fa-solid fa-box" style="color:#6366f1;font-size:10px;flex-shrink:0;"></i>
          <span>${esc(name)}</span>
        </div>`).join('')}
    </div>`
}

function toggleTrackComponents(i) {
  const body    = document.getElementById(`trk-comp-body-${i}`)
  const chevron = document.getElementById(`trk-comp-chevron-${i}`)
  if (!body) return
  const hidden = body.classList.toggle('d-none')
  if (chevron) chevron.className = `fa-solid fa-chevron-${hidden ? 'down' : 'up'} text-xs text-muted`
}

function calcTrackItem(i) {
  const trackType    = selTrackType[i]
  const qty          = parseInt(document.getElementById(`trk-qty-${i}`)?.value) || 0
  const lenRaw       = parseFloat(document.getElementById(`trk-len-${i}`)?.value)
  const lenUnit      = document.getElementById(`trk-unit-${i}`)?.value || 'in'
  const rate         = parseFloat(document.getElementById(`trk-rate-${i}`)?.value) || 0
  const calcEl       = document.getElementById(`trk-calc-${i}`)
  const subEl        = document.getElementById(`trk-sub-${i}`)

  if (!isNaN(lenRaw) && lenRaw > 0 && calcEl) {
    const lenFt      = trkToFeet(lenRaw, lenUnit)
    const chargeable = trkCeilHalf(lenFt)
    const lineTotal  = qty * rate

    calcEl.style.display = ''
    calcEl.innerHTML = `
      <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:12px;display:grid;gap:8px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin-bottom:2px;">
          <i class="fa-solid fa-calculator" style="margin-right:4px;"></i>Length Calculation
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:12px;align-items:center;">
          <span style="background:#eff6ff;color:#1d4ed8;padding:3px 9px;border-radius:4px;font-weight:600;">
            Input: ${lenRaw} ${lenUnit}
          </span>
          <i class="fa-solid fa-arrow-right" style="color:#9ca3af;font-size:10px;"></i>
          <span style="background:#fef3c7;color:#92400e;padding:3px 9px;border-radius:4px;font-weight:600;">
            ${lenFt.toFixed(4)} ft (actual)
          </span>
          <i class="fa-solid fa-arrow-right" style="color:#9ca3af;font-size:10px;"></i>
          <span style="background:#d1fae5;color:#065f46;padding:3px 9px;border-radius:4px;font-weight:700;font-size:13px;">
            ${chargeable.toFixed(1)} ft <span style="font-size:10px;font-weight:500;">(chargeable — rounded up to nearest 0.5 ft)</span>
          </span>
        </div>
        ${qty > 0 && rate > 0 ? `
        <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;padding:6px 10px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:5px;align-items:center;">
          <span style="color:#374151;">${qty} track${qty !== 1 ? 's' : ''} × ₹${rate.toFixed(2)}/track</span>
          <span style="font-size:14px;font-weight:700;color:#059669;margin-left:auto;">Total: ₹${lineTotal.toFixed(2)}</span>
        </div>` : `<div style="font-size:12px;color:#9ca3af;">Enter rate to see total</div>`}
      </div>`

    if (subEl) {
      if (qty > 0 && rate > 0) {
        subEl.innerHTML = `
          <span>Qty: <strong>${qty}</strong></span>
          <span>Chargeable: <strong>${chargeable.toFixed(1)} ft</strong></span>
          <span>Rate: <strong>₹${rate.toFixed(2)}/track</strong></span>
          <span>Total: <strong style="color:#059669;">₹${lineTotal.toFixed(2)}</strong></span>`
      } else {
        subEl.innerHTML = `<span style="color:#9ca3af;">Enter quantity, length, and rate to see total</span>`
      }
    }
  } else {
    if (calcEl) calcEl.style.display = 'none'
    if (subEl)  subEl.innerHTML = `<span style="color:#9ca3af;">Enter length to see calculation</span>`
  }
  updateGrand()
}

// ── Resale Item (FG Stock) flow ───────────────────────────────────────────────
function isFinishedGoodVariant(v) {
  return INVENTORY_SOURCE.isFinishedGoodVariant(v)
}

function variantAvailableQty(v) {
  return INVENTORY_SOURCE.availableQty(v)
}

function buildDirectOrderItems() {
  return INVENTORY_SOURCE.buildDirectOrderItems({
    fgStock: allFGItems,
    variants: allVariants,
    includeAdditionalVariant: isAdditionalDirectOrderVariant,
  })
/*
  const fgStockItems = (allFGItems || []).map(item => ({
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

  const variantItems = (allVariants || [])
    .filter(v => isFinishedGoodVariant(v) && !isHiddenOrderVariant(v))
    .map(v => ({
      key: `var:${v.id}`,
      source: 'variant',
      fgStockId: null,
      variantId: v.id,
      code: v.product?.name || v.category?.name || '',
      name: v.name || 'Finished Good',
      description: [v.product?.name, v.category?.name].filter(Boolean).join(' · '),
      purchase_cost: v.purchase_rate,
      quantity: variantAvailableQty(v),
      unit: v.unit || 'pcs',
      categoryLabel: v.category?.name || 'Finished Goods',
      variant: v,
    }))

  return [...fgStockItems, ...variantItems]
    .sort((a, b) => `${a.categoryLabel} ${a.name}`.localeCompare(`${b.categoryLabel} ${b.name}`))
*/
}

function renderFGIList(i, query) {
  const lower = query.toLowerCase()
  const filtered = query
    ? allDirectItems.filter(x => `${x.name} ${x.code} ${x.categoryLabel}`.toLowerCase().includes(lower))
    : allDirectItems
  const listEl = document.getElementById(`fgi-list-${i}`)
  if (!listEl) return
  if (!filtered.length) {
    listEl.innerHTML = `<div style="padding:12px 14px;font-size:13px;color:#9ca3af;">No items found</div>`
    return
  }
  listEl.innerHTML = filtered.map(x => {
    const stockInfo = x.quantity > 0 ? `${Number(x.quantity).toFixed(x.quantity % 1 === 0 ? 0 : 2)} ${x.unit} in stock` : '<span style="color:#ef4444">Out of stock</span>'
    const costStr   = x.purchase_cost != null ? `₹${Number(x.purchase_cost).toFixed(2)} cost · ` : ''
    return `<div onmousedown="selectFGIItem(${i},'${x.key}')"
                 style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:13px;">
      <div class="fw-600">${esc(x.code)} — ${esc(x.name)}</div>
      <div class="text-xs text-muted">${esc(x.categoryLabel)} · ${costStr}${stockInfo}</div>
    </div>`
  }).join('')
}

function onFGISearch(i, q) { renderFGIList(i, q) }

function toggleFGIDrop(i) {
  if (fgItemDropOpen[i]) closeFGIDrop(i); else openFGIDrop(i)
}
function openFGIDrop(i) {
  document.getElementById(`fgi-drop-${i}`).style.display = ''
  document.getElementById(`fgi-search-${i}`)?.focus()
  fgItemDropOpen[i] = true
  renderFGIList(i, '')
}
function closeFGIDrop(i) {
  const el = document.getElementById(`fgi-drop-${i}`)
  if (el) el.style.display = 'none'
  fgItemDropOpen[i] = false
}

function selectFGIItem(i, id) {
  const item = allDirectItems.find(x => x.key === id)
  if (!item) return
  selFGItem[i] = item
  closeFGIDrop(i)

  document.getElementById(`fgi-trigger-${i}`).style.display = 'none'
  const card = document.getElementById(`fgi-sel-card-${i}`)
  card.style.display = ''
  text(`fgi-sel-name-${i}`, `${item.code} — ${item.name}`)
  const stockStr = item.quantity > 0
    ? `${Number(item.quantity).toFixed(item.quantity % 1 === 0 ? 0 : 2)} ${item.unit} in stock`
    : 'Out of stock'
  text(`fgi-sel-info-${i}`, [item.description, stockStr].filter(Boolean).join(' · '))

  // Show purchase cost reference
  const costEl = document.getElementById(`fgi-cost-val-${i}`)
  if (costEl) costEl.textContent = item.purchase_cost != null ? `₹${Number(item.purchase_cost).toFixed(2)} / ${item.unit}` : 'Not recorded'

  // Update rate label unit
  const rateUnitEl = document.getElementById(`fgi-rate-unit-${i}`)
  if (rateUnitEl) rateUnitEl.textContent = `(₹/${item.unit})`

  document.getElementById(`fgi-rate-wrap-${i}`).style.display = ''
  document.getElementById(`fgi-qty-wrap-${i}`).style.display = ''
  calcResaleItem(i)
}

function clearFGIItem(i) {
  selFGItem[i] = null
  const trigger = document.getElementById(`fgi-trigger-${i}`)
  if (trigger) trigger.style.display = ''
  const card = document.getElementById(`fgi-sel-card-${i}`)
  if (card) card.style.display = 'none'
  closeFGIDrop(i)
  document.getElementById(`fgi-rate-wrap-${i}`).style.display = 'none'
  document.getElementById(`fgi-qty-wrap-${i}`).style.display = 'none'
  const subEl = document.getElementById(`resale-sub-${i}`)
  if (subEl) subEl.innerHTML = ''
  calcResaleItem(i)
}

function resaleMeasureForItem(i, item) {
  const qty = parseFloat(document.getElementById(`fgi-qty-${i}`)?.value) || 0
  const wRaw = parseFloat(document.getElementById(`fgi-w-${i}`)?.value)
  const hRaw = parseFloat(document.getElementById(`fgi-h-${i}`)?.value)
  const wUnit = document.getElementById(`fgi-wu-${i}`)?.value || 'cm'
  const hUnit = document.getElementById(`fgi-hu-${i}`)?.value || 'cm'
  const hasWidth = !isNaN(wRaw) && wRaw > 0
  const hasLength = !isNaN(hRaw) && hRaw > 0
  const widthCm = hasWidth ? cvtUnit(wRaw, wUnit, 'cm') : null
  const heightCm = hasLength ? cvtUnit(hRaw, hUnit, 'cm') : null
  const unit = item?.unit || 'pcs'
  let billQty = qty
  let areaSqm = qty
  let measureLabel = ''

  if (hasWidth && hasLength) {
    const areaEach = (widthCm / 100) * (heightCm / 100)
    areaSqm = areaEach * qty
    billQty = areaSqm
    measureLabel = `${wRaw} ${wUnit} x ${hRaw} ${hUnit}`
  } else if (hasLength) {
    const lengthM = heightCm / 100
    if (unit === 'm') billQty = lengthM * qty
    if (unit === 'ft') billQty = cvtUnit(hRaw, hUnit, 'ft') * qty
    areaSqm = unit === 'm' || unit === 'ft' ? billQty : qty
    measureLabel = `${hRaw} ${hUnit}`
  }

  return {
    qty,
    billQty,
    areaSqm,
    widthCm,
    heightCm,
    inputWidthRaw: hasWidth ? wRaw : null,
    inputWidthUnit: hasWidth ? wUnit : null,
    inputHeightRaw: hasLength ? hRaw : null,
    inputHeightUnit: hasLength ? hUnit : null,
    measureLabel,
  }
}

function unitConversionsFromCm(valueCm) {
  if (!valueCm || valueCm <= 0) return ''
  const rows = [
    `${valueCm.toFixed(2)} cm`,
    `${(valueCm / 100).toFixed(3)} m`,
    `${(valueCm / 2.54).toFixed(2)} in`,
    `${(valueCm / 30.48).toFixed(2)} ft`,
  ]
  return rows.join(' | ')
}

function calcResaleItem(i) {
  const item     = selFGItem[i]
  const rate     = parseFloat(document.getElementById(`fgi-rate-${i}`)?.value) || 0
  const measure  = resaleMeasureForItem(i, item)
  const qty      = measure.qty
  const billQty  = measure.billQty
  const total    = billQty * rate
  const subEl    = document.getElementById(`resale-sub-${i}`)
  const badge    = document.getElementById(`fgi-margin-badge-${i}`)
  const showCosts = canSeeCostDetails()

  if (showCosts && item && rate > 0 && item.purchase_cost > 0) {
    const margin = ((rate - item.purchase_cost) / rate) * 100
    const color  = margin >= 20 ? '#059669' : margin >= 10 ? '#d97706' : '#ef4444'
    const bg     = margin >= 20 ? '#d1fae5' : margin >= 10 ? '#fef3c7' : '#fee2e2'
    if (badge) {
      badge.style.display = ''
      badge.style.color = color
      badge.style.background = bg
      badge.textContent = `Margin: ${margin.toFixed(1)}%`
    }
  } else if (badge) {
    badge.style.display = 'none'
  }

  if (subEl) {
    if (!item || qty <= 0 || rate <= 0) {
      subEl.innerHTML = `<span style="color:#9ca3af;">Select item, set quantity and selling rate</span>`
    } else {
      const hasArea = measure.widthCm && measure.heightCm
      const areaSqft = measure.areaSqm * 10.7639
      const purchaseCost = Number(item.purchase_cost || 0)
      const costTotal = purchaseCost > 0 ? purchaseCost * billQty : 0
      const margin = total > 0 && costTotal > 0 ? ((total - costTotal) / total) * 100 : 0
      const marginColor = margin >= 20 ? '#059669' : margin >= 10 ? '#d97706' : '#ef4444'
      const widthConversions = unitConversionsFromCm(measure.widthCm)
      const lengthConversions = unitConversionsFromCm(measure.heightCm)
      subEl.innerHTML = `
        <div style="display:grid;gap:6px;">
          <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:12px;">
            <span>Quantity: <strong>${qty}</strong></span>
            ${measure.measureLabel ? `<span>Size: <strong>${esc(measure.measureLabel)}</strong></span>` : ''}
            ${hasArea ? `<span>Area: <strong>${measure.areaSqm.toFixed(3)} m²</strong> <span style="color:#9ca3af;">(${areaSqft.toFixed(2)} ft²)</span></span>` : ''}
            ${hasArea ? `<span>Billing: <strong>${billQty.toFixed(3)} m² × ${fmt$(rate)}</strong></span>` : `<span>Bill Qty: <strong>${billQty.toFixed(3)} ${esc(item.unit)}</strong></span>`}
          </div>
          ${(widthConversions || lengthConversions) ? `
          <div style="display:grid;gap:3px;font-size:11px;color:#64748b;">
            ${widthConversions ? `<span>Width: ${esc(widthConversions)}</span>` : ''}
            ${lengthConversions ? `<span>Length: ${esc(lengthConversions)}</span>` : ''}
          </div>` : ''}
          <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;padding:6px 10px;background:#f8fafc;border-radius:5px;border:1px solid #e5e7eb;">
            ${showCosts && purchaseCost > 0 ? `<span style="color:#1d4ed8;"><i class="fa-solid fa-receipt" style="margin-right:3px;font-size:10px;"></i>Purchase: <strong>${fmt$(purchaseCost)}/${esc(item.unit)}</strong></span>` : ''}
            <span style="color:#374151;"><i class="fa-solid fa-tag" style="margin-right:3px;font-size:10px;"></i>Sell: <strong>${fmt$(rate)}/${hasArea ? 'm²' : esc(item.unit)}</strong></span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;">
            ${showCosts && costTotal > 0 ? `<span style="color:#92400e;">Cost: <strong>${fmt$(costTotal)}</strong></span>` : ''}
            <span style="color:#059669;">Sale: <strong>${fmt$(total)}</strong></span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:6px 10px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:5px;font-size:12px;">
            ${showCosts && costTotal > 0 ? `<span style="color:#64748b;">Total Cost: <strong>${fmt$(costTotal)}</strong></span>` : ''}
            <span>Total Revenue: <strong style="color:#059669;">${fmt$(total)}</strong></span>
            ${showCosts && costTotal > 0 ? `<span style="color:${marginColor};font-weight:700;padding:2px 8px;background:${margin>=20?'#d1fae5':margin>=10?'#fef3c7':'#fee2e2'};border-radius:999px;">Margin: ${margin.toFixed(1)}%</span>` : ''}
          </div>
        </div>`
    }
  }
  updateGrand()
}

// ── BOM Toggle ────────────────────────────────────────────────────────────────
function getComponentPlan(subType, wCm, qty) {
  const recipe = findRecipeForBlindType(allRecipes, subType)
  const wM = wCm / 100  // convert cm to meters for width-dependent parts
  const components = (recipe?.recipe_items || []).map(item => {
    const plannedQty = item.is_width_dependent
      ? wM * qty                                    // width-dependent: qty = blind width × count
      : Number(item.quantity_per_unit || 0) * qty
    const rate = Number(item.inv_variants?.purchase_rate || 0)
    return {
      variant_id:         item.variant_id,
      planned_qty:        plannedQty,
      is_width_dependent: item.is_width_dependent,
      unit:               item.inv_variants?.unit || 'pcs',
      name:               item.inv_variants?.name || 'Component',
      rate,
      line_total:         plannedQty * rate,
    }
  })

  return {
    components,
    total: components.reduce((s, c) => s + Number(c.line_total || 0), 0),
  }
}

function getComponentPlanForFGRows(subType, rows) {
  const recipe = findRecipeForBlindType(allRecipes, subType)
  const validRows = (rows || []).filter(r => r.qty > 0 && Number.isFinite(r.w_m))
  const components = (recipe?.recipe_items || []).map(item => {
    const plannedQty = validRows.reduce((sum, row) => {
      return sum + (item.is_width_dependent ? row.w_m * row.qty : Number(item.quantity_per_unit || 0) * row.qty)
    }, 0)
    const rate = Number(item.inv_variants?.purchase_rate || 0)
    return {
      variant_id:         item.variant_id,
      planned_qty:        plannedQty,
      is_width_dependent: item.is_width_dependent,
      unit:               item.inv_variants?.unit || 'pcs',
      name:               item.inv_variants?.name || 'Component',
      rate,
      line_total:         plannedQty * rate,
    }
  })

  return {
    components,
    total: components.reduce((s, c) => s + Number(c.line_total || 0), 0),
  }
}

function toggleBOM(i) {
  const body    = document.getElementById(`bom-body-${i}`)
  const chevron = document.getElementById(`bom-chevron-${i}`)
  if (!body) return
  const hidden = body.classList.toggle('d-none')
  chevron.className = `fa-solid fa-chevron-${hidden ? 'down' : 'up'} text-xs text-muted`
}

// Legacy single-row calculator kept only as a reference while the multi-row
// calculator below owns the active Create Order UI.
function calcItemLegacySingleRow(i) {
  const mainType = val(`maintype-${i}`)
  const subType  = val(`subtype-${i}`)
  const v        = selFabVar[i]
  const fabricId = v?.id || null
  const rollW_m  = v?.width_m || 0
  const rate     = parseFloat(document.getElementById(`rate-${i}`)?.value) || v?.base_rate_sqm || 0
  const fabricRequired = (BLIND_FABRIC_MAP[mainType] || []).length > 0

  const discPct  = Math.min(Math.max(parseFloat(document.getElementById(`disc-${i}`)?.value) || 0, 0), 100)
  const sellRate = discPct > 0 ? rate * (1 - discPct / 100) : rate

  const wRaw  = parseFloat(document.getElementById(`w-${i}`)?.value)
  const hRaw  = parseFloat(document.getElementById(`h-${i}`)?.value)
  const wUnit = document.getElementById(`wu-${i}`)?.value || 'cm'
  const hUnit = document.getElementById(`hu-${i}`)?.value || 'cm'
  const qtyRaw = parseFloat(document.getElementById(`q-${i}`)?.value)
  const qty   = !isNaN(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1

  const w_cm = !isNaN(wRaw) ? cvtUnit(wRaw, wUnit, 'cm') : NaN
  const h_cm = !isNaN(hRaw) ? cvtUnit(hRaw, hUnit, 'cm') : NaN
  const w_m  = w_cm / 100
  const h_m  = h_cm / 100

  const subEl = document.getElementById(`sub-${i}`)
  const fabricWarn = document.getElementById(`fabric-warn-${i}`)
  const showCosts = canSeeCostDetails()
  if (fabricWarn) fabricWarn.style.display = 'none'

  let areaHtml = ''

  if (!isNaN(w_cm) && !isNaN(h_cm)) {
    const areaSqm  = w_m * h_m * qty
    const areaSqft = areaSqm * 10.7639
    let fabricTotal = 0
    let lineTotal   = 0
    let rollHtml   = ''
    let wastageHtml = ''
    const isSheerDimout    = mainType === 'Sheer Dimout Blinds'
    const fabricMultiplier = isSheerDimout ? 2 : 1

    if (fabricId || (!fabricRequired && rate > 0)) {
      fabricTotal = areaSqm * sellRate

      if (fabricId && rollW_m > 0) {
        if (w_m > rollW_m) {
          if (fabricWarn) {
            fabricWarn.textContent = `⚠ Width (${wRaw}${wUnit} = ${w_m.toFixed(3)}m) exceeds roll width (${rollW_m}m). Split into multiple blinds.`
            fabricWarn.style.display = ''
          }
        }

        // fabricMultiplier and isSheerDimout already defined above
        const totalLengthNeeded = h_m * qty * fabricMultiplier
        const stockRolls = (v.rolls||[]).filter(r => r.status === 'in_stock' && r.remaining_length > 0)
        const stockM = stockRolls.reduce((s, r) => s + Number(r.remaining_length||0), 0)
        const stockSqm = stockM * rollW_m
        const stockOk = stockM >= totalLengthNeeded
        const stockHtml = `<span style="color:${stockOk ? '#059669' : '#ef4444'};">
          Stock: <strong>${stockM.toFixed(2)}m</strong> (${stockSqm.toFixed(2)} sqm)
          ${stockOk ? '✓' : `⚠ Need ${totalLengthNeeded.toFixed(2)}m`}
        </span>`

        rollHtml = `
          <span style="color:#6b7280;">
            Fabric needed: <strong>${totalLengthNeeded.toFixed(2)}m</strong>
            ${isSheerDimout ? '<span style="color:#7c3aed;font-size:11px;">(×2 — sheer dimout uses double cloth)</span>' : ''}
          </span>
          ${stockHtml}`

        const sideWaste_sqm = Math.max(rollW_m - w_m, 0) * h_m * qty
        if (sideWaste_sqm > 0.01) {
          wastageHtml = `<span style="color:#f59e0b;">Side trim waste: <strong>${sideWaste_sqm.toFixed(3)} m²</strong></span>`
        }
      }
    }

    const componentPlan = getComponentPlan(subType, w_cm, qty)
    lineTotal = fabricTotal

    // ── Full financial breakdown ──
    // Cost rate = purchase_rate (per linear meter) ÷ fabric width (m) = cost per sqm
    const purchaseRatePerM = Number(v?.purchase_rate || 0)
    const fabW             = Number(v?.width_m || 0)
    const costRateSqm      = (fabW > 0 && purchaseRatePerM > 0) ? (purchaseRatePerM / fabW) : Number(v?.base_rate_sqm || 0)
    const fabricCostTotal  = areaSqm * costRateSqm * fabricMultiplier
    const componentCost    = componentPlan.total
    const totalCost        = fabricCostTotal + componentCost
    const totalRevenue     = fabricTotal
    const margin           = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100) : 0
    const marginColor      = margin >= 20 ? '#059669' : margin >= 10 ? '#d97706' : '#ef4444'

    areaHtml = `
      <div style="display:grid;gap:6px;">
        <!-- Row 1: Area + dimensions -->
        <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:12px;">
          <span>Area: <strong>${areaSqm.toFixed(3)} m²</strong> <span style="color:#9ca3af;">(${areaSqft.toFixed(2)} ft²)</span></span>
          ${fabricId && rollHtml ? rollHtml : ''}
          ${wastageHtml}
        </div>
        ${fabricId || (!fabricRequired && rate > 0) ? `
        <!-- Row 2: Rate comparison -->
        <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;padding:6px 10px;background:#f8fafc;border-radius:5px;border:1px solid #e5e7eb;">
          ${showCosts && fabricId ? `<span style="color:#1d4ed8;"><i class="fa-solid fa-receipt" style="margin-right:3px;font-size:10px;"></i>Purchase: <strong>₹${purchaseRatePerM.toFixed(2)}/m</strong></span>
          <span style="color:#92400e;"><i class="fa-solid fa-coins" style="margin-right:3px;font-size:10px;"></i>Cost: <strong>₹${costRateSqm.toFixed(2)}/m²</strong></span>` : ''}
          <span style="color:#374151;"><i class="fa-solid fa-tag" style="margin-right:3px;font-size:10px;"></i>RRP: <strong>₹${rate.toFixed(2)}/m²</strong></span>
          ${discPct > 0 ? `<span style="color:#d97706;"><i class="fa-solid fa-percent" style="margin-right:3px;font-size:10px;"></i>Sell: <strong>₹${sellRate.toFixed(2)}/m²</strong> <span style="font-size:10px;">(−${discPct}%)</span></span>` : ''}
        </div>
        <!-- Row 3: Money breakdown -->
        <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;">
          ${showCosts && fabricId ? `<span style="color:#92400e;">Fabric Cost: <strong>${fmt$(fabricCostTotal)}</strong></span>` : ''}
          <span style="color:#059669;">Sale: <strong>${fmt$(fabricTotal)}</strong></span>
          ${showCosts && componentCost > 0 ? `<span style="color:#7c3aed;">Components: <strong>${fmt$(componentCost)}</strong></span>` : ''}
        </div>
        <!-- Row 4: Totals + margin -->
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:6px 10px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:5px;font-size:12px;">
          ${showCosts && totalCost > 0 ? `<span style="color:#64748b;">Total Cost: <strong>${fmt$(totalCost)}</strong></span>` : ''}
          <span>Total Revenue: <strong style="color:#059669;">${fmt$(totalRevenue)}</strong></span>
          ${showCosts && totalRevenue > 0 ? `<span style="color:${marginColor};font-weight:700;padding:2px 8px;background:${margin>=20?'#d1fae5':margin>=10?'#fef3c7':'#fee2e2'};border-radius:999px;">Margin: ${margin.toFixed(1)}%</span>` : ''}
        </div>` : `
        <div style="font-size:12px;color:#9ca3af;">${fabricRequired ? 'Select a fabric to see financial breakdown' : 'Set a selling rate to see totals'}</div>`}
      </div>`
  } else {
    areaHtml = `<span style="color:#9ca3af;">Enter dimensions to see area and totals</span>`
  }

  if (subEl) subEl.innerHTML = areaHtml

  // BOM preview
  const bomWrap = document.getElementById(`bom-wrap-${i}`)
  const bomBody = document.getElementById(`bom-body-${i}`)
  const bomComponentPlan = !isNaN(w_m) && !isNaN(h_m) ? getComponentPlan(subType, w_cm, qty) : { components: [], total: 0 }
  if (bomComponentPlan.components.length && !isNaN(w_m) && !isNaN(h_m)) {
    bomWrap.style.display = ''
    const rows = bomComponentPlan.components.map(item => {
      const rateStr = item.rate ? `${fmt$(item.rate)}/${item.unit}` : '—'
      return `<tr>
        <td style="font-size:12px;">${esc(item.name)}</td>
        <td style="font-size:12px;text-align:center;color:#6b7280;">${item.is_width_dependent ? 'Width-based' : 'Fixed'}</td>
        <td style="font-size:12px;text-align:right;font-weight:600;">${item.planned_qty.toFixed(3)} ${item.unit}</td>
        ${showCosts ? `<td style="font-size:12px;text-align:right;color:#9ca3af;">${rateStr}</td>` : ''}
      </tr>`
    }).join('')
    bomBody.innerHTML = `
      <div class="table-wrap" style="margin:0 0 8px;">
        <table style="font-size:12px;">
          <thead><tr>
            <th>Component</th>
            <th style="text-align:center;">Type</th>
            <th style="text-align:right;">Qty Needed</th>
            ${showCosts ? '<th style="text-align:right;">Rate</th>' : ''}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
  } else {
    if (bomWrap) bomWrap.style.display = 'none'
  }

  updateGrand()
}

// ── Grand Total ───────────────────────────────────────────────────────────────
function calcItem(i) {
  const mainType = val(`maintype-${i}`)
  const subType = val(`subtype-${i}`)
  const v = selFabVar[i]
  const fabricId = v?.id || null
  const rollW_m = Number(v?.width_m || 0)
  const rate = parseFloat(document.getElementById(`rate-${i}`)?.value) || Number(v?.base_rate_sqm || 0)
  const fabricRequired = (BLIND_FABRIC_MAP[mainType] || []).length > 0
  const discPct = Math.min(Math.max(parseFloat(document.getElementById(`disc-${i}`)?.value) || 0, 0), 100)
  const sellRate = discPct > 0 ? rate * (1 - discPct / 100) : rate
  const dimRows = readFGDimensionRows(i)
  const validRows = dimRows.filter(r => r.qty > 0 && Number.isFinite(r.w_m) && Number.isFinite(r.h_m))
  const subEl = document.getElementById(`sub-${i}`)
  const fabricWarn = document.getElementById(`fabric-warn-${i}`)
  const showCosts = canSeeCostDetails()
  if (fabricWarn) fabricWarn.style.display = 'none'

  if (!validRows.length) {
    if (subEl) subEl.innerHTML = `<span style="color:#9ca3af;">Enter dimensions to see SQM and totals</span>`
    const bomWrap = document.getElementById(`bom-wrap-${i}`)
    if (bomWrap) bomWrap.style.display = 'none'
    updateGrand()
    return
  }

  const areaSqm = validRows.reduce((sum, row) => sum + row.areaSqm, 0)
  const areaSqft = areaSqm * 10.7639
  const totalQty = validRows.reduce((sum, row) => sum + row.qty, 0)
  const isSheerDimout = mainType === 'Sheer Dimout Blinds'
  const fabricMultiplier = isSheerDimout ? 2 : 1
  const fabricTotal = (fabricId || (!fabricRequired && rate > 0)) ? areaSqm * sellRate : 0
  const componentPlan = getComponentPlanForFGRows(subType, validRows)
  let rollHtml = ''
  let wastageHtml = ''

  if (fabricId && rollW_m > 0) {
    const overRows = validRows.filter(row => row.w_m > rollW_m)
    if (overRows.length && fabricWarn) {
      fabricWarn.textContent = `Width on row ${overRows.map(r => r.index).join(', ')} exceeds roll width (${rollW_m}m). Split into multiple blinds.`
      fabricWarn.style.display = ''
    }

    const totalLengthNeeded = validRows.reduce((sum, row) => sum + (row.h_m * row.qty * fabricMultiplier), 0)
    const stockRolls = (v.rolls || []).filter(r => r.status === 'in_stock' && r.remaining_length > 0)
    const stockM = stockRolls.reduce((s, r) => s + Number(r.remaining_length || 0), 0)
    const stockSqm = stockM * rollW_m
    const stockOk = stockM >= totalLengthNeeded
    rollHtml = `
      <span style="color:#6b7280;">
        Fabric needed: <strong>${totalLengthNeeded.toFixed(2)}m</strong>
        ${isSheerDimout ? '<span style="color:#7c3aed;font-size:11px;">(x2 sheer dimout cloth)</span>' : ''}
      </span>
      <span style="color:${stockOk ? '#059669' : '#ef4444'};">
        Stock: <strong>${stockM.toFixed(2)}m</strong> (${stockSqm.toFixed(2)} sqm)
        ${stockOk ? 'OK' : `Need ${totalLengthNeeded.toFixed(2)}m`}
      </span>`

    const sideWaste_sqm = validRows.reduce((sum, row) => sum + Math.max(rollW_m - row.w_m, 0) * row.h_m * row.qty, 0)
    if (sideWaste_sqm > 0.01) {
      wastageHtml = `<span style="color:#f59e0b;">Side trim waste: <strong>${sideWaste_sqm.toFixed(3)} sqm</strong></span>`
    }
  }

  const purchaseRatePerM = Number(v?.purchase_rate || 0)
  const fabW = Number(v?.width_m || 0)
  const costRateSqm = (fabW > 0 && purchaseRatePerM > 0) ? (purchaseRatePerM / fabW) : Number(v?.base_rate_sqm || 0)
  const fabricCostTotal = areaSqm * costRateSqm * fabricMultiplier
  const componentCost = componentPlan.total
  const totalCost = fabricCostTotal + componentCost
  const totalRevenue = fabricTotal
  const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100) : 0
  const marginColor = margin >= 20 ? '#059669' : margin >= 10 ? '#d97706' : '#ef4444'
  const rowSummary = validRows.map(row => `
    <tr>
      <td>${row.index}</td>
      <td>${fmtPlainNumber(row.qty, 3)}</td>
      <td>${fmtPlainNumber(row.wRaw, 3)} ${esc(row.wUnit)} x ${fmtPlainNumber(row.hRaw, 3)} ${esc(row.hUnit)}</td>
      <td style="text-align:right;font-weight:700;">${row.areaSqm.toFixed(3)} sqm</td>
    </tr>`).join('')

  if (subEl) {
    subEl.innerHTML = `
      <div style="display:grid;gap:6px;">
        <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:12px;">
          <span>Blinds: <strong>${fmtPlainNumber(totalQty, 3)}</strong></span>
          <span>Total SQM: <strong>${areaSqm.toFixed(3)} sqm</strong> <span style="color:#9ca3af;">(${areaSqft.toFixed(2)} sqft)</span></span>
          ${fabricId && rollHtml ? rollHtml : ''}
          ${wastageHtml}
        </div>
        <div class="fg-dimension-summary">
          <table>
            <thead><tr><th>Row</th><th>Qty</th><th>Dimensions</th><th style="text-align:right;">SQM</th></tr></thead>
            <tbody>${rowSummary}</tbody>
          </table>
        </div>
        ${fabricId || (!fabricRequired && rate > 0) ? `
        <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;padding:6px 10px;background:#f8fafc;border-radius:5px;border:1px solid #e5e7eb;">
          ${showCosts && fabricId ? `<span style="color:#1d4ed8;"><i class="fa-solid fa-receipt" style="margin-right:3px;font-size:10px;"></i>Purchase: <strong>Rs ${purchaseRatePerM.toFixed(2)}/m</strong></span>
          <span style="color:#92400e;"><i class="fa-solid fa-coins" style="margin-right:3px;font-size:10px;"></i>Cost: <strong>Rs ${costRateSqm.toFixed(2)}/sqm</strong></span>` : ''}
          <span style="color:#374151;"><i class="fa-solid fa-tag" style="margin-right:3px;font-size:10px;"></i>RRP: <strong>Rs ${rate.toFixed(2)}/sqm</strong></span>
          ${discPct > 0 ? `<span style="color:#d97706;"><i class="fa-solid fa-percent" style="margin-right:3px;font-size:10px;"></i>Sell: <strong>Rs ${sellRate.toFixed(2)}/sqm</strong> <span style="font-size:10px;">(-${discPct}%)</span></span>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;">
          ${showCosts && fabricId ? `<span style="color:#92400e;">Fabric Cost: <strong>${fmt$(fabricCostTotal)}</strong></span>` : ''}
          <span style="color:#059669;">Sale: <strong>${fmt$(fabricTotal)}</strong></span>
          ${showCosts && componentCost > 0 ? `<span style="color:#7c3aed;">Components: <strong>${fmt$(componentCost)}</strong></span>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:6px 10px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:5px;font-size:12px;">
          ${showCosts && totalCost > 0 ? `<span style="color:#64748b;">Total Cost: <strong>${fmt$(totalCost)}</strong></span>` : ''}
          <span>Total Revenue: <strong style="color:#059669;">${fmt$(totalRevenue)}</strong></span>
          ${showCosts && totalRevenue > 0 ? `<span style="color:${marginColor};font-weight:700;padding:2px 8px;background:${margin>=20?'#d1fae5':margin>=10?'#fef3c7':'#fee2e2'};border-radius:999px;">Margin: ${margin.toFixed(1)}%</span>` : ''}
        </div>` : `
        <div style="font-size:12px;color:#9ca3af;">${fabricRequired ? 'Select a fabric to see financial breakdown' : 'Set a selling rate to see totals'}</div>`}
      </div>`
  }

  const bomWrap = document.getElementById(`bom-wrap-${i}`)
  const bomBody = document.getElementById(`bom-body-${i}`)
  if (componentPlan.components.length && validRows.length) {
    bomWrap.style.display = ''
    const rows = componentPlan.components.map(item => {
      const rateStr = item.rate ? `${fmt$(item.rate)}/${item.unit}` : '-'
      return `<tr>
        <td style="font-size:12px;">${esc(item.name)}</td>
        <td style="font-size:12px;text-align:center;color:#6b7280;">${item.is_width_dependent ? 'Width-based' : 'Fixed'}</td>
        <td style="font-size:12px;text-align:right;font-weight:600;">${item.planned_qty.toFixed(3)} ${item.unit}</td>
        ${showCosts ? `<td style="font-size:12px;text-align:right;color:#9ca3af;">${rateStr}</td>` : ''}
      </tr>`
    }).join('')
    bomBody.innerHTML = `
      <div class="table-wrap" style="margin:0 0 8px;">
        <table style="font-size:12px;">
          <thead><tr>
            <th>Component</th>
            <th style="text-align:center;">Type</th>
            <th style="text-align:right;">Qty Needed</th>
            ${showCosts ? '<th style="text-align:right;">Rate</th>' : ''}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
  } else if (bomWrap) {
    bomWrap.style.display = 'none'
  }

  updateGrand()
}

function updateGrand() {
  let grand = 0
  document.querySelectorAll('.item-card').forEach(card => {
    const i            = card.id.replace('item-', '')
    const fgVisible    = document.getElementById(`fg-section-${i}`)?.style.display !== 'none'
    const trackVisible = document.getElementById(`track-section-${i}`)?.style.display !== 'none'
    const resaleVisible = document.getElementById(`resale-section-${i}`)?.style.display !== 'none'

    if (resaleVisible) {
      const rate = parseFloat(document.getElementById(`fgi-rate-${i}`)?.value) || 0
      const measure = resaleMeasureForItem(i, selFGItem[i])
      grand += measure.billQty * rate
      return
    }

    if (fgVisible) {
      const v = selFabVar[i]
      const rate  = parseFloat(document.getElementById(`rate-${i}`)?.value) || v?.base_rate_sqm || 0
      const discPct = Math.min(Math.max(parseFloat(document.getElementById(`disc-${i}`)?.value) || 0, 0), 100)
      const sellRate = discPct > 0 ? rate * (1 - discPct / 100) : rate
      const rows = readFGDimensionRows(i).filter(r => r.qty > 0 && Number.isFinite(r.w_m) && Number.isFinite(r.h_m))
      grand += rows.reduce((sum, row) => sum + row.areaSqm * sellRate, 0)
    } else if (trackVisible) {
      const qty      = parseInt(document.getElementById(`trk-qty-${i}`)?.value) || 0
      const lenRaw   = parseFloat(document.getElementById(`trk-len-${i}`)?.value)
      const lenUnit  = document.getElementById(`trk-unit-${i}`)?.value || 'in'
      const rate     = parseFloat(document.getElementById(`trk-rate-${i}`)?.value) || 0
      if (!isNaN(lenRaw) && lenRaw > 0) {
        grand += qty * rate
      }
    } else {
      const qty    = parseFloat(document.getElementById(`rm-qty-${i}`)?.value) || 0
      const rate   = parseFloat(document.getElementById(`rm-rate-${i}`)?.value) || 0
      grand += qty * rate
    }
  })
  text('grand-total', fmt$(grand))
  saveOrderDraft()
}

// ── Submit Order ──────────────────────────────────────────────────────────────
function setupOrderDraftAutosave() {
  clearOrderDraft()
}

function getOrderItemType(i) {
  if (document.getElementById(`resale-section-${i}`)?.style.display !== 'none') return 'resale'
  if (document.getElementById(`track-section-${i}`)?.style.display !== 'none') return 'track'
  if (document.getElementById(`rm-section-${i}`)?.style.display !== 'none') return 'rm'
  return 'fg'
}

function setFieldValue(id, value) {
  const el = document.getElementById(id)
  if (el) el.value = value ?? ''
}

function quoteInputDate(value) {
  const textValue = String(value || '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(textValue)) return textValue
  return new Date().toISOString().slice(0, 10)
}

function readCreateQuoteValue(id) {
  return document.getElementById(id)?.value?.trim() || ''
}

function quoteCustomerBlock(customer = selectedCustomer) {
  if (!customer) return ''
  return [
    customer.name,
    customer.address,
    [customer.city, customer.state].filter(Boolean).join(', '),
    customer.phone ? `Phone: ${customer.phone}` : '',
    customer.gstin ? `GST No. ${customer.gstin}` : '',
  ].filter(Boolean).join('\n')
}

function fillQuoteAddressFromCustomer(customer = selectedCustomer, force = false) {
  const block = quoteCustomerBlock(customer)
  if (!block) return
  const billing = document.getElementById('quote-billing-address')
  const delivery = document.getElementById('quote-delivery-address')
  if (billing && (force || !billing.value.trim())) billing.value = block
  if (delivery && (force || !delivery.value.trim())) delivery.value = block
}

function collectCreateQuoteForm(orderUid = '') {
  const quoteNo = readCreateQuoteValue('quote-no') || (orderUid ? `TV/${orderUid}` : '')
  return {
    quoteNo,
    quoteDate: readCreateQuoteValue('quote-date') || quoteInputDate(val('order-date')),
    billingAddress: readCreateQuoteValue('quote-billing-address'),
    deliveryAddress: readCreateQuoteValue('quote-delivery-address'),
    intro1: readCreateQuoteValue('quote-intro-1'),
    intro2: readCreateQuoteValue('quote-intro-2'),
    cgstRate: Number(readCreateQuoteValue('quote-cgst-rate') || 0),
    sgstRate: Number(readCreateQuoteValue('quote-sgst-rate') || 0),
    terms: {
      payment1: readCreateQuoteValue('quote-term-payment-1') || QUOTE_DEFAULT_TERMS.payment1,
      payment2: readCreateQuoteValue('quote-term-payment-2') || QUOTE_DEFAULT_TERMS.payment2,
      installation: readCreateQuoteValue('quote-term-installation') || QUOTE_DEFAULT_TERMS.installation,
      delivery: readCreateQuoteValue('quote-term-delivery') || QUOTE_DEFAULT_TERMS.delivery,
    },
    bank: {
      accountName: readCreateQuoteValue('quote-bank-account-name') || QUOTE_DEFAULT_BANK.accountName,
      bankName: readCreateQuoteValue('quote-bank-name') || QUOTE_DEFAULT_BANK.bankName,
      branch: readCreateQuoteValue('quote-bank-branch') || QUOTE_DEFAULT_BANK.branch,
      accountNo: readCreateQuoteValue('quote-bank-account-no') || QUOTE_DEFAULT_BANK.accountNo,
      ifsc: readCreateQuoteValue('quote-bank-ifsc') || QUOTE_DEFAULT_BANK.ifsc,
    },
  }
}

async function saveCreateQuoteForm(orderId, orderUid) {
  const formData = collectCreateQuoteForm(orderUid)
  const { error } = await db.from('order_quote_forms').insert({
    order_id: orderId,
    form_data: formData,
    updated_by: currentProfile?.id || null,
  })
  if (error) {
    if (/order_quote_forms|relation .* does not exist|schema cache/i.test(error.message || '')) {
      console.warn('Quote/proforma details were not saved. Run migration 033_order_quote_forms_and_downloads.sql:', error.message)
      return
    }
    throw error
  }
}

function displayTicketUid(ticket) {
  const raw = String(ticket?.ticket_uid || '').replace(/^TKT-/i, '')
  if (/^\d{10}$/.test(raw)) return raw.slice(0, 4)
  return raw || 'Ticket'
}

function saveOrderDraft() {
}

function restoreOrderDraft() {
  clearOrderDraft()
  return false
}

function clearOrderDraft() {
  try { localStorage.removeItem(ORDER_DRAFT_KEY) } catch {}
}

async function submitOrder() {
  hideAlert('order-alert')
  if (submitOrder._busy) return

  let custId = null
  if (isNewCustomer) {
    const name  = val('nc-name').trim()
    if (!name)  { showAlert('order-alert', 'Customer name is required'); return }
  } else {
    if (!selectedCustomer) { showAlert('order-alert', 'Select a customer or use "New Customer"'); return }
    custId = selectedCustomer.id
  }

  const cards = document.querySelectorAll('.item-card')
  if (!cards.length) { showAlert('order-alert', 'Add at least one item'); return }

  const items = []
  for (const card of cards) {
    const i             = card.id.replace('item-', '')
    const fgVisible     = document.getElementById(`fg-section-${i}`)?.style.display !== 'none'
    const trackVisible  = document.getElementById(`track-section-${i}`)?.style.display !== 'none'
    const resaleVisible = document.getElementById(`resale-section-${i}`)?.style.display !== 'none'
    const productCode   = selProductCode[i] || null

    if (resaleVisible) {
      const fgItem = selFGItem[i]
      const measure = resaleMeasureForItem(i, fgItem)
      const qty    = measure.qty
      const rate   = parseFloat(document.getElementById(`fgi-rate-${i}`)?.value)

      if (!fgItem)          { showAlert('order-alert', `Item ${i}: select a Resale Item`); return }
      if (isNaN(qty) || qty <= 0) { showAlert('order-alert', `Item ${i}: enter valid quantity`); return }
      if (isNaN(rate) || rate <= 0) { showAlert('order-alert', `Item ${i}: enter a selling rate`); return }

      items.push({
        itemType:   'resale',
        fgStockId:  fgItem.fgStockId || null,
        fabricId:   fgItem.variantId || null,
        qty:        measure.qty,
        unit:       measure.widthCm && measure.heightCm ? 'sqm' : fgItem.unit,
        rate,
        lineTotal:  measure.billQty * rate,
        areaSqm:    measure.areaSqm,
        w_cm:       measure.widthCm,
        h_cm:       measure.heightCm,
        inputWidthRaw: measure.inputWidthRaw,
        inputWidthUnit: measure.inputWidthUnit,
        inputHeightRaw: measure.inputHeightRaw,
        inputHeightUnit: measure.inputHeightUnit,
        components: [],
        wasteInfo:  null,
        productCodeId: productCode?.id || null,
        productName: productCode?.code || fgItem.name,
      })
      continue
    }

    if (fgVisible) {
      {
        const mainType = val(`maintype-${i}`)
        const subType  = val(`subtype-${i}`)
        const v        = selFabVar[i]
        const fabricId = v?.id || null
        const rollId   = selRoll[i] || null
        const rows     = readFGDimensionRows(i)

        if (!mainType) { showAlert('order-alert', `Item ${i}: select a Blind Type`); return }
        if (!subType)  { showAlert('order-alert', `Item ${i}: select a Sub-Type`); return }

        const catNames = BLIND_FABRIC_MAP[mainType] || []
        if (catNames.length && !fabricId) {
          showAlert('order-alert', `Item ${i}: select a Fabric`)
          return
        }

        if (!rows.length) { showAlert('order-alert', `Item ${i}: add at least one dimension row`); return }
        for (const row of rows) {
          if (!Number.isFinite(row.qtyRaw) || row.qtyRaw <= 0) { showAlert('order-alert', `Item ${i}, row ${row.index}: enter valid quantity`); return }
          if (!Number.isFinite(row.wRaw) || row.wRaw <= 0) { showAlert('order-alert', `Item ${i}, row ${row.index}: enter valid width`); return }
          if (!Number.isFinite(row.hRaw) || row.hRaw <= 0) { showAlert('order-alert', `Item ${i}, row ${row.index}: enter valid height`); return }
          if (fabricId && v?.width_m > 0 && row.w_m > v.width_m) {
            showAlert('order-alert', `Item ${i}, row ${row.index}: width (${row.w_m.toFixed(3)}m) exceeds roll width (${v.width_m}m). Cannot proceed.`)
            return
          }
        }

        const rate = parseFloat(document.getElementById(`rate-${i}`)?.value) || v?.base_rate_sqm || 0
        if (rate <= 0) { showAlert('order-alert', `Item ${i}: enter a selling rate`); return }

        const discPctSub = Math.min(Math.max(parseFloat(document.getElementById(`disc-${i}`)?.value) || 0, 0), 100)
        const sellRateSub = discPctSub > 0 ? rate * (1 - discPctSub / 100) : rate
        const rollW_m = v?.width_m || 0
        const isSheerDimout = mainType === 'Sheer Dimout Blinds'
        const fabricMult = isSheerDimout ? 2 : 1

        for (const row of rows) {
          const areaSqm = row.areaSqm
          const fabricTotal = areaSqm * sellRateSub
          const componentPlan = getComponentPlan(subType, row.w_cm, row.qty)
          const components = componentPlan.components

          let wasteInfo = null
          if (fabricId && rollW_m > 0) {
            wasteInfo = {
              variant_id:    fabricId,
              cut_length_m:  row.h_m * row.qty * fabricMult,
              used_length_m: row.h_m * row.qty * fabricMult,
              cut_width_m:   rollW_m,
              used_width_m:  row.w_m,
            }
          }

          items.push({
            itemType: 'finished_goods',
            mainType, subType, fabricId, rollId,
            w_cm: row.w_cm,
            h_cm: row.h_cm,
            w_m: row.w_m,
            h_m: row.h_m,
            qty: row.qty,
            inputWidthRaw: row.wRaw,
            inputWidthUnit: row.wUnit,
            inputHeightRaw: row.hRaw,
            inputHeightUnit: row.hUnit,
            areaSqm,
            rate: sellRateSub,
            lineTotal: fabricTotal,
            components,
            wasteInfo,
            productCodeId: productCode?.id || null,
            productName: productCode?.code || subType,
          })
        }
        continue
      }
      const mainType = val(`maintype-${i}`)
      const subType  = val(`subtype-${i}`)
      const v        = selFabVar[i]
      const fabricId = v?.id || null
      const rollId   = selRoll[i] || null
      const wRaw     = parseFloat(document.getElementById(`w-${i}`)?.value)
      const hRaw     = parseFloat(document.getElementById(`h-${i}`)?.value)
      const wUnit    = document.getElementById(`wu-${i}`)?.value || 'cm'
      const hUnit    = document.getElementById(`hu-${i}`)?.value || 'cm'
      const qty      = parseFloat(document.getElementById(`q-${i}`)?.value)

      if (!mainType) { showAlert('order-alert', `Item ${i}: select a Blind Type`); return }
      if (!subType)  { showAlert('order-alert', `Item ${i}: select a Sub-Type`); return }
      if (isNaN(qty) || qty <= 0) { showAlert('order-alert', `Item ${i}: enter valid quantity`); return }

      const catNames = BLIND_FABRIC_MAP[mainType] || []
      if (catNames.length && !fabricId) {
        showAlert('order-alert', `Item ${i}: select a Fabric`); return
      }

      if (isNaN(wRaw) || wRaw <= 0) { showAlert('order-alert', `Item ${i}: enter valid width`); return }
      if (isNaN(hRaw) || hRaw <= 0) { showAlert('order-alert', `Item ${i}: enter valid height`); return }

      const w_cm = cvtUnit(wRaw, wUnit, 'cm')
      const h_cm = cvtUnit(hRaw, hUnit, 'cm')
      const w_m  = w_cm / 100
      const h_m  = h_cm / 100

      if (fabricId && v?.width_m > 0 && w_m > v.width_m) {
        showAlert('order-alert', `Item ${i}: width (${w_m.toFixed(3)}m) exceeds roll width (${v.width_m}m). Cannot proceed.`)
        return
      }

      const rate           = parseFloat(document.getElementById(`rate-${i}`)?.value) || v?.base_rate_sqm || 0
      if (rate <= 0) { showAlert('order-alert', `Item ${i}: enter a selling rate`); return }

      const discPctSub     = Math.min(Math.max(parseFloat(document.getElementById(`disc-${i}`)?.value) || 0, 0), 100)
      const sellRateSub    = discPctSub > 0 ? rate * (1 - discPctSub / 100) : rate
      const rollW_m        = v?.width_m || 0
      const areaSqm        = w_m * h_m * qty
      const isSheerDimout  = mainType === 'Sheer Dimout Blinds'
      const fabricMult     = isSheerDimout ? 2 : 1
      const fabricTotal    = areaSqm * sellRateSub
      const componentPlan  = getComponentPlan(subType, w_cm, qty)
      const components     = componentPlan.components
      const lineTotal      = fabricTotal

      let wasteInfo = null
      if (fabricId && rollW_m > 0) {
        const isSheerDimout = mainType === 'Sheer Dimout Blinds'
        const fabricMultiplier = isSheerDimout ? 2 : 1
        wasteInfo = {
          variant_id:    fabricId,
          cut_length_m:  h_m * qty * fabricMultiplier,
          used_length_m: h_m * qty * fabricMultiplier,
          cut_width_m:   rollW_m,
          used_width_m:  w_m,
        }
      }

      items.push({
        itemType: 'finished_goods',
        mainType, subType, fabricId, rollId,
        w_cm, h_cm, w_m, h_m, qty,
        inputWidthRaw: wRaw,
        inputWidthUnit: wUnit,
        inputHeightRaw: hRaw,
        inputHeightUnit: hUnit,
        areaSqm, rate: sellRateSub, lineTotal,
        components, wasteInfo,
        productCodeId: productCode?.id || null,
        productName: productCode?.code || subType,
      })
    } else if (!fgVisible && !trackVisible) {
      const varSel  = document.getElementById(`rm-var-${i}`)
      const varId   = varSel?.value
      const varOpt  = varSel?.options[varSel?.selectedIndex]
      const qty     = parseFloat(document.getElementById(`rm-qty-${i}`)?.value)
      const unit    = val(`rm-unit-${i}`)
      const rate    = parseFloat(document.getElementById(`rm-rate-${i}`)?.value)

      if (!varId)            { showAlert('order-alert', `Item ${i}: select a variant`); return }
      if (isNaN(qty) || qty <= 0) { showAlert('order-alert', `Item ${i}: enter valid quantity`); return }
      if (isNaN(rate) || rate <= 0) { showAlert('order-alert', `Item ${i}: enter a selling rate`); return }

      items.push({
        itemType: 'raw_material',
        fabricId: varId,
        rollId: null,
        qty, unit, rate,
        lineTotal: qty * rate,
        areaSqm: unit === 'm' || unit === 'ft' ? cvtUnit(qty, unit, 'm') : qty,
        components: [],
        wasteInfo: null,
        productCodeId: productCode?.id || null,
        productName: productCode?.code || varOpt?.dataset?.name || varOpt?.textContent || null,
      })
    }

    if (trackVisible) {
      const trackType = selTrackType[i]
      const qty       = parseInt(document.getElementById(`trk-qty-${i}`)?.value) || 0
      const lenRaw    = parseFloat(document.getElementById(`trk-len-${i}`)?.value)
      const lenUnit   = document.getElementById(`trk-unit-${i}`)?.value || 'in'
      const rate      = parseFloat(document.getElementById(`trk-rate-${i}`)?.value) || 0

      if (!trackType) { showAlert('order-alert', `Item ${i}: select a Track Type (Super/Jumbo/M Track)`); return }
      if (!qty || qty <= 0) { showAlert('order-alert', `Item ${i}: enter valid quantity`); return }
      if (isNaN(lenRaw) || lenRaw <= 0) { showAlert('order-alert', `Item ${i}: enter valid length`); return }

      const lengthFt     = trkToFeet(lenRaw, lenUnit)
      const chargeableFt = trkCeilHalf(lengthFt)

      const recipe = findRecipeForBlindType(allRecipes, trackType)
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

      const trkComponents  = componentSource.map((component, idx) => {
        const matched = component.variantId
          ? allVariants.find(v => v.id === component.variantId) || null
          : resolveVariantForRecipeLabel(allVariants, component.name)
        // First component is always the track section (length-based); rest are pcs
        const isSection = idx === 0
        return {
          name: component.name,
          variantId:   matched?.id || null,
          unit:        isSection ? 'ft' : (matched?.unit || 'pcs'),
          plannedQty:  isSection
            ? chargeableFt * qty
            : (component.isWidthDependent ? chargeableFt * qty : (component.quantityPerUnit || 0) * qty),
        }
      })

      items.push({
        itemType:      'track',
        trackType,
        qty,
        inputLengthRaw: lenRaw,
        inputLengthUnit: lenUnit,
        lengthFt,
        chargeableFt,
        rate,
        lineTotal:     qty * rate,
        trkComponents,
        components:    [],
        wasteInfo:     null,
        productCodeId:  productCode?.id || null,
        productName:    productCode?.code || trackType,
      })
    }
  }

  const btn = document.getElementById('submit-btn')
  submitOrder._busy = true
  btn.disabled = true
  btn.innerHTML = '<span class="spinner spinner-sm"></span> Creating…'

  let createdOrderId = null
  try {
    if (isNewCustomer) {
      const newCustomer = await saveFilledCustomerProfile()
      if (!newCustomer) throw new Error('Customer profile could not be saved')
      custId = newCustomer.id
    }

    const { data: uidData } = await db.rpc('generate_order_uid')
    const orderUid = uidData || ('ORD-' + Date.now())

    const { data: order, error: orderErr } = await db.from('orders').insert({
      cust_id:      custId,
      customer_id:  currentProfile.id,
      dealer_name:  selectedCustomer?.name || val('nc-name') || 'Walk-in',
      status:       'inquiry',
      total_amount: items.reduce((s, it) => s + it.lineTotal, 0),
      notes:        val('order-notes') || null,
      order_uid:    orderUid,
      order_date:   val('order-date') || null,
    }).select('id').single()
    if (orderErr) throw orderErr
    const orderId = order.id
    createdOrderId = orderId
    await saveCreateQuoteForm(orderId, orderUid)

    for (const item of items) {
      const itemPayload = {
        order_id:         orderId,
        variant_id:       item.fabricId || null,
        roll_id:          item.rollId || null,
        fg_stock_id:      item.fgStockId || null,
        width_cm:         item.w_cm ?? null,
        height_cm:        item.h_cm ?? null,
        input_width_raw:  item.inputWidthRaw ?? null,
        input_width_unit: item.inputWidthUnit ?? null,
        input_height_raw: item.inputHeightRaw ?? null,
        input_height_unit:item.inputHeightUnit ?? null,
        input_length_raw: item.inputLengthRaw ?? null,
        input_length_unit:item.inputLengthUnit ?? null,
        input_length_ft:  item.lengthFt ?? null,
        chargeable_length_ft: item.chargeableFt ?? null,
        // For tracks: area_sqm stores chargeable length in feet
        area_sqm:         item.itemType === 'track' ? (item.chargeableFt ?? null) : (item.areaSqm ?? null),
        quantity:         item.qty,
        rate_applied:     item.rate,
        line_total:       item.lineTotal,
        item_type:        item.itemType,
        // For tracks: sale_unit = 'ft', blind_type = track sub-type
        sale_unit:        item.itemType === 'track' ? 'track' : (item.unit || null),
        blind_type:       item.itemType === 'track' ? (item.trackType || null) : (item.subType || null),
        product_code_id:  item.productCodeId || null,
        product_name:     item.productName || null,
        fabric_deducted:  false,
      }
      let oiResult = await db.from('order_items').insert(itemPayload).select('id').single()
      if (oiResult.error && /product_code_id/i.test(oiResult.error.message || '')) {
        delete itemPayload.product_code_id
        oiResult = await db.from('order_items').insert(itemPayload).select('id').single()
      }
      if (oiResult.error && /input_width_raw|input_width_unit|input_height_raw|input_height_unit|input_length_raw|input_length_unit|input_length_ft|chargeable_length_ft/i.test(oiResult.error.message || '')) {
        delete itemPayload.input_width_raw
        delete itemPayload.input_width_unit
        delete itemPayload.input_height_raw
        delete itemPayload.input_height_unit
        delete itemPayload.input_length_raw
        delete itemPayload.input_length_unit
        delete itemPayload.input_length_ft
        delete itemPayload.chargeable_length_ft
        oiResult = await db.from('order_items').insert(itemPayload).select('id').single()
      }
      if (oiResult.error && /product_code_id/i.test(oiResult.error.message || '')) {
        delete itemPayload.product_code_id
        oiResult = await db.from('order_items').insert(itemPayload).select('id').single()
      }
      const { data: oi, error: oiErr } = oiResult
      if (oiErr) throw oiErr

      const orderItemId = oi.id

      if (item.components.length) {
        const compRows = item.components.map(c => ({
          order_id:           orderId,
          order_item_id:      orderItemId,
          variant_id:         c.variant_id,
          planned_qty:        c.planned_qty,
          is_width_dependent: c.is_width_dependent,
          unit:               c.unit,
          is_extra:           false,
          deducted:           false,
        }))
        const { error: compErr } = await db.from('order_components').insert(compRows)
        if (compErr) console.error('Components insert error:', compErr)
      }

      // Insert track raw material components (using nullable variant_id + component_name)
      if (item.itemType === 'track' && item.trkComponents?.length) {
        const trkCompRows = item.trkComponents.map(c => ({
          order_id:       orderId,
          order_item_id:  orderItemId,
          variant_id:     c.variantId || null,
          component_name: c.variantId ? null : c.name,
          planned_qty:    c.plannedQty ?? 0,
          unit:           c.unit || 'pcs',
          is_extra:       false,
          deducted:       false,
        }))
        const { error: trkCompErr } = await db.from('order_components').insert(trkCompRows)
        if (trkCompErr) console.error('Track components insert error:', trkCompErr)
      }

    }

    if (activeTicket?.id) {
      const { error: ticketErr } = await db.from('order_tickets').update({
        status: 'converted',
        converted_order_id: orderId,
        converted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', activeTicket.id)
      if (ticketErr) throw ticketErr
    }

    await logActivity('create', 'order', orderId, orderUid, {
      items: items.length,
      customer: selectedCustomer?.name || val('nc-name'),
      ticket_id: activeTicket?.id || null,
    })
    clearOrderDraft()
    toast('Order created! Move it to processing when ready for production.')
    const isEmbed = new URLSearchParams(window.location.search).get('embed') === '1'
    if (isEmbed && window.parent && window.parent !== window) {
      if (typeof window.parent.onCreateOrderComplete === 'function') {
        window.parent.onCreateOrderComplete(orderId)
      } else if (typeof window.parent.closeCreateOrderPanel === 'function') {
        window.parent.closeCreateOrderPanel()
        window.parent.loadOrders?.()
      } else {
        window.location.href = `order-detail.html?id=${orderId}`
      }
    } else {
      window.location.href = `order-detail.html?id=${orderId}`
    }
  } catch (err) {
    if (createdOrderId) {
      try {
        await db.from('order_components').delete().eq('order_id', createdOrderId)
        await db.from('order_items').delete().eq('order_id', createdOrderId)
        await db.from('orders').delete().eq('id', createdOrderId)
      } catch (cleanupErr) {
        console.warn('Failed to clean up incomplete order:', cleanupErr?.message || cleanupErr)
      }
    }
    showAlert('order-alert', err.message)
    btn.disabled = false
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Submit Order'
    submitOrder._busy = false
  }
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
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
  return variants.find(v => targets.includes(normalizeInventoryNameForMatch(v.name))) || null
}

init()
