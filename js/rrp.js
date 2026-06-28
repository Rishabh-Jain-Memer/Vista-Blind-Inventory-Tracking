/*
  Manual RRP table controller.
  Each RRP table links to one master node. Sales Order resolves the selected
  inventory item back to its master path and applies the nearest matching table.
*/

let rrpPriceBooks = []
let rrpTables = []
let rrpMechanismPrices = []
let rrpMasterNodes = []
let rrpMasterPages = []
let rrpMechanismGroups = []
let rrpMechanismOptions = []
let activePriceBookId = ''
let rrpReady = true
let rrpError = null

async function init() {
  const profile = await initSidebar()
  if (!profile) return
  await loadRRP()
  hide('loading')
  show('content')
}

async function loadRRP() {
  await loadRRPEngine()
  renderRRPScreen()
}

async function loadRRPEngine() {
  rrpReady = true
  rrpError = null
  const [
    booksRes,
    tablesRes,
    pricesRes,
    pagesRes,
    nodesRes,
    groupsRes,
    optionsRes,
  ] = await Promise.all([
    db.from('rrp_price_books').select('*').order('is_default', { ascending: false }).order('effective_from', { ascending: false }),
    db.from('rrp_rules').select('*').eq('is_active', true).order('priority').order('label'),
    db.from('rrp_rule_mechanism_prices').select('*').eq('is_active', true).order('sort_order').order('mechanism_label'),
    db.from('master_pages').select('id, name, sort_order').order('sort_order').order('name'),
    db.from('master_nodes').select('id, parent_id, page_id, name, normalized_name, exclude_from_pnc_name, sort_order').order('sort_order').order('name'),
    db.from('mechanism_groups').select('id, name, sort_order').order('sort_order').order('name'),
    db.from('mechanism_options').select('id, group_id, name, normalized_name, source_label, price_key, sort_order, is_active').order('sort_order').order('name'),
  ])

  const error = booksRes.error || tablesRes.error || pricesRes.error || pagesRes.error || nodesRes.error || groupsRes.error || optionsRes.error
  if (error) {
    rrpReady = false
    rrpError = error
    rrpPriceBooks = []
    rrpTables = []
    rrpMechanismPrices = []
    rrpMasterPages = []
    rrpMasterNodes = []
    rrpMechanismGroups = []
    rrpMechanismOptions = []
    return
  }

  rrpPriceBooks = booksRes.data || []
  rrpTables = tablesRes.data || []
  rrpMechanismPrices = pricesRes.data || []
  rrpMasterPages = pagesRes.data || []
  rrpMasterNodes = nodesRes.data || []
  rrpMechanismGroups = groupsRes.data || []
  rrpMechanismOptions = optionsRes.data || []
  await ensureInternalRRPBook()
  activePriceBookId = activePriceBookId && rrpPriceBooks.some(book => book.id === activePriceBookId)
    ? activePriceBookId
    : (rrpPriceBooks.find(book => book.is_default)?.id || rrpPriceBooks[0]?.id || '')
}

async function ensureInternalRRPBook() {
  if (rrpPriceBooks.length) return
  const payload = {
    name: 'Default RRP',
    normalized_name: 'default rrp',
    effective_from: new Date().toISOString().slice(0, 10),
    status: 'active',
    is_default: true,
    notes: 'Internal default used by the manual RRP screen.',
  }
  const { data, error } = await db.from('rrp_price_books').insert(payload).select('*').single()
  if (error) {
    rrpReady = false
    rrpError = error
    return
  }
  rrpPriceBooks = data ? [data] : []
}

function renderRRPScreen() {
  if (!rrpReady) {
    html('rrp-rule-setup-error', `
      <div class="alert alert-error show" style="margin-bottom:12px;">
        RRP tables are not ready. Run the RRP migration first, then refresh.
        <div class="text-xs" style="margin-top:4px;">${esc(rrpError?.message || '')}</div>
      </div>
    `)
    html('rrp-rules-list', '')
    return
  }
  html('rrp-rule-setup-error', '')
  renderRRPRules()
}

