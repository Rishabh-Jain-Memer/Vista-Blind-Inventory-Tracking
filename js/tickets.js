/*
  Ticket controller for the standalone Tickets page.
  Tickets capture customer requirements before a confirmed order is built in the
  existing Create Order form.
*/

let ticketEmployees = []
let ticketCustomers = []
let allTickets = []
let ticketsProfile = null

function ticketEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function ticketVal(id) {
  return document.getElementById(id)?.value || ''
}

function ticketCustomerName(ticket) {
  return ticket.customer_name || ticket.customers?.name || 'Unknown customer'
}

function ticketDisplayUid(ticket) {
  const raw = String(ticket?.ticket_uid || '').replace(/^TKT-/i, '')
  if (/^\d{10}$/.test(raw)) return raw.slice(0, 4)
  return raw || String(ticket?.id || '').slice(0, 8)
}

function todayISODate() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

function profileName(profile) {
  return profile?.full_name || profile?.email || ''
}

function employeeName(id) {
  if (!id) return ''
  if (ticketsProfile?.id === id) return profileName(ticketsProfile)
  return profileName(ticketEmployees.find(p => p.id === id)) || 'Staff member'
}

function ticketStatusLabel(status) {
  return {
    open: 'Open',
    followup: 'Followup',
    order_confirmed: 'Order Confirmed',
    converted: 'Converted',
    cancelled: 'Cancelled',
  }[status] || status
}

function ticketBadge(status) {
  return `<span class="badge badge-${ticketEsc(status)}">${ticketEsc(ticketStatusLabel(status))}</span>`
}

function sortedTicketHistory(ticket, newestFirst = true) {
  const rows = [...(ticket?.order_ticket_followups || [])]
  return rows.sort((a, b) => newestFirst
    ? String(b.created_at).localeCompare(String(a.created_at))
    : String(a.created_at).localeCompare(String(b.created_at)))
}

function ticketLatestFollowup(ticket) {
  return sortedTicketHistory(ticket, true)[0] || null
}

function ticketFollowupDate(ticket) {
  const latest = ticketLatestFollowup(ticket)
  return latest?.follow_up_date || (ticket.follow_up_at ? String(ticket.follow_up_at).slice(0, 10) : '')
}

function ticketAgeDays(ticket) {
  const start = new Date(ticket.inquiry_date || ticket.created_at || Date.now())
  const today = new Date()
  start.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((today - start) / 86400000))
}

function ticketNextAction(ticket) {
  if (ticket.status === 'converted') return 'Order created'
  if (ticket.status === 'cancelled') return 'Closed as cancelled'
  if (ticket.status === 'order_confirmed') return 'Create order'
  const due = ticketFollowupDate(ticket)
  return due ? `Follow up on ${due}` : 'Schedule follow-up'
}

async function initTickets(profile) {
  ticketsProfile = profile
  renderTicketCustomerForm()
  resetTicketForm()
  await Promise.all([loadTicketEmployees(), loadTicketCustomers()])
  await loadTickets()
}

async function loadTicketCustomers() {
  const { data, error } = await CUSTOMER_SOURCE.loadCustomers()
  if (error) {
    console.warn('ticket customer load error:', error.message)
    ticketCustomers = []
  } else {
    ticketCustomers = (data || []).map(CUSTOMER_SOURCE.normalize)
  }
  renderTicketCustomerOptions()
}

async function initTicketsPage() {
  const profile = await initSidebar()
  if (!profile) return
  await initTickets(profile)
  hide('loading')
  show('content')
}

async function loadTicketEmployees() {
  const { data, error } = await db.from('profiles').select('id, full_name, email, role').order('full_name')
  if (error) {
    console.warn('ticket employee load error:', error.message)
    ticketEmployees = []
  } else {
    ticketEmployees = data || []
  }
  if (ticketsProfile?.id && !ticketEmployees.some(p => p.id === ticketsProfile.id)) {
    ticketEmployees.push(ticketsProfile)
  }
  renderTicketEmployeeOptions()
}

function renderTicketEmployeeOptions() {
  const sel = document.getElementById('ticket-allocated-to')
  if (!sel) return
  const current = sel.value || ticketsProfile?.id || ''
  sel.innerHTML = '<option value="">Unassigned</option>' + ticketEmployees
    .filter(p => ['admin', 'sales', 'executer'].includes(p.role))
    .map(p => `<option value="${p.id}">${ticketEsc(profileName(p))}${p.role ? ` (${ticketEsc(p.role)})` : ''}</option>`)
    .join('')
  if ([...sel.options].some(o => o.value === current)) sel.value = current
}

