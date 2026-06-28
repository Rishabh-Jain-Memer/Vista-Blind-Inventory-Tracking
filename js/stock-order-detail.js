let currentProfile = null
let stockOrder = null
let stockItems = []
let stockDownloads = []

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function nl2br(s) {
  return esc(s).replace(/\n/g, '<br>')
}

function fieldLabel(label, value) {
  return `<div class="info-item"><div class="info-label">${esc(label)}</div><div class="info-value">${nl2br(value || '-')}</div></div>`
}

function displayDate(s) {
  return s ? fmtDate(s) : '-'
}

async function init() {
  const profile = await initSidebar()
  if (!profile) return
  currentProfile = profile
  await loadStockOrder()
  hide('loading')
  show('content')
}

async function loadStockOrder() {
  const id = new URLSearchParams(window.location.search).get('id')
  if (!id) {
    showAlert('detail-alert', 'Missing stock order id')
    return
  }

  const [orderRes, itemRes, downloadRes] = await Promise.all([
    db.from('stock_orders').select('*').eq('id', id).single(),
    db.from('stock_order_items').select('*').eq('stock_order_id', id).order('line_no'),
    db.from('stock_order_downloads').select('*').eq('stock_order_id', id).order('created_at', { ascending: false }),
  ])
  if (orderRes.error) {
    showAlert('detail-alert', orderRes.error.message)
    return
  }
  if (itemRes.error) toast(itemRes.error.message, 'error')
  if (downloadRes.error) toast(downloadRes.error.message, 'error')
  stockOrder = orderRes.data
  stockItems = itemRes.data || []
  stockDownloads = downloadRes.data || []
  renderStockOrder()
}

function renderStockOrder() {
  const form = stockOrder.order_form_data || {}
  text('stock-order-title', stockOrder.stock_order_uid || 'Stock Order')
  html('stock-order-badge', badge(stockOrder.status || 'pending'))
  text('stock-order-date', fmtDateTime(stockOrder.created_at))

  const receiveBtn = document.getElementById('receive-stock-btn')
  if (receiveBtn) {
    receiveBtn.style.display = stockOrder.status === 'pending' ? '' : 'none'
  }
  const cancelBtn = document.getElementById('cancel-stock-order-btn')
  if (cancelBtn) {
    cancelBtn.style.display = stockOrder.status === 'pending' ? '' : 'none'
  }

  html('stock-order-info', [
    fieldLabel('Supplier', stockOrder.supplier_name),
    fieldLabel('Bill Number', stockOrder.bill_no),
    fieldLabel('Bill Date', displayDate(stockOrder.bill_date)),
    fieldLabel('Status', stockOrder.status),
    fieldLabel('Total Value', fmt$(stockOrder.total_amount || 0)),
    fieldLabel('Notes', stockOrder.notes),
    fieldLabel('Received At', stockOrder.received_at ? fmtDateTime(stockOrder.received_at) : '-'),
    fieldLabel('Downloads', String(stockDownloads.length)),
  ].join(''))

  html('stock-form-info', `
    <div class="info-grid">
      ${fieldLabel('Party Order No.', form.party_order_no)}
      ${fieldLabel('Date of Dispatch', form.dispatch_date)}
      ${fieldLabel('Mode of Despatch', form.mode_despatch)}
      ${fieldLabel('GST No.', form.gst_no)}
      ${fieldLabel('Contact Person', form.contact_person)}
      ${fieldLabel('Telephone', form.tel)}
      ${fieldLabel('Dealer / Ref.', form.dealer_ref)}
      ${fieldLabel('Order Type', form.order_type)}
      ${fieldLabel('Freight', form.freight)}
      ${fieldLabel('Payment Terms', form.payment_terms)}
      ${fieldLabel('Installation', form.installation)}
      ${fieldLabel('Special Instructions', form.special_instructions)}
      ${fieldLabel('Invoice To', form.invoice_to)}
      ${fieldLabel('Delivery Address', form.delivery_address)}
    </div>
  `)

  html('stock-items-body', stockItems.length
    ? stockItems.map(renderStockItemRow).join('')
    : '<tr><td colspan="7" class="empty-state">No stock items found</td></tr>')
}

