/*
  Dedicated ticket detail controller.
  Keeps the Tickets page as a queue while this page owns CRM context,
  append-only follow-ups, and conversion into the existing Create Order flow.
*/

let ticketDetailProfile = null
let ticketDetailEmployees = []
let currentTicket = null

function ticketDetailEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function ticketDetailVal(id) {
  return document.getElementById(id)?.value || ''
}

function ticketDetailTodayISO() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

function ticketDetailProfileName(profile) {
  return profile?.full_name || profile?.email || ''
}

function ticketDetailEmployeeName(id) {
  if (!id) return ''
  if (ticketDetailProfile?.id === id) return ticketDetailProfileName(ticketDetailProfile)
  return ticketDetailProfileName(ticketDetailEmployees.find(p => p.id === id)) || 'Staff member'
}

function ticketDetailCustomerName(ticket) {
  return ticket?.customer_name || ticket?.customers?.name || 'Unknown customer'
}

function ticketDetailDisplayUid(ticket) {
  const raw = String(ticket?.ticket_uid || '').replace(/^TKT-/i, '')
  if (/^\d{10}$/.test(raw)) return raw.slice(0, 4)
  return raw || String(ticket?.id || '').slice(0, 8)
}

function ticketDetailStatusLabel(status) {
  return {
    open: 'Open',
    followup: 'Followup',
    order_confirmed: 'Order Confirmed',
    converted: 'Converted',
    cancelled: 'Cancelled',
  }[status] || status || 'Open'
}

function ticketDetailBadge(status) {
  return `<span class="badge badge-${ticketDetailEsc(status || 'open')}">${ticketDetailEsc(ticketDetailStatusLabel(status))}</span>`
}

function sortedTicketDetailHistory(ticket, newestFirst = true) {
  const rows = [...(ticket?.order_ticket_followups || [])]
  return rows.sort((a, b) => newestFirst
    ? String(b.created_at).localeCompare(String(a.created_at))
    : String(a.created_at).localeCompare(String(b.created_at)))
}

function ticketDetailFollowupDate(ticket) {
  const latest = sortedTicketDetailHistory(ticket, true)[0]
  return latest?.follow_up_date || (ticket?.follow_up_at ? String(ticket.follow_up_at).slice(0, 10) : '')
}

function ticketDetailAgeDays(ticket) {
  const start = new Date(ticket?.inquiry_date || ticket?.created_at || Date.now())
  const today = new Date()
  start.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((today - start) / 86400000))
}

function ticketDetailNextAction(ticket) {
  if (ticket?.status === 'converted') return 'Order created'
  if (ticket?.status === 'cancelled') return 'Closed as cancelled'
  if (ticket?.status === 'order_confirmed') return 'Create order'
  const due = ticketDetailFollowupDate(ticket)
  return due ? `Follow up on ${due}` : 'Schedule follow-up'
}

async function initTicketDetailPage() {
  ticketDetailProfile = await initSidebar()
  if (!ticketDetailProfile) return

  const ticketId = new URLSearchParams(window.location.search).get('id')
  if (!ticketId) {
    hide('loading')
    show('content')
    showAlert('ticket-alert', 'Missing ticket id. Open the ticket again from the Tickets page.')
    return
  }

  await loadTicketDetailEmployees()
  await loadTicketDetail(ticketId)
  hide('loading')
  show('content')
}

async function loadTicketDetailEmployees() {
  const { data, error } = await db.from('profiles').select('id, full_name, email, role').order('full_name')
  if (error) {
    console.warn('ticket detail employee load error:', error.message)
    ticketDetailEmployees = []
    return
  }
  ticketDetailEmployees = data || []
  if (ticketDetailProfile?.id && !ticketDetailEmployees.some(p => p.id === ticketDetailProfile.id)) {
    ticketDetailEmployees.push(ticketDetailProfile)
  }
}

