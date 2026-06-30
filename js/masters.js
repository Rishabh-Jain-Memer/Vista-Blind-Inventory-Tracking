/*
  Masters page controller.
  Masters are structure only: main masters and nested sub masters.
*/

let masterNodes = []
let masterPages = []
let expandedMasters = new Set()
let mechanismGroups = []
let mechanismOptions = []
let masterMechanismGroups = []
let mechanismPartLinks = []
let mechanismInventoryVariants = []
let mechanismLoadError = null
let mechanismPartLinkError = null
let activeMastersTab = 'structure'
let activeMasterPageId = ''

const MASTER_STATE_KEY = 'vista.masters.expanded.v2'
const MASTER_TAB_STATE_KEY = 'vista.masters.activeTab.v1'
const MASTER_PAGE_STATE_KEY = 'vista.masters.activePage.v1'
const MASTER_INVENTORY_SUB_GROUP = 'Master'
const MASTER_INVENTORY_UNIT = 'pcs'
const MASTER_SYNC_ITEM_LIMIT = 5000
const UNASSIGNED_MASTER_PAGE = '__unassigned__'

function escMaster(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]))
}

function normMasterName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function cleanMasterName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function masterUuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const value = Math.random() * 16 | 0
    const digit = ch === 'x' ? value : ((value & 0x3) | 0x8)
    return digit.toString(16)
  })
}

function dbReturnedRow(data, fallback) {
  if (Array.isArray(data)) return data[0] || fallback
  return data || fallback
}