function renderRRPRules() {
  const q = String(document.getElementById('rrp-rule-search')?.value || '').toLowerCase().trim()
  let rows = rrpTables
    .filter(row => !activePriceBookId || row.price_book_id === activePriceBookId)
    .map(row => ({ ...row, node: nodeById(row.master_node_id) }))

  if (q) {
    rows = rows.filter(row => {
      const mechanismText = mechanismPricesForTable(row.id).map(price => price.mechanism_label).join(' ')
      const text = [row.label, row.pricing_basis, masterPath(row.node), pageNameForNode(row.node), mechanismText].join(' ').toLowerCase()
      return text.includes(q)
    })
  }

  rows.sort((a, b) =>
    Number(a.priority || 0) - Number(b.priority || 0) ||
    rrpSectionLabel(a).localeCompare(rrpSectionLabel(b)) ||
    masterPath(a.node).localeCompare(masterPath(b.node))
  )

  if (!rows.length) {
    html('rrp-rules-list', `
      <div class="empty-state" style="padding:24px;">
        No RRP tables yet. Click <strong>Create RRP Table</strong>, select a master, and enter the RRP.
      </div>
    `)
    return
  }

  const columns = mechanismColumnsForRows(rows)
  html('rrp-rules-list', renderRRPMatrix(rows, columns))
}