function renderTicketCustomerForm() {
  const wrap = document.getElementById('ticket-customer-fields')
  if (!wrap) return
  wrap.innerHTML = CUSTOMER_SOURCE.formFields('ticket-customer', {}, { nameLabel: 'Customer Name' })
}

function renderTicketCustomerOptions() {
  const sel = document.getElementById('ticket-customer-profile')
  if (!sel) return
  const current = sel.value || ''
  sel.innerHTML = '<option value="">New / typed profile</option>' + ticketCustomers
    .map(c => `<option value="${c.id}">${ticketEsc(c.name)}${c.phone ? ` - ${ticketEsc(c.phone)}` : ''}</option>`)
    .join('')
  if ([...sel.options].some(o => o.value === current)) sel.value = current
}

function selectTicketCustomerProfile(customerId) {
  const customer = ticketCustomers.find(c => c.id === customerId)
  if (!customer) {
    document.getElementById('ticket-save-profile-wrap')?.classList.remove('d-none')
    return
  }
  CUSTOMER_SOURCE.fillForm('ticket-customer', customer)
  document.getElementById('ticket-save-profile-wrap')?.classList.add('d-none')
}

async function saveTicket() {
  hideAlert('ticket-alert')
  const notes = ticketVal('ticket-notes').trim()
  const selectedCustomerId = ticketVal('ticket-customer-profile')
  const selectedCustomer = ticketCustomers.find(c => c.id === selectedCustomerId) || null
  const customerPayload = CUSTOMER_SOURCE.readForm('ticket-customer', { createdBy: ticketsProfile?.id })
  const customerName = (selectedCustomer?.name || customerPayload.name || '').trim()
  const inquiryFor = ticketVal('ticket-inquiry-for').trim()
  if (!customerName) {
    showAlert('ticket-alert', 'Customer name is required')
    return
  }
  if (!inquiryFor) {
    showAlert('ticket-alert', 'Inquiry for is required')
    return
  }
  if (!notes) {
    showAlert('ticket-alert', 'Remarks are required')
    return
  }

  const btn = document.getElementById('save-ticket-btn')
  if (btn) {
    btn.disabled = true
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Saving...'
  }

  try {
    let custId = selectedCustomer?.id || null
    let customerForTicket = selectedCustomer || null
    const shouldSaveProfile = !custId && document.getElementById('ticket-save-profile')?.checked
    if (shouldSaveProfile) {
      const { data: savedCustomer, error: customerErr } = await CUSTOMER_SOURCE.insertCustomer(customerPayload)
      if (customerErr) throw customerErr
      customerForTicket = CUSTOMER_SOURCE.normalize(savedCustomer)
      custId = customerForTicket.id
      ticketCustomers = [...ticketCustomers.filter(c => c.id !== custId), customerForTicket]
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      renderTicketCustomerOptions()
    }
    const payload = {
      cust_id: custId,
      created_by: ticketsProfile?.id || null,
      inquiry_date: todayISODate(),
      customer_name: customerName,
      customer_mobile: customerForTicket?.phone || customerPayload.phone || null,
      inquiry_for: inquiryFor,
      location: ticketVal('ticket-location') || null,
      allocated_to: ticketVal('ticket-allocated-to') || null,
      requirement_notes: notes,
      follow_up_at: ticketVal('ticket-follow-up') || null,
      status: 'open',
    }
    const { data, error } = await db.from('order_tickets').insert(payload).select('id, ticket_uid').single()
    if (error) {
      if (/relation .*order_tickets|schema cache.*order_tickets/i.test(error.message || '')) {
        throw new Error('Run migration 023_order_tickets.sql in Supabase to enable tickets.')
      }
      throw error
    }
    await logActivity('create', 'order_ticket', data.id, data.ticket_uid, { customer_name: customerName })
    toast('Ticket created')
    resetTicketForm()
    openTicketDetail(data.id)
  } catch (err) {
    showAlert('ticket-alert', err.message || String(err))
  } finally {
    if (btn) {
      btn.disabled = false
      btn.innerHTML = '<i class="fa-solid fa-plus"></i> Create Ticket'
    }
  }
}

