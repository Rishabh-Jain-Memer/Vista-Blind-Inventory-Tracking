/*
  Orders list controller.
  Handles order search/filter/export, and applies role-specific presentation so
  sales users can see active order flow without financial columns.
*/

function openCreateOrderPanel() {
  window.location.href = 'create.html?tab=order'
}

function openCreateStockOrderPanel() {
  window.location.href = 'create.html?tab=stock'
}

function closeCreateOrderPanel() {
  window.location.href = 'orders.html'
}

let isAdminOrStaff = false
let isAdmin = false
let isSales = false
let currentProfile = null
let allOrders = []
let filteredOrders = []
let allStockOrders = []
let filteredStockOrders = []
let currentOrdersTab = 'sales'
let showDeleted = false
let profileCustomerFilter = null

function orderDisplayDate(o) {
  return o.order_date || o.created_at
}

function orderStatus(o) {
  const s = String(o?.status || '').toLowerCase()
  if (s === 'discussing' || s === 'pending') return 'inquiry'
  if (s === 'in progress') return 'processing'
  return s
}

function stockOrderDisplayDate(o) {
  return o.created_at || o.bill_date
}

async function init() {
  const profile = await initSidebar()
  if (!profile) return
  currentProfile = profile
  isAdminOrStaff = profile.role === 'admin'
  isAdmin = profile.role === 'admin'
  isSales = profile.role === 'sales'
  profileCustomerFilter = new URLSearchParams(window.location.search).get('cust')

  document.getElementById('search-input').addEventListener('input', renderOrders)
  document.getElementById('status-filter').addEventListener('change', renderOrders)
  document.getElementById('date-from').addEventListener('change', renderOrders)
  document.getElementById('date-to').addEventListener('change', renderOrders)
  document.getElementById('month-filter')?.addEventListener('change', renderOrders)
  document.getElementById('sort-filter')?.addEventListener('change', renderOrders)

  if (!isAdmin) document.getElementById('deleted-toggle-btn')?.remove()
  if (!isAdmin) {
    document.getElementById('new-stock-order-btn')?.remove()
    document.getElementById('orders-tab-strip')?.remove()
  }
  if (isSales) {
    document.getElementById('orders-th-total')?.remove()
    document.getElementById('orders-th-cost')?.remove()
    document.getElementById('orders-th-profit')?.remove()
    document.getElementById('orders-export-btn')?.remove()
  }

  await loadOrders()
  const requestedTab = new URLSearchParams(window.location.search).get('tab')
  if (requestedTab === 'stock' && isAdmin) switchOrdersTab('stock')
  hide('loading')
  show('content')
}