function renderRRPMatrix(rows, columns) {
  const groups = groupedRRPRows(rows)
  const colCount = 5 + columns.length + 1
  return `
    <div style="border:1px solid var(--border);border-radius:5px;overflow:hidden;background:#fff;">
      <table class="rrp-sheet-table">
        <colgroup>
          <col style="width:78px;">
          <col style="width:24px;">
          <col>
          <col style="width:36px;">
          <col style="width:32px;">
          ${columns.map(() => '<col style="width:82px;">').join('')}
          <col style="width:42px;">
        </colgroup>
        <thead>
          <tr style="background:#e8f1f8;">
            <th style="text-align:center;padding:3px 4px;">Book</th>
            <th style="text-align:center;padding:3px 2px;">No</th>
            <th style="padding:3px 4px;">Shade</th>
            <th style="text-align:center;padding:3px 2px;">Max</th>
            <th style="text-align:center;padding:3px 2px;">UOM</th>
            ${columns.map(col => `<th style="text-align:center;">${esc(shortMechanismLabel(col.label))}</th>`).join('')}
            <th style="text-align:center;">Act</th>
          </tr>
          <tr style="background:#19a9d2;color:#fff;">
            <th style="padding:2px 4px;">Collection</th>
            <th style="padding:2px;">S</th>
            <th style="padding:2px 4px;">${esc(groups[0]?.root || 'RRP')}</th>
            <th></th>
            <th></th>
            ${columns.map(() => '<th style="text-align:center;padding:2px;">RRP</th>').join('')}
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${groups.map(group => renderRRPMatrixGroup(group, columns, colCount)).join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderRRPMatrixGroup(group, columns, colCount) {
  return `
    <tr class="rrp-section-row">
      <td colspan="${colCount}" style="background:#19a9d2;color:#fff;font-weight:800;text-transform:uppercase;letter-spacing:.02em;padding:2px 5px;line-height:1.1;">
        ${esc(group.section || group.root)}${group.collection ? ` / ${esc(group.collection)}` : ''}
      </td>
    </tr>
    ${group.rows.map((row, idx) => renderRRPMatrixRow(row, columns, idx + 1)).join('')}
  `
}

function renderRRPMatrixRow(row, columns, serialNo) {
  const meta = rowMasterMeta(row)
  return `
    <tr>
      <td style="font-weight:600;text-align:center;padding:2px 4px;line-height:1.05;">${esc(compactGroupLabel(meta.collection || meta.root || '-'))}</td>
      <td style="text-align:center;padding:2px;">${serialNo}</td>
      <td style="padding:2px 4px;line-height:1.05;" title="${escAttr(masterPath(row.node) || 'Unlinked master')}">
        <div class="fw-600" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(meta.shade)}</div>
      </td>
      <td style="text-align:center;padding:2px;">${row.width_max_cm ? esc(row.width_max_cm) : '-'}</td>
      <td style="text-align:center;padding:2px;">${esc(row.uom || 'SQM')}</td>
      ${columns.map(col => renderMechanismMatrixCell(row, col)).join('')}
      <td>
        <div class="rrp-action-cell">
          <button class="rrp-icon-action" onclick="openMechanismPriceModal('${escAttr(row.id)}')" title="Add mechanism RRP"><i class="fa-solid fa-plus"></i></button>
          <button class="rrp-icon-action" onclick="openRRPRuleModal('${escAttr(row.id)}')" title="Edit table"><i class="fa-solid fa-pen"></i></button>
          <button class="rrp-icon-action danger" onclick="deleteRRPRule('${escAttr(row.id)}')" title="Delete table"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `
}

function renderMechanismMatrixCell(row, col) {
  const match = mechanismPriceForColumn(row, col)
  const value = match ? finalMechanismRRP(row, match) : Number(row.base_rrp || 0)
  const inherited = !match
  const title = inherited ? 'Using base RRP' : `${match.modifier_type === 'add' ? 'Base + add-on' : 'Mechanism override'}`
  const optionId = [...(col.optionIds || new Set())][0] || ''
  return `
    <td style="text-align:center;background:${inherited ? '#fff' : '#fef2f2'};padding:1px;" title="${escAttr(title)}">
      <button class="rrp-rate-btn"
              onclick="${match ? `openMechanismPriceModal('${escAttr(row.id)}','${escAttr(match.id)}')` : `openMechanismPriceModal('${escAttr(row.id)}','','${escAttr(col.label)}','${escAttr(optionId)}')`}"
              style="color:${inherited ? '#111827' : '#047857'};">
        ${value ? Number(value).toLocaleString('en-IN') : '-'}
      </button>
    </td>
  `
}

function groupedRRPRows(rows) {
  const groups = new Map()
  for (const row of rows) {
    const meta = rowMasterMeta(row)
    const section = rrpSectionLabel(row)
    const key = `${meta.root}|${section}`
    if (!groups.has(key)) groups.set(key, { root: meta.root, section, collection: '', rows: [] })
    groups.get(key).rows.push(row)
  }
  return [...groups.values()]
}

function rowMasterMeta(row) {
  const nodes = masterNodePath(row.node)
  const root = nodes[0]?.name || pageNameForNode(row.node) || 'RRP'
  const collection = rrpCollectionLabel(row, nodes)
  const leaf = nodes[nodes.length - 1]?.name || row.label || 'Master'
  const parent = nodes[nodes.length - 2]?.name || ''
  const label = String(row.label || '').trim()
  const shade = label && normKey(label).includes(normKey(leaf))
    ? label
    : [parent, leaf].filter(Boolean).join(' ') || label || leaf
  return { root, collection, leaf, shade }
}

function rrpSectionLabel(row) {
  const firstNote = String(row.notes || '').split('|')[0]?.trim()
  if (firstNote && /^roller\b/i.test(firstNote)) return firstNote
  const nodes = masterNodePath(row.node)
  return nodes[1]?.name || nodes[0]?.name || 'RRP'
}

function rrpCollectionLabel(row, nodes = []) {
  const label = normKey([row.label, masterPath(row.node)].join(' '))
  if (label.includes('soletombo') || label.includes('soletonbo')) return 'Soleto Series'
  if (label.includes('wonderdesign')) return 'Wonder Designs'
  if (label.includes('harris')) return 'Harris'
  if (label.includes('midnightbloom')) return 'Midnight Bloom'
  if (label.includes('prism')) return 'Prism'
  if (label.includes('customised')) return 'Customised'
  if (nodes.length > 2) return nodes.slice(1, -1).map(node => node.name).join(' / ')
  return 'Classic Roller Series'
}

function masterNodePath(node) {
  const path = []
  let cur = node
  while (cur) {
    path.unshift(cur)
    cur = parentOf(cur)
  }
  return path
}

function mechanismColumnsForRows(rows) {
  const usedPrices = rows.flatMap(row => mechanismPricesForTable(row.id))
  const usedOptionIds = new Set(usedPrices.map(price => price.mechanism_option_id).filter(Boolean))
  const usedGroupIds = new Set(
    rrpMechanismOptions
      .filter(option => usedOptionIds.has(option.id))
      .map(option => option.group_id)
      .filter(Boolean)
  )
  const optionPool = rrpMechanismOptions
    .filter(option => option.is_active !== false)
    .filter(option => !usedGroupIds.size || usedGroupIds.has(option.group_id))

  const columns = new Map()
  for (const option of optionPool) addMechanismColumn(columns, option.name, option.id, option.sort_order)
  for (const price of usedPrices) addMechanismColumn(columns, price.mechanism_label, price.mechanism_option_id, 999)

  return [...columns.values()].sort((a, b) =>
    mechanismSortWeight(a.label) - mechanismSortWeight(b.label) ||
    Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
    a.label.localeCompare(b.label)
  )
}

function addMechanismColumn(columns, label, optionId = '', sortOrder = 0) {
  if (!label) return
  const key = normKey(label)
  const existing = columns.get(key)
  if (existing) {
    if (optionId) existing.optionIds.add(optionId)
    existing.sortOrder = Math.min(existing.sortOrder, Number(sortOrder || 0))
    return
  }
  columns.set(key, {
    key,
    label,
    optionIds: new Set(optionId ? [optionId] : []),
    sortOrder: Number(sortOrder || 0),
  })
}

function mechanismSortWeight(label) {
  const key = normKey(label)
  if (key.includes('withoutheadrail')) return 10
  if (key.includes('withheadrail')) return 20
  if (key.includes('plaincassette')) return 30
  if (key.includes('decorativesquarecassette')) return 50
  if (key.includes('decorativecassette')) return 40
  return 100
}

function shortMechanismLabel(label) {
  const key = normKey(label)
  if (key.includes('withoutheadrail')) return 'W/O HR'
  if (key.includes('withheadrail')) return 'W/ HR'
  if (key.includes('decorativesquarecassette')) return 'Dec Sq Cass'
  if (key.includes('decorativecassette')) return 'Dec. Cass.'
  if (key.includes('plaincassette')) return 'Plain Cass.'
  return String(label || '')
}

function compactGroupLabel(label) {
  return String(label || '')
    .replace(/\bClassic Roller Series\b/i, 'Classic')
    .replace(/\bRoller Blind\b/i, 'Roller')
    .replace(/\s*\/\s*/g, ' / ')
}

function mechanismPriceForColumn(row, col) {
  const optionIds = col.optionIds || new Set()
  return mechanismPricesForTable(row.id).find(price =>
    (price.mechanism_option_id && optionIds.has(price.mechanism_option_id)) ||
    normKey(price.mechanism_label) === col.key ||
    normKey(price.price_key) === col.key
  ) || null
}

function finalMechanismRRP(row, price) {
  const value = Number(price?.rrp || 0)
  if (!price) return Number(row.base_rrp || 0)
  if (price.modifier_type === 'add') return Number(row.base_rrp || 0) + value
  return value
}

function mechanismPricesForTable(tableId) {
  return rrpMechanismPrices
    .filter(row => row.rule_id === tableId && row.is_active !== false)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || (a.mechanism_label || '').localeCompare(b.mechanism_label || ''))
}

function nodeById(id) {
  return rrpMasterNodes.find(node => node.id === id) || null
}

function parentOf(node) {
  return node?.parent_id ? nodeById(node.parent_id) : null
}

function masterPath(node) {
  if (!node) return ''
  const names = []
  let cur = node
  while (cur) {
    names.unshift(cur.name)
    cur = parentOf(cur)
  }
  return names.join(' > ')
}

function pageNameForNode(node) {
  let cur = node
  while (cur?.parent_id) cur = parentOf(cur)
  if (!cur?.page_id) return 'Unassigned'
  return rrpMasterPages.find(page => page.id === cur.page_id)?.name || 'Page'
}

function sortedMasterNodes() {
  return [...rrpMasterNodes].sort((a, b) =>
    pageNameForNode(a).localeCompare(pageNameForNode(b)) ||
    masterPath(a).localeCompare(masterPath(b))
  )
}

function mechanismOptionById(id) {
  return rrpMechanismOptions.find(option => option.id === id) || null
}

function mechanismGroupName(option) {
  const group = rrpMechanismGroups.find(item => item.id === option?.group_id)
  return group?.name || 'Mechanism'
}

function masterOptionsHtml(selectedId = '') {
  return sortedMasterNodes().map(node => `
    <option value="${esc(node.id)}" ${node.id === selectedId ? 'selected' : ''}>${esc(pageNameForNode(node))} / ${esc(masterPath(node))}</option>
  `).join('')
}

function mechanismOptionOptionsHtml(selectedId = '') {
  const active = rrpMechanismOptions.filter(option => option.is_active !== false)
  return '<option value="">Manual mechanism name</option>' + active.map(option => `
    <option value="${esc(option.id)}" ${option.id === selectedId ? 'selected' : ''}>${esc(mechanismGroupName(option))} / ${esc(option.name)}</option>
  `).join('')
}

function openRRPRuleModal(tableId = '') {
  const table = rrpTables.find(item => item.id === tableId) || null
  if (!activePriceBookId) return toast('RRP setup is not ready yet. Refresh and try again.', 'error')
  openModal(table ? 'Edit RRP Table' : 'Create RRP Table', `
    <div id="rrp-rule-alert" class="alert alert-error"></div>
    <div class="form-group">
      <label>Linked Master <span style="color:#ef4444">*</span></label>
      <select id="rrp-rule-master">${masterOptionsHtml(table?.master_node_id || '')}</select>
    </div>
    <div class="form-row cols-2">
      <div class="form-group"><label>Table Name</label><input id="rrp-rule-label" value="${esc(table?.label || '')}" placeholder="Auto from master if blank"></div>
      <div class="form-group">
        <label>Pricing Basis</label>
        <select id="rrp-rule-basis">
          ${['sqm', 'running_m', 'piece', 'fixed'].map(basis => `<option value="${basis}" ${basis === (table?.pricing_basis || 'sqm') ? 'selected' : ''}>${labelPricingBasis(basis)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row cols-3">
      <div class="form-group"><label>RRP</label><input id="rrp-rule-base" type="number" min="0" step="0.01" value="${esc(table?.base_rrp ?? '')}"></div>
      <div class="form-group"><label>DP</label><input id="rrp-rule-dp" type="number" min="0" step="0.01" value="${esc(table?.dealer_price ?? '')}" placeholder="Auto RRP / 2"></div>
      <div class="form-group"><label>Minimum Charge</label><input id="rrp-rule-min" type="number" min="0" step="0.01" value="${esc(table?.min_charge ?? '')}"></div>
    </div>
    <div class="form-row cols-3">
      <div class="form-group"><label>Max Width (cm)</label><input id="rrp-rule-width" type="number" min="0" step="0.01" value="${esc(table?.width_max_cm ?? '')}"></div>
      <div class="form-group"><label>UOM</label><input id="rrp-rule-uom" value="${esc(table?.uom || 'SQM')}"></div>
      <div class="form-group"><label>Priority</label><input id="rrp-rule-priority" type="number" step="1" value="${esc(table?.priority ?? 100)}"></div>
    </div>
    <div class="form-group"><label>Notes</label><textarea id="rrp-rule-notes" rows="3">${esc(table?.notes || '')}</textarea></div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="rrp-rule-save" onclick="saveRRPRule('${escAttr(tableId)}')">${table ? 'Save Changes' : 'Create RRP Table'}</button>
    </div>
  `)
}

