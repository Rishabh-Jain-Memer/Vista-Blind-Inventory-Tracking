/*
  Components page controller.
  Uses a Profiles-style drill-in flow:
  - list of blind component sets
  - click into a single product detail
  - edit product components with inventory-linked dropdowns
  Track components follow the same flow and stay linked to inventory variants.
*/

const TRACK_TEMPLATES = {
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

const EXPECTED_BLIND_RECIPES = [
  'Roller Blinds Without Headrail',
  'Roller Blinds With Headrail',
  'Sheer Dimout Blinds Classic Mechanism with Plain Cassette',
  'Sheer Dimout Blinds Classic Mechanism with Decorative Cassette',
  'S-Contour Blinds',
  'Roller Blinds With Plain Cassette',
  'Roller Blinds With Decorative Cassette',
]

const RECIPE_ALIAS_MAP = {
  'roller blinds without headrail': 'Roller Blinds Without Headrail',
  'roller with plain cassette': 'Roller Blinds With Plain Cassette',
  'roller blinds with plain cassette': 'Roller Blinds With Plain Cassette',
  'roller with decorative cassette': 'Roller Blinds With Decorative Cassette',
  'roller blinds with decorative cassette': 'Roller Blinds With Decorative Cassette',
  'roller with headrail': 'Roller Blinds With Headrail',
  'roller blinds with headrail': 'Roller Blinds With Headrail',
  'sheer dimout plain cassette': 'Sheer Dimout Blinds Classic Mechanism with Plain Cassette',
  'sheer dimout decorative cassette': 'Sheer Dimout Blinds Classic Mechanism with Decorative Cassette',
  's contour': 'S-Contour Blinds',
  's contour blinds': 'S-Contour Blinds',
  's contour blinds with cassette': 'S-Contour Blinds',
}

let currentProfile = null
let activeRecipeTab = 'blind'
let currentBlindRecipeId = null
let currentTrackRecipeName = null

let recipeSchema = {
  hasUpdatedAt: true,
  hasCreatedAt: true,
}

let inventoryState = {
  categories: [],
  products: [],
  variants: [],
  rolls: [],
}

let blindRecipes = []
let trackRecipes = []
let variantChoices = []
let editingRecipeId = null
let editingComponents = []
const componentSearchState = {}
const RECIPE_LABEL_PREFIXES = [
  'Curtain Tracks-',
  'Roller W/o Headrail-',
  'Roller with Headrail-',
  'Sheer Dimout Plain Cassette-',
  'Sheer Dimout Decorative Cassette-',
  'S-Contour-',
  'Roller with Plain Cassette-',
  'Roller with Decorative Cassette-',
]

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function queryWithRlsFallback(runPrimary, runAdmin) {
  return runPrimary(db)
}

function normalizeRecipeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[.']/g, '')
    .replace(/[-/]/g, ' ')
    .replace(/\b(blinds?|classic|premium|mechanism)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeInventoryLabel(name) {
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

  const keys = new Set()
  const add = value => {
    const normalized = normalizeInventoryLabel(value)
    if (normalized) keys.add(normalized)
  }

  add(raw)
  if (raw.includes('>')) add(raw.split('>').pop())

  for (const prefix of RECIPE_LABEL_PREFIXES) {
    if (raw.toLowerCase().startsWith(prefix.toLowerCase())) {
      add(raw.slice(prefix.length))
    }
  }

  return [...keys]
}

function resolveBlindTypeName(name) {
  const normalized = normalizeRecipeName(name)
  return RECIPE_ALIAS_MAP[normalized] || name
}

function computeVariantAvailableStock(variant) {
  return (variant.rolls || [])
    .filter(roll => (roll.status || 'in_stock') === 'in_stock')
    .reduce((sum, roll) => sum + Number(roll.remaining_length || 0), 0)
}

function fmtQty(qty, unit) {
  const value = Number(qty || 0)
  if (unit === 'pcs') return `${Math.round(value)} pcs`
  if (unit === 'm') return `${value.toFixed(3)} m`
  if (unit === 'ft') return `${value.toFixed(2)} ft`
  if (unit === 'cm') return `${value.toFixed(1)} cm`
  return `${value.toFixed(3)} ${unit || ''}`.trim()
}

function resolveVariantFromLabel(label) {
  const targets = buildInventoryMatchKeys(label)
  return variantChoices.find(variant => targets.includes(normalizeInventoryLabel(variant.name)))
    || variantChoices.find(variant => targets.includes(normalizeInventoryLabel(variant.direct_label)))
    || null
}

async function init() {
  currentProfile = await initSidebar()
  if (!currentProfile) return
  if (currentProfile.role !== 'admin') {
    window.location.href = 'dashboard.html'
    return
  }

  await loadRecipeData()
  renderStats()
  renderBlindRecipeList()
  renderTrackRecipeList()
  switchRecipeTab('blind')

  hide('loading')
  show('content')
}

async function loadRecipeData() {
  const recipesPromise = loadRecipesWithSchemaFallback()
  const [inventoryCatalog, recipesRes, recipeItemsRes] = await Promise.all([
    INVENTORY_SOURCE.loadCatalog({ includeCosts: true }),
    recipesPromise,
    db.from('recipe_items').select('id, recipe_id, variant_id, component_name, quantity_per_unit, is_width_dependent, sort_order').order('sort_order'),
  ])

  if (inventoryCatalog.errors.categories) throw new Error(inventoryCatalog.errors.categories.message)
  if (inventoryCatalog.errors.products) throw new Error(inventoryCatalog.errors.products.message)
  if (inventoryCatalog.errors.variants) throw new Error(inventoryCatalog.errors.variants.message)
  if (recipesRes.error) throw new Error(recipesRes.error.message)
  if (recipeItemsRes.error) throw new Error(recipeItemsRes.error.message)

  inventoryState.categories = inventoryCatalog.categories
  inventoryState.products = inventoryCatalog.products
  inventoryState.variants = inventoryCatalog.variants
  inventoryState.rolls = inventoryCatalog.variants.flatMap(variant =>
    (variant.rolls || []).map(roll => ({ ...roll, variant_id: roll.variant_id || variant.id })),
  )

  const categoriesById = new Map(inventoryState.categories.map(item => [item.id, item]))
  const productsById = new Map(inventoryState.products.map(item => [item.id, item]))
  const rollsByVariantId = new Map()
  for (const roll of inventoryState.rolls) {
    const list = rollsByVariantId.get(roll.variant_id) || []
    list.push(roll)
    rollsByVariantId.set(roll.variant_id, list)
  }

  const variantsById = new Map(
    inventoryState.variants.map(variant => {
      const product = productsById.get(variant.product_id) || null
      const category = product ? categoriesById.get(product.category_id) || null : null
      const rolls = rollsByVariantId.get(variant.id) || []
      const hydrated = {
        ...variant,
        product,
        category,
        rolls,
        category_name: category?.name || 'Uncategorized',
        product_name: product?.name || 'Unnamed Product',
        direct_label: variant.name || 'Unnamed Variant',
        available_stock: computeVariantAvailableStock({ ...variant, rolls }),
      }
      return [variant.id, hydrated]
    }),
  )

  variantChoices = [...variantsById.values()].sort((a, b) => String(a.direct_label || '').localeCompare(String(b.direct_label || '')))

  const actualRecipes = (recipesRes.data || []).map(recipe => {
    const canonicalBlindType = resolveBlindTypeName(recipe.blind_type || recipe.name || '')
    const items = (recipeItemsRes.data || [])
      .filter(item => item.recipe_id === recipe.id)
      .map(item => {
        const variant = item.variant_id ? variantsById.get(item.variant_id) || null : resolveVariantFromLabel(item.component_name)
        return {
          ...item,
          variant,
          display_name: variant?.direct_label || item.component_name || 'Missing inventory component',
        }
      })
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    return {
      ...recipe,
      blind_type: canonicalBlindType,
      name: recipe.name || canonicalBlindType,
      items,
      is_virtual: false,
    }
  })

  const trackNames = new Set(Object.keys(TRACK_TEMPLATES))
  const actualTrackRecipes = actualRecipes.filter(recipe => trackNames.has(recipe.blind_type || recipe.name || ''))
  const actualBlindRecipes = actualRecipes.filter(recipe => !trackNames.has(recipe.blind_type || recipe.name || ''))

  const byBlindType = new Map(actualBlindRecipes.map(recipe => [recipe.blind_type, recipe]))
  const virtualRecipes = EXPECTED_BLIND_RECIPES
    .filter(name => !byBlindType.has(name))
    .map(name => ({
      id: `virtual:${name}`,
      name,
      blind_type: name,
      description: 'Component shell. Import or update workbook components, or add inventory-linked parts here.',
      notes: '',
      is_active: true,
      created_at: null,
      updated_at: null,
      items: [],
      is_virtual: true,
    }))

  blindRecipes = [...actualBlindRecipes, ...virtualRecipes].sort((a, b) => {
    const aIndex = EXPECTED_BLIND_RECIPES.indexOf(a.blind_type)
    const bIndex = EXPECTED_BLIND_RECIPES.indexOf(b.blind_type)
    const safeA = aIndex === -1 ? 999 : aIndex
    const safeB = bIndex === -1 ? 999 : bIndex
    if (safeA !== safeB) return safeA - safeB
    return (a.name || '').localeCompare(b.name || '')
  })

  trackRecipes = Object.keys(TRACK_TEMPLATES).map(name => {
    const actual = actualTrackRecipes.find(recipe => (recipe.blind_type || recipe.name || '') === name)
    if (actual) return actual
    return {
      id: `virtual-track:${name}`,
      name,
      blind_type: name,
      description: 'Track component shell. Add inventory-linked parts here for future track orders.',
      notes: 'Imported from Tracks.xlsx',
      is_active: true,
      created_at: null,
      updated_at: null,
      is_virtual: true,
      items: TRACK_TEMPLATES[name].map((componentName, index) => {
        const variant = resolveVariantFromLabel(componentName)
        return {
          id: `virtual-track-item:${name}:${index + 1}`,
          recipe_id: `virtual-track:${name}`,
          variant_id: variant?.id || '',
          variant,
          component_name: componentName,
          quantity_per_unit: 1,
          is_width_dependent: false,
          sort_order: index + 1,
          display_name: variant?.direct_label || componentName,
        }
      }),
    }
  })

  if (!currentBlindRecipeId || !blindRecipes.some(recipe => recipe.id === currentBlindRecipeId)) {
    currentBlindRecipeId = blindRecipes[0]?.id || null
  }
  if (!currentTrackRecipeName || !trackRecipes.some(recipe => recipe.blind_type === currentTrackRecipeName)) {
    currentTrackRecipeName = trackRecipes[0]?.blind_type || null
  }
}

async function loadRecipesWithSchemaFallback() {
  let res = await db
    .from('product_recipes')
    .select('id, name, blind_type, description, is_active, notes, created_at, updated_at')
    .order('name')

  if (!res.error) {
    recipeSchema.hasUpdatedAt = true
    recipeSchema.hasCreatedAt = true
    return res
  }

  if (!/updated_at/i.test(String(res.error.message || ''))) return res
  recipeSchema.hasUpdatedAt = false

  res = await db
    .from('product_recipes')
    .select('id, name, blind_type, description, is_active, notes, created_at')
    .order('name')

  if (!res.error) {
    recipeSchema.hasCreatedAt = true
    return { ...res, data: (res.data || []).map(row => ({ ...row, updated_at: null })) }
  }

  if (!/created_at/i.test(String(res.error.message || ''))) return res
  recipeSchema.hasCreatedAt = false

  const finalRes = await db
    .from('product_recipes')
    .select('id, name, blind_type, description, is_active, notes')
    .order('name')

  if (finalRes.error) return finalRes
  return { ...finalRes, data: (finalRes.data || []).map(row => ({ ...row, created_at: null, updated_at: null })) }
}

function renderStats() {
  const componentCount = blindRecipes.reduce((sum, recipe) => sum + recipe.items.length, 0)
  const unmatchedCount = blindRecipes.reduce((sum, recipe) => sum + recipe.items.filter(item => !item.variant).length, 0)
  html('recipe-stats', `
    <div class="stat-card">
      <div><div class="stat-label">Blind Components</div><div class="stat-value">${blindRecipes.length}</div><div class="stat-sub">current visible component products</div></div>
      <div class="stat-icon icon-indigo"><i class="fa-solid fa-book-open"></i></div>
    </div>
    <div class="stat-card">
      <div><div class="stat-label">Track Components</div><div class="stat-value">${trackRecipes.length}</div><div class="stat-sub">inventory-linked track products</div></div>
      <div class="stat-icon icon-blue"><i class="fa-solid fa-ruler-horizontal"></i></div>
    </div>
    <div class="stat-card">
      <div><div class="stat-label">Component Lines</div><div class="stat-value">${componentCount}</div><div class="stat-sub">blind BOM lines</div></div>
      <div class="stat-icon icon-green"><i class="fa-solid fa-cubes"></i></div>
    </div>
    <div class="stat-card">
      <div><div class="stat-label">Need Relink</div><div class="stat-value">${unmatchedCount}</div><div class="stat-sub">rows still missing inventory matches</div></div>
      <div class="stat-icon ${unmatchedCount ? 'icon-red' : 'icon-violet'}"><i class="fa-solid fa-link-slash"></i></div>
    </div>
  `)
}

function switchRecipeTab(tab) {
  activeRecipeTab = tab
  document.getElementById('tab-btn-blind-recipes')?.classList.toggle('active', tab === 'blind')
  document.getElementById('tab-btn-track-recipes')?.classList.toggle('active', tab === 'track')
  document.getElementById('tab-blind-recipes').style.display = tab === 'blind' ? '' : 'none'
  document.getElementById('tab-track-recipes').style.display = tab === 'track' ? '' : 'none'
}

function renderBlindRecipeList() {
  const query = val('recipe-search')
  const list = fuzzyFilter(blindRecipes, query, recipe => {
    const itemText = recipe.items.map(item => item.display_name || item.component_name || '').join(' ')
    return `${recipe.name} ${recipe.blind_type} ${recipe.description || ''} ${itemText}`
  })

  text('blind-recipe-count', `Blind Components (${list.length})`)
  html('blind-recipes-body', list.map(recipe => `
    <tr class="drill-row" style="cursor:pointer;" onclick="openBlindRecipe('${recipe.id}')">
      <td>
        <div class="fw-600">${esc(recipe.name || recipe.blind_type || 'Component Set')}</div>
        <div class="text-xs text-muted">${recipe.is_virtual ? 'Component shell - add inventory-linked components' : (recipe.description || 'Inventory-linked component set')}</div>
      </td>
      <td>${esc(recipe.blind_type || '-')}</td>
      <td>${recipe.items.length}</td>
      <td><span class="badge ${recipe.is_virtual ? 'badge-warning' : (recipe.is_active ? 'badge-success' : 'badge-archived')}">${recipe.is_virtual ? 'Needs import' : (recipe.is_active ? 'Active' : 'Inactive')}</span></td>
      <td style="text-align:right;white-space:nowrap;" onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm" onclick="openBlindRecipe('${recipe.id}')" title="Open"><i class="fa-solid fa-folder-open"></i></button>
        <button class="btn btn-ghost btn-sm" onclick="openRecipeModal('${recipe.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="empty-state">No component sets match your search.</td></tr>`)
}

function openBlindRecipe(recipeId) {
  const recipe = blindRecipes.find(item => item.id === recipeId)
  if (!recipe) return
  currentBlindRecipeId = recipeId
  document.getElementById('blind-recipes-list').style.display = 'none'
  document.getElementById('blind-recipes-toolbar').style.display = 'none'
  document.getElementById('blind-recipe-detail').style.display = ''

  html('blind-recipe-detail', `
    <div class="card">
      <div class="card-header">
        <div>
          <h2>${esc(recipe.name || recipe.blind_type || 'Component Set')}</h2>
          <p class="text-muted text-sm">${esc(recipe.blind_type || '')}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="openRecipeModal('${recipe.id}')"><i class="fa-solid fa-pen"></i> Edit Components</button>
          ${recipe.is_virtual ? '' : `<button class="btn btn-danger btn-sm" onclick="deleteRecipe('${recipe.id}')"><i class="fa-solid fa-trash"></i> Delete</button>`}
          <button class="btn btn-ghost btn-sm" onclick="closeBlindRecipe()"><i class="fa-solid fa-arrow-left"></i> Back to Components</button>
        </div>
      </div>
      <div style="padding:16px;">
        <div class="stats-grid" style="margin-bottom:16px;">
          <div class="stat-card"><div class="stat-label">Components</div><div class="stat-value" style="font-size:20px;">${recipe.items.length}</div></div>
          <div class="stat-card"><div class="stat-label">Status</div><div class="stat-value" style="font-size:20px;">${recipe.is_virtual ? 'Shell' : (recipe.is_active ? 'Active' : 'Inactive')}</div></div>
          <div class="stat-card"><div class="stat-label">Updated</div><div class="stat-value" style="font-size:20px;">${recipe.updated_at || recipe.created_at ? fmtDate(recipe.updated_at || recipe.created_at) : 'Legacy'}</div></div>
        </div>
        ${recipe.description ? `<p class="text-muted" style="margin-bottom:12px;">${esc(recipe.description)}</p>` : ''}
        ${recipe.notes ? `<p class="text-muted text-sm" style="margin-bottom:14px;">${esc(recipe.notes)}</p>` : ''}

        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Inventory Item</th>
              <th>Required</th>
              <th>Available</th>
              <th>Type</th>
              <th style="text-align:right;">Actions</th>
            </tr></thead>
            <tbody>
              ${recipe.items.length ? recipe.items.map(item => {
                const available = item.variant ? fmtQty(item.variant.available_stock || 0, item.variant.unit || 'pcs') : 'No link'
                return `
                  <tr>
                    <td>
                      <div class="fw-600">${esc(item.variant?.name || item.component_name || item.display_name || 'Missing inventory item')}</div>
                      <div class="text-xs text-muted">${item.variant ? `${esc(item.variant.product_name)} · ${esc(item.variant.category_name)}` : 'Inventory variant missing'}</div>
                    </td>
                    <td>${Number(item.quantity_per_unit || 0)} ${esc(item.variant?.unit || 'pcs')}${item.is_width_dependent ? ' / blind width m' : ''}</td>
                    <td><span class="badge ${item.variant && Number(item.variant.available_stock || 0) > 0 ? 'badge-success' : 'badge-warning'}">${esc(available)}</span></td>
                    <td>${item.is_width_dependent ? 'Width based' : 'Fixed qty'}</td>
                    <td style="text-align:right;">
                      ${item.variant_id ? `<a class="btn btn-ghost btn-sm" href="inventory.html?variant=${encodeURIComponent(item.variant_id)}" title="Open in inventory"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : '<span class="text-xs text-muted">No link</span>'}
                    </td>
                  </tr>
                `
              }).join('') : `<tr><td colspan="5" class="empty-state">No components saved yet. Edit this component set and choose inventory items.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `)
}

function closeBlindRecipe() {
  document.getElementById('blind-recipe-detail').innerHTML = ''
  document.getElementById('blind-recipe-detail').style.display = 'none'
  document.getElementById('blind-recipes-list').style.display = ''
  document.getElementById('blind-recipes-toolbar').style.display = ''
}

function renderTrackRecipeList() {
  text('track-recipe-count', `Track Components (${trackRecipes.length})`)
  html('track-recipes-body', trackRecipes.map(recipe => `
    <tr class="drill-row" style="cursor:pointer;" onclick="openTrackRecipe('${recipe.blind_type}')">
      <td><div class="fw-600">${esc(recipe.name || recipe.blind_type)}</div><div class="text-xs text-muted">${recipe.is_virtual ? 'Track component shell - add inventory-linked parts' : 'Inventory-linked track component set'}</div></td>
      <td>${recipe.items.length}</td>
      <td><span class="badge ${recipe.is_virtual ? 'badge-warning' : 'badge-admin'}">${recipe.is_virtual ? 'Needs import' : 'Track'}</span></td>
      <td style="text-align:right;white-space:nowrap;" onclick="event.stopPropagation()"><button class="btn btn-ghost btn-sm" onclick="openTrackRecipe('${recipe.blind_type}')" title="Open"><i class="fa-solid fa-folder-open"></i></button><button class="btn btn-ghost btn-sm" onclick="openRecipeModal('${recipe.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button></td>
    </tr>
  `).join(''))
}

function openTrackRecipe(name) {
  const recipe = trackRecipes.find(item => item.blind_type === name || item.name === name)
  if (!recipe) return
  currentTrackRecipeName = name
  document.getElementById('track-recipes-list').style.display = 'none'
  document.getElementById('track-recipes-toolbar').style.display = 'none'
  document.getElementById('track-recipe-detail').style.display = ''
  html('track-recipe-detail', `
    <div class="card">
      <div class="card-header">
        <div>
          <h2>${esc(recipe.name || name)}</h2>
          <p class="text-muted text-sm">${recipe.is_virtual ? 'Track component shell. Add or relink inventory parts here.' : 'Inventory-linked track component set.'}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="openRecipeModal('${recipe.id}')"><i class="fa-solid fa-pen"></i> Edit Components</button>
          ${recipe.is_virtual ? '' : `<button class="btn btn-danger btn-sm" onclick="deleteRecipe('${recipe.id}')"><i class="fa-solid fa-trash"></i> Delete</button>`}
          <button class="btn btn-ghost btn-sm" onclick="closeTrackRecipe()"><i class="fa-solid fa-arrow-left"></i> Back to Track Components</button>
        </div>
      </div>
      <div style="padding:16px;">
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Inventory Item</th><th>Required</th><th>Available</th><th style="text-align:right;">Actions</th></tr></thead>
            <tbody>
              ${recipe.items.map((part, index) => {
                const variant = part.variant || resolveVariantFromLabel(part.component_name || part.display_name || '')
                const available = variant ? fmtQty(variant.available_stock || 0, variant.unit || 'pcs') : 'No link'
                return `
                  <tr>
                    <td>${index + 1}</td>
                    <td>
                      <div class="fw-600">${esc(variant?.name || part.component_name || part.display_name || 'Missing inventory item')}</div>
                      <div class="text-xs text-muted">${variant ? `${esc(variant.product_name)} · ${esc(variant.category_name)}` : 'No inventory match yet'}</div>
                    </td>
                    <td>${Number(part.quantity_per_unit || 0)} ${esc(variant?.unit || 'pcs')}${part.is_width_dependent ? ' / track length unit' : ''}</td>
                    <td><span class="badge ${variant && Number(variant.available_stock || 0) > 0 ? 'badge-success' : 'badge-warning'}">${esc(available)}</span></td>
                    <td style="text-align:right;">${variant ? `<a class="btn btn-ghost btn-sm" href="inventory.html?variant=${encodeURIComponent(variant.id)}"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : '<span class="text-xs text-muted">No link</span>'}</td>
                  </tr>
                `
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `)
}

function closeTrackRecipe() {
  document.getElementById('track-recipe-detail').innerHTML = ''
  document.getElementById('track-recipe-detail').style.display = 'none'
  document.getElementById('track-recipes-list').style.display = ''
  document.getElementById('track-recipes-toolbar').style.display = ''
}

function openRecipeModal(recipeId = null) {
  const recipe = recipeId ? blindRecipes.find(item => item.id === recipeId) || trackRecipes.find(item => item.id === recipeId) || null : null
  editingRecipeId = recipe && !recipe.is_virtual ? recipe.id : null
  editingComponents = recipe
    ? recipe.items.map(item => ({
        rowId: crypto.randomUUID(),
        variantId: item.variant_id || item.variant?.id || '',
        quantityPerUnit: Number(item.quantity_per_unit || 0),
        isWidthDependent: Boolean(item.is_width_dependent),
      }))
    : [{
        rowId: crypto.randomUUID(),
        variantId: '',
        quantityPerUnit: 1,
        isWidthDependent: false,
      }]

  resetComponentSearchState()
  openModal(recipe ? 'Edit Components' : 'New Component Set', `
    <div id="recipe-form-alert" class="alert alert-error"></div>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Component Product Name <span style="color:#ef4444">*</span></label>
        <input id="recipe-name" value="${esc(recipe?.name || '')}" placeholder="e.g. Roller Blinds With Plain Cassette">
      </div>
      <div class="form-group">
        <label>Order Match Key <span style="color:#ef4444">*</span></label>
        <input id="recipe-blind-type" value="${esc(recipe?.blind_type || '')}" placeholder="Exact blind type / mechanism text">
      </div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Description</label>
        <input id="recipe-description" value="${esc(recipe?.description || '')}" placeholder="Internal note about this BOM">
      </div>
      <div class="form-group" style="display:flex;align-items:flex-end;">
        <label style="display:flex;gap:10px;align-items:center;font-weight:600;">
          <input id="recipe-active" type="checkbox" ${recipe?.is_active === false ? '' : 'checked'}>
          Active for future orders
        </label>
      </div>
    </div>
    <div class="form-group">
      <label>Notes</label>
      <textarea id="recipe-notes" rows="3" placeholder="Optional admin notes">${esc(recipe?.notes || '')}</textarea>
    </div>
    <div class="card" style="border-radius:14px;margin-top:12px;box-shadow:none;">
      <div class="card-header">
        <div>
          <h2>Components</h2>
          <span class="text-muted text-sm">Search inventory, then pick a direct inventory item from the dropdown.</span>
        </div>
        <button class="btn btn-accent-soft btn-sm" onclick="addRecipeComponentRow()"><i class="fa-solid fa-plus"></i> Add Component</button>
      </div>
      <div style="padding:14px;" id="recipe-component-rows"></div>
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveRecipe()"><i class="fa-solid fa-floppy-disk"></i> Save Components</button>
    </div>
  `, true)
  renderRecipeComponentRows()
}

function resetComponentSearchState() {
  Object.keys(componentSearchState).forEach(key => delete componentSearchState[key])
  for (const row of editingComponents) {
    const selected = row.variantId ? variantChoices.find(item => item.id === row.variantId) || null : null
    componentSearchState[row.rowId] = selected?.direct_label || ''
  }
}

function getComponentSearchMatches(query, selectedVariantId) {
  const q = String(query || '').trim()
  const list = q
    ? fuzzyFilter(variantChoices, q, item => `${item.direct_label} ${item.product_name} ${item.category_name}`)
    : variantChoices
  const selected = selectedVariantId ? variantChoices.find(item => item.id === selectedVariantId) || null : null
  const merged = selected && !list.some(item => item.id === selected.id) ? [selected, ...list] : list
  return merged.slice(0, 40)
}

function renderRecipeComponentRows() {
  html('recipe-component-rows', editingComponents.map((row, index) => {
    const selected = row.variantId ? variantChoices.find(item => item.id === row.variantId) || null : null
    const query = componentSearchState[row.rowId] ?? selected?.direct_label ?? ''
    const matches = getComponentSearchMatches(query, row.variantId)
    return `
      <div class="card" style="margin-bottom:12px;border-radius:14px;">
        <div class="card-header">
          <h2>Component ${index + 1}</h2>
          <button class="btn btn-ghost btn-sm" style="color:#ef4444;" onclick="removeRecipeComponentRow('${row.rowId}')"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div style="padding:14px;">
          <div class="form-group">
            <label>Inventory Item <span style="color:#ef4444">*</span></label>
            <input class="filter-input" value="${esc(query)}" placeholder="Search inventory item" oninput="setRecipeComponentSearch('${row.rowId}', this.value)">
            <select id="component-select-${row.rowId}" style="margin-top:8px;" onchange="selectRecipeComponentVariant('${row.rowId}', this.value)">
              <option value="">Select direct inventory item...</option>
              ${matches.map(item => `<option value="${item.id}" ${item.id === row.variantId ? 'selected' : ''}>${esc(item.direct_label)}</option>`).join('')}
            </select>
            ${selected ? `
              <div style="margin-top:8px;padding:10px 12px;border:1px solid #bbf7d0;border-radius:12px;background:#f0fdf4;">
                <div class="fw-600 text-sm">${esc(selected.direct_label)}</div>
                <div class="text-xs text-muted" style="margin-top:2px;">${esc(selected.product_name)} · ${esc(selected.category_name)} · Available ${esc(fmtQty(selected.available_stock || 0, selected.unit || 'pcs'))}</div>
              </div>
            ` : '<div class="text-xs" style="margin-top:8px;color:#c2410c;">Search, then choose one direct inventory item from the dropdown.</div>'}
          </div>
          <div class="form-row cols-2">
            <div class="form-group">
              <label>Required Qty <span style="color:#ef4444">*</span></label>
              <input id="component-qty-${row.rowId}" type="number" min="0" step="0.001" value="${Number(row.quantityPerUnit || 0)}" oninput="updateRecipeComponentQuantity('${row.rowId}', this.value)">
            </div>
            <div class="form-group" style="display:flex;align-items:flex-end;">
              <label style="display:flex;gap:10px;align-items:center;font-weight:600;">
                <input id="component-width-${row.rowId}" type="checkbox" ${row.isWidthDependent ? 'checked' : ''} onchange="updateRecipeComponentWidthFlag('${row.rowId}', this.checked)">
                Width dependent
              </label>
            </div>
          </div>
        </div>
      </div>
    `
  }).join(''))
}

function addRecipeComponentRow() {
  const rowId = crypto.randomUUID()
  editingComponents.push({ rowId, variantId: '', quantityPerUnit: 1, isWidthDependent: false })
  componentSearchState[rowId] = ''
  renderRecipeComponentRows()
}

function removeRecipeComponentRow(rowId) {
  editingComponents = editingComponents.filter(row => row.rowId !== rowId)
  delete componentSearchState[rowId]
  if (!editingComponents.length) addRecipeComponentRow()
  else renderRecipeComponentRows()
}

function setRecipeComponentSearch(rowId, value) {
  componentSearchState[rowId] = value
  renderRecipeComponentRows()
}

function selectRecipeComponentVariant(rowId, variantId) {
  const row = editingComponents.find(item => item.rowId === rowId)
  if (!row) return
  if (!variantId) {
    row.variantId = ''
    renderRecipeComponentRows()
    return
  }
  const variant = variantChoices.find(item => item.id === variantId)
  if (!variant) return
  row.variantId = variantId
  componentSearchState[rowId] = variant.direct_label
  renderRecipeComponentRows()
}

function updateRecipeComponentQuantity(rowId, value) {
  const row = editingComponents.find(item => item.rowId === rowId)
  if (row) row.quantityPerUnit = Number(value || 0)
}

function updateRecipeComponentWidthFlag(rowId, checked) {
  const row = editingComponents.find(item => item.rowId === rowId)
  if (row) row.isWidthDependent = Boolean(checked)
}

async function saveRecipe() {
  hideAlert('recipe-form-alert')
  const name = val('recipe-name')
  const blindType = resolveBlindTypeName(val('recipe-blind-type') || name)
  const description = val('recipe-description')
  const notes = val('recipe-notes')
  const isActive = Boolean(document.getElementById('recipe-active')?.checked)

  if (!name) return showAlert('recipe-form-alert', 'Component product name is required')
  if (!blindType) return showAlert('recipe-form-alert', 'Order match key is required')

  const rows = editingComponents.map((row, index) => ({
    variantId: row.variantId,
    quantityPerUnit: Number(document.getElementById(`component-qty-${row.rowId}`)?.value || row.quantityPerUnit || 0),
    isWidthDependent: Boolean(document.getElementById(`component-width-${row.rowId}`)?.checked ?? row.isWidthDependent),
    sort_order: index + 1,
  }))

  if (!rows.length) return showAlert('recipe-form-alert', 'Add at least one component')
  if (rows.some(row => !row.variantId)) return showAlert('recipe-form-alert', 'Each component must be selected from inventory')
  if (rows.some(row => !(row.quantityPerUnit > 0))) return showAlert('recipe-form-alert', 'Each component must have quantity greater than zero')

  try {
    const payload = {
      name,
      blind_type: blindType,
      description: description || null,
      notes: notes || null,
      is_active: isActive,
      ...(recipeSchema.hasUpdatedAt ? { updated_at: new Date().toISOString() } : {}),
    }

    let recipeId = editingRecipeId
    if (recipeId) {
      const updateRes = await queryWithRlsFallback(
        client => client.from('product_recipes').update(payload).eq('id', recipeId).select('id').single(),
        client => client.from('product_recipes').update(payload).eq('id', recipeId).select('id').single(),
      )
      if (updateRes.error) throw new Error(updateRes.error.message)
    } else {
      const insertRes = await queryWithRlsFallback(
        client => client.from('product_recipes').insert({
          ...payload,
          ...(recipeSchema.hasCreatedAt ? { created_at: new Date().toISOString() } : {}),
        }).select('id').single(),
        client => client.from('product_recipes').insert({
          ...payload,
          ...(recipeSchema.hasCreatedAt ? { created_at: new Date().toISOString() } : {}),
        }).select('id').single(),
      )
      if (insertRes.error) throw new Error(insertRes.error.message)
      recipeId = insertRes.data.id
    }

    const deleteRes = await queryWithRlsFallback(
      client => client.from('recipe_items').delete().eq('recipe_id', recipeId),
      client => client.from('recipe_items').delete().eq('recipe_id', recipeId),
    )
    if (deleteRes.error) throw new Error(deleteRes.error.message)

    const items = rows.map(row => {
      const variant = variantChoices.find(item => item.id === row.variantId)
      return {
        recipe_id: recipeId,
        variant_id: row.variantId,
        component_name: variant?.name || '',
        quantity_per_unit: row.quantityPerUnit,
        is_width_dependent: row.isWidthDependent,
        sort_order: row.sort_order,
      }
    })

    const insertItemsRes = await queryWithRlsFallback(
      client => client.from('recipe_items').insert(items),
      client => client.from('recipe_items').insert(items),
    )
    if (insertItemsRes.error) throw new Error(insertItemsRes.error.message)

    await logActivity(editingRecipeId ? 'update' : 'create', 'recipe', recipeId, blindType, { component_count: items.length })

    currentBlindRecipeId = recipeId
    closeModal()
    await loadRecipeData()
    renderStats()
    renderBlindRecipeList()
    openBlindRecipe(currentBlindRecipeId)
    toast(editingRecipeId ? 'Components updated' : 'Component set created')
  } catch (error) {
    showAlert('recipe-form-alert', error.message || 'Could not save components')
  }
}

async function deleteRecipe(recipeId) {
  const recipe = blindRecipes.find(item => item.id === recipeId) || trackRecipes.find(item => item.id === recipeId)
  if (!recipe || recipe.is_virtual) return
  const confirmed = window.confirm(`Delete component set "${recipe.name || recipe.blind_type}"?\n\nFuture orders will stop using it. Past executed/completed orders keep their stored component history.`)
  if (!confirmed) return

  try {
    const res = await queryWithRlsFallback(
      client => client.from('product_recipes').delete().eq('id', recipeId),
      client => client.from('product_recipes').delete().eq('id', recipeId),
    )
    if (res.error) throw new Error(res.error.message)
    await logActivity('delete', 'recipe', recipeId, recipe.blind_type, { recipe_name: recipe.name })
    currentBlindRecipeId = null
    await loadRecipeData()
    renderStats()
    renderBlindRecipeList()
    closeBlindRecipe()
    toast('Component set deleted')
  } catch (error) {
    toast(error.message || 'Could not delete component set', 'error')
  }
}

window.switchRecipeTab = switchRecipeTab
window.renderBlindRecipeList = renderBlindRecipeList
window.openBlindRecipe = openBlindRecipe
window.closeBlindRecipe = closeBlindRecipe
window.openTrackRecipe = openTrackRecipe
window.closeTrackRecipe = closeTrackRecipe
window.openRecipeModal = openRecipeModal
window.closeModal = closeModal
window.addRecipeComponentRow = addRecipeComponentRow
window.removeRecipeComponentRow = removeRecipeComponentRow
window.setRecipeComponentSearch = setRecipeComponentSearch
window.selectRecipeComponentVariant = selectRecipeComponentVariant
window.updateRecipeComponentQuantity = updateRecipeComponentQuantity
window.updateRecipeComponentWidthFlag = updateRecipeComponentWidthFlag
window.saveRecipe = saveRecipe
window.deleteRecipe = deleteRecipe

init().catch(error => {
  console.error(error)
  hide('loading')
  show('content')
  html('blind-recipes-body', `<tr><td colspan="5" class="empty-state">${esc(error.message || 'Could not load components.')}</td></tr>`)
  toast(error.message || 'Could not load components.', 'error')
})