async function loadOrders() {
  const withInvoiceSelect = 'id, order_uid, dealer_name, customer_name, source, source_order_no, source_bill_no, invoice_number, invoice_date, status, total_amount, cost_amount, notes, order_date, created_at, deleted_at, cust_id, customer_id, customers!cust_id(name, phone), order_components(id, deducted, actual_qty, planned_qty)'
  const fallbackSelect = 'id, order_uid, dealer_name, customer_name, source, source_order_no, source_bill_no, status, total_amount, cost_amount, notes, order_date, created_at, deleted_at, cust_id, customer_id, customers!cust_id(name, phone), order_components(id, deducted, actual_qty, planned_qty)'
  let query = db
    .from('orders')
    .select(withInvoiceSelect)
    .order('order_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (!showDeleted) query = query.is('deleted_at', null)

  let { data, error } = await query
  if (error && /invoice_number|invoice_date/i.test(error.message || '')) {
    query = db
      .from('orders')
      .select(fallbackSelect)
      .order('order_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (!showDeleted) query = query.is('deleted_at', null)
    ;({ data, error } = await query)
  }
  if (error) { toast(error.message, 'error'); return }
  allOrders = data ?? []
  if (isAdmin) await loadStockOrders()
  populateMonthFilter()
  renderOrders()
}

async function loadStockOrders() {
  let query = db
    .from('stock_orders')
    .select('id, stock_order_uid, supplier_name, bill_no, bill_date, notes, status, total_amount, created_at, received_at, deleted_at')
    .order('created_at', { ascending: false })
  if (!showDeleted) query = query.is('deleted_at', null)
  const { data, error } = await query
  if (error) {
    toast(error.message, 'error')
    allStockOrders = []
    return
  }
  allStockOrders = data || []
}

function switchOrdersTab(tab) {
  if (tab === 'stock' && !isAdmin) return
  currentOrdersTab = tab === 'stock' ? 'stock' : 'sales'
  document.getElementById('orders-tab-sales')?.classList.toggle('active', currentOrdersTab === 'sales')
  document.getElementById('orders-tab-stock')?.classList.toggle('active', currentOrdersTab === 'stock')
  const salesCard = document.getElementById('sales-orders-card')
  const stockCard = document.getElementById('stock-orders-card')
  if (salesCard) salesCard.style.display = currentOrdersTab === 'sales' ? '' : 'none'
  if (stockCard) stockCard.style.display = currentOrdersTab === 'stock' ? '' : 'none'
  configureFiltersForCurrentTab()
  populateMonthFilter()
  renderOrders()
  const url = new URL(window.location.href)
  url.searchParams.set('tab', currentOrdersTab)
  window.history.replaceState(null, '', url.toString())
}

function configureFiltersForCurrentTab() {
  const search = document.getElementById('search-input')
  const status = document.getElementById('status-filter')
  const sort = document.getElementById('sort-filter')
  if (search) search.placeholder = currentOrdersTab === 'stock'
    ? 'Search stock orders, supplier, bill...'
    : 'Search orders, customer, dealer...'
  if (status) {
    const current = status.value
    status.innerHTML = currentOrdersTab === 'stock'
      ? '<option value="">All Statuses</option><option value="pending">Pending</option><option value="received">Received</option><option value="cancelled">Cancelled</option>'
      : '<option value="">All Statuses</option><option value="inquiry">Inquiry</option><option value="processing">Processing</option><option value="executed">Executed</option><option value="completed">Completed</option>'
    if ([...status.options].some(opt => opt.value === current)) status.value = current
  }
  if (sort && currentOrdersTab === 'stock' && sort.value.startsWith('total-')) return
}

function populateMonthFilter() {
  const sel = document.getElementById('month-filter')
  if (!sel) return
  const current = sel.value
  const source = currentOrdersTab === 'stock' ? allStockOrders : allOrders
  const dateFn = currentOrdersTab === 'stock' ? stockOrderDisplayDate : orderDisplayDate
  const months = [...new Set(source
    .map(o => String(dateFn(o) || '').slice(0, 7))
    .filter(Boolean))]
    .sort()
    .reverse()
  sel.innerHTML = '<option value="">All Months</option>' + months
    .map(m => `<option value="${m}">${new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</option>`)
    .join('')
  if (months.includes(current)) sel.value = current
}

function toggleDeleted() {
  showDeleted = !showDeleted
  const btn = document.getElementById('deleted-toggle-btn')
  if (btn) {
    btn.innerHTML = showDeleted
      ? '<i class="fa-solid fa-eye-slash"></i> Hide Deleted'
      : '<i class="fa-solid fa-trash-restore"></i> Show Deleted'
    btn.style.background = showDeleted ? '#fef2f2' : ''
    btn.style.borderColor = showDeleted ? '#fca5a5' : ''
    btn.style.color = showDeleted ? '#dc2626' : ''
  }
  loadOrders()
}

function renderOrders() {
  if (currentOrdersTab === 'stock') {
    renderStockOrders()
    return
  }
  const search = val('search-input')
  const status = val('status-filter')
  const dateFrom = document.getElementById('date-from').value
  const dateTo = document.getElementById('date-to').value
  const month = document.getElementById('month-filter')?.value || ''
  const sortMode = document.getElementById('sort-filter')?.value || 'date-desc'

  let filtered = allOrders.filter(o => {
    const displayDate = orderDisplayDate(o) || ''
    if (profileCustomerFilter && o.cust_id !== profileCustomerFilter) return false
    if (status && orderStatus(o) !== status) return false
    if (month && !String(displayDate).startsWith(month)) return false
    if (dateFrom && displayDate < dateFrom) return false
    if (dateTo && displayDate > dateTo + 'T23:59:59') return false
    return true
  })

  if (search) {
    filtered = fuzzyFilter(filtered, search, o => {
      const customer = o.customers?.name || o.customer_name || o.dealer_name || ''
      return `${o.id} ${o.order_uid || ''} ${o.dealer_name || ''} ${customer} ${o.source_bill_no || ''}`
    })
  }

  filtered.sort((a, b) => {
    const dateA = new Date(orderDisplayDate(a) || a.created_at || 0).getTime()
    const dateB = new Date(orderDisplayDate(b) || b.created_at || 0).getTime()
    if (sortMode === 'date-asc') return dateA - dateB
    if (sortMode === 'month-desc') return String(orderDisplayDate(b) || '').slice(0, 7).localeCompare(String(orderDisplayDate(a) || '').slice(0, 7)) || dateB - dateA
    if (sortMode === 'month-asc') return String(orderDisplayDate(a) || '').slice(0, 7).localeCompare(String(orderDisplayDate(b) || '').slice(0, 7)) || dateA - dateB
    if (sortMode === 'total-desc') return Number(b.total_amount || 0) - Number(a.total_amount || 0)
    if (sortMode === 'total-asc') return Number(a.total_amount || 0) - Number(b.total_amount || 0)
    return dateB - dateA
  })

  filteredOrders = filtered
  const totalLabel = showDeleted ? 'order (incl. deleted)' : 'order'
  text('order-count', `${filtered.length} of ${allOrders.length} ${totalLabel}${allOrders.length !== 1 ? 's' : ''}`)

  const colspan = isSales ? 7 : 10
  html('orders-body', !filtered.length
    ? `<tr><td colspan="${colspan}" class="empty-state">No orders found. <a href="create.html?tab=order" class="link">Create your first order</a></td></tr>`
    : filtered.map(o => renderOrderRow(o)).join(''))
}

function renderStockOrders() {
  const search = val('search-input')
  const status = val('status-filter')
  const dateFrom = document.getElementById('date-from').value
  const dateTo = document.getElementById('date-to').value
  const month = document.getElementById('month-filter')?.value || ''
  const sortMode = document.getElementById('sort-filter')?.value || 'date-desc'

  let filtered = allStockOrders.filter(o => {
    const displayDate = stockOrderDisplayDate(o) || ''
    if (status && String(o.status || '').toLowerCase() !== status) return false
    if (month && !String(displayDate).startsWith(month)) return false
    if (dateFrom && displayDate < dateFrom) return false
    if (dateTo && displayDate > dateTo + 'T23:59:59') return false
    return true
  })

  if (search) {
    filtered = fuzzyFilter(filtered, search, o =>
      `${o.id} ${o.stock_order_uid || ''} ${o.supplier_name || ''} ${o.bill_no || ''} ${o.notes || ''}`
    )
  }

  filtered.sort((a, b) => {
    const dateA = new Date(stockOrderDisplayDate(a) || 0).getTime()
    const dateB = new Date(stockOrderDisplayDate(b) || 0).getTime()
    if (sortMode === 'date-asc') return dateA - dateB
    if (sortMode === 'month-desc') return String(stockOrderDisplayDate(b) || '').slice(0, 7).localeCompare(String(stockOrderDisplayDate(a) || '').slice(0, 7)) || dateB - dateA
    if (sortMode === 'month-asc') return String(stockOrderDisplayDate(a) || '').slice(0, 7).localeCompare(String(stockOrderDisplayDate(b) || '').slice(0, 7)) || dateA - dateB
    if (sortMode === 'total-desc') return Number(b.total_amount || 0) - Number(a.total_amount || 0)
    if (sortMode === 'total-asc') return Number(a.total_amount || 0) - Number(b.total_amount || 0)
    return dateB - dateA
  })

  filteredStockOrders = filtered
  const totalLabel = showDeleted ? 'stock order (incl. deleted)' : 'stock order'
  text('order-count', `${filtered.length} of ${allStockOrders.length} ${totalLabel}${allStockOrders.length !== 1 ? 's' : ''}`)
  html('stock-orders-body', !filtered.length
    ? '<tr><td colspan="7" class="empty-state">No stock orders found. <a href="create.html?tab=stock" class="link">Create your first stock order</a></td></tr>'
    : filtered.map(renderStockOrderRow).join(''))
}

function renderStockOrderRow(o) {
  const uid = o.stock_order_uid || ('#' + o.id.substring(0, 8).toUpperCase())
  const isDeleted = !!o.deleted_at
  const actions = isDeleted
    ? `<button class="btn btn-ghost btn-sm" style="color:#059669" onclick="restoreStockOrder('${o.id}','${esc(uid)}')" title="Restore stock order">
        <i class="fa-solid fa-trash-restore"></i>
      </button>`
    : `<button class="btn btn-ghost btn-sm" onclick="window.location.href='stock-order-detail.html?id=${o.id}'" title="View">
        <i class="fa-solid fa-pen"></i>
      </button>
      <button class="btn btn-ghost btn-sm" style="color:#ef4444" onclick="deleteStockOrder('${o.id}','${esc(uid)}')" title="Delete">
        <i class="fa-solid fa-trash"></i>
      </button>`
  return `<tr class="${isDeleted ? 'order-row-deleted' : ''}">
    <td>
      <a href="stock-order-detail.html?id=${o.id}" class="link fw-600" style="font-family:monospace">${esc(uid)}</a>
      <div class="text-xs text-muted">${fmtDateTime(o.created_at)}</div>
      ${isDeleted ? `<div class="text-xs" style="color:#ef4444;font-style:italic;">Deleted ${fmtDate(o.deleted_at)}</div>` : ''}
    </td>
    <td class="fw-600">${esc(o.supplier_name || '-')}</td>
    <td>
      <div>${esc(o.bill_no || '-')}</div>
      <div class="text-xs text-muted">${esc(o.notes || '')}</div>
    </td>
    <td class="text-muted">${fmtDateTime(stockOrderDisplayDate(o))}</td>
    <td>${badge(o.status || 'pending')}</td>
    <td class="tr fw-600">${fmt$(o.total_amount || 0)}</td>
    <td style="text-align:right;white-space:nowrap;">${actions}</td>
  </tr>`
}

function renderOrderRow(o) {
  const custName = o.customers?.name || o.customer_name || o.dealer_name || '-'
  const uid = o.order_uid || ('#' + o.id.substring(0, 8).toUpperCase())
  const isDeleted = !!o.deleted_at
  const status = orderStatus(o)
  const displayDate = orderDisplayDate(o)
  const showFinancials = !isSales && status !== 'cancelled' && !isDeleted
  const costAmount = Number(o.cost_amount || 0)
  const sellingPrice = Number(o.total_amount || 0)
  const netProfit = sellingPrice - costAmount
  const compStatus = componentStatusBadge(o.order_components || [])

  const actionBtns = isDeleted
    ? (isAdmin ? `
        <button class="btn btn-ghost btn-sm" style="color:#059669" onclick="restoreOrder('${o.id}','${esc(custName)}')" title="Restore order">
          <i class="fa-solid fa-trash-restore"></i>
        </button>
        <button class="btn btn-ghost btn-sm" style="color:#ef4444" onclick="permanentDeleteOrder('${o.id}','${esc(custName)}')" title="Permanently delete">
          <i class="fa-solid fa-trash"></i>
        </button>` : '')
    : `${(isAdminOrStaff || isSales) ? `<button class="btn btn-ghost btn-sm" onclick="window.location.href='order-detail.html?id=${o.id}'" title="View${isAdminOrStaff ? '/Edit' : ''}">
          <i class="fa-solid fa-pen"></i>
        </button>` : ''}
       ${isAdmin ? `<button class="btn btn-ghost btn-sm" style="color:#ef4444" onclick="deleteOrder('${o.id}','${esc(custName)}')" title="Delete">
          <i class="fa-solid fa-trash"></i>
        </button>` : ''}`

  const moneyCells = isSales ? '' : `
    <td class="tr fw-600">${fmt$(sellingPrice)}</td>
    <td class="tr" style="color:#64748b;">${showFinancials ? fmt$(costAmount) : '<span style="color:#cbd5e1;">-</span>'}</td>
    <td class="tr fw-600" style="color:${showFinancials ? (netProfit >= 0 ? '#059669' : '#ef4444') : '#cbd5e1'};">${showFinancials ? fmt$(netProfit) : '-'}</td>
  `

  return `<tr class="${isDeleted ? 'order-row-deleted' : ''}">
    <td>
      <a href="order-detail.html?id=${o.id}" class="link fw-600" style="font-family:monospace">${esc(uid)}</a>
      <div class="text-xs text-muted">${fmtDate(displayDate)}</div>
      ${isDeleted ? `<div class="text-xs" style="color:#ef4444;font-style:italic;">Deleted ${fmtDate(o.deleted_at)}</div>` : ''}
    </td>
    <td>
      <div class="fw-600">${esc(custName)}</div>
      ${o.customers?.phone ? `<div class="text-xs text-muted">${esc(o.customers.phone)}</div>` : ''}
      ${o.invoice_number ? `<div class="text-xs text-muted">Invoice: ${esc(o.invoice_number)}${o.invoice_date ? ` · ${fmtDate(o.invoice_date)}` : ''}</div>` : ''}
    </td>
    <td class="text-muted text-xs">${esc(o.notes || '-')}</td>
    <td class="text-muted">${fmtDateTime(displayDate)}</td>
    <td>${badge(status)}</td>
    <td>${compStatus}</td>
    ${moneyCells}
    <td style="text-align:right;white-space:nowrap;">${actionBtns}</td>
  </tr>`
}

function componentStatusBadge(components) {
  if (!components.length) return '<span class="text-xs" style="color:#94a3b8;">No components</span>'
  const done = components.filter(c => c.deducted).length
  const confirmed = components.filter(c => c.actual_qty != null).length
  const total = components.length
  if (done === total) return `<span class="badge badge-success">${done}/${total} deducted</span>`
  if (confirmed > 0) return `<span class="badge badge-warning">${confirmed}/${total} confirmed</span>`
  return `<span class="badge badge-processing">0/${total} pending</span>`
}

async function deleteOrder(id, label) {
  if (!confirm(`Delete order "${label}"?\n\nThe order will be hidden but can be restored from "Show Deleted". Inventory is NOT affected.`)) return
  const { error } = await db.from('orders').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) { toast(error.message, 'error'); return }
  await logActivity('delete', 'order', id, label)
  toast('Order deleted (can be restored)')
  await loadOrders()
}

async function restoreOrder(id, label) {
  if (!confirm(`Restore order "${label}"?`)) return
  const { error } = await db.from('orders').update({ deleted_at: null }).eq('id', id)
  if (error) { toast(error.message, 'error'); return }
  await logActivity('restore', 'order', id, label)
  toast('Order restored')
  await loadOrders()
}

async function permanentDeleteOrder(id, label) {
  if (!confirm(`PERMANENTLY delete order "${label}"?\n\nThis cannot be undone. All items and components will be removed.`)) return
  const { error } = await db.from('orders').delete().eq('id', id)
  if (error) { toast(error.message, 'error'); return }
  await logActivity('permanent_delete', 'order', id, label)
  toast('Order permanently deleted')
  await loadOrders()
}

async function deleteStockOrder(id, label) {
  if (!confirm(`Delete stock order "${label}"?\n\nThis hides the stock order from the list. If it was already received, inventory is NOT reversed.`)) return
  const { error } = await db.from('stock_orders').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) { toast(error.message, 'error'); return }
  await logActivity('delete', 'stock_order', id, label)
  toast('Stock order deleted (can be restored)')
  await loadOrders()
}