function resetTicketForm() {
  ;[
    'ticket-notes',
    'ticket-follow-up',
    'ticket-inquiry-for',
    'ticket-location',
    'ticket-customer-name',
    'ticket-customer-contact',
    'ticket-customer-phone',
    'ticket-customer-phone2',
    'ticket-customer-email',
    'ticket-customer-gstin',
    'ticket-customer-address',
    'ticket-customer-city',
    'ticket-customer-state',
    'ticket-customer-notes',
  ].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.value = ''
  })
  const customerProfile = document.getElementById('ticket-customer-profile')
  if (customerProfile) customerProfile.value = ''
  const saveProfile = document.getElementById('ticket-save-profile')
  if (saveProfile) saveProfile.checked = true
  document.getElementById('ticket-save-profile-wrap')?.classList.remove('d-none')
  const allocated = document.getElementById('ticket-allocated-to')
  if (allocated) allocated.value = ticketsProfile?.id || ''
}

async function loadTickets() {
  const body = document.getElementById('tickets-body')
  if (body) body.innerHTML = '<tr><td colspan="10" class="empty-state">Loading tickets...</td></tr>'

  const { data, error } = await db
    .from('order_tickets')
    .select(`id, ticket_uid, cust_id, status, requirement_notes, follow_up_at, converted_order_id, converted_at, created_at, inquiry_date, customer_name, customer_mobile, inquiry_for, location, allocated_to, customers!cust_id(${CUSTOMER_SOURCE.SELECT}), order_ticket_followups(id, status, remarks, remark_by, follow_up_date, created_at)`)
    .order('created_at', { ascending: false })

  if (error) {
    const message = /order_ticket_followups|inquiry_date|customer_name|allocated_to/i.test(error.message || '')
      ? 'Run migration 025_order_ticket_inquiry_followups.sql in Supabase to enable ticket inquiry fields and follow-up history.'
      : /order_tickets/i.test(error.message || '')
      ? 'Run migration 023_order_tickets.sql in Supabase to enable tickets.'
      : error.message
    if (body) body.innerHTML = `<tr><td colspan="10" class="empty-state">${ticketEsc(message)}</td></tr>`
    return
  }
  allTickets = data || []
  renderTickets()
}

function renderTickets() {
  const status = ticketVal('ticket-status-filter')
  const rows = allTickets.filter(t => {
    if (!status) return true
    if (status === 'active') return ['open', 'followup', 'order_confirmed'].includes(t.status)
    return t.status === status
  })
  text('ticket-count', `${rows.length} of ${allTickets.length} ticket${allTickets.length === 1 ? '' : 's'}`)
  const body = document.getElementById('tickets-body')
  if (!body) return
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="10" class="empty-state">No tickets found.</td></tr>'
    return
  }
  body.innerHTML = rows.map(t => renderTicketRow(t)).join('')
}

function renderTicketRow(t) {
  const customer = ticketCustomerName(t)
  const canConvert = ['admin', 'sales'].includes(ticketsProfile?.role)
  const isActive = ['open', 'followup', 'order_confirmed'].includes(t.status)
  const actions = isActive
    ? `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openFollowupModal('${t.id}')"><i class="fa-solid fa-reply"></i> Follow-up</button>
       ${canConvert ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); convertTicketToOrder('${t.id}')"><i class="fa-solid fa-arrow-right"></i> Create Order</button>` : ''}
       <button class="btn btn-ghost btn-sm" style="color:#ef4444" onclick="event.stopPropagation(); cancelTicket('${t.id}')"><i class="fa-solid fa-ban"></i></button>`
    : (t.converted_order_id
      ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); window.location.href='order-detail.html?id=${t.converted_order_id}'"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>`
      : '')
  const history = sortedTicketHistory(t, true)
  const latest = history[0]
  const nextAction = ticketNextAction(t)

  return `<tr onclick="openTicketDetail('${t.id}')" style="cursor:pointer;">
    <td>
      <div class="fw-600" style="font-family:monospace;display:flex;align-items:center;gap:6px;">
        <i class="fa-solid fa-arrow-up-right-from-square text-xs text-muted"></i>
        ${ticketEsc(ticketDisplayUid(t))}
      </div>
      <div class="text-xs text-muted">${ticketAgeDays(t)} day${ticketAgeDays(t) === 1 ? '' : 's'} old</div>
    </td>
    <td>
      <div class="fw-600">${ticketEsc(customer)}</div>
      ${t.customer_mobile || t.customers?.phone ? `<div class="text-xs text-muted">${ticketEsc(t.customer_mobile || t.customers?.phone)}</div>` : ''}
    </td>
    <td>${ticketEsc(t.inquiry_for || '-')}</td>
    <td>${ticketEsc(t.location || '-')}</td>
    <td>${ticketEsc(employeeName(t.allocated_to) || '-')}</td>
    <td class="text-muted text-xs" style="max-width:360px;white-space:normal;">
      <div>${ticketEsc(latest?.remarks || t.requirement_notes)}</div>
      ${history.length ? `<div class="text-xs" style="color:#64748b;margin-top:4px;">${history.length} follow-up${history.length === 1 ? '' : 's'} logged</div>` : ''}
    </td>
    <td class="text-muted">${ticketEsc(ticketFollowupDate(t) || '-')}<div class="text-xs text-muted">${ticketEsc(nextAction)}</div></td>
    <td>${ticketBadge(t.status)}</td>
    <td style="text-align:right;white-space:nowrap;">${actions}</td>
  </tr>`
}