async function saveRRPRule(tableId = '') {
  hideAlert('rrp-rule-alert')
  const masterId = val('rrp-rule-master')
  const node = nodeById(masterId)
  if (!activePriceBookId) return showAlert('rrp-rule-alert', 'RRP setup is not ready. Refresh and try again.')
  if (!node) return showAlert('rrp-rule-alert', 'Select a linked master')
  const label = val('rrp-rule-label').trim() || node.name
  const base = selectedNumber('rrp-rule-base')
  const dealer = selectedNumber('rrp-rule-dp')
  const payload = {
    price_book_id: activePriceBookId,
    master_node_id: masterId,
    label,
    normalized_label: normalizedName(label),
    pricing_basis: val('rrp-rule-basis') || 'sqm',
    uom: val('rrp-rule-uom').trim() || 'SQM',
    base_rrp: base,
    dealer_price: dealer,
    min_charge: selectedNumber('rrp-rule-min'),
    width_max_cm: selectedNumber('rrp-rule-width'),
    priority: Number(val('rrp-rule-priority') || 100),
    notes: val('rrp-rule-notes').trim() || null,
    is_active: true,
  }
  disable('rrp-rule-save')
  try {
    const query = tableId
      ? db.from('rrp_rules').update(payload).eq('id', tableId)
      : db.from('rrp_rules').insert(payload)
    const { error } = await query
    if (error) throw error
    toast(tableId ? 'RRP table updated' : 'RRP table created')
    closeModal()
    await loadRRP()
  } catch (err) {
    showAlert('rrp-rule-alert', err.message || String(err))
  } finally {
    disable('rrp-rule-save', false)
  }
}