async function loadTicketDetail(ticketId) {
  hideAlert('ticket-alert')
  const { data, error } = await db
    .from('order_tickets')
    .select('id, ticket_uid, cust_id, status, requirement_notes, follow_up_at, converted_order_id, converted_at, created_at, updated_at, created_by, inquiry_date, customer_name, customer_mobile, inquiry_for, location, allocated_to, customers!cust_id(name, phone), order_ticket_followups(id, status, remarks, remark_by, follow_up_date, created_at)')
    .eq('id', ticketId)
    .single()

  if (error) {
    const message = /order_ticket_followups|inquiry_date|customer_name|allocated_to/i.test(error.message || '')
      ? 'Run migration 025_order_ticket_inquiry_followups.sql in Supabase to enable ticket inquiry fields and follow-up history.'
      : /order_tickets/i.test(error.message || '')
      ? 'Run migration 023_order_tickets.sql in Supabase to enable tickets.'
      : error.message
    showAlert('ticket-alert', message)
    return
  }

  currentTicket = data
  renderTicketDetail()
}

function renderTicketDetail() {
  if (!currentTicket) return
  const ticket = currentTicket
  const customer = ticketDetailCustomerName(ticket)
  const title = `${ticketDetailDisplayUid(ticket)} - ${customer}`
  text('ticket-title', title)
  text('ticket-subtitle', ticket.inquiry_for || 'Customer inquiry detail, follow-ups, and order handoff.')
  html('ticket-status-pill', ticketDetailBadge(ticket.status))
  html('ticket-actions', renderTicketDetailActions(ticket))
  html('ticket-context', renderTicketDetailContext(ticket))
  text('ticket-requirement', ticket.requirement_notes || '-')
  html('ticket-timeline', renderTicketTimeline(ticket))
}

function renderTicketDetailActions(ticket) {
  const canConvert = ['admin', 'sales'].includes(ticketDetailProfile?.role)
  const isActive = ['open', 'followup', 'order_confirmed'].includes(ticket.status)
  if (isActive) {
    return `<button class="btn btn-secondary btn-sm" onclick="openFollowupModal()"><i class="fa-solid fa-reply"></i> Follow-up</button>
      ${canConvert ? `<button class="btn btn-primary btn-sm" onclick="convertTicketToOrder()"><i class="fa-solid fa-arrow-right"></i> Create Order</button>` : ''}
      <button class="btn btn-ghost btn-sm" style="color:#ef4444" onclick="cancelTicket()"><i class="fa-solid fa-ban"></i> Cancel</button>`
  }
  if (ticket.converted_order_id) {
    return `<button class="btn btn-secondary btn-sm" onclick="window.location.href='order-detail.html?id=${ticketDetailEsc(ticket.converted_order_id)}'"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open Order</button>`
  }
  return ''
}

function renderTicketDetailContext(ticket) {
  const phone = ticket.customer_mobile || ticket.customers?.phone || '-'
  const inquiryDate = ticket.inquiry_date || String(ticket.created_at || '').slice(0, 10)
  const converted = ticket.converted_at ? String(ticket.converted_at).slice(0, 10) : '-'
  return [
    ticketDetailMetric('Status', ticketDetailBadge(ticket.status)),
    ticketDetailMetric('Owner', ticketDetailEsc(ticketDetailEmployeeName(ticket.allocated_to) || 'Unassigned')),
    ticketDetailMetric('Next Action', ticketDetailEsc(ticketDetailNextAction(ticket))),
    ticketDetailMetric('Inquiry Date', ticketDetailEsc(inquiryDate || '-')),
    ticketDetailMetric('Age', `${ticketDetailAgeDays(ticket)} day${ticketDetailAgeDays(ticket) === 1 ? '' : 's'}`),
    ticketDetailMetric('Customer', ticketDetailEsc(ticketDetailCustomerName(ticket))),
    ticketDetailMetric('Mobile', ticketDetailEsc(phone)),
    ticketDetailMetric('Location', ticketDetailEsc(ticket.location || '-')),
    ticketDetailMetric('Inquiry For', ticketDetailEsc(ticket.inquiry_for || '-')),
    ticketDetailMetric('Created By', ticketDetailEsc(ticketDetailEmployeeName(ticket.created_by) || '-')),
    ticketDetailMetric('Converted', ticketDetailEsc(converted)),
  ].join('')
}

function ticketDetailMetric(label, value) {
  return `<div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px 12px;min-width:0;">
    <div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">${ticketDetailEsc(label)}</div>
    <div class="fw-600" style="font-size:13px;overflow-wrap:anywhere;">${value}</div>
  </div>`
}