function openTicketDetail(ticketId) {
  if (!ticketId) return
  window.location.href = `ticket-detail.html?id=${encodeURIComponent(ticketId)}`
}

function openFollowupModal(ticketId) {
  const ticket = allTickets.find(t => t.id === ticketId)
  if (!ticket) return
  openModal('Add Follow-up', `
    <div id="fu-alert" class="alert alert-error"></div>
    <div class="form-group">
      <label>Status</label>
      <select id="fu-status">
        <option value="followup">Followup</option>
        <option value="order_confirmed">Order Confirmed</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </div>
    <div class="form-group">
      <label>Remark Date</label>
      <input id="fu-date" type="date" value="${todayISODate()}">
    </div>
    <div class="form-group">
      <label>Remarks *</label>
      <textarea id="fu-remarks" rows="4" placeholder="What happened in this follow-up?"></textarea>
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="fu-save-btn" onclick="saveFollowup('${ticketId}')">Save Follow-up</button>
    </div>
  `)
}

async function saveFollowup(ticketId) {
  hideAlert('fu-alert')
  const remarks = ticketVal('fu-remarks').trim()
  if (!remarks) {
    showAlert('fu-alert', 'Remarks are required')
    return
  }
  const status = ticketVal('fu-status') || 'followup'
  const followUpDate = ticketVal('fu-date') || todayISODate()
  const btn = document.getElementById('fu-save-btn')
  if (btn) {
    btn.disabled = true
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Saving...'
  }
  try {
    const { error: historyErr } = await db.from('order_ticket_followups').insert({
      ticket_id: ticketId,
      status,
      remarks,
      remark_by: ticketsProfile?.id || null,
      follow_up_date: followUpDate,
    })
    if (historyErr) throw historyErr
    const updates = {
      status,
      requirement_notes: remarks,
      follow_up_at: followUpDate,
      updated_at: new Date().toISOString(),
    }
    const { error: ticketErr } = await db.from('order_tickets').update(updates).eq('id', ticketId)
    if (ticketErr) throw ticketErr
    await logActivity('update', 'order_ticket', ticketId, ticketId, { status, follow_up_date: followUpDate })
    closeModal()
    toast('Follow-up saved')
    await loadTickets()
  } catch (err) {
    showAlert('fu-alert', /order_ticket_followups/i.test(err.message || '')
      ? 'Run migration 025_order_ticket_inquiry_followups.sql in Supabase to enable follow-up history.'
      : (err.message || String(err)))
  } finally {
    if (btn) {
      btn.disabled = false
      btn.innerHTML = 'Save Follow-up'
    }
  }
}

function convertTicketToOrder(ticketId) {
  const frame = document.getElementById('create-order-frame')
  if (frame) frame.src = `create-order.html?embed=1&ticket=${encodeURIComponent(ticketId)}`
  else window.location.href = `create.html?tab=order&ticket=${encodeURIComponent(ticketId)}`
  if (typeof switchCreateTab === 'function') switchCreateTab('order')
}

async function cancelTicket(ticketId) {
  if (!confirm('Cancel this ticket?')) return
  const { error } = await db.from('order_tickets').update({
    status: 'cancelled',
    updated_at: new Date().toISOString(),
  }).eq('id', ticketId)
  if (error) {
    toast(error.message, 'error')
    return
  }
  await logActivity('cancel', 'order_ticket', ticketId, ticketId)
  toast('Ticket cancelled')
  await loadTickets()
}