async function deleteRRPRule(tableId) {
  const table = rrpTables.find(item => item.id === tableId)
  if (!table) return
  if (!confirm(`Delete RRP table "${table.label}"? Mechanism prices under it will also be deleted.`)) return
  try {
    const { error } = await db.from('rrp_rules').delete().eq('id', tableId)
    if (error) throw error
    toast('RRP table deleted')
    await loadRRP()
  } catch (err) {
    toast(err.message || 'Failed to delete RRP table', 'error')
  }
}

function openMechanismPriceModal(tableId, priceId = '', presetLabel = '', presetOptionId = '') {
  const table = rrpTables.find(item => item.id === tableId)
  const row = rrpMechanismPrices.find(item => item.id === priceId) || null
  if (!table) return
  const mechanismLabel = row?.mechanism_label || presetLabel || ''
  const mechanismOptionId = row?.mechanism_option_id || presetOptionId || ''
  openModal(row ? 'Edit Mechanism RRP' : 'Add Mechanism RRP', `
    <div id="rrp-mech-price-alert" class="alert alert-error"></div>
    <div class="form-group">
      <label>RRP Table</label>
      <input value="${esc(table.label)}" disabled>
    </div>
    <div class="form-group">
      <label>Mechanism</label>
      <select id="rrp-mech-option" onchange="prefillMechanismLabel()">${mechanismOptionOptionsHtml(mechanismOptionId)}</select>
    </div>
    <div class="form-row cols-2">
      <div class="form-group"><label>Mechanism Name <span style="color:#ef4444">*</span></label><input id="rrp-mech-label" value="${esc(mechanismLabel)}" placeholder="With Decorative Cassette"></div>
      <div class="form-group"><label>Match Key</label><input id="rrp-mech-key" value="${esc(row?.price_key || '')}" placeholder="Optional alternate name"></div>
    </div>
    <div class="form-row cols-3">
      <div class="form-group">
        <label>How To Apply</label>
        <select id="rrp-mech-type">
          <option value="override" ${row?.modifier_type === 'add' ? '' : 'selected'}>Use this as final RRP</option>
          <option value="add" ${row?.modifier_type === 'add' ? 'selected' : ''}>Add to base RRP</option>
        </select>
      </div>
      <div class="form-group"><label>RRP <span style="color:#ef4444">*</span></label><input id="rrp-mech-rrp" type="number" min="0" step="0.01" value="${esc(row?.rrp ?? '')}"></div>
      <div class="form-group"><label>DP</label><input id="rrp-mech-dp" type="number" min="0" step="0.01" value="${esc(row?.dealer_price ?? '')}" placeholder="Auto RRP / 2"></div>
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="rrp-mech-save" onclick="saveMechanismPrice('${escAttr(tableId)}','${escAttr(priceId)}')">${row ? 'Save Changes' : 'Add Mechanism RRP'}</button>
    </div>
  `)
}