function renderTicketTimeline(ticket) {
  const history = sortedTicketDetailHistory(ticket, true)
  const timeline = [
    ...history.map(h => ({
      title: ticketDetailStatusLabel(h.status),
      when: h.follow_up_date || h.created_at,
      by: ticketDetailEmployeeName(h.remark_by),
      body: h.remarks,
      icon: 'fa-reply',
    })),
    {
      title: 'Initial Inquiry',
      when: ticket.inquiry_date || ticket.created_at,
      by: ticketDetailEmployeeName(ticket.created_by),
      body: ticket.requirement_notes,
      icon: 'fa-ticket',
    },
  ]

  return timeline.map(entry => `
    <div style="display:grid;grid-template-columns:28px minmax(0,1fr);gap:10px;">
      <div style="width:26px;height:26px;border-radius:999px;background:#eef2ff;color:#4f46e5;display:grid;place-items:center;font-size:11px;">
        <i class="fa-solid ${entry.icon}"></i>
      </div>
      <div style="border-left:2px solid #e2e8f0;padding-left:12px;padding-bottom:8px;min-width:0;">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <div class="fw-600 text-sm">${ticketDetailEsc(entry.title)}</div>
          <div class="text-xs text-muted">${ticketDetailEsc(entry.when ? String(entry.when).slice(0, 10) : '')}</div>
        </div>
        ${entry.by ? `<div class="text-xs text-muted">By ${ticketDetailEsc(entry.by)}</div>` : ''}
        <div class="text-xs" style="white-space:pre-wrap;margin-top:4px;overflow-wrap:anywhere;">${ticketDetailEsc(entry.body || '-')}</div>
      </div>
    </div>
  `).join('')
}

function openFollowupModal() {
  if (!currentTicket) return
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
      <input id="fu-date" type="date" value="${ticketDetailTodayISO()}">
    </div>
    <div class="form-group">
      <label>Remarks *</label>
      <textarea id="fu-remarks" rows="4" placeholder="What happened in this follow-up?"></textarea>
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="fu-save-btn" onclick="saveFollowup()">Save Follow-up</button>
    </div>
  `)
}

async function saveFollowup() {
  if (!currentTicket) return
  hideAlert('fu-alert')
  const remarks = ticketDetailVal('fu-remarks').trim()
  if (!remarks) {
    showAlert('fu-alert', 'Remarks are required')
    return
  }
  const status = ticketDetailVal('fu-status') || 'followup'
  const followUpDate = ticketDetailVal('fu-date') || ticketDetailTodayISO()
  const btn = document.getElementById('fu-save-btn')
  if (btn) {
    btn.disabled = true
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Saving...'
  }
  try {
    const { error: historyErr } = await db.from('order_ticket_followups').insert({
      ticket_id: currentTicket.id,
      status,
      remarks,
      remark_by: ticketDetailProfile?.id || null,
      follow_up_date: followUpDate,
    })
    if (historyErr) throw historyErr
    const updates = {
      status,
      requirement_notes: remarks,
      follow_up_at: followUpDate,
      updated_at: new Date().toISOString(),
    }
    const { error: ticketErr } = await db.from('order_tickets').update(updates).eq('id', currentTicket.id)
    if (ticketErr) throw ticketErr
    await logActivity('update', 'order_ticket', currentTicket.id, currentTicket.ticket_uid || currentTicket.id, { status, follow_up_date: followUpDate })
    closeModal()
    toast('Follow-up saved')
    await loadTicketDetail(currentTicket.id)
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

function convertTicketToOrder() {
  if (!currentTicket) return
  window.location.href = `create.html?tab=order&ticket=${encodeURIComponent(currentTicket.id)}`
}

async function cancelTicket() {
  if (!currentTicket) return
  if (!confirm('Cancel this ticket?')) return
  const { error } = await db.from('order_tickets').update({
    status: 'cancelled',
    updated_at: new Date().toISOString(),
  }).eq('id', currentTicket.id)
  if (error) {
    toast(error.message, 'error')
    return
  }
  await logActivity('cancel', 'order_ticket', currentTicket.id, currentTicket.ticket_uid || currentTicket.id)
  toast('Ticket cancelled')
  await loadTicketDetail(currentTicket.id)
}
