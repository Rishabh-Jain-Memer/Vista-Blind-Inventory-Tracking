/*
  Dashboard page controller.
  Loads high-level order revenue, low-stock alerts, recent orders, and summary
  cards from Supabase. This page should summarize data, not create its own
  inventory import or valuation rules.
*/

async function init() {
  const profile = await initSidebar();
  if (!profile) return;

  if (profile.role === 'customer') {
    window.location.href = 'customer-dashboard.html';
    return;
  }
  if (profile.role === 'executer') {
    window.location.href = 'executer-dashboard.html';
    return;
  }
  if (profile.role === 'sales') {
    window.location.href = 'orders.html';
    return;
  }

  const name = profile.full_name?.split(' ')[0] || 'there';
  text('greeting', `Good day, ${name} 👋`);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Parallel fetches — use new inv_rolls / inv_variants tables
  const [ordersRes, lowRes, recentRes] = await Promise.all([
    // Only count non-cancelled, non-deleted orders in revenue
    db.from('orders').select('total_amount, cost_amount, status')
      .gte('created_at', monthStart)
      .is('deleted_at', null),
    db.from('inv_rolls')
      .select('id, batch_code, remaining_length, original_length, unit, inv_variants(name, width_m)')
      .eq('status', 'in_stock')
      .lt('remaining_length', 5)
      .order('remaining_length')
      .limit(5),
    db.from('orders')
      .select('id, order_uid, dealer_name, customer_name, created_at, order_date, status, total_amount, customers!cust_id(name)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(6),
  ]);

  const orderStatus = o => {
    const s = String(o?.status || '').toLowerCase()
    if (s === 'discussing' || s === 'pending') return 'inquiry'
    if (s === 'in progress') return 'processing'
    return s
  }

  // Stats: all active orders count; financials match outward report completed orders.
  const monthOrders  = ordersRes.data ?? [];
  const activeOrders = monthOrders;
  const closedOrders = monthOrders.filter(o => orderStatus(o) === 'completed');
  const sellingTotal = closedOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const costTotal    = closedOrders.reduce((s, o) => s + Number(o.cost_amount  || 0), 0);
  const netProfit    = sellingTotal - costTotal;
  text('s-orders', activeOrders.length);
  text('s-revenue', fmtMoney(sellingTotal));
  text('s-cost', fmtMoney(costTotal));
  text('s-profit', fmtMoney(netProfit));

  const lowRolls = lowRes.data ?? [];
  text('s-low', lowRolls.length);
  if (lowRolls.length === 0) {
    const el = document.getElementById('s-low-icon');
    if (el) el.className = 'stat-icon icon-gray';
  }

  // Recent orders
  const orders = recentRes.data ?? [];
  html('recent-orders', orders.length === 0
    ? `<tr><td colspan="5" class="empty-state">No orders yet</td></tr>`
    : orders.map(o => {
        const customer = o.customer_name || o.customers?.name || o.dealer_name || '-';
        const uid = o.order_uid || ('#' + o.id.substring(0,8).toUpperCase())
        return `
        <tr>
          <td><a href="order-detail.html?id=${o.id}" class="link" style="font-family:monospace">${esc(uid)}</a></td>
          <td class="fw-600">${esc(o.dealer_name || customer)}</td>
          <td class="text-muted">${fmtDate(o.order_date || o.created_at)}</td>
          <td>${badge(orderStatus(o))}</td>
          <td class="tr fw-600">₹${o.total_amount.toFixed(2)}</td>
        </tr>`
      }).join(''));

  // Low stock rolls
  html('low-stock-list', lowRolls.length === 0
    ? `<div class="empty-state">All rolls well stocked ✓</div>`
    : lowRolls.map(r => {
        const pct = r.original_length > 0
          ? Math.max(0, Math.min(100, (Number(r.remaining_length) / Number(r.original_length)) * 100))
          : 0;
        const cls = pct < 20 ? 'fill-red' : 'fill-amber';
        return `
          <div style="padding:.9rem 1.25rem; border-bottom:1px solid #f1f5f9;">
            <div class="fw-600 text-sm">${esc(r.batch_code)}</div>
            <div class="text-xs text-muted mb-1">${esc(r.inv_variants?.name ?? '')}</div>
            <div style="display:flex;align-items:center;gap:.75rem">
              <div class="progress" style="flex:1"><div class="progress-fill ${cls}" style="width:${pct.toFixed(0)}%"></div></div>
              <span class="text-xs" style="color:#dc2626;font-weight:600">${Number(r.remaining_length).toFixed(2)} ${r.unit || 'm'} left</span>
            </div>
          </div>`
      }).join(''));

  hide('loading');
  show('content');
}

function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtMoney(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

init();