async function cancelStockOrder() {
  if (!stockOrder || stockOrder.status !== 'pending') return
  const label = stockOrder.stock_order_uid || stockOrder.id
  if (!confirm(`Cancel stock order ${label}?\n\nThis closes the order without adding anything to inventory.`)) return
  const { error } = await db.from('stock_orders').update({
    status: 'cancelled',
  }).eq('id', stockOrder.id).eq('status', 'pending')
  if (error) {
    toast(error.message, 'error')
    return
  }
  await logActivity('cancel', 'stock_order', stockOrder.id, label)
  toast('Stock order cancelled')
  await loadStockOrder()
}

function renderStockItemRow(item) {
  const description = [
    esc(item.variant_name),
    item.category_name ? `Category: ${esc(item.category_name)}` : '',
    item.item_type ? `Type: ${esc(item.item_type)}` : '',
    item.width_m ? `Width: ${esc(item.width_m)} m` : '',
    esc(item.notes || ''),
  ].filter(Boolean).join('<br>')
  return `<tr>
    <td>${item.line_no}</td>
    <td>${description}</td>
    <td>${esc(item.batch_code || '-')}</td>
    <td class="tr">${Number(item.quantity || 0).toFixed(3)}</td>
    <td>${esc(item.unit || '')}</td>
    <td class="tr">${fmt$(item.rate || 0)}</td>
    <td class="tr fw-600">${fmt$(item.line_total || ((item.quantity || 0) * (item.rate || 0)))}</td>
  </tr>`
}

