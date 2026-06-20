/*
  Customer dashboard controller.
  Shows a customer's own orders and totals. Admin/staff users are redirected to
  the internal dashboard so customer-only logic stays separated.
*/

async function init() {
  const profile = await initSidebar();
  if (!profile) return;

  if (profile.role === 'admin') {
    window.location.href = 'dashboard.html';
    return;
  }

  const name = profile.full_name?.split(' ')[0] || 'there';
  text('greeting', `Welcome back, ${name} 👋`);

  // Parallel fetches for the current user's orders
  const [ordersRes] = await Promise.all([
    db.from('orders').select('id, dealer_name, created_at, order_date, status, total_amount').eq('customer_id', profile.id).order('created_at', { ascending: false })
  ]);

  const orders = ordersRes.data ?? [];
  const orderStatus = o => {
    const s = String(o?.status || '').toLowerCase()
    if (s === 'discussing' || s === 'pending') return 'inquiry'
    if (s === 'in progress') return 'processing'
    return s
  }

  const pending = orders.filter(o => ['inquiry', 'processing'].includes(orderStatus(o)));
  const completed = orders.filter(o => orderStatus(o) === 'completed');

  text('s-pending', pending.length);
  text('s-completed', completed.length);

  // Recent orders
  const recentOrders = orders.slice(0, 5);
  html('my-orders', recentOrders.length === 0
    ? `<tr><td colspan="5" class="empty-state">No orders yet. Place your first order today!</td></tr>`
    : recentOrders.map(o => `
        <tr>
          <td><a href="order-detail.html?id=${o.id}" class="link" style="font-family:monospace">#${o.id.substring(0,8)}</a></td>
          <td class="fw-600">${esc(o.dealer_name || '—')}</td>
          <td class="text-muted">${fmtDate(o.order_date || o.created_at)}</td>
          <td>${badge(orderStatus(o))}</td>
          <td class="tr fw-600">₹${o.total_amount.toFixed(2)}</td>
        </tr>`).join(''));

  hide('loading');
  show('content');
}

function esc(s) { return (s || '').replace(/'/g, "\\'").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

init();