async function restoreStockOrder(id, label) {
  if (!confirm(`Restore stock order "${label}"?`)) return
  const { error } = await db.from('stock_orders').update({ deleted_at: null }).eq('id', id)
  if (error) { toast(error.message, 'error'); return }
  await logActivity('restore', 'stock_order', id, label)
  toast('Stock order restored')
  await loadOrders()
}

function downloadOrdersReport() {
  if (currentOrdersTab === 'stock') {
    downloadStockOrdersReport()
    return
  }
  const orders = filteredOrders.length ? filteredOrders : allOrders
  if (!orders.length) { toast('No orders to export', 'error'); return }

  const rows = [['Order UID', 'Customer Name', 'Phone', 'Notes', 'Status', 'Date & Time']]
  if (!isSales) rows[0].push('Total (INR)')

  for (const o of orders) {
    const custName = o.customers?.name || o.customer_name || o.dealer_name || ''
    const row = [
      o.order_uid || ('#' + o.id.substring(0, 8)),
      custName,
      o.customers?.phone || '',
      o.notes || '',
      o.status || '',
      fmtDateTime(orderDisplayDate(o)),
    ]
    if (!isSales) row.push(Number(o.total_amount || 0))
    rows.push(row)
  }

  const ok = exportWorkbook([
    { name: 'Orders', rows, cols: rows[0].map(() => ({ wch: 22 })) },
  ], `Vista-Orders-${todayStamp()}.xlsx`)
  if (ok) toast('Excel exported')
}

function downloadStockOrdersReport() {
  const orders = filteredStockOrders.length ? filteredStockOrders : allStockOrders
  if (!orders.length) { toast('No stock orders to export', 'error'); return }

  const rows = [['Stock Order UID', 'Supplier', 'Bill No', 'Bill Date', 'Status', 'Created At', 'Received At', 'Total (INR)', 'Notes']]
  for (const o of orders) {
    rows.push([
      o.stock_order_uid || ('#' + o.id.substring(0, 8)),
      o.supplier_name || '',
      o.bill_no || '',
      o.bill_date || '',
      o.status || '',
      fmtDateTime(o.created_at),
      o.received_at ? fmtDateTime(o.received_at) : '',
      Number(o.total_amount || 0),
      o.notes || '',
    ])
  }

  const ok = exportWorkbook([
    { name: 'Stock Orders', rows, cols: rows[0].map(() => ({ wch: 22 })) },
  ], `Vista-Stock-Orders-${todayStamp()}.xlsx`)
  if (ok) toast('Excel exported')
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

init()