function stockOrderPrintHtml() {
  const form = stockOrder.order_form_data || {}
  const supplier = form.supplier || {}
  const total = stockItems.reduce((sum, item) => sum + Number(item.line_total || ((item.quantity || 0) * (item.rate || 0))), 0)
  const rows = stockItems.map(item => `
    <tr>
      <td>${item.line_no}</td>
      <td>
        <strong>${esc(item.variant_name)}</strong><br>
        ${esc(item.category_name || '')}
        ${item.width_m ? `<br>Width: ${esc(item.width_m)} m` : ''}
        ${item.notes ? `<br>${esc(item.notes)}` : ''}
      </td>
      <td>${esc(item.batch_code || '')}</td>
      <td class="num">${Number(item.quantity || 0).toFixed(3)}</td>
      <td>${esc(item.unit || '')}</td>
      <td class="num">${Number(item.rate || 0).toFixed(2)}</td>
      <td class="num">${Number(item.line_total || ((item.quantity || 0) * (item.rate || 0))).toFixed(2)}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${esc(stockOrder.stock_order_uid)} Stock Order</title>
  <style>
    body { font-family: Arial, sans-serif; color:#000; margin:20px; font-size:13px; }
    .sheet { max-width:1080px; margin:0 auto; }
    .top { border:1px solid #000; padding:10px 12px; display:flex; justify-content:space-between; gap:16px; }
    .company { font-size:18px; font-weight:700; }
    .title { text-align:center; font-weight:700; font-size:20px; margin:12px 0; text-decoration:underline; }
    .grid { display:grid; grid-template-columns:1fr 1fr; border:1px solid #000; border-bottom:none; }
    .box { min-height:82px; padding:8px; border-bottom:1px solid #000; }
    .box + .box { border-left:1px solid #000; }
    .label { font-size:11px; font-weight:700; text-transform:uppercase; margin-bottom:4px; }
    .meta { display:grid; grid-template-columns:repeat(3, 1fr); border-left:1px solid #000; border-top:1px solid #000; margin-top:10px; }
    .meta div { padding:7px; border-right:1px solid #000; border-bottom:1px solid #000; min-height:34px; }
    table { width:100%; border-collapse:collapse; margin-top:12px; }
    th, td { border:1px solid #000; padding:6px; vertical-align:top; }
    th { text-align:center; font-size:12px; }
    .num { text-align:right; }
    .terms { margin-top:12px; border:1px solid #000; padding:8px; min-height:76px; }
    .sign { display:grid; grid-template-columns:1fr 1fr; gap:30px; margin-top:40px; }
    .sign div { border-top:1px solid #000; padding-top:6px; text-align:center; font-weight:700; }
    @media print { body { margin:8mm; } .no-print { display:none; } }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div>
        <div class="company">${esc(supplier.name || stockOrder.supplier_name || 'Supplier')}</div>
        <div>${nl2br([supplier.address, supplier.city, supplier.state].filter(Boolean).join(', '))}</div>
      </div>
      <div style="text-align:right;">
        <div><strong>Stock Order No:</strong> ${esc(stockOrder.stock_order_uid || '')}</div>
        <div><strong>Bill No:</strong> ${esc(stockOrder.bill_no || '')}</div>
        <div><strong>Bill Date:</strong> ${esc(displayDate(stockOrder.bill_date))}</div>
      </div>
    </div>
    <div class="title">ORDER FORM</div>
    <div class="grid">
      <div class="box"><div class="label">Invoice To</div>${nl2br(form.invoice_to || '-')}</div>
      <div class="box"><div class="label">Delivery Add</div>${nl2br(form.delivery_address || '-')}</div>
    </div>
    <div class="meta">
      <div><strong>Party Order No:</strong><br>${esc(form.party_order_no || stockOrder.stock_order_uid || '')}</div>
      <div><strong>Date of Dispatch:</strong><br>${esc(form.dispatch_date || '')}</div>
      <div><strong>GST No:</strong><br>${esc(form.gst_no || '')}</div>
      <div><strong>Contact Person:</strong><br>${esc(form.contact_person || '')}</div>
      <div><strong>Tel:</strong><br>${esc(form.tel || '')}</div>
      <div><strong>Mode of Despatch:</strong><br>${esc(form.mode_despatch || '')}</div>
      <div><strong>Dealer / Ref:</strong><br>${esc(form.dealer_ref || '')}</div>
      <div><strong>Order Type:</strong><br>${esc(form.order_type || '')}</div>
      <div><strong>Freight:</strong><br>${esc(form.freight || '')}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>SR.NO.</th>
          <th>DESCRIPTION</th>
          <th>BATCH</th>
          <th>QTY</th>
          <th>UNIT</th>
          <th>RATE</th>
          <th>AMOUNT</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="6" class="num"><strong>Total</strong></td>
          <td class="num"><strong>${total.toFixed(2)}</strong></td>
        </tr>
      </tfoot>
    </table>
    <div class="terms">
      <div><strong>Payment Terms:</strong> ${esc(form.payment_terms || '-')}</div>
      <div><strong>Installation:</strong> ${esc(form.installation || '-')}</div>
      <div><strong>Special Instructions:</strong> ${nl2br(form.special_instructions || '-')}</div>
    </div>
    <div class="sign">
      <div>Prepared By</div>
      <div>Approved By</div>
    </div>
  </div>
</body>
</html>`
}

function openPrintableHtml(docHtml) {
  const win = window.open('', '_blank')
  if (!win) {
    toast('Allow popups to open the form', 'error')
    return
  }
  win.document.write(docHtml)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 250)
}

async function downloadStockOrderForm() {
  if (!stockOrder) return
  const docHtml = stockOrderPrintHtml()
  const userId = AUTH.currentUserId()
  const { error } = await db.from('stock_order_downloads').insert({
    stock_order_id: stockOrder.id,
    document_type: 'stock_order',
    form_data: stockOrder.order_form_data || {},
    html: docHtml,
    created_by: userId,
  })
  if (error) {
    toast(error.message, 'error')
    return
  }
  openPrintableHtml(docHtml)
  await loadStockOrder()
}