function parseMasterNames(primaryValue, bulkValue = '') {
  const rawParts = [
    primaryValue,
    ...String(bulkValue || '').split(/[\n,]+/),
  ]
  const seen = new Set()
  const names = []
  for (const part of rawParts) {
    const name = cleanMasterName(part)
    const key = normMasterName(name)
    if (!name || seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}

function setupMasterModalSubmit(saveButtonId, focusId = '') {
  const body = document.getElementById('modal-body')
  if (!body) return
  body.onkeydown = event => {
    if (event.key !== 'Enter') return
    const tag = String(event.target?.tagName || '').toLowerCase()
    if (tag === 'textarea' && !event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    document.getElementById(saveButtonId)?.click()
  }
  if (focusId) {
    setTimeout(() => document.getElementById(focusId)?.focus(), 0)
  }
}

function loadMasterExpandState() {
  try {
    const raw = localStorage.getItem(MASTER_STATE_KEY)
    expandedMasters = raw ? new Set(JSON.parse(raw) || []) : new Set()
  } catch {
    expandedMasters = new Set()
  }
}

function saveMasterExpandState() {
  try {
    localStorage.setItem(MASTER_STATE_KEY, JSON.stringify([...expandedMasters]))
  } catch {}
}

function loadMastersTabState() {
  try {
    const saved = localStorage.getItem(MASTER_TAB_STATE_KEY)
    activeMastersTab = saved === 'mechanisms' ? 'mechanisms' : 'structure'
  } catch {
    activeMastersTab = 'structure'
  }
}

function saveMastersTabState() {
  try {
    localStorage.setItem(MASTER_TAB_STATE_KEY, activeMastersTab)
  } catch {}
}

function loadMasterPageState() {
  try {
    activeMasterPageId = localStorage.getItem(MASTER_PAGE_STATE_KEY) || ''
  } catch {
    activeMasterPageId = ''
  }
}

function saveMasterPageState() {
  try {
    localStorage.setItem(MASTER_PAGE_STATE_KEY, activeMasterPageId || '')
  } catch {}
}

async function initMasters() {
  try {
    const profile = await initSidebar()
    if (!profile) return
    loadMasterExpandState()
    loadMastersTabState()
    loadMasterPageState()
    await loadMastersData()
    switchMastersTab(activeMastersTab)
    show('content')
  } catch (err) {
    console.error('Masters init error:', err)
    toast(err.message || 'Failed to load masters', 'error')
  } finally {
    hide('loading')
  }
}

function switchMastersTab(tab) {
  activeMastersTab = tab === 'mechanisms' ? 'mechanisms' : 'structure'
  saveMastersTabState()

  const structurePanel = document.getElementById('masters-panel-structure')
  const mechanismsPanel = document.getElementById('masters-panel-mechanisms')
  const structureTab = document.getElementById('masters-tab-structure')
  const mechanismsTab = document.getElementById('masters-tab-mechanisms')
  const masterActions = document.getElementById('master-page-actions')

  structurePanel?.classList.toggle('d-none', activeMastersTab !== 'structure')
  mechanismsPanel?.classList.toggle('d-none', activeMastersTab !== 'mechanisms')
  structureTab?.classList.toggle('active', activeMastersTab === 'structure')
  mechanismsTab?.classList.toggle('active', activeMastersTab === 'mechanisms')
  if (masterActions) masterActions.style.display = activeMastersTab === 'structure' ? 'flex' : 'none'
}

async function loadMastersData() {
  const [pagesRes, nodesRes] = await Promise.all([
    db.from('master_pages').select('id, name, normalized_name, sort_order, created_at').order('sort_order').order('name'),
    db
      .from('master_nodes')
      .select('id, parent_id, page_id, name, normalized_name, exclude_from_pnc_name, sort_order, created_at')
      .order('sort_order')
      .order('name'),
  ])

  if (pagesRes.error || nodesRes.error) {
    renderMastersSetupError(pagesRes.error || nodesRes.error)
    return
  }

  masterPages = pagesRes.data || []
  masterNodes = nodesRes.data || []
  normalizeActiveMasterPage()
  await loadMechanismData()
  renderMasters()
  renderMechanisms()
}

function renderMastersSetupError(error) {
  html('master-page-tabs', '')
  html('master-stats', '')
  html('masters-tree', `
    <div class="empty-state" style="text-align:left;">
      <div class="fw-600" style="margin-bottom:6px;">Masters table is not ready.</div>
      <div class="text-sm text-muted">Run migration <code>003_master_nodes_structure.sql</code> in Supabase, then refresh this page.</div>
      <div class="text-xs text-muted" style="margin-top:8px;">${escMaster(error.message || '')}</div>
    </div>
  `)
  html('mechanism-setup-error', '')
  html('mechanism-stats', '')
  html('mechanism-groups', '')
  html('mechanism-assignments', '')
}

function normalizeActiveMasterPage() {
  const pageIds = new Set(masterPages.map(page => page.id))
  const hasUnassignedRoots = masterNodes.some(node => !node.parent_id && !node.page_id)
  if (activeMasterPageId === UNASSIGNED_MASTER_PAGE && hasUnassignedRoots) return
  if (activeMasterPageId && pageIds.has(activeMasterPageId)) return
  activeMasterPageId = masterPages[0]?.id || (hasUnassignedRoots ? UNASSIGNED_MASTER_PAGE : '')
  saveMasterPageState()
}

async function loadMechanismData() {
  mechanismLoadError = null
  mechanismPartLinkError = null
  const [groupsRes, optionsRes, assignmentsRes] = await Promise.all([
    db.from('mechanism_groups').select('id, name, normalized_name, description, sort_order, created_at').order('sort_order').order('name'),
    db.from('mechanism_options').select('id, group_id, name, normalized_name, source_label, price_key, sort_order, is_active, created_at').order('sort_order').order('name'),
    db.from('master_mechanism_groups').select('master_node_id, mechanism_group_id, is_required, sort_order, created_at').order('sort_order'),
  ])

  const error = groupsRes.error || optionsRes.error || assignmentsRes.error
  if (error) {
    mechanismLoadError = error
    mechanismGroups = []
    mechanismOptions = []
    masterMechanismGroups = []
    mechanismPartLinks = []
    mechanismInventoryVariants = []
    return
  }

  mechanismGroups = groupsRes.data || []
  mechanismOptions = optionsRes.data || []
  masterMechanismGroups = assignmentsRes.data || []

  const [linksRes, variantsRes] = await Promise.all([
    db.from('mechanism_part_links')
      .select('id, mechanism_option_id, variant_id, part_name, quantity_rule, quantity_per_unit, wastage_pct, unit, is_required, sort_order, notes')
      .order('sort_order')
      .order('part_name'),
    db.from('inv_variants')
      .select('id, name, unit, purchase_rate, inv_products(id, name, inv_categories(id, name, sub_group))')
      .order('name'),
  ])

  mechanismPartLinks = linksRes.error ? [] : (linksRes.data || [])
  mechanismInventoryVariants = variantsRes.error ? [] : (variantsRes.data || []).map(row => ({
    ...row,
    product: row.inv_products || null,
    category: row.inv_products?.inv_categories || null,
  }))
  mechanismPartLinkError = linksRes.error || variantsRes.error || null
}

function childNodes(parentId) {
  return masterNodes
    .filter(node => (node.parent_id || null) === (parentId || null))
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || (a.name || '').localeCompare(b.name || ''))
}

function rootNodesForActivePage() {
  const roots = childNodes(null)
  if (!masterPages.length && activeMasterPageId !== UNASSIGNED_MASTER_PAGE) return roots
  if (activeMasterPageId === UNASSIGNED_MASTER_PAGE) return roots.filter(root => !root.page_id)
  return roots.filter(root => root.page_id === activeMasterPageId)
}

function activeMasterPage() {
  return masterPages.find(page => page.id === activeMasterPageId) || null
}

function pageNameForRoot(root) {
  return root.page_id ? (masterPages.find(page => page.id === root.page_id)?.name || 'Page') : 'Unassigned'
}

function unassignedRootNodes() {
  return childNodes(null).filter(root => !root.page_id)
}

function nodeById(id) {
  return masterNodes.find(node => node.id === id) || null
}

function mechanismGroupById(id) {
  return mechanismGroups.find(group => group.id === id) || null
}

function mechanismOptionById(id) {
  return mechanismOptions.find(option => option.id === id) || null
}

function nodeDepth(node) {
  let depth = 0
  let current = node
  const seen = new Set()
  while (current?.parent_id && !seen.has(current.parent_id)) {
    seen.add(current.parent_id)
    current = nodeById(current.parent_id)
    if (current) depth += 1
  }
  return depth
}

function descendantsOf(parentId) {
  const direct = childNodes(parentId)
  return direct.flatMap(child => [child, ...descendantsOf(child.id)])
}

function masterPath(node) {
  const parts = []
  let current = node
  const seen = new Set()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    parts.unshift(current.name)
    current = current.parent_id ? nodeById(current.parent_id) : null
  }
  return parts.join(' / ')
}

function sortedMasterNodes() {
  return [...masterNodes].sort((a, b) => masterPath(a).localeCompare(masterPath(b)))
}

function masterSearchText(node) {
  return [node.name, ...descendantsOf(node.id).map(child => child.name)].join(' ')
}

function includedNameParts(node) {
  return node.exclude_from_pnc_name ? [] : [node.name]
}

function renderMasterStats(roots = childNodes(null)) {
  const visibleIds = new Set(roots.flatMap(root => [root.id, ...descendantsOf(root.id).map(child => child.id)]))
  const visibleNodes = masterNodes.filter(node => visibleIds.has(node.id))
  const subCount = visibleNodes.filter(node => node.parent_id).length
  const maxDepth = visibleNodes.reduce((max, node) => Math.max(max, nodeDepth(node) + 1), 0)
  const skippedCount = visibleNodes.filter(node => node.exclude_from_pnc_name).length

  html('master-stats', `
    <div class="master-summary">
      <span><strong>${roots.length}</strong> main</span>
      <span><strong>${subCount}</strong> sub</span>
      <span><strong>${maxDepth}</strong> levels</span>
      <span><strong>${skippedCount}</strong> skipped in final names</span>
    </div>
  `)
}

function renderMasterPageTabs() {
  const unassignedRoots = unassignedRootNodes()
  const hasUnassignedRoots = unassignedRoots.length > 0
  const tabs = masterPages.map(page => `
    <button class="master-page-tab ${page.id === activeMasterPageId ? 'active' : ''}" onclick="switchMasterPage('${page.id}')">
      <span>${escMaster(page.name)}</span>
      <small>${childNodes(null).filter(root => root.page_id === page.id).length}</small>
    </button>
  `)
  if (hasUnassignedRoots) {
    tabs.push(`
      <button class="master-page-tab ${activeMasterPageId === UNASSIGNED_MASTER_PAGE ? 'active' : ''}" onclick="switchMasterPage('${UNASSIGNED_MASTER_PAGE}')">
        <span>Unassigned</span>
        <small>${unassignedRoots.length}</small>
      </button>
    `)
  }

  const page = activeMasterPage()
  const pageIndex = page ? masterPages.findIndex(item => item.id === page.id) : -1
  const isUnassignedActive = activeMasterPageId === UNASSIGNED_MASTER_PAGE && hasUnassignedRoots
  html('master-page-tabs', `
    <div class="master-page-tabs-scroll">
      ${tabs.join('') || '<span class="text-xs text-muted">Create a page to organize masters.</span>'}
    </div>
    <div class="master-page-tools">
      ${page ? `
        <button class="master-icon-btn" onclick="moveMasterPage('${page.id}', -1)" title="Move page left" ${pageIndex <= 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-left"></i></button>
        <button class="master-icon-btn" onclick="moveMasterPage('${page.id}', 1)" title="Move page right" ${pageIndex < 0 || pageIndex >= masterPages.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-right"></i></button>
        <button class="master-icon-btn" onclick="openMasterPageModal('${page.id}')" title="Rename page"><i class="fa-solid fa-pen"></i></button>
        <button class="master-icon-btn danger" onclick="deleteMasterPage('${page.id}')" title="Delete page"><i class="fa-solid fa-trash"></i></button>
      ` : isUnassignedActive ? `
        <button class="master-icon-btn" onclick="openUnassignedPageModal()" title="Rename Unassigned into a page"><i class="fa-solid fa-pen"></i></button>
      ` : ''}
      <button class="btn btn-secondary btn-sm" onclick="openManageMasterPagesModal()"><i class="fa-solid fa-list-ul"></i> Pages</button>
      <button class="btn btn-secondary btn-sm" onclick="openMasterPageModal()"><i class="fa-solid fa-folder-plus"></i> Page</button>
    </div>
  `)
}

function switchMasterPage(pageId) {
  activeMasterPageId = pageId || ''
  saveMasterPageState()
  renderMasters()
}

async function moveMasterPage(pageId, direction) {
  const currentIndex = masterPages.findIndex(page => page.id === pageId)
  if (currentIndex < 0) return
  const targetIndex = currentIndex + Number(direction || 0)
  if (targetIndex < 0 || targetIndex >= masterPages.length) return

  const orderedPages = [...masterPages]
  const [movedPage] = orderedPages.splice(currentIndex, 1)
  orderedPages.splice(targetIndex, 0, movedPage)

  try {
    const results = await Promise.all(orderedPages.map((page, index) => (
      db.from('master_pages').update({ sort_order: (index + 1) * 10 }).eq('id', page.id)
    )))
    const failed = results.find(result => result.error)
    if (failed) throw failed.error
    activeMasterPageId = pageId
    saveMasterPageState()
    toast('Page moved')
    await loadMastersData()
  } catch (err) {
    toast(err.message || 'Failed to move page', 'error')
  }
}

function openManageMasterPagesModal() {
  const rows = masterPages.map((page, index) => {
    const rootCount = childNodes(null).filter(root => root.page_id === page.id).length
    return `
      <div class="master-page-manage-row">
        <div class="master-page-manage-title">
          <strong>${escMaster(page.name)}</strong>
          <span>${rootCount} main master${rootCount !== 1 ? 's' : ''}</span>
        </div>
        <div class="master-page-manage-actions">
          <button class="master-icon-btn" onclick="moveMasterPageFromManager('${page.id}', -1)" title="Move up" ${index === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
          <button class="master-icon-btn" onclick="moveMasterPageFromManager('${page.id}', 1)" title="Move down" ${index === masterPages.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
          <button class="master-icon-btn" onclick="openMasterPageModal('${page.id}')" title="Rename"><i class="fa-solid fa-pen"></i></button>
          <button class="master-icon-btn danger" onclick="deleteMasterPage('${page.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `
  }).join('')
  const unassignedRoots = unassignedRootNodes()
  const unassignedRow = unassignedRoots.length ? `
      <div class="master-page-manage-row">
        <div class="master-page-manage-title">
          <strong>Unassigned</strong>
          <span>${unassignedRoots.length} main master${unassignedRoots.length !== 1 ? 's' : ''} without a page</span>
        </div>
        <div class="master-page-manage-actions">
          <button class="master-icon-btn" onclick="openUnassignedPageModal()" title="Rename into real page"><i class="fa-solid fa-pen"></i></button>
        </div>
      </div>
  ` : ''

  openModal('Manage Master Pages', `
    <div class="master-page-manage-list">
      ${rows || (!unassignedRow ? '<div class="empty-state" style="padding:18px;">No pages yet.</div>' : '')}
      ${unassignedRow}
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
      <button class="btn btn-primary" onclick="openMasterPageModal()"><i class="fa-solid fa-folder-plus"></i> New Page</button>
    </div>
  `)
}

async function moveMasterPageFromManager(pageId, direction) {
  await moveMasterPage(pageId, direction)
  openManageMasterPagesModal()
}

function openUnassignedPageModal() {
  const roots = unassignedRootNodes()
  if (!roots.length) {
    toast('No unassigned masters found', 'error')
    return
  }
  openModal('Rename Unassigned Page', `
    <div id="unassigned-page-alert" class="alert alert-error"></div>
    <p class="text-sm text-muted" style="margin-bottom:12px;">This will turn Unassigned into a real page and move its ${roots.length} main master${roots.length !== 1 ? 's' : ''} into it.</p>
    <div class="form-group">
      <label>Page Name <span style="color:#ef4444">*</span></label>
      <input id="unassigned-page-name" value="Unassigned" placeholder="e.g. Blinds">
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="unassigned-page-save" onclick="saveUnassignedAsPage()">Save Page</button>
    </div>
  `)
  setupMasterModalSubmit('unassigned-page-save', 'unassigned-page-name')
}

async function saveUnassignedAsPage() {
  hideAlert('unassigned-page-alert')
  const roots = unassignedRootNodes()
  const name = cleanMasterName(val('unassigned-page-name'))
  if (!roots.length) {
    showAlert('unassigned-page-alert', 'There are no unassigned masters to move')
    return
  }
  if (!name) {
    showAlert('unassigned-page-alert', 'Page name is required')
    return
  }

  const normalized = normMasterName(name)
  disable('unassigned-page-save')
  try {
    const duplicate = await db
      .from('master_pages')
      .select('id')
      .eq('normalized_name', normalized)
      .maybeSingle()
    if (duplicate.error) throw duplicate.error
    if (duplicate.data) throw new Error('Another page with this name already exists.')

    const nextSort = masterPages.length
      ? Math.max(...masterPages.map(page => Number(page.sort_order || 0))) + 10
      : 10
    const pagePayload = { id: masterUuid(), name, normalized_name: normalized, sort_order: nextSort }
    const { data: pageData, error: pageError } = await db
      .from('master_pages')
      .insert(pagePayload)
      .select('id')
      .single()
    if (pageError) throw pageError
    const page = dbReturnedRow(pageData, pagePayload)

    const { error: rootError } = await db
      .from('master_nodes')
      .update({ page_id: page.id })
      .in('id', roots.map(root => root.id))
    if (rootError) throw rootError

    activeMasterPageId = page.id
    saveMasterPageState()
    toast('Unassigned page renamed')
    closeModal()
    await loadMastersData()
  } catch (err) {
    showAlert('unassigned-page-alert', err.message || String(err))
  } finally {
    disable('unassigned-page-save', false)
  }
}

function renderMasters() {
  const query = normMasterName(val('master-search'))
  renderMasterPageTabs()
  let roots = rootNodesForActivePage()
  if (query) {
    roots = roots.filter(root => normMasterName(masterSearchText(root)).includes(query))
    roots.forEach(root => {
      expandedMasters.add(root.id)
      descendantsOf(root.id).forEach(child => expandedMasters.add(child.id))
    })
  }

  renderMasterStats(roots)

  if (!roots.length) {
    html('masters-tree', `<div class="empty-state">No masters found.</div>`)
    return
  }

  html('masters-tree', roots.map(node => renderMasterNode(node, 0)).join(''))
}

function renderMasterNode(node, depth) {
  const children = childNodes(node.id)
  const isOpen = expandedMasters.has(node.id)
  const childLabel = children.length === 1 ? '1 child' : `${children.length} children`
  const title = depth === 0 ? 'Add sub master' : 'Add nested sub master'
  const skipText = node.exclude_from_pnc_name ? 'Skipped' : 'Included'
  const skipTitle = node.exclude_from_pnc_name
    ? 'This label will be skipped later when final PNC names are generated'
    : 'This label will be included later when final PNC names are generated'

  return `
    <div class="master-section master-depth-${Math.min(depth, 4)}" id="master-${node.id}">
      <div class="master-header" onclick="toggleMaster('${node.id}')">
        <div class="master-title-wrap">
          <i class="fa-solid fa-chevron-right inv-chevron ${isOpen ? 'rotated' : ''}" id="master-chevron-${node.id}"></i>
          <div class="master-title-block">
            <div class="master-title">
              <span>${escMaster(node.name)}</span>
              <span class="master-count" title="${childLabel}">${children.length}</span>
              ${node.exclude_from_pnc_name ? '<span class="master-skip-note">skipped</span>' : ''}
            </div>
          </div>
        </div>
        <div class="master-actions">
          <button class="master-name-toggle ${node.exclude_from_pnc_name ? 'is-off' : ''}" onclick="event.stopPropagation();toggleMasterNameExclusion('${node.id}')" title="${skipTitle}">
            <i class="fa-solid ${node.exclude_from_pnc_name ? 'fa-eye-slash' : 'fa-eye'}"></i>
            <span>${skipText}</span>
          </button>
          <button class="master-icon-btn" onclick="event.stopPropagation();openEditMasterModal('${node.id}')" title="Edit master">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="master-icon-btn" onclick="event.stopPropagation();openSubMasterModal('${node.id}')" title="${title}">
            <i class="fa-solid fa-plus"></i>
          </button>
          <button class="master-icon-btn danger" onclick="event.stopPropagation();deleteMasterNode('${node.id}')" title="Delete master">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="master-body ${isOpen ? '' : 'd-none'}" id="master-body-${node.id}">
        ${children.length
          ? children.map(child => renderMasterNode(child, depth + 1)).join('')
          : '<div class="master-empty-child">No sub masters yet.</div>'}
      </div>
    </div>
  `
}

function optionsForMechanismGroup(groupId) {
  return mechanismOptions
    .filter(option => option.group_id === groupId && option.is_active !== false)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || (a.name || '').localeCompare(b.name || ''))
}

function renderMechanisms() {
  if (!document.getElementById('mechanism-groups')) return

  if (mechanismLoadError) {
    html('mechanism-setup-error', `
      <div class="alert alert-error show" style="margin-bottom:10px;">
        Mechanism tables are not ready. Re-run <code>003_master_nodes_structure.sql</code>, then refresh. ${escMaster(mechanismLoadError.message || '')}
      </div>
    `)
    html('mechanism-stats', '')
    html('mechanism-groups', '')
    html('mechanism-assignments', '')
    html('mechanism-master-select', '<option value="">Run migration 003 first</option>')
    html('mechanism-group-select', '<option value="">Run migration 003 first</option>')
    disable('mechanism-assign-btn')
    return
  }

  html('mechanism-setup-error', '')
  if (mechanismPartLinkError) {
    html('mechanism-setup-error', `
      <div class="alert alert-error show" style="margin-bottom:10px;">
        Mechanism part linking is not ready. Run <code>014_mechanism_part_links.sql</code>, then refresh. ${escMaster(mechanismPartLinkError.message || '')}
      </div>
    `)
  }
  disable('mechanism-assign-btn', false)
  const optionCount = mechanismOptions.filter(option => option.is_active !== false).length
  const partCount = mechanismPartLinks.length
  html('mechanism-stats', `
    <div class="master-summary">
      <span><strong>${mechanismGroups.length}</strong> groups</span>
      <span><strong>${optionCount}</strong> options</span>
      <span><strong>${partCount}</strong> linked parts</span>
      <span><strong>${masterMechanismGroups.length}</strong> assignments</span>
    </div>
  `)

  html('mechanism-groups', mechanismGroups.length
    ? mechanismGroups.map(renderMechanismGroup).join('')
    : '<div class="empty-state">No mechanism groups yet.</div>')

  renderMechanismAssignmentControls()
  renderMechanismAssignments()
}

function renderMechanismGroup(group) {
  const options = optionsForMechanismGroup(group.id)
  return `
    <div class="mechanism-card">
      <div class="mechanism-card-head">
        <div>
          <div class="mechanism-card-title">${escMaster(group.name)}</div>
          <div class="mechanism-card-meta">${options.length} option${options.length !== 1 ? 's' : ''}${group.description ? ` - ${escMaster(group.description)}` : ''}</div>
        </div>
        <div class="mechanism-card-actions">
          <button class="master-icon-btn" onclick="openMechanismOptionModal('${group.id}')" title="Add option">
            <i class="fa-solid fa-plus"></i>
          </button>
          <button class="master-icon-btn" onclick="openMechanismGroupModal('${group.id}')" title="Edit group">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="master-icon-btn danger" onclick="deleteMechanismGroup('${group.id}')" title="Delete group">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="mechanism-options">
        ${options.length ? options.map(renderMechanismOption).join('') : '<div class="master-empty-child" style="padding:8px 10px;">No options yet.</div>'}
      </div>
    </div>
  `
}

function renderMechanismOption(option) {
  const parts = partsForMechanismOption(option.id)
  const meta = [
    option.price_key ? `price key: ${option.price_key}` : '',
    option.source_label ? `source: ${option.source_label}` : '',
    parts.length ? `${parts.length} linked part${parts.length !== 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' - ')
  return `
    <div class="mechanism-option">
      <div>
        <div class="mechanism-option-name">${escMaster(option.name)}</div>
        ${meta ? `<div class="mechanism-option-meta">${escMaster(meta)}</div>` : ''}
      </div>
      <div class="mechanism-option-actions">
        <button class="master-icon-btn" onclick="openMechanismPartsModal('${option.id}')" title="Link inventory parts">
          <i class="fa-solid fa-boxes-stacked"></i>
        </button>
        <button class="master-icon-btn" onclick="openMechanismOptionModal('${option.group_id}', '${option.id}')" title="Edit option">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="master-icon-btn danger" onclick="deleteMechanismOption('${option.id}')" title="Delete option">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `
}

function partsForMechanismOption(optionId) {
  return mechanismPartLinks
    .filter(link => link.mechanism_option_id === optionId)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || (a.part_name || '').localeCompare(b.part_name || ''))
}

function inventoryVariantById(variantId) {
  return mechanismInventoryVariants.find(variant => variant.id === variantId) || null
}

function mechanismVariantLabel(variant) {
  if (!variant) return ''
  return [variant.category?.name, variant.product?.name, variant.name].filter(Boolean).join(' / ')
}

function mechanismPartRuleLabel(rule) {
  return {
    fixed: 'Fixed',
    per_blind: 'Per blind',
    per_width_m: 'Per width metre',
    per_height_m: 'Per height metre',
    per_area_sqm: 'Per sqm',
  }[rule] || rule
}

function openMechanismPartsModal(optionId) {
  const option = mechanismOptionById(optionId)
  if (!option) return
  const group = mechanismGroupById(option.group_id)
  const parts = partsForMechanismOption(optionId)
  const variantOptions = mechanismInventoryVariants
    .map(variant => `<option value="${escMaster(variant.id)}">${escMaster(mechanismVariantLabel(variant))}</option>`)
    .join('')
  const rows = parts.length ? parts.map(part => {
    const variant = inventoryVariantById(part.variant_id)
    const rate = variant?.purchase_rate != null ? ` - ${fmt$(Number(variant.purchase_rate || 0))}/${variant.unit || part.unit || 'pcs'}` : ''
    return `
      <div class="mechanism-assignment">
        <div>
          <div class="mechanism-assignment-master">${escMaster(part.part_name)}</div>
          <div class="mechanism-assignment-group">
            <span class="mechanism-chip"><i class="fa-solid fa-box"></i>${escMaster(mechanismPartRuleLabel(part.quantity_rule))}</span>
            <span class="text-xs text-muted">${Number(part.quantity_per_unit || 0)} ${escMaster(part.unit || variant?.unit || 'pcs')}${rate}</span>
            ${part.notes ? `<span class="text-xs text-muted"> - ${escMaster(part.notes)}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:4px;">
          <button class="master-icon-btn" onclick="openMechanismPartEditModal('${part.id}')" title="Edit part"><i class="fa-solid fa-pen"></i></button>
          <button class="master-icon-btn danger" onclick="deleteMechanismPartLink('${part.id}')" title="Remove part"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `
  }).join('') : '<div class="empty-state" style="padding:16px;">No linked parts yet.</div>'

  openModal('Mechanism Parts', `
    <div class="text-sm text-muted" style="margin-bottom:12px;">${escMaster(group?.name || 'Mechanism')} / ${escMaster(option.name)}</div>
    <div id="mechanism-part-alert" class="alert alert-error"></div>
    <div class="mechanism-assignments-list" style="display:grid;gap:8px;margin-bottom:16px;">${rows}</div>
    <div class="card" style="padding:12px;margin:0;">
      <div class="form-row cols-2">
        <div class="form-group">
          <label>Inventory Part <span style="color:#ef4444">*</span></label>
          <select id="mechanism-part-variant" onchange="syncMechanismPartNameFromVariant()">
            <option value="">Select inventory part</option>
            ${variantOptions}
          </select>
        </div>
        <div class="form-group">
          <label>Part Name</label>
          <input id="mechanism-part-name" placeholder="Uses inventory name if blank">
        </div>
      </div>
      <div class="form-row cols-3">
        <div class="form-group">
          <label>Quantity Rule</label>
          <select id="mechanism-part-rule">
            <option value="per_blind">Per blind</option>
            <option value="fixed">Fixed once</option>
            <option value="per_width_m">Per width metre</option>
            <option value="per_height_m">Per height metre</option>
            <option value="per_area_sqm">Per sqm</option>
          </select>
        </div>
        <div class="form-group">
          <label>Qty / Unit</label>
          <input id="mechanism-part-qty" type="number" step="0.001" min="0" value="1">
        </div>
        <div class="form-group">
          <label>Wastage %</label>
          <input id="mechanism-part-wastage" type="number" step="0.01" min="0" value="0">
        </div>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <input id="mechanism-part-notes" placeholder="Optional">
      </div>
      <div style="display:flex;justify-content:flex-end;">
        <button class="btn btn-primary btn-sm" id="mechanism-part-save" onclick="saveMechanismPartLink('${optionId}')">
          <i class="fa-solid fa-link"></i> Link Part
        </button>
      </div>
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
    </div>
  `, true)
}

function syncMechanismPartNameFromVariant() {
  const variant = inventoryVariantById(val('mechanism-part-variant'))
  const input = document.getElementById('mechanism-part-name')
  if (input && !input.value.trim()) input.value = variant?.name || ''
}

function mechanismPartFormPayload(optionId) {
  const variant = inventoryVariantById(val('mechanism-part-variant'))
  const partName = cleanMasterName(val('mechanism-part-name')) || variant?.name || ''
  const qty = parseFloat(val('mechanism-part-qty'))
  const wastage = parseFloat(val('mechanism-part-wastage'))
  if (!variant) throw new Error('Select an inventory part')
  if (!partName) throw new Error('Part name is required')
  if (!Number.isFinite(qty) || qty < 0) throw new Error('Enter a valid quantity')
  if (!Number.isFinite(wastage) || wastage < 0) throw new Error('Enter a valid wastage percentage')
  return {
    mechanism_option_id: optionId,
    variant_id: variant.id,
    part_name: partName,
    quantity_rule: val('mechanism-part-rule') || 'per_blind',
    quantity_per_unit: qty,
    wastage_pct: wastage,
    unit: variant.unit || 'pcs',
    notes: cleanMasterName(val('mechanism-part-notes')) || null,
  }
}

async function saveMechanismPartLink(optionId) {
  hideAlert('mechanism-part-alert')
  let payload
  try {
    payload = mechanismPartFormPayload(optionId)
  } catch (err) {
    showAlert('mechanism-part-alert', err.message || String(err))
    return
  }

  disable('mechanism-part-save')
  try {
    payload.sort_order = partsForMechanismOption(optionId).length
    const { error } = await db.from('mechanism_part_links').insert({ id: masterUuid(), ...payload })
    if (error) throw error
    await logActivity('create', 'mechanism_part_link', optionId, payload.part_name, payload)
    toast('Mechanism part linked')
    await loadMastersData()
    openMechanismPartsModal(optionId)
  } catch (err) {
    showAlert('mechanism-part-alert', err.message || String(err))
  } finally {
    disable('mechanism-part-save', false)
  }
}

function openMechanismPartEditModal(linkId) {
  const part = mechanismPartLinks.find(link => link.id === linkId)
  if (!part) return
  const option = mechanismOptionById(part.mechanism_option_id)
  const variantOptions = mechanismInventoryVariants
    .map(variant => `<option value="${escMaster(variant.id)}" ${variant.id === part.variant_id ? 'selected' : ''}>${escMaster(mechanismVariantLabel(variant))}</option>`)
    .join('')
  openModal('Edit Mechanism Part', `
    <div id="mechanism-part-edit-alert" class="alert alert-error"></div>
    <div class="form-group">
      <label>Mechanism</label>
      <input value="${escMaster(option?.name || '')}" disabled>
    </div>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Inventory Part <span style="color:#ef4444">*</span></label>
        <select id="mechanism-part-variant">${variantOptions}</select>
      </div>
      <div class="form-group">
        <label>Part Name</label>
        <input id="mechanism-part-name" value="${escMaster(part.part_name || '')}">
      </div>
    </div>
    <div class="form-row cols-3">
      <div class="form-group">
        <label>Quantity Rule</label>
        <select id="mechanism-part-rule">
          ${['per_blind', 'fixed', 'per_width_m', 'per_height_m', 'per_area_sqm'].map(rule => `<option value="${rule}" ${part.quantity_rule === rule ? 'selected' : ''}>${escMaster(mechanismPartRuleLabel(rule))}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Qty / Unit</label>
        <input id="mechanism-part-qty" type="number" step="0.001" min="0" value="${Number(part.quantity_per_unit || 0)}">
      </div>
      <div class="form-group">
        <label>Wastage %</label>
        <input id="mechanism-part-wastage" type="number" step="0.01" min="0" value="${Number(part.wastage_pct || 0)}">
      </div>
    </div>
    <div class="form-group">
      <label>Notes</label>
      <input id="mechanism-part-notes" value="${escMaster(part.notes || '')}">
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="openMechanismPartsModal('${part.mechanism_option_id}')">Cancel</button>
      <button class="btn btn-primary" id="mechanism-part-edit-save" onclick="saveMechanismPartEdit('${linkId}')">Save Changes</button>
    </div>
  `, true)
}

async function saveMechanismPartEdit(linkId) {
  const part = mechanismPartLinks.find(link => link.id === linkId)
  if (!part) return
  hideAlert('mechanism-part-edit-alert')
  let payload
  try {
    payload = mechanismPartFormPayload(part.mechanism_option_id)
  } catch (err) {
    showAlert('mechanism-part-edit-alert', err.message || String(err))
    return
  }

  disable('mechanism-part-edit-save')
  try {
    const { error } = await db.from('mechanism_part_links').update(payload).eq('id', linkId)
    if (error) throw error
    await logActivity('update', 'mechanism_part_link', linkId, payload.part_name, payload)
    toast('Mechanism part updated')
    await loadMastersData()
    openMechanismPartsModal(part.mechanism_option_id)
  } catch (err) {
    showAlert('mechanism-part-edit-alert', err.message || String(err))
  } finally {
    disable('mechanism-part-edit-save', false)
  }
}

async function deleteMechanismPartLink(linkId) {
  const part = mechanismPartLinks.find(link => link.id === linkId)
  if (!part) return
  if (!confirm(`Remove "${part.part_name}" from this mechanism?`)) return
  try {
    const { error } = await db.from('mechanism_part_links').delete().eq('id', linkId)
    if (error) throw error
    await logActivity('delete', 'mechanism_part_link', linkId, part.part_name, { mechanism_option_id: part.mechanism_option_id })
    toast('Mechanism part removed')
    await loadMastersData()
    openMechanismPartsModal(part.mechanism_option_id)
  } catch (err) {
    toast(err.message || 'Failed to remove mechanism part', 'error')
  }
}

function renderMechanismAssignmentControls() {
  const masterOptions = sortedMasterNodes()
    .map(node => `<option value="${escMaster(node.id)}">${escMaster(masterPath(node))}</option>`)
    .join('')
  const groupOptions = mechanismGroups
    .map(group => `<option value="${escMaster(group.id)}">${escMaster(group.name)}</option>`)
    .join('')

  html('mechanism-master-select', masterOptions || '<option value="">Create a master first</option>')
  html('mechanism-group-select', groupOptions || '<option value="">Create a mechanism group first</option>')
}

function renderMechanismAssignments() {
  if (!masterMechanismGroups.length) {
    html('mechanism-assignments', '<div class="empty-state">No mechanism assignments yet.</div>')
    return
  }

  const rows = [...masterMechanismGroups]
    .map(row => ({
      ...row,
      master: nodeById(row.master_node_id),
      group: mechanismGroupById(row.mechanism_group_id),
    }))
    .filter(row => row.master && row.group)
    .sort((a, b) => masterPath(a.master).localeCompare(masterPath(b.master)) || a.group.name.localeCompare(b.group.name))

  html('mechanism-assignments', rows.map(row => `
    <div class="mechanism-assignment">
      <div>
        <div class="mechanism-assignment-master">${escMaster(masterPath(row.master))}</div>
        <div class="mechanism-assignment-group"><span class="mechanism-chip"><i class="fa-solid fa-gears"></i>${escMaster(row.group.name)}</span></div>
      </div>
      <button class="master-icon-btn danger" onclick="removeMechanismAssignment('${row.master_node_id}', '${row.mechanism_group_id}')" title="Remove assignment">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  `).join(''))
}

async function toggleMasterNameExclusion(nodeId) {
  const node = nodeById(nodeId)
  if (!node) return
  const nextValue = !node.exclude_from_pnc_name
  try {
    node.exclude_from_pnc_name = nextValue
    renderMasters()
    const { error } = await db
      .from('master_nodes')
      .update({ exclude_from_pnc_name: nextValue })
      .eq('id', nodeId)
    if (error) throw error
    await logActivity('update', 'master_node', node.id, node.name, { exclude_from_pnc_name: nextValue })
    toast(nextValue ? 'Master label will be skipped in final names' : 'Master label will be included in final names')
  } catch (err) {
    node.exclude_from_pnc_name = !nextValue
    renderMasters()
    toast(err.message || 'Failed to update master', 'error')
  }
}

function toggleMaster(nodeId) {
  const body = document.getElementById(`master-body-${nodeId}`)
  const icon = document.getElementById(`master-chevron-${nodeId}`)
  if (!body) return
  if (expandedMasters.has(nodeId)) {
    expandedMasters.delete(nodeId)
    body.classList.add('d-none')
    icon?.classList.remove('rotated')
  } else {
    expandedMasters.add(nodeId)
    body.classList.remove('d-none')
    icon?.classList.add('rotated')
  }
  saveMasterExpandState()
}

function expandAllMasters() {
  masterNodes.forEach(node => expandedMasters.add(node.id))
  saveMasterExpandState()
  renderMasters()
}

function collapseAllMasters() {
  expandedMasters.clear()
  saveMasterExpandState()
  renderMasters()
}

function masterPageSelectHtml(selectedId = activeMasterPageId, inputId = 'main-master-page') {
  if (!masterPages.length) return ''
  return `
    <div class="form-group">
      <label>Page</label>
      <select id="${inputId}">
        ${masterPages.map(page => `<option value="${escMaster(page.id)}" ${page.id === selectedId ? 'selected' : ''}>${escMaster(page.name)}</option>`).join('')}
        <option value="" ${!selectedId || selectedId === UNASSIGNED_MASTER_PAGE ? 'selected' : ''}>Unassigned</option>
      </select>
    </div>
  `
}

function openMasterPageModal(pageId = null) {
  const page = pageId ? masterPages.find(item => item.id === pageId) : null
  openModal(page ? 'Rename Master Page' : 'Create Master Page', `
    <div id="master-page-alert" class="alert alert-error"></div>
    <div class="form-group">
      <label>Page Name <span style="color:#ef4444">*</span></label>
      <input id="master-page-name" value="${escMaster(page?.name || '')}" placeholder="e.g. Blinds">
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="master-page-save" onclick="saveMasterPage('${pageId || ''}')">${page ? 'Save Changes' : 'Create Page'}</button>
    </div>
  `)
  setupMasterModalSubmit('master-page-save', 'master-page-name')
}

async function saveMasterPage(pageId = '') {
  hideAlert('master-page-alert')
  const name = cleanMasterName(val('master-page-name'))
  if (!name) {
    showAlert('master-page-alert', 'Page name is required')
    return
  }
  const normalized = normMasterName(name)
  disable('master-page-save')
  try {
    let duplicateQuery = db
      .from('master_pages')
      .select('id')
      .eq('normalized_name', normalized)
    if (pageId) duplicateQuery = duplicateQuery.neq('id', pageId)
    const duplicate = await duplicateQuery.maybeSingle()
    if (duplicate.error) throw duplicate.error
    if (duplicate.data) throw new Error('Another page with this name already exists.')

    if (pageId) {
      const { error } = await db
        .from('master_pages')
        .update({ name, normalized_name: normalized })
        .eq('id', pageId)
      if (error) throw error
      activeMasterPageId = pageId
    } else {
      const nextSort = masterPages.length
        ? Math.max(...masterPages.map(page => Number(page.sort_order || 0))) + 10
        : 10
      const payload = { id: masterUuid(), name, normalized_name: normalized, sort_order: nextSort }
      const { data, error } = await db
        .from('master_pages')
        .insert(payload)
        .select('id')
        .single()
      if (error) throw error
      activeMasterPageId = dbReturnedRow(data, payload).id
    }

    saveMasterPageState()
    toast(pageId ? 'Page renamed' : 'Page created')
    closeModal()
    await loadMastersData()
  } catch (err) {
    showAlert('master-page-alert', err.message || String(err))
  } finally {
    disable('master-page-save', false)
  }
}

async function deleteMasterPage(pageId) {
  const page = masterPages.find(item => item.id === pageId)
  if (!page) return
  const rootCount = childNodes(null).filter(root => root.page_id === pageId).length
  if (!confirm(`Delete page "${page.name}"?\n\n${rootCount} main master${rootCount !== 1 ? 's' : ''} will move to Unassigned. Masters will not be deleted.`)) return
  try {
    const { error } = await db.from('master_pages').delete().eq('id', pageId)
    if (error) throw error
    if (activeMasterPageId === pageId) activeMasterPageId = ''
    saveMasterPageState()
    toast('Page deleted')
    await loadMastersData()
  } catch (err) {
    toast(err.message || 'Failed to delete page', 'error')
  }
}

function openEditMasterModal(nodeId) {
  const node = nodeById(nodeId)
  if (!node) return
  const parent = node.parent_id ? nodeById(node.parent_id) : null
  openModal('Edit Master', `
    <div id="edit-master-alert" class="alert alert-error"></div>
    <div class="form-group">
      <label>${parent ? 'Parent Master' : 'Level'}</label>
      <input value="${escMaster(parent?.name || 'Main Master')}" disabled>
    </div>
    <div class="form-group">
      <label>Master Name <span style="color:#ef4444">*</span></label>
      <input id="edit-master-name" value="${escMaster(node.name)}">
    </div>
    ${parent ? '' : masterPageSelectHtml(node.page_id || '', 'edit-master-page')}
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="edit-master-save" onclick="saveMasterEdit('${nodeId}')">Save Changes</button>
    </div>
  `)
  setupMasterModalSubmit('edit-master-save', 'edit-master-name')
}

async function saveMasterEdit(nodeId) {
  hideAlert('edit-master-alert')
  const node = nodeById(nodeId)
  const name = cleanMasterName(val('edit-master-name'))
  const pageId = node?.parent_id ? null : (val('edit-master-page') || null)
  if (!node) {
    showAlert('edit-master-alert', 'Master was not found')
    return
  }
  if (!name) {
    showAlert('edit-master-alert', 'Master name is required')
    return
  }

  const normalized = normMasterName(name)
  disable('edit-master-save')
  try {
    let duplicateQuery = db
      .from('master_nodes')
      .select('id')
      .eq('normalized_name', normalized)
      .neq('id', nodeId)
      .limit(1)
    duplicateQuery = node.parent_id ? duplicateQuery.eq('parent_id', node.parent_id) : duplicateQuery.is('parent_id', null)
    const duplicate = await duplicateQuery.maybeSingle()
    if (duplicate.error) throw duplicate.error
    if (duplicate.data) throw new Error('Another master with this name already exists at this level.')

    const update = { name, normalized_name: normalized }
    if (!node.parent_id) update.page_id = pageId

    const { error } = await db
      .from('master_nodes')
      .update(update)
      .eq('id', nodeId)
    if (error) throw error

    await logActivity('update', 'master_node', nodeId, name, { previous_name: node.name, page_id: pageId })
    toast('Master updated')
    closeModal()
    await loadMastersData()
  } catch (err) {
    showAlert('edit-master-alert', err.message || String(err))
  } finally {
    disable('edit-master-save', false)
  }
}

async function deleteMasterNode(nodeId) {
  const node = nodeById(nodeId)
  if (!node) return
  const descendants = descendantsOf(nodeId)
  const childText = descendants.length
    ? `\n\nThis will also delete ${descendants.length} nested sub master${descendants.length !== 1 ? 's' : ''}.`
    : ''
  if (!confirm(`Delete master "${node.name}"?${childText}\n\nRun Sync Inventory after deleting to remove stale generated inventory rows. Rows with stock or history will be kept.`)) return

  try {
    const deletedIds = new Set([nodeId, ...descendants.map(child => child.id)])
    const { error } = await db.from('master_nodes').delete().eq('id', nodeId)
    if (error) throw error
    deletedIds.forEach(id => expandedMasters.delete(id))
    saveMasterExpandState()
    await logActivity('delete', 'master_node', nodeId, node.name, { nested_deleted: descendants.length })
    toast('Master deleted')
    await loadMastersData()
  } catch (err) {
    toast(err.message || 'Failed to delete master', 'error')
  }
}

function openMechanismGroupModal(groupId = null) {
  const group = groupId ? mechanismGroupById(groupId) : null
  openModal(group ? 'Edit Mechanism Group' : 'Create Mechanism Group', `
    <div id="mechanism-group-alert" class="alert alert-error"></div>
    <div class="form-group">
      <label>Group Name <span style="color:#ef4444">*</span></label>
      <input id="mechanism-group-name" value="${escMaster(group?.name || '')}" placeholder="e.g. Roller Headrail / Cassette">
    </div>
    <div class="form-group">
      <label>Description</label>
      <textarea id="mechanism-group-description" rows="3" placeholder="Optional">${escMaster(group?.description || '')}</textarea>
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="mechanism-group-save" onclick="saveMechanismGroup(${groupId ? `'${groupId}'` : 'null'})">${group ? 'Save Changes' : 'Create Group'}</button>
    </div>
  `)
  setupMasterModalSubmit('mechanism-group-save', 'mechanism-group-name')
}

async function saveMechanismGroup(groupId = null) {
  hideAlert('mechanism-group-alert')
  const name = cleanMasterName(val('mechanism-group-name'))
  const description = cleanMasterName(val('mechanism-group-description')) || null
  if (!name) {
    showAlert('mechanism-group-alert', 'Group name is required')
    return
  }

  const normalized = normMasterName(name)
  const duplicate = mechanismGroups.find(group => group.normalized_name === normalized && group.id !== groupId)
  if (duplicate) {
    showAlert('mechanism-group-alert', 'Another mechanism group with this name already exists.')
    return
  }

  disable('mechanism-group-save')
  try {
    if (groupId) {
      const { error } = await db
        .from('mechanism_groups')
        .update({ name, normalized_name: normalized, description })
        .eq('id', groupId)
      if (error) throw error
      await logActivity('update', 'mechanism_group', groupId, name, { description })
      toast('Mechanism group updated')
    } else {
      const nextSort = mechanismGroups.length
        ? Math.max(...mechanismGroups.map(group => Number(group.sort_order || 0))) + 1
        : 0
      const payload = { id: masterUuid(), name, normalized_name: normalized, description, sort_order: nextSort }
      const { data, error } = await db
        .from('mechanism_groups')
        .insert(payload)
        .select('id, name')
        .single()
      if (error) throw error
      const row = dbReturnedRow(data, payload)
      await logActivity('create', 'mechanism_group', row.id, row.name, { description })
      toast('Mechanism group created')
    }
    closeModal()
    await loadMastersData()
  } catch (err) {
    showAlert('mechanism-group-alert', err.message || String(err))
  } finally {
    disable('mechanism-group-save', false)
  }
}

async function deleteMechanismGroup(groupId) {
  const group = mechanismGroupById(groupId)
  if (!group) return
  const optionCount = optionsForMechanismGroup(groupId).length
  const assignmentCount = masterMechanismGroups.filter(row => row.mechanism_group_id === groupId).length
  if (!confirm(`Delete mechanism group "${group.name}"?\n\nThis will also remove ${optionCount} option${optionCount !== 1 ? 's' : ''} and ${assignmentCount} master assignment${assignmentCount !== 1 ? 's' : ''}.`)) return

  try {
    const { error } = await db.from('mechanism_groups').delete().eq('id', groupId)
    if (error) throw error
    await logActivity('delete', 'mechanism_group', groupId, group.name, { options_deleted: optionCount, assignments_deleted: assignmentCount })
    toast('Mechanism group deleted')
    await loadMastersData()
  } catch (err) {
    toast(err.message || 'Failed to delete mechanism group', 'error')
  }
}

function openMechanismOptionModal(groupId, optionId = null) {
  const group = mechanismGroupById(groupId)
  const option = optionId ? mechanismOptionById(optionId) : null
  if (!group) return
  openModal(option ? 'Edit Mechanism Option' : 'Create Mechanism Option', `
    <div id="mechanism-option-alert" class="alert alert-error"></div>
    <div class="form-group">
      <label>Group</label>
      <input value="${escMaster(group.name)}" disabled>
    </div>
    <div class="form-group">
      <label>Option Name <span style="color:#ef4444">*</span></label>
      <input id="mechanism-option-name" value="${escMaster(option?.name || '')}" placeholder="e.g. With Headrail">
    </div>
    <div class="form-row cols-2">
      <div class="form-group">
        <label>Source Label</label>
        <input id="mechanism-option-source" value="${escMaster(option?.source_label || '')}" placeholder="Workbook/header label">
      </div>
      <div class="form-group">
        <label>Price Key</label>
        <input id="mechanism-option-price-key" value="${escMaster(option?.price_key || '')}" placeholder="e.g. rrp_w_headrail">
      </div>
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="mechanism-option-save" onclick="saveMechanismOption('${groupId}', ${optionId ? `'${optionId}'` : 'null'})">${option ? 'Save Changes' : 'Create Option'}</button>
    </div>
  `)
  setupMasterModalSubmit('mechanism-option-save', 'mechanism-option-name')
}

async function saveMechanismOption(groupId, optionId = null) {
  hideAlert('mechanism-option-alert')
  const name = cleanMasterName(val('mechanism-option-name'))
  const sourceLabel = cleanMasterName(val('mechanism-option-source')) || null
  const priceKey = cleanMasterName(val('mechanism-option-price-key')) || null
  if (!name) {
    showAlert('mechanism-option-alert', 'Option name is required')
    return
  }

  const normalized = normMasterName(name)
  const duplicate = mechanismOptions.find(option =>
    option.group_id === groupId && option.normalized_name === normalized && option.id !== optionId)
  if (duplicate) {
    showAlert('mechanism-option-alert', 'Another option with this name already exists in this group.')
    return
  }

  disable('mechanism-option-save')
  try {
    if (optionId) {
      const { error } = await db
        .from('mechanism_options')
        .update({ name, normalized_name: normalized, source_label: sourceLabel, price_key: priceKey })
        .eq('id', optionId)
      if (error) throw error
      await logActivity('update', 'mechanism_option', optionId, name, { group_id: groupId, source_label: sourceLabel, price_key: priceKey })
      toast('Mechanism option updated')
    } else {
      const siblings = optionsForMechanismGroup(groupId)
      const nextSort = siblings.length
        ? Math.max(...siblings.map(option => Number(option.sort_order || 0))) + 1
        : 0
      const payload = {
        id: masterUuid(),
        group_id: groupId,
        name,
        normalized_name: normalized,
        source_label: sourceLabel,
        price_key: priceKey,
        sort_order: nextSort,
      }
      const { data, error } = await db
        .from('mechanism_options')
        .insert(payload)
        .select('id, name')
        .single()
      if (error) throw error
      const row = dbReturnedRow(data, payload)
      await logActivity('create', 'mechanism_option', row.id, row.name, { group_id: groupId, source_label: sourceLabel, price_key: priceKey })
      toast('Mechanism option created')
    }
    closeModal()
    await loadMastersData()
  } catch (err) {
    showAlert('mechanism-option-alert', err.message || String(err))
  } finally {
    disable('mechanism-option-save', false)
  }
}

async function deleteMechanismOption(optionId) {
  const option = mechanismOptionById(optionId)
  if (!option) return
  if (!confirm(`Delete mechanism option "${option.name}"?`)) return

  try {
    const { error } = await db.from('mechanism_options').delete().eq('id', optionId)
    if (error) throw error
    await logActivity('delete', 'mechanism_option', optionId, option.name, { group_id: option.group_id })
    toast('Mechanism option deleted')
    await loadMastersData()
  } catch (err) {
    toast(err.message || 'Failed to delete mechanism option', 'error')
  }
}

async function assignMechanismGroup() {
  const masterNodeId = val('mechanism-master-select')
  const mechanismGroupId = val('mechanism-group-select')
  const master = nodeById(masterNodeId)
  const group = mechanismGroupById(mechanismGroupId)
  if (!master || !group) {
    toast('Select a master and mechanism group first', 'error')
    return
  }
  if (masterMechanismGroups.some(row => row.master_node_id === masterNodeId && row.mechanism_group_id === mechanismGroupId)) {
    toast('That mechanism group is already applied to this master', 'error')
    return
  }

  disable('mechanism-assign-btn')
  try {
    const { error } = await db
      .from('master_mechanism_groups')
      .insert({
        master_node_id: masterNodeId,
        mechanism_group_id: mechanismGroupId,
        sort_order: masterMechanismGroups.length,
      })
    if (error) throw error
    await logActivity('create', 'master_mechanism_group', masterNodeId, masterPath(master), { mechanism_group_id: mechanismGroupId, mechanism_group: group.name })
    toast('Mechanism applied to master')
    await loadMastersData()
  } catch (err) {
    toast(err.message || 'Failed to apply mechanism', 'error')
  } finally {
    disable('mechanism-assign-btn', false)
  }
}

async function removeMechanismAssignment(masterNodeId, mechanismGroupId) {
  const master = nodeById(masterNodeId)
  const group = mechanismGroupById(mechanismGroupId)
  if (!master || !group) return
  if (!confirm(`Remove "${group.name}" from "${masterPath(master)}"?`)) return

  try {
    const { error } = await db
      .from('master_mechanism_groups')
      .delete()
      .eq('master_node_id', masterNodeId)
      .eq('mechanism_group_id', mechanismGroupId)
    if (error) throw error
    await logActivity('delete', 'master_mechanism_group', masterNodeId, masterPath(master), { mechanism_group_id: mechanismGroupId, mechanism_group: group.name })
    toast('Mechanism assignment removed')
    await loadMastersData()
  } catch (err) {
    toast(err.message || 'Failed to remove assignment', 'error')
  }
}

function syncLimitError() {
  return new Error(`Sync stopped because this master structure would generate more than ${MASTER_SYNC_ITEM_LIMIT} inventory items. Narrow the master branches before syncing.`)
}

function leafNameOptions(node, limit = MASTER_SYNC_ITEM_LIMIT) {
  const results = []

  function walk(current, prefix) {
    const nextPrefix = [...prefix, ...includedNameParts(current)]
    const children = childNodes(current.id)
    if (!children.length) {
      if (results.length >= limit) throw syncLimitError()
      results.push(nextPrefix)
      return
    }
    children.forEach(child => walk(child, nextPrefix))
  }

  walk(node, [])
  return results
}

function cartesianNameGroups(groups) {
  return groups.reduce((acc, group) => {
    const next = []
    for (const prefix of acc) {
      for (const parts of group) {
        if (next.length >= MASTER_SYNC_ITEM_LIMIT) {
          throw syncLimitError()
        }
        next.push([...prefix, ...parts])
      }
    }
    return next
  }, [[]])
}

function shouldUseGroupedPnc(root) {
  const branchChildren = childNodes(root.id).filter(child => childNodes(child.id).length)
  return branchChildren.length > 1 && branchChildren.every(child => child.exclude_from_pnc_name)
}

function inventoryNamesForRoot(root, remainingLimit = MASTER_SYNC_ITEM_LIMIT) {
  const rootParts = includedNameParts(root)
  const children = childNodes(root.id)
  const groups = children
    .map(child => leafNameOptions(child).filter(parts => parts.length))
    .filter(group => group.length)
  const rawNames = shouldUseGroupedPnc(root)
    ? cartesianNameGroups(groups)
        .map(parts => [...rootParts, ...parts])
    : leafNameOptions(root)

  const seen = new Set()
  const names = []
  for (const parts of rawNames) {
    const name = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    const key = normMasterName(name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    names.push(name)
    if (names.length > remainingLimit) {
      throw syncLimitError()
    }
  }
  return names
}

function buildInventorySyncPlan() {
  const roots = childNodes(null)
  const plan = []
  for (const root of roots) {
    const names = inventoryNamesForRoot(root, MASTER_SYNC_ITEM_LIMIT - plan.length)
    for (const name of names) {
      plan.push({
        root,
        rootId: root.id,
        categoryName: root.name,
        productName: root.name,
        variantName: name,
        syncKey: masterSyncKey(root.id, name),
      })
      if (plan.length > MASTER_SYNC_ITEM_LIMIT) {
        throw syncLimitError()
      }
    }
  }
  return plan
}

function masterSyncKey(rootId, variantName) {
  return `${rootId || ''}|${normMasterName(variantName)}`
}

async function ensureInventoryCategory(name) {
  const normalized = normMasterName(name)
  const existing = await db
    .from('inv_categories')
    .select('id, name, normalized_name, sub_group')
    .eq('normalized_name', normalized)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return existing.data

  const payload = {
    id: masterUuid(),
    name,
    normalized_name: normalized,
    sub_group: MASTER_INVENTORY_SUB_GROUP,
  }
  const { data, error } = await db
    .from('inv_categories')
    .insert(payload)
    .select('id, name, normalized_name, sub_group')
    .single()
  if (error) throw error
  return dbReturnedRow(data, payload)
}

async function ensureInventoryProduct(categoryId, name) {
  const normalized = normMasterName(name)
  const existing = await db
    .from('inv_products')
    .select('id, name, normalized_name')
    .eq('category_id', categoryId)
    .eq('normalized_name', normalized)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return existing.data

  const payload = {
    id: masterUuid(),
    category_id: categoryId,
    name,
    normalized_name: normalized,
  }
  const { data, error } = await db
    .from('inv_products')
    .insert(payload)
    .select('id, name, normalized_name')
    .single()
  if (error) throw error
  return dbReturnedRow(data, payload)
}

async function ensureInventoryVariant(productId, name) {
  const normalized = normMasterName(name)
  const existing = await db
    .from('inv_variants')
    .select('id, name, normalized_name')
    .eq('product_id', productId)
    .eq('normalized_name', normalized)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return { row: existing.data, created: false }

  const payload = {
    id: masterUuid(),
    product_id: productId,
    name,
    normalized_name: normalized,
    unit: MASTER_INVENTORY_UNIT,
  }
  const { data, error } = await db
    .from('inv_variants')
    .insert(payload)
    .select('id, name, normalized_name')
    .single()
  if (error) throw error
  return { row: dbReturnedRow(data, payload), created: true }
}

async function loadActiveMasterSyncItems() {
  const { data, error } = await db
    .from('master_inventory_sync_items')
    .select('id, root_id, variant_id, category_name, product_name, variant_name, normalized_variant_name, is_active')
    .eq('is_active', true)
  if (error) {
    throw new Error(`Run the updated migration 003 before syncing inventory. ${error.message || ''}`.trim())
  }
  return data || []
}

async function upsertMasterSyncItem(item, variantId) {
  const normalizedVariantName = normMasterName(item.variantName)
  const existing = await db
    .from('master_inventory_sync_items')
    .select('id')
    .eq('root_id', item.rootId)
    .eq('normalized_variant_name', normalizedVariantName)
    .maybeSingle()
  if (existing.error) throw existing.error

  const payload = {
    root_id: item.rootId,
    variant_id: variantId,
    category_name: item.categoryName,
    product_name: item.productName,
    variant_name: item.variantName,
    normalized_variant_name: normalizedVariantName,
    is_active: true,
    delete_reason: null,
    deleted_at: null,
  }

  if (existing.data) {
    const { error } = await db.from('master_inventory_sync_items').update(payload).eq('id', existing.data.id)
    if (error) throw error
  } else {
    const { error } = await db.from('master_inventory_sync_items').insert({ id: masterUuid(), ...payload })
    if (error) throw error
  }
}

async function markMasterSyncItemInactive(row, reason) {
  const { error } = await db
    .from('master_inventory_sync_items')
    .update({
      is_active: false,
      delete_reason: reason,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', row.id)
  if (error) throw error
}

async function countRows(table, column, value) {
  if (!value) return 0
  const { count, error } = await db
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, value)
  if (error) throw error
  return count || 0
}

async function deleteSyncedInventoryVariant(row) {
  if (!row.variant_id) {
    await markMasterSyncItemInactive(row, 'missing_variant')
    return { deleted: 0, kept: 0 }
  }

  const [rollCount, movementCount] = await Promise.all([
    countRows('inv_rolls', 'variant_id', row.variant_id),
    countRows('inv_movements', 'variant_id', row.variant_id),
  ])
  if (rollCount || movementCount) {
    await markMasterSyncItemInactive(row, 'kept_has_stock_or_history')
    return { deleted: 0, kept: 1 }
  }

  const variantRes = await db
    .from('inv_variants')
    .select('id, product_id, inv_products(id, category_id)')
    .eq('id', row.variant_id)
    .maybeSingle()
  if (variantRes.error) throw variantRes.error
  const variant = variantRes.data
  if (!variant) {
    await markMasterSyncItemInactive(row, 'already_deleted')
    return { deleted: 0, kept: 0 }
  }

  const productId = variant.product_id
  const categoryId = variant.inv_products?.category_id
  const { error } = await db.from('inv_variants').delete().eq('id', row.variant_id)
  if (error) throw error

  if (productId) {
    const variantCount = await countRows('inv_variants', 'product_id', productId)
    if (!variantCount) await db.from('inv_products').delete().eq('id', productId)
  }
  if (categoryId) {
    const productCount = await countRows('inv_products', 'category_id', categoryId)
    if (!productCount) await db.from('inv_categories').delete().eq('id', categoryId)
  }

  await markMasterSyncItemInactive(row, 'deleted_generated_variant')
  return { deleted: 1, kept: 0 }
}

async function syncMastersToInventory() {
  const syncBtn = document.getElementById('sync-masters-btn')
  let plan = []
  let trackedRows = []
  try {
    plan = buildInventorySyncPlan()
    trackedRows = await loadActiveMasterSyncItems()
  } catch (err) {
    toast(err.message || 'Failed to prepare inventory sync', 'error')
    return
  }
  if (!plan.length) {
    toast('Create masters and sub masters before syncing inventory', 'error')
    return
  }

  const desiredByKey = new Map(plan.map(item => [item.syncKey, item]))
  const trackedByKey = new Map(trackedRows.map(row => [masterSyncKey(row.root_id, row.variant_name), row]))
  const additions = plan.filter(item => !trackedByKey.has(item.syncKey))
  const removals = trackedRows.filter(row => !desiredByKey.has(masterSyncKey(row.root_id, row.variant_name)))
  const unchanged = plan.length - additions.length

  if (!additions.length && !removals.length) {
    toast('Inventory already matches the current masters')
    return
  }

  const sample = additions.slice(0, 4).map(item => `+ ${item.variantName}`).join('\n')
  const removeSample = removals.slice(0, 4).map(item => `- ${item.variant_name}`).join('\n')
  const samples = [sample, removeSample].filter(Boolean).join('\n')
  if (!confirm(`Sync inventory changes?\n\nAdd: ${additions.length}\nRemove stale generated: ${removals.length}\nUnchanged: ${unchanged}\n\n${samples}\n\nRows with stock or movement history will be kept.`)) {
    return
  }

  try {
    if (syncBtn) {
      syncBtn.disabled = true
      syncBtn.innerHTML = '<span class="spinner spinner-sm"></span> Syncing...'
    }
    const categoryCache = new Map()
    const productCache = new Map()
    let created = 0
    let existing = 0
    let deleted = 0
    let kept = 0

    for (const item of additions) {
      const catKey = normMasterName(item.categoryName)
      let category = categoryCache.get(catKey)
      if (!category) {
        category = await ensureInventoryCategory(item.categoryName)
        if (!category?.id) throw new Error(`Could not prepare inventory category for "${item.categoryName}". Refresh and try again.`)
        categoryCache.set(catKey, category)
      }

      const productKey = `${category.id}:${normMasterName(item.productName)}`
      let product = productCache.get(productKey)
      if (!product) {
        product = await ensureInventoryProduct(category.id, item.productName)
        if (!product?.id) throw new Error(`Could not prepare inventory product for "${item.productName}". Refresh and try again.`)
        productCache.set(productKey, product)
      }

      const result = await ensureInventoryVariant(product.id, item.variantName)
      if (!result?.row?.id) throw new Error(`Could not prepare inventory variant for "${item.variantName}". Refresh and try again.`)
      await upsertMasterSyncItem(item, result.row.id)
      if (result.created) created += 1
      else existing += 1
    }

    for (const row of removals) {
      const result = await deleteSyncedInventoryVariant(row)
      deleted += result.deleted
      kept += result.kept
    }

    await logActivity('create', 'master_inventory_sync', null, 'Masters to Inventory', {
      total: plan.length,
      added: additions.length,
      removed: removals.length,
      created,
      existing,
      deleted,
      kept,
    })
    toast(`Inventory synced: ${created} created, ${existing} linked, ${deleted} removed${kept ? `, ${kept} kept with stock/history` : ''}`)
  } catch (err) {
    toast(err.message || 'Failed to sync inventory', 'error')
  } finally {
    if (syncBtn) {
      syncBtn.disabled = false
      syncBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Sync Inventory'
    }
  }
}

function openMainMasterModal() {
  openModal('Create Main Master', `
    <div id="main-master-alert" class="alert alert-error"></div>
    <div class="form-group">
      <label>Main Master Name <span style="color:#ef4444">*</span></label>
      <input id="main-master-name" placeholder="e.g. A">
    </div>
    <div class="form-group">
      <label>Multiple Main Masters <span class="text-xs text-muted">(optional)</span></label>
      <textarea id="main-master-bulk" rows="5" placeholder="Add one per line or separate with commas"></textarea>
      <div class="text-xs text-muted" style="margin-top:4px;">Use this when the + button should create many masters together. Ctrl+Enter saves from this box.</div>
    </div>
    ${masterPageSelectHtml(activeMasterPageId)}
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="main-master-save" onclick="saveMainMaster()">Create Master</button>
    </div>
  `)
  setupMasterModalSubmit('main-master-save', 'main-master-name')
}

async function saveMainMaster() {
  hideAlert('main-master-alert')
  const names = parseMasterNames(val('main-master-name'), val('main-master-bulk'))
  const pageId = val('main-master-page') || null
  if (!names.length) {
    showAlert('main-master-alert', 'Enter at least one main master name')
    return
  }

  disable('main-master-save')
  try {
    const createdNodes = []
    for (const name of names) {
      const node = await ensureMasterNode(null, name, pageId)
      expandedMasters.add(node.id)
      createdNodes.push(node)
    }
    await logActivity('create', 'master_node', null, 'Main Masters', {
      level: 'main',
      page_id: pageId,
      names: createdNodes.map(node => node.name),
    })
    toast(createdNodes.length === 1 ? 'Main master created' : `${createdNodes.length} main masters created`)
    closeModal()
    await loadMastersData()
  } catch (err) {
    showAlert('main-master-alert', err.message || String(err))
  } finally {
    disable('main-master-save', false)
  }
}

function openSubMasterModal(parentId) {
  const parent = nodeById(parentId)
  if (!parent) return
  openModal('Create Sub Master', `
    <div id="sub-master-alert" class="alert alert-error"></div>
    <div class="form-group">
      <label>Parent Master</label>
      <input value="${escMaster(parent.name)}" disabled>
    </div>
    <div class="form-group">
      <label>Sub Master Name <span style="color:#ef4444">*</span></label>
      <input id="sub-master-name" placeholder="e.g. 1">
    </div>
    <div class="form-group">
      <label>Multiple Sub Masters <span class="text-xs text-muted">(optional)</span></label>
      <textarea id="sub-master-bulk" rows="5" placeholder="Add one per line or separate with commas"></textarea>
      <div class="text-xs text-muted" style="margin-top:4px;">Use this to add several sub masters under ${escMaster(parent.name)}. Ctrl+Enter saves from this box.</div>
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="sub-master-save" onclick="saveSubMaster('${parentId}')">Create Sub Master</button>
    </div>
  `)
  setupMasterModalSubmit('sub-master-save', 'sub-master-name')
}

async function saveSubMaster(parentId) {
  hideAlert('sub-master-alert')
  const parent = nodeById(parentId)
  const names = parseMasterNames(val('sub-master-name'), val('sub-master-bulk'))
  if (!parent) {
    showAlert('sub-master-alert', 'Parent master was not found')
    return
  }
  if (!names.length) {
    showAlert('sub-master-alert', 'Enter at least one sub master name')
    return
  }

  disable('sub-master-save')
  try {
    const createdNodes = []
    for (const name of names) {
      const node = await ensureMasterNode(parent.id, name)
      expandedMasters.add(node.id)
      createdNodes.push(node)
    }
    expandedMasters.add(parent.id)
    await logActivity('create', 'master_node', null, 'Sub Masters', {
      parent_id: parent.id,
      parent: parent.name,
      names: createdNodes.map(node => node.name),
    })
    toast(createdNodes.length === 1 ? 'Sub master created' : `${createdNodes.length} sub masters created`)
    closeModal()
    await loadMastersData()
  } catch (err) {
    showAlert('sub-master-alert', err.message || String(err))
  } finally {
    disable('sub-master-save', false)
  }
}

async function ensureMasterNode(parentId, name, pageId = null) {
  const normalized = normMasterName(name)
  let query = db.from('master_nodes').select('id, parent_id, page_id, name, normalized_name, exclude_from_pnc_name, sort_order, created_at')
  query = parentId ? query.eq('parent_id', parentId) : query.is('parent_id', null)
  const existing = await query.eq('normalized_name', normalized).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return existing.data

  const siblings = childNodes(parentId)
  const nextSort = siblings.length
    ? Math.max(...siblings.map(node => Number(node.sort_order || 0))) + 1
    : 0
  const payload = {
    id: masterUuid(),
    parent_id: parentId,
    page_id: parentId ? null : pageId,
    name,
    normalized_name: normalized,
    exclude_from_pnc_name: false,
    sort_order: nextSort,
  }
  const { data, error } = await db
    .from('master_nodes')
    .insert(payload)
    .select('id, parent_id, page_id, name, normalized_name, exclude_from_pnc_name, sort_order, created_at')
    .single()
  if (error) throw error
  return dbReturnedRow(data, payload)
}

initMasters()