function prefillMechanismLabel() {
  const option = mechanismOptionById(val('rrp-mech-option'))
  if (!option) return
  const labelEl = document.getElementById('rrp-mech-label')
  const keyEl = document.getElementById('rrp-mech-key')
  if (labelEl && !labelEl.value) labelEl.value = option.name
  if (keyEl && !keyEl.value) keyEl.value = option.price_key || option.source_label || option.name
}

async function saveMechanismPrice(tableId, priceId = '') {
  hideAlert('rrp-mech-price-alert')
  const label = val('rrp-mech-label').trim()
  const rrp = selectedNumber('rrp-mech-rrp')
  if (!label) return showAlert('rrp-mech-price-alert', 'Mechanism name is required')
  if (rrp == null || rrp < 0) return showAlert('rrp-mech-price-alert', 'RRP is required')
  const payload = {
    rule_id: tableId,
    mechanism_option_id: val('rrp-mech-option') || null,
    mechanism_label: label,
    normalized_mechanism_label: normalizedName(label),
    price_key: val('rrp-mech-key').trim() || null,
    modifier_type: val('rrp-mech-type') || 'override',
    rrp,
    dealer_price: selectedNumber('rrp-mech-dp'),
    is_active: true,
  }
  disable('rrp-mech-save')
  try {
    const query = priceId
      ? db.from('rrp_rule_mechanism_prices').update(payload).eq('id', priceId)
      : db.from('rrp_rule_mechanism_prices').insert(payload)
    const { error } = await query
    if (error) throw error
    toast(priceId ? 'Mechanism RRP updated' : 'Mechanism RRP added')
    closeModal()
    await loadRRP()
  } catch (err) {
    showAlert('rrp-mech-price-alert', err.message || String(err))
  } finally {
    disable('rrp-mech-save', false)
  }
}

async function deleteMechanismPrice(priceId) {
  const row = rrpMechanismPrices.find(item => item.id === priceId)
  if (!row) return
  if (!confirm(`Delete mechanism RRP "${row.mechanism_label}"?`)) return
  try {
    const { error } = await db.from('rrp_rule_mechanism_prices').delete().eq('id', priceId)
    if (error) throw error
    toast('Mechanism RRP deleted')
    await loadRRP()
  } catch (err) {
    toast(err.message || 'Failed to delete mechanism RRP', 'error')
  }
}

function labelPricingBasis(basis) {
  return { sqm: 'SQM', running_m: 'Running meter', piece: 'Piece', fixed: 'Fixed' }[basis] || basis || 'SQM'
}

function fmtMoneyPlain(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '-'
  return `Rs ${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function defaultDP(value) {
  return Number(value || 0) ? Number(value) / 2 : null
}

function normalizedName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function normKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function selectedNumber(id) {
  const raw = val(id)
  if (raw === '') return null
  const num = Number(raw)
  return Number.isFinite(num) ? num : null
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escAttr(s) {
  return esc(s).replace(/'/g, '&#39;')
}

init()