function openStockDownloads() {
  if (!stockDownloads.length) {
    openModal('Downloads', '<div class="empty-state">No stock form downloads yet.</div>', true)
    return
  }
  const rows = stockDownloads.map(d => `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
      <div>
        <div class="fw-600">${esc(d.document_type || 'stock_order')}</div>
        <div class="text-xs text-muted">${fmtDateTime(d.created_at)}</div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="redownloadStockOrderForm('${d.id}')">
        <i class="fa-solid fa-download"></i> Redownload
      </button>
    </div>
  `).join('')
  openModal('Downloads', rows, true)
}

function redownloadStockOrderForm(downloadId) {
  const row = stockDownloads.find(d => d.id === downloadId)
  if (!row) return
  openPrintableHtml(row.html || stockOrderPrintHtml())
}

async function receiveStockOrder() {
  if (!stockOrder || stockOrder.status !== 'pending') return
  if (!stockItems.length) {
    toast('No stock items to receive', 'error')
    return
  }
  if (!confirm(`Add stock for ${stockOrder.stock_order_uid}?\n\nThis will add the order items into live inventory and reports.`)) return

  const btn = document.getElementById('receive-stock-btn')
  if (btn) {
    btn.disabled = true
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Adding...'
  }
  try {
    const userId = AUTH.currentUserId()
    for (const item of stockItems) {
      if (!item.variant_id) throw new Error(`Item ${item.line_no}: missing inventory variant`)
      const { error: variantErr } = await db.from('inv_variants').update({
        unit: item.unit,
        purchase_rate: item.rate,
        width_m: item.width_m || null,
        base_rate_sqm: item.width_m && item.rate ? Number(item.rate) / Number(item.width_m) : null,
      }).eq('id', item.variant_id)
      if (variantErr) throw variantErr

      const batch = item.batch_code || `${stockOrder.bill_no || stockOrder.stock_order_uid}/${item.line_no}/${item.variant_name}`.slice(0, 100)
      const qty = Number(item.quantity || 0)
      const rate = Number(item.rate || 0)
      const { data: roll, error: rollErr } = await db.from('inv_rolls').insert({
        variant_id: item.variant_id,
        batch_code: batch,
        original_length: qty,
        remaining_length: qty,
        unit: item.unit,
        purchase_rate: rate,
        status: 'in_stock',
        inward_date: stockOrder.bill_date || new Date().toISOString().slice(0, 10),
        bill_no: stockOrder.bill_no,
        supplier: stockOrder.supplier_name,
        stock_value: qty * rate,
        notes: item.notes || stockOrder.notes || null,
      }).select('id').single()
      if (rollErr) throw rollErr

      const { error: moveErr } = await db.from('inv_movements').insert({
        roll_id: roll.id,
        variant_id: item.variant_id,
        movement_type: 'inflow',
        quantity: qty,
        unit: item.unit,
        rate,
        reference: stockOrder.bill_no || stockOrder.stock_order_uid,
        note: item.notes || stockOrder.notes || 'Received from stock order',
        performed_by: userId,
      })
      if (moveErr) throw moveErr
    }

    const { error: updateErr } = await db.from('stock_orders').update({
      status: 'received',
      received_at: new Date().toISOString(),
      received_by: userId,
    }).eq('id', stockOrder.id).eq('status', 'pending')
    if (updateErr) throw updateErr

    await logActivity('stock_receive', 'stock_order', stockOrder.id, stockOrder.stock_order_uid, {
      supplier: stockOrder.supplier_name,
      items: stockItems.length,
      total_value: stockOrder.total_amount,
    })
    toast('Stock added to inventory')
    await loadStockOrder()
  } catch (err) {
    showAlert('detail-alert', err.message || String(err))
  } finally {
    if (btn) {
      btn.disabled = false
      btn.innerHTML = '<i class="fa-solid fa-boxes-stacked"></i> Receive Stock'
    }
  }
}

init()
