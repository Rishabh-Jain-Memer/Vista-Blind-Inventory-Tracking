/*
  Dashboard page controller.
  Shows operational statistics only: order status, tickets, and inventory health.
*/

async function init() {
  const profile = await initSidebar()
  if (!profile) return

  const name = profile.full_name?.split(' ')[0] || 'there'
  text('greeting', `Good day, ${name}`)

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [ordersRes, lowRes, ticketsRes, recentRes] = await Promise.all([
    db.from('orders')
      .select('id, order_uid, dealer_name, customer_name, created_at, order_date, executed_at, status, customers!cust_id(name)')
      .is('deleted_at', null),
    db.from('inv_rolls')
      .select('id, batch_code, remaining_length, original_length, unit, inv_variants(name, width_m, unit)')
      .eq('status', 'in_stock')
      .lt('remaining_length', 5)
      .order('remaining_length')
      .limit(8),
    db.from('order_tickets')
      .select('id, status')
      .eq('status', 'active'),
    db.from('orders')
      .select('id, order_uid, dealer_name, customer_name, created_at, order_date, status, customers!cust_id(name)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  if (ordersRes.error) { toast(ordersRes.error.message, 'error'); return finish() }
  if (lowRes.error) console.warn('Low inventory query failed:', lowRes.error.message)
  if (ticketsRes.error) console.warn('Open tickets query failed:', ticketsRes.error.message)
  if (recentRes.error) console.warn('Recent orders query failed:', recentRes.error.message)

  const orders = ordersRes.data || []
  const activeOrders = orders.filter(o => isActiveOrder(orderStatus(o)))
  const completedThisMonth = orders.filter(o => {
    if (orderStatus(o) !== 'completed') return false
    const date = new Date(o.executed_at || o.order_date || o.created_at)
    return !isNaN(date) && date >= monthStart
  })
  const productionOrders = orders.filter(o => ['processing', 'executed'].includes(orderStatus(o)))
  const lowRolls = lowRes.data || []
  const openTickets = ticketsRes.data || []

  text('s-active-orders', activeOrders.length)
  text('s-completed-month', completedThisMonth.length)
  text('s-production', productionOrders.length)
  text('s-open-tickets', openTickets.length)
  text('s-low', lowRolls.length)
  if (!lowRolls.length) {
    const icon = document.getElementById('s-low-icon')
    if (icon) icon.className = 'stat-icon icon-green'
  }

  renderRecentOrders(recentRes.data || [])
  renderLowStock(lowRolls)
  finish()
}

function finish() {
  hide('loading')
  show('content')
}

function orderStatus(o) {
  const s = String(o?.status || '').toLowerCase()
  if (s === 'discussing' || s === 'pending' || s === 'inquiry') return 'active'
  if (s === 'in progress') return 'processing'
  return s
}

function isActiveOrder(status) {
  return !['completed', 'cancelled', 'canceled'].includes(status)
}

function renderRecentOrders(orders) {
  html('recent-orders', !orders.length
    ? '<tr><td colspan="4" class="empty-state">No orders yet</td></tr>'
    : orders.map(o => {
        const customer = o.customer_name || o.customers?.name || o.dealer_name || '-'
        const uid = o.order_uid || ('#' + o.id.substring(0, 8).toUpperCase())
        const status = orderStatus(o)
        return `
        <tr>
          <td><a href="order-detail.html?id=${o.id}" class="link" style="font-family:monospace">${esc(uid)}</a></td>
          <td class="fw-600">${esc(customer)}</td>
          <td class="text-muted">${fmtDate(o.order_date || o.created_at)}</td>
          <td>${badge(status)}</td>
        </tr>`
      }).join(''))
}

function renderLowStock(lowRolls) {
  html('low-stock-list', !lowRolls.length
    ? '<div class="empty-state">Inventory is currently healthy</div>'
    : lowRolls.map(r => {
        const pct = Number(r.original_length || 0) > 0
          ? Math.max(0, Math.min(100, (Number(r.remaining_length || 0) / Number(r.original_length || 0)) * 100))
          : 0
        const cls = pct < 20 ? 'fill-red' : 'fill-amber'
        return `
          <div class="inventory-alert-row">
            <div class="fw-600 text-sm">${esc(r.batch_code || 'Stock row')}</div>
            <div class="text-xs text-muted mb-1">${esc(r.inv_variants?.name || '')}</div>
            <div style="display:flex;align-items:center;gap:.75rem">
              <div class="progress" style="flex:1"><div class="progress-fill ${cls}" style="width:${pct.toFixed(0)}%"></div></div>
              <span class="text-xs" style="color:${pct < 20 ? '#dc2626' : '#b45309'};font-weight:700">${Number(r.remaining_length || 0).toFixed(2)} ${esc(r.unit || 'm')} left</span>
            </div>
          </div>`
      }).join(''))
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

init()
