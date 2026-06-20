/*
  Profiles page controller.
  Historical route: settings.html. Visible product area: Profiles.
  Owns employees, customers, and suppliers, and links each profile back to the
  relevant audit log, orders, reports, and inventory records.
*/

const ROLES = ['admin', 'executer', 'sales']

let myId = null
let currentTab = 'employees'
let currentRole = ''

let allEmployees = []
let employeeActivityCounts = {}
let allEmployeeLogs = []
let allSalesOrders = []

let allCustomers = []
let allCustomerOrders = []
let customerStats = {}

let allSuppliers = []
let supplierTableReady = true
let allSupplierRolls = []
let supplierStats = {}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function profileMoney(n) {
  return fmt$(Number(n || 0))
}

function orderStatus(o) {
  const s = String(o?.status || '').toLowerCase()
  if (s === 'discussing' || s === 'pending') return 'inquiry'
  if (s === 'in progress') return 'processing'
  return s
}

function safeArg(value) {
  return encodeURIComponent(String(value ?? ''))
}

function monthKey(dateValue) {
  if (!dateValue) return 'No date'
  const d = new Date(dateValue)
  if (Number.isNaN(d.getTime())) return 'No date'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key) {
  if (key === 'No date') return key
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function yearKey(dateValue) {
  if (!dateValue) return 'No year'
  const d = new Date(dateValue)
  return Number.isNaN(d.getTime()) ? 'No year' : String(d.getFullYear())
}

function setProfileMode(tab, mode) {
  const list = document.getElementById(`${tab}-list`)
  const detail = document.getElementById(`${tab.slice(0, -1)}-detail`)
  if (list) list.style.display = mode === 'detail' ? 'none' : ''
  if (detail) detail.style.display = mode === 'detail' ? '' : 'none'
}

async function adminUserAction(action, payload = {}) {
  const { data, error } = await db.functions.invoke('admin-users', {
    body: { action, ...payload },
  })
  if (error) throw new Error(error.message || 'Admin user function failed')
  if (data?.error) throw new Error(data.error)
  return data || {}
}

async function init() {
  const profile = await initSidebar()
  if (!profile) return
  if (!['admin', 'sales'].includes(profile.role)) { window.location.href = 'dashboard.html'; return }
  myId = profile.id
  currentRole = profile.role

  if (profile.role === 'sales') {
    configureSalesProfilesMode()
    await Promise.all([
      loadEmployees(),
      loadSalesOrders(),
    ])
  } else {
    await Promise.all([
      loadEmployees(),
      loadCustomers(),
      loadSuppliers(),
    ])
  }

  const hash = window.location.hash.replace('#', '')
  const tab = profile.role === 'sales'
    ? 'employees'
    : (['employees', 'customers', 'suppliers'].includes(hash) ? hash : 'employees')
  switchTab(tab)
  hide('loading')
  show('content')
}

function isSalesProfilesMode() {
  return currentRole === 'sales'
}

function configureSalesProfilesMode() {
  text('tab-btn-employees', 'Executers')
  document.getElementById('tab-btn-customers')?.remove()
  document.getElementById('tab-btn-suppliers')?.remove()
  document.getElementById('tab-customers')?.remove()
  document.getElementById('tab-suppliers')?.remove()
  document.getElementById('roles-access-card')?.remove()
  const pageHeader = document.querySelector('.page-header p')
  if (pageHeader) pageHeader.textContent = 'Executer directory and order assignment for the sales team.'
}

function switchTab(name) {
  currentTab = name
  ;['employees', 'customers', 'suppliers'].forEach(t => {
    const panel = document.getElementById(`tab-${t}`)
    if (panel) panel.style.display = t === name ? '' : 'none'
    document.getElementById(`tab-btn-${t}`)?.classList.toggle('active', t === name)
  })
  history.replaceState(null, '', `#${name}`)
}

// Employees
async function loadEmployees() {
  const [profilesRes, logsRes] = await Promise.all([
    db.from('profiles').select('*').order('created_at'),
    db.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(500),
  ])
  if (profilesRes.error) { toast(profilesRes.error.message, 'error'); return }
  if (logsRes.error) console.warn('activity_logs load error:', logsRes.error.message)

  allEmployees = (profilesRes.data || []).filter(u => isSalesProfilesMode() ? u.role === 'executer' : true)
  allEmployeeLogs = logsRes.data || []
  employeeActivityCounts = {}
  for (const l of allEmployeeLogs) {
    if (!l.user_id) continue
    employeeActivityCounts[l.user_id] = (employeeActivityCounts[l.user_id] || 0) + 1
  }
  renderEmployees()
}

function renderEmployees() {
  text('employee-count', `${isSalesProfilesMode() ? 'Executers' : 'Employees'} (${allEmployees.length})`)
  const subtitle = document.querySelector('#tab-employees .profile-toolbar-subtitle')
  if (subtitle) subtitle.textContent = isSalesProfilesMode()
    ? 'See all executers and assign open sales orders to them.'
    : 'Manage team access and activity history.'
  if (isSalesProfilesMode()) {
    document.querySelector('#tab-employees .profile-toolbar-actions')?.remove()
  }
  if (!allEmployees.length) {
    html('employees-body', `<tr><td colspan="6" class="empty-state">No employees found.</td></tr>`)
    return
  }

  html('employees-body', allEmployees.map(u => {
    const acts = employeeActivityCounts[u.id] || 0
    return `<tr class="drill-row" style="cursor:pointer;" onclick="openEmployeeProfile('${u.id}')">
      <td class="fw-600">
        ${esc(u.full_name || 'Unnamed')}
        ${u.id === myId ? '<span class="text-muted text-xs"> (you)</span>' : ''}
      </td>
      <td class="text-muted">${esc(u.email || '-')}</td>
      <td>${badge(u.role || 'executer')}</td>
      <td>${acts} action${acts !== 1 ? 's' : ''}</td>
      <td class="text-muted">${u.created_at ? fmtDate(u.created_at) : '-'}</td>
      <td style="text-align:right;white-space:nowrap;" onclick="event.stopPropagation()">
        ${!isSalesProfilesMode() && u.id !== myId ? `
          <button class="btn btn-ghost btn-sm" onclick="openEditUserModal('${u.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-ghost btn-sm" style="color:#ef4444" onclick="confirmDeleteUser('${u.id}','${safeArg(u.full_name || u.email || u.id)}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        ` : `<span class="text-xs text-muted">${isSalesProfilesMode() ? 'Open profile' : 'Own account'}</span>`}
      </td>
    </tr>`
  }).join(''))
}

function openEmployeeProfile(userId) {
  const u = allEmployees.find(x => x.id === userId)
  if (!u) return
  const logs = allEmployeeLogs.filter(l => l.user_id === userId)
  const latest = logs.slice(0, 25)
  const actionTypes = {}
  logs.forEach(l => { actionTypes[l.action_type] = (actionTypes[l.action_type] || 0) + 1 })
  const actionRows = Object.entries(actionTypes)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<span class="badge badge-staff" style="margin-right:6px;margin-bottom:6px;">${esc(k)}: ${v}</span>`)
    .join('') || '<span class="text-muted">No activity yet</span>'

  const salesAssignmentHtml = isSalesProfilesMode() ? buildSalesExecuterAssignmentHtml(u.id) : ''

  setProfileMode('employees', 'detail')
  html('employee-detail', `
    <div class="card">
      <div class="card-header">
        <div>
          <h2>${esc(u.full_name || u.email || 'Employee')}</h2>
          <p class="text-muted text-sm">${esc(u.email || '')}</p>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="closeEmployeeProfile()"><i class="fa-solid fa-arrow-left"></i> Back to Employees</button>
      </div>
      <div style="padding:16px;">
        <div class="stats-grid" style="margin-bottom:16px;">
          <div class="stat-card"><div class="stat-label">Role</div><div class="stat-value" style="font-size:20px;">${esc(u.role || 'executer')}</div></div>
          <div class="stat-card"><div class="stat-label">Activity Rows</div><div class="stat-value" style="font-size:20px;">${logs.length}</div></div>
          <div class="stat-card"><div class="stat-label">Joined</div><div class="stat-value" style="font-size:20px;">${u.created_at ? fmtDate(u.created_at) : '-'}</div></div>
        </div>
        ${salesAssignmentHtml}
        <div style="margin-bottom:16px;">${actionRows}</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Label</th></tr></thead>
            <tbody>
              ${latest.length ? latest.map(l => `<tr>
                <td class="text-muted">${fmtDateTime(l.created_at)}</td>
                <td>${esc(l.action_type)}</td>
                <td>${esc(l.entity_type || '-')}</td>
                <td>${esc(l.entity_label || l.entity_id || '-')}</td>
              </tr>`).join('') : `<tr><td colspan="4" class="empty-state">No activity found for this employee.</td></tr>`}
            </tbody>
          </table>
        </div>
        <div style="margin-top:12px;">
          <a class="btn btn-ghost btn-sm" href="activity-log.html?user=${encodeURIComponent(userId)}">
            <i class="fa-solid fa-clock-rotate-left"></i> Open Full Activity Log
          </a>
        </div>
      </div>
    </div>
  `)
  document.getElementById('employee-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function loadSalesOrders() {
  if (!myId) return
  const { data, error } = await db
    .from('orders')
    .select('id, order_uid, customer_id, status, created_at, order_date, notes, assigned_executor_id')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) { console.warn('sales order load error:', error.message); return }
  allSalesOrders = data || []
}

function buildSalesExecuterAssignmentHtml(executerId) {
  const orders = allSalesOrders.filter(o => ['inquiry', 'processing'].includes(orderStatus(o)))
  if (!orders.length) {
    return `<div class="card" style="box-shadow:none;margin-bottom:16px;"><div style="padding:14px 16px;" class="text-muted">No open orders are waiting for executer assignment.</div></div>`
  }
  return `
    <div class="card" style="box-shadow:none;margin-bottom:16px;">
      <div class="card-header">
        <div>
          <h2>Assign Orders</h2>
          <span class="text-muted text-sm">Choose which active sales order should go to this executer.</span>
        </div>
      </div>
      <div style="padding:16px;">
        ${orders.map(o => `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
            <div>
              <div class="fw-600">${esc(o.order_uid || o.id)}</div>
              <div class="text-xs text-muted">${fmtDateTime(o.order_date || o.created_at)} | ${esc(orderStatus(o))}${o.assigned_executor_id ? ' | already assigned' : ''}</div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="assignExecuterFromProfiles('${o.id}','${executerId}')">
              ${o.assigned_executor_id === executerId ? 'Reassign to This Executer' : 'Assign'}
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `
}

async function assignExecuterFromProfiles(orderId, executerId) {
  const order = allSalesOrders.find(o => o.id === orderId)
  const shouldMoveToProcessing = orderStatus(order) === 'inquiry'
  const updates = {
    assigned_executor_id: executerId,
    assigned_at: new Date().toISOString(),
    assigned_by: myId,
  }
  if (shouldMoveToProcessing) updates.status = 'processing'
  const { error } = await db.from('orders').update(updates).eq('id', orderId)
  if (error) {
    if (/assigned_executor_id|assigned_at|assigned_by/i.test(error.message || '')) {
      toast('Run 008_order_executor_assignment.sql in Supabase to enable executer assignment.', 'error')
      return
    }
    toast(error.message, 'error')
    return
  }
  await logActivity('assign', 'order', orderId, orderId, {
    assigned_executor_id: executerId,
    status: shouldMoveToProcessing ? { old: 'inquiry', new: 'processing' } : undefined,
  })
  toast(shouldMoveToProcessing ? 'Executer assigned and order moved to processing' : 'Executer assigned to order')
  await loadSalesOrders()
  openEmployeeProfile(executerId)
}

function closeEmployeeProfile() {
  html('employee-detail', '')
  setProfileMode('employees', 'list')
}

function openAddUserModal() {
  const roleOpts = ROLES.map(r => `<option value="${r}">${r}</option>`).join('')
  openModal('Add Employee', `
    <div id="au-alert" class="alert alert-error"></div>
    <div class="form-group"><label>Full Name *</label><input id="au-name" placeholder="e.g. Amit Sharma"></div>
    <div class="form-group"><label>Email *</label><input id="au-email" type="email" placeholder="amit@company.com"></div>
    <div class="form-row cols-2">
      <div class="form-group"><label>Temporary Password *</label><input id="au-pass" type="password" placeholder="Min 6 characters"></div>
      <div class="form-group"><label>Role *</label><select id="au-role">${roleOpts}</select></div>
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="au-save-btn" onclick="saveNewUser()"><i class="fa-solid fa-user-plus"></i> Create Employee</button>
    </div>
  `)
}

async function saveNewUser() {
  hideAlert('au-alert')
  const fullName = val('au-name')
  const email = val('au-email')
  const password = document.getElementById('au-pass').value
  const role = document.getElementById('au-role').value
  if (!fullName) { showAlert('au-alert', 'Full name is required'); return }
  if (!email) { showAlert('au-alert', 'Email is required'); return }
  if (!password || password.length < 6) { showAlert('au-alert', 'Password must be at least 6 characters'); return }

  disable('au-save-btn')
  let result
  try {
    result = await adminUserAction('createUser', { email, password, fullName, role })
  } catch (error) {
    showAlert('au-alert', `${error.message}. Deploy supabase/functions/admin-users for secure employee management.`)
    disable('au-save-btn', false)
    return
  }
  const userId = result.user?.id
  await logActivity('create', 'employee', userId, fullName, { role })
  toast(`Employee "${fullName}" created`)
  closeModal()
  await loadEmployees()
}

function openEditUserModal(userId) {
  const u = allEmployees.find(x => x.id === userId)
  if (!u) return
  const roleOpts = ROLES.map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')
  const isTargetAdmin = u.role === 'admin'
  openModal('Edit Employee', `
    <div id="eu-alert" class="alert alert-error"></div>
    <div class="form-group"><label>Full Name</label><input id="eu-name" value="${esc(u.full_name || '')}"></div>
    <div class="form-group">
      <label>Email ${isTargetAdmin ? '<span class="text-xs text-muted">Admin email cannot be changed here</span>' : ''}</label>
      <input id="eu-email" type="email" value="${esc(u.email || '')}" ${isTargetAdmin ? 'disabled' : ''}>
    </div>
    <div class="form-group"><label>Role</label><select id="eu-role">${roleOpts}</select></div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      ${isTargetAdmin ? '' : `<button class="btn btn-secondary" onclick="openResetUserPasswordModal('${userId}')"><i class="fa-solid fa-key"></i> Reset Password</button>`}
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveUserEdit('${userId}')">Save Changes</button>
    </div>
  `)
}

async function saveUserEdit(userId) {
  hideAlert('eu-alert')
  const target = allEmployees.find(x => x.id === userId)
  const fullName = val('eu-name') || null
  const email = val('eu-email') || null
  const role = document.getElementById('eu-role').value
  if (target?.role !== 'admin' && email && email.toLowerCase() !== String(target?.email || '').toLowerCase()) {
    try {
      await adminUserAction('updateUserEmail', { userId, email })
    } catch (error) {
      showAlert('eu-alert', `${error.message}. Deploy supabase/functions/admin-users for secure employee management.`)
      return
    }
  }
  const updates = { full_name: fullName, role }
  if (target?.role !== 'admin' && email) updates.email = email
  const { error } = await db.from('profiles').update(updates).eq('id', userId)
  if (error) { showAlert('eu-alert', error.message); return }
  await logActivity('update', 'employee', userId, fullName || userId, { role, email_changed_to: updates.email || undefined })
  toast('Employee updated')
  closeModal()
  await loadEmployees()
}

function openResetUserPasswordModal(userId) {
  const u = allEmployees.find(x => x.id === userId)
  if (!u || u.role === 'admin') return
  openModal('Reset Employee Password', `
    <div id="rp-alert" class="alert alert-error"></div>
    <p class="text-sm text-muted" style="margin-bottom:12px;">Current passwords cannot be viewed. Set a new temporary password for <strong>${esc(u.full_name || u.email || userId)}</strong>.</p>
    <div class="form-row cols-2">
      <div class="form-group"><label>New Temporary Password *</label><input id="rp-pass" type="password" placeholder="At least 6 characters"></div>
      <div class="form-group"><label>Confirm Password *</label><input id="rp-pass2" type="password" placeholder="Re-enter password"></div>
    </div>
    <div class="modal-footer" style="padding:0;margin-top:1rem;">
      <button class="btn btn-secondary" onclick="openEditUserModal('${userId}')">Back</button>
      <button class="btn btn-primary" id="rp-save-btn" onclick="saveResetUserPassword('${userId}')">Reset Password</button>
    </div>
  `)
}

async function saveResetUserPassword(userId) {
  hideAlert('rp-alert')
  const target = allEmployees.find(x => x.id === userId)
  if (!target || target.role === 'admin') {
    showAlert('rp-alert', 'Admin passwords cannot be reset from this screen')
    return
  }
  const password = document.getElementById('rp-pass')?.value || ''
  const confirm = document.getElementById('rp-pass2')?.value || ''
  if (!password || password.length < 6) {
    showAlert('rp-alert', 'Password must be at least 6 characters')
    return
  }
  if (password !== confirm) {
    showAlert('rp-alert', 'Passwords do not match')
    return
  }
  disable('rp-save-btn')
  try {
    await adminUserAction('resetPassword', { userId, password })
  } catch (error) {
    disable('rp-save-btn', false)
    showAlert('rp-alert', `${error.message}. Deploy supabase/functions/admin-users for secure employee management.`)
    return
  }
  disable('rp-save-btn', false)
  await logActivity('update', 'employee', userId, target.full_name || target.email || userId, { password_reset: true })
  toast('Employee password reset')
  closeModal()
}

function confirmDeleteUser(userId, label) {
  label = decodeURIComponent(label)
  openModal('Delete Employee', `
    <div id="du-alert" class="alert alert-error"></div>
    <p style="margin-bottom:16px;">Delete <strong>${esc(label)}</strong>?</p>
    <p class="text-sm text-muted">This removes login access. Their previous activity logs remain.</p>
    <div class="modal-footer" style="padding:0;margin-top:1.5rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" style="background:#ef4444;border-color:#ef4444" id="du-confirm-btn" onclick="deleteUser('${userId}','${safeArg(label)}')">Delete</button>
    </div>
  `)
}

async function deleteUser(userId, label) {
  label = decodeURIComponent(label)
  disable('du-confirm-btn')
  try {
    await adminUserAction('deleteUser', { userId })
  } catch (error) {
    showAlert('du-alert', `${error.message}. Deploy supabase/functions/admin-users for secure employee management.`)
    disable('du-confirm-btn', false)
    return
  }
  await logActivity('delete', 'employee', userId, label)
  toast(`Employee "${label}" deleted`)
  closeModal()
  await loadEmployees()
}

// Customers
async function loadCustomers() {
  const [custRes, ordersRes] = await Promise.all([
    CUSTOMER_SOURCE.loadCustomers(),
    db.from('orders')
      .select('id, order_uid, cust_id, dealer_name, customer_name, status, total_amount, cost_amount, created_at, order_date, source_bill_no, deleted_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])
  if (custRes.error) { toast(custRes.error.message, 'error'); return }
  if (ordersRes.error) console.warn('orders load error:', ordersRes.error.message)
  allCustomers = (custRes.data || []).map(CUSTOMER_SOURCE.normalize)
  allCustomerOrders = ordersRes.data || []
  buildCustomerStats()
  renderCustomers()
}

function buildCustomerStats() {
  customerStats = {}
  allCustomers.forEach(c => { customerStats[c.id] = { count: 0, value: 0, orders: [] } })
  for (const o of allCustomerOrders) {
    if (!o.cust_id) continue
    if (!customerStats[o.cust_id]) customerStats[o.cust_id] = { count: 0, value: 0, orders: [] }
    customerStats[o.cust_id].count += 1
    customerStats[o.cust_id].value += Number(o.total_amount || 0)
    customerStats[o.cust_id].orders.push(o)
  }
}

function renderCustomers() {
  const q = (document.getElementById('cust-search-input')?.value || '').toLowerCase()
  let list = allCustomers
  if (q) {
    list = list.filter(c =>
      `${c.name || ''} ${c.phone || ''} ${c.phone2 || ''} ${c.city || ''} ${c.state || ''} ${c.gstin || ''}`.toLowerCase().includes(q)
    )
  }
  text('cust-count', `Customers (${list.length} of ${allCustomers.length})`)
  if (!list.length) {
    html('customers-body', `<tr><td colspan="7" class="empty-state">No customers found.</td></tr>`)
    return
  }
  html('customers-body', list.map(c => {
    const st = customerStats[c.id] || { count: 0, value: 0 }
    return `<tr class="drill-row" style="cursor:pointer;" onclick="openCustomerProfile('${c.id}')">
      <td class="fw-600">${esc(c.name || 'Unnamed')}</td>
      <td class="text-muted">${esc(c.phone || '-')}<br><span class="text-xs">${esc(c.email || '')}</span></td>
      <td class="text-muted">${esc([c.city, c.state].filter(Boolean).join(', ') || '-')}</td>
      <td class="text-muted text-xs">${esc(c.gstin || '-')}</td>
      <td>${st.count} order${st.count !== 1 ? 's' : ''}</td>
      <td class="tr fw-600">${profileMoney(st.value)}</td>
      <td style="text-align:right;white-space:nowrap;" onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm" onclick="openCustomerProfile('${c.id}')" title="Open"><i class="fa-solid fa-folder-open"></i></button>
        <button class="btn btn-ghost btn-sm" onclick="openEditCustomerModal('${c.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-ghost btn-sm" style="color:#ef4444" onclick="confirmDeleteCustomer('${c.id}','${safeArg(c.name || '')}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`
  }).join(''))
}

function openCustomerProfile(id) {
  const c = allCustomers.find(x => x.id === id)
  if (!c) return
  const st = customerStats[id] || { count: 0, value: 0, orders: [] }
  const orders = [...(st.orders || [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))

  const years = new Map()
  orders.forEach(o => {
    const y = yearKey(o.created_at)
    const m = monthKey(o.created_at)
    if (!years.has(y)) years.set(y, new Map())
    if (!years.get(y).has(m)) years.get(y).set(m, [])
    years.get(y).get(m).push(o)
  })

  const groupedOrders = [...years.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, months]) => {
      const yearOrders = [...months.values()].flat()
      const yearValue = yearOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0)
      const monthBlocks = [...months.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([mk, monthOrders]) => {
          const monthValue = monthOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0)
          return `<details open style="border:1px solid var(--border);border-radius:10px;margin:10px 0;background:#fff;">
            <summary style="cursor:pointer;padding:12px 14px;display:flex;justify-content:space-between;gap:12px;">
              <span><strong>${esc(monthLabel(mk))}</strong> <span class="text-muted">- ${monthOrders.length} order${monthOrders.length !== 1 ? 's' : ''}</span></span>
              <span class="fw-600">${profileMoney(monthValue)}</span>
            </summary>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Bill No.</th><th class="tr">Value</th></tr></thead>
                <tbody>${monthOrders.map(o => `<tr>
                  <td><a href="order-detail.html?id=${o.id}" style="color:var(--accent);font-family:monospace;font-weight:600;">${esc(o.order_uid || o.id.slice(0,8))}</a></td>
                  <td>${fmtDate(o.order_date || o.created_at)}</td>
                  <td>${badge(orderStatus(o))}</td>
                  <td class="text-muted">${esc(o.source_bill_no || '-')}</td>
                  <td class="tr fw-600">${profileMoney(o.total_amount)}</td>
                </tr>`).join('')}</tbody>
              </table>
            </div>
          </details>`
        }).join('')
      return `<details open style="margin-bottom:16px;">
        <summary class="section-title" style="cursor:pointer;margin:0 0 8px;">${esc(year)} - ${yearOrders.length} order${yearOrders.length !== 1 ? 's' : ''} - ${profileMoney(yearValue)}</summary>
        ${monthBlocks}
      </details>`
    }).join('') || `<div class="empty-state">No orders yet.</div>`

  setProfileMode('customers', 'detail')
  html('customer-detail', `
    <div class="card">
      <div class="card-header">
        <div>
          <h2>${esc(c.name || 'Customer')}</h2>
          <p class="text-muted text-sm">${esc([c.phone, c.email, c.city].filter(Boolean).join(' | '))}</p>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="closeCustomerProfile()"><i class="fa-solid fa-arrow-left"></i> Back to Customers</button>
      </div>
      <div style="padding:16px;">
        <div class="stats-grid" style="margin-bottom:16px;">
          <div class="stat-card"><div class="stat-label">Orders</div><div class="stat-value" style="font-size:22px;">${st.count}</div></div>
          <div class="stat-card"><div class="stat-label">Total Order Value</div><div class="stat-value" style="font-size:22px;">${profileMoney(st.value)}</div></div>
          <div class="stat-card"><div class="stat-label">GSTIN</div><div class="stat-value" style="font-size:16px;">${esc(c.gstin || '-')}</div></div>
        </div>
        <div class="card" style="box-shadow:none;margin-bottom:16px;">
          <div style="padding:14px 16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;font-size:13px;">
            <div><strong>Contact:</strong><br>${esc(c.contact_person || c.name || '-')}</div>
            <div><strong>Phone:</strong><br>${esc([c.phone, c.phone2].filter(Boolean).join(', ') || '-')}</div>
            <div><strong>Email:</strong><br>${esc(c.email || '-')}</div>
            <div><strong>Address:</strong><br>${esc([c.address, c.city, c.state].filter(Boolean).join(', ') || '-')}</div>
          </div>
        </div>
        ${groupedOrders}
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
          <a class="btn btn-ghost btn-sm" href="orders.html?cust=${encodeURIComponent(id)}">Open In Orders</a>
          <a class="btn btn-ghost btn-sm" href="reports.html?tab=outward&customer=${encodeURIComponent(id)}">Open In Reports</a>
        </div>
      </div>
    </div>
  `)
  document.getElementById('customer-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function closeCustomerProfile() {
  html('customer-detail', '')
  setProfileMode('customers', 'list')
}

function customerFormFields(c = {}) {
  return CUSTOMER_SOURCE.formFields('cf', c)
}

function customerFormValues() {
  return CUSTOMER_SOURCE.readForm('cf')
}

function openAddCustomerModal() {
  openModal('Add Customer', `<div id="cf-alert" class="alert alert-error"></div>${customerFormFields()}<div class="modal-footer" style="padding:0;margin-top:1rem;"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="cf-save-btn" onclick="saveNewCustomer()">Add Customer</button></div>`)
}

async function saveNewCustomer() {
  hideAlert('cf-alert')
  const vals = customerFormValues()
  if (!vals.name) { showAlert('cf-alert', 'Name is required'); return }
  disable('cf-save-btn')
  const { error } = await saveProfileRow('customers', vals, 'insert')
  if (error) { showAlert('cf-alert', error.message); disable('cf-save-btn', false); return }
  toast('Customer added')
  closeModal()
  await loadCustomers()
}

function openEditCustomerModal(id) {
  const c = allCustomers.find(x => x.id === id)
  if (!c) return
  openModal('Edit Customer', `<div id="cf-alert" class="alert alert-error"></div>${customerFormFields(c)}<div class="modal-footer" style="padding:0;margin-top:1rem;"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="cf-save-btn" onclick="saveEditCustomer('${id}')">Save Changes</button></div>`)
}

async function saveEditCustomer(id) {
  hideAlert('cf-alert')
  const vals = customerFormValues()
  if (!vals.name) { showAlert('cf-alert', 'Name is required'); return }
  disable('cf-save-btn')
  const { error } = await saveProfileRow('customers', { ...vals, updated_at: new Date().toISOString() }, 'update', id)
  if (error) { showAlert('cf-alert', error.message); disable('cf-save-btn', false); return }
  toast('Customer updated')
  closeModal()
  await loadCustomers()
  openCustomerProfile(id)
}

function confirmDeleteCustomer(id, label) {
  label = decodeURIComponent(label)
  openModal('Delete Customer', `<div id="dc-alert" class="alert alert-error"></div><p>Delete <strong>${esc(label)}</strong>?</p><p class="text-sm text-muted">Orders remain for accounting history.</p><div class="modal-footer" style="padding:0;margin-top:1.5rem;"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" style="background:#ef4444;border-color:#ef4444" id="dc-btn" onclick="deleteCustomer('${id}','${safeArg(label)}')">Delete</button></div>`)
}

async function deleteCustomer(id, label) {
  label = decodeURIComponent(label)
  disable('dc-btn')
  const { error } = await db.from('customers').delete().eq('id', id)
  if (error) { showAlert('dc-alert', error.message); disable('dc-btn', false); return }
  toast(`Customer "${label}" deleted`)
  closeModal()
  await loadCustomers()
}

function exportCustomersExcel() {
  const rows = [['Name','Contact','Phone','Email','City','State','GSTIN','Orders','Order Value']]
  allCustomers.forEach(c => {
    const st = customerStats[c.id] || { count: 0, value: 0 }
    rows.push([c.name, c.contact_person || '', c.phone || '', c.email || '', c.city || '', c.state || '', c.gstin || '', st.count, st.value])
  })
  const ok = exportWorkbook([
    { name: 'Customers', rows, cols: rows[0].map(() => ({ wch: 20 })) },
  ], `Vista-Customers-${todayStamp()}.xlsx`)
  if (ok) toast('Customers exported to Excel')
}

// Suppliers
async function loadSuppliers() {
  const rollsRes = await db.from('inv_rolls').select(`
    id, batch_code, original_length, remaining_length, unit, purchase_rate, stock_value,
    inward_date, bill_no, supplier, created_at,
    inv_variants(id, name, unit, purchase_rate, inv_products(name, inv_categories(name, sub_group)))
  `).order('inward_date', { ascending: false })
  if (rollsRes.error) { toast(rollsRes.error.message, 'error'); return }
  allSupplierRolls = (rollsRes.data || []).map(r => ({
    ...r,
    variantId: r.inv_variants?.id,
    variantName: r.inv_variants?.name || '-',
    categoryName: r.inv_variants?.inv_products?.inv_categories?.name || '-',
    effectiveRate: Number(r.purchase_rate || r.inv_variants?.purchase_rate || 0),
    effectiveValue: Number(r.stock_value || 0) || Number(r.original_length || 0) * Number(r.purchase_rate || r.inv_variants?.purchase_rate || 0),
  }))

  const supRes = await db.from('suppliers').select('*').order('name')
  if (supRes.error) {
    supplierTableReady = false
    console.warn('suppliers table load error:', supRes.error.message)
    allSuppliers = []
  } else {
    supplierTableReady = true
    allSuppliers = supRes.data || []
  }
  buildSupplierStats()
  renderSuppliers()
}

function buildSupplierStats() {
  supplierStats = {}
  for (const r of allSupplierRolls) {
    const name = r.supplier || 'Unknown Supplier'
    if (!supplierStats[name]) supplierStats[name] = { bills: new Set(), value: 0, rows: [] }
    supplierStats[name].bills.add(r.bill_no || 'No bill')
    supplierStats[name].value += r.effectiveValue
    supplierStats[name].rows.push(r)
  }
}

function mergedSuppliers() {
  const byName = new Map()
  allSuppliers.forEach(s => byName.set(s.name, { ...s, source: 'profile' }))
  Object.keys(supplierStats).forEach(name => {
    if (!byName.has(name)) byName.set(name, { id: null, name, source: 'inward' })
  })
  return [...byName.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

function renderSuppliers() {
  const q = (document.getElementById('supplier-search-input')?.value || '').toLowerCase()
  let list = mergedSuppliers()
  if (q) list = list.filter(s => `${s.name || ''} ${s.phone || ''} ${s.gstin || ''} ${s.city || ''}`.toLowerCase().includes(q))
  text('supplier-count', `Suppliers (${list.length})${supplierTableReady ? '' : ' - run migration 005 to save supplier profiles'}`)
  if (!list.length) {
    html('suppliers-body', `<tr><td colspan="6" class="empty-state">No suppliers found.</td></tr>`)
    return
  }
  html('suppliers-body', list.map(s => {
    const st = supplierStats[s.name] || { bills: new Set(), value: 0, rows: [] }
    return `<tr class="drill-row" style="cursor:pointer;" onclick="openSupplierProfile('${safeArg(s.name)}')">
      <td class="fw-600">${esc(s.name || 'Unnamed')}${s.source === 'inward' ? '<div class="text-xs text-muted">from purchase bills</div>' : ''}</td>
      <td class="text-muted">${esc([s.contact_person, s.phone, s.email].filter(Boolean).join(' | ') || '-')}</td>
      <td class="text-muted text-xs">${esc(s.gstin || '-')}</td>
      <td>${st.bills.size} bill${st.bills.size !== 1 ? 's' : ''}</td>
      <td class="tr fw-600">${profileMoney(st.value)}</td>
      <td style="text-align:right;white-space:nowrap;" onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm" onclick="openSupplierProfile('${safeArg(s.name)}')" title="Open"><i class="fa-solid fa-folder-open"></i></button>
        ${s.id ? `
          <button class="btn btn-ghost btn-sm" onclick="openEditSupplierModal('${s.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-ghost btn-sm" style="color:#ef4444" onclick="confirmDeleteSupplier('${s.id}','${safeArg(s.name)}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        ` : `<button class="btn btn-ghost btn-sm" onclick="openAddSupplierModal('${safeArg(s.name)}')" title="Create profile"><i class="fa-solid fa-address-card"></i></button>`}
      </td>
    </tr>`
  }).join(''))
}

function openSupplierProfile(encodedName) {
  const name = decodeURIComponent(encodedName)
  const profile = allSuppliers.find(s => s.name === name) || { name }
  const rows = [...(supplierStats[name]?.rows || [])]
  const total = rows.reduce((s, r) => s + r.effectiveValue, 0)
  const years = new Map()
  rows.forEach(r => {
    const yk = yearKey(r.inward_date)
    const mk = monthKey(r.inward_date)
    if (!years.has(yk)) years.set(yk, new Map())
    if (!years.get(yk).has(mk)) years.get(yk).set(mk, [])
    years.get(yk).get(mk).push(r)
  })

  const yearSections = [...years.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([yk, months]) => {
    const yRows = [...months.values()].flat()
    const yTotal = yRows.reduce((s, r) => s + r.effectiveValue, 0)
    const monthSections = [...months.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([mk, mRows]) => {
      const bills = new Map()
      mRows.forEach(r => {
        const key = `${r.bill_no || 'No bill'}||${r.inward_date || ''}`
        if (!bills.has(key)) bills.set(key, [])
        bills.get(key).push(r)
      })
      const billHtml = [...bills.entries()].map(([key, bRows]) => {
        const [billNo, date] = key.split('||')
        const billTotal = bRows.reduce((s, r) => s + r.effectiveValue, 0)
        return `<details style="border:1px solid var(--border);border-radius:10px;margin-bottom:10px;background:#fff;">
          <summary style="cursor:pointer;padding:12px 14px;display:flex;justify-content:space-between;gap:12px;">
            <span><strong>${esc(billNo)}</strong> <span class="text-muted"> | ${date ? fmtDate(date) : 'No date'}</span></span>
            <span class="fw-600">${profileMoney(billTotal)}</span>
          </summary>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Item</th><th>Category</th><th>Batch</th><th class="tr">Qty</th><th class="tr">Rate</th><th class="tr">Value</th></tr></thead>
              <tbody>${bRows.map(r => `<tr>
                <td><a href="inventory.html?${r.variantId ? `variant=${encodeURIComponent(r.variantId)}` : `q=${encodeURIComponent(r.variantName)}`}" style="color:var(--accent);font-weight:600;">${esc(r.variantName)}</a></td>
                <td class="text-muted">${esc(r.categoryName)}</td>
                <td class="text-muted">${esc(r.batch_code || '-')}</td>
                <td class="tr">${Number(r.original_length || 0)} ${esc(r.unit || '')}</td>
                <td class="tr">${profileMoney(r.effectiveRate)}</td>
                <td class="tr fw-600">${profileMoney(r.effectiveValue)}</td>
              </tr>`).join('')}</tbody>
            </table>
          </div>
        </details>`
      }).join('')
      const monthTotal = mRows.reduce((s, r) => s + r.effectiveValue, 0)
      return `<details open style="margin:10px 0 14px;">
        <summary style="cursor:pointer;font-weight:700;color:var(--text);padding:8px 0;">${esc(monthLabel(mk))} - ${profileMoney(monthTotal)}</summary>
        ${billHtml}
      </details>`
    }).join('')
    return `<details open style="margin-bottom:16px;">
      <summary class="section-title" style="cursor:pointer;margin:0 0 8px;">${esc(yk)} - ${profileMoney(yTotal)}</summary>
      ${monthSections}
    </details>`
  }).join('') || `<div class="empty-state">No purchase bills found for this supplier.</div>`

  setProfileMode('suppliers', 'detail')
  html('supplier-detail', `
    <div class="card">
      <div class="card-header">
        <div>
          <h2>${esc(name)}</h2>
          <p class="text-muted text-sm">${esc([profile.contact_person, profile.phone, profile.email, profile.city].filter(Boolean).join(' | '))}</p>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="closeSupplierProfile()"><i class="fa-solid fa-arrow-left"></i> Back to Suppliers</button>
      </div>
      <div style="padding:16px;">
        <div class="stats-grid" style="margin-bottom:16px;">
          <div class="stat-card"><div class="stat-label">Bills</div><div class="stat-value" style="font-size:22px;">${supplierStats[name]?.bills.size || 0}</div></div>
          <div class="stat-card"><div class="stat-label">Purchased Items</div><div class="stat-value" style="font-size:22px;">${rows.length}</div></div>
          <div class="stat-card"><div class="stat-label">Purchase Value</div><div class="stat-value" style="font-size:22px;">${profileMoney(total)}</div></div>
        </div>
        <div style="margin-bottom:12px;">
          <a class="btn btn-ghost btn-sm" href="reports.html?tab=inward&supplier=${encodeURIComponent(name)}">Open Supplier In Reports</a>
        </div>
        ${yearSections}
      </div>
    </div>
  `)
  document.getElementById('supplier-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function closeSupplierProfile() {
  html('supplier-detail', '')
  setProfileMode('suppliers', 'list')
}

function supplierFormFields(s = {}) {
  return `
    <div class="form-row cols-2">
      <div class="form-group"><label>Supplier Name *</label><input id="sf-name" value="${esc(s.name || '')}"></div>
      <div class="form-group"><label>Contact Person</label><input id="sf-contact" value="${esc(s.contact_person || '')}"></div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group"><label>Phone</label><input id="sf-phone" value="${esc(s.phone || '')}"></div>
      <div class="form-group"><label>Alternate Phone</label><input id="sf-phone2" value="${esc(s.phone2 || '')}"></div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group"><label>Email</label><input id="sf-email" value="${esc(s.email || '')}"></div>
      <div class="form-group"><label>GSTIN</label><input id="sf-gstin" value="${esc(s.gstin || '')}" style="text-transform:uppercase;"></div>
    </div>
    <div class="form-group"><label>Address</label><input id="sf-address" value="${esc(s.address || '')}"></div>
    <div class="form-row cols-2">
      <div class="form-group"><label>City</label><input id="sf-city" value="${esc(s.city || '')}"></div>
      <div class="form-group"><label>State</label><input id="sf-state" value="${esc(s.state || '')}"></div>
    </div>
    <div class="form-group"><label>Notes</label><input id="sf-notes" value="${esc(s.notes || '')}"></div>`
}

function supplierFormValues() {
  return {
    name: val('sf-name'),
    contact_person: val('sf-contact') || null,
    phone: val('sf-phone') || null,
    phone2: val('sf-phone2') || null,
    email: val('sf-email') || null,
    gstin: val('sf-gstin') || null,
    address: val('sf-address') || null,
    city: val('sf-city') || null,
    state: val('sf-state') || null,
    notes: val('sf-notes') || null,
  }
}

async function saveProfileRow(table, values, mode, id = null) {
  const run = (payload, client = db) => {
    if (mode === 'insert') return client.from(table).insert(payload)
    return client.from(table).update(payload).eq('id', id)
  }

  const payload = { ...values }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await run(payload)
    if (!result.error) return result

    const missingColumn = String(result.error.message || '').match(/'([^']+)' column/i)?.[1]
    if (!missingColumn || !(missingColumn in payload)) return result
    delete payload[missingColumn]
  }
  return run(payload)
}

async function deleteProfileRow(table, id) {
  return db.from(table).delete().eq('id', id)
}

function openAddSupplierModal(prefillName = '') {
  prefillName = prefillName ? decodeURIComponent(prefillName) : ''
  if (!supplierTableReady) {
    openModal('Supplier Profiles Need Migration', `<p>Run <code>supabase/migrations/006_fix_profile_optional_fields_and_rls.sql</code> in Supabase first, then reload this page.</p>`)
    return
  }
  openModal('Add Supplier', `<div id="sf-alert" class="alert alert-error"></div>${supplierFormFields({ name: prefillName })}<div class="modal-footer" style="padding:0;margin-top:1rem;"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="sf-save-btn" onclick="saveNewSupplier()">Add Supplier</button></div>`)
}

async function saveNewSupplier() {
  hideAlert('sf-alert')
  const vals = supplierFormValues()
  if (!vals.name) { showAlert('sf-alert', 'Supplier name is required'); return }
  disable('sf-save-btn')
  const { error } = await saveProfileRow('suppliers', vals, 'insert')
  if (error) { showAlert('sf-alert', error.message); disable('sf-save-btn', false); return }
  toast('Supplier added')
  closeModal()
  await loadSuppliers()
}

function openEditSupplierModal(id) {
  const s = allSuppliers.find(x => x.id === id)
  if (!s) return
  openModal('Edit Supplier', `<div id="sf-alert" class="alert alert-error"></div>${supplierFormFields(s)}<div class="modal-footer" style="padding:0;margin-top:1rem;"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="sf-save-btn" onclick="saveEditSupplier('${id}')">Save Changes</button></div>`)
}

async function saveEditSupplier(id) {
  hideAlert('sf-alert')
  const vals = supplierFormValues()
  if (!vals.name) { showAlert('sf-alert', 'Supplier name is required'); return }
  disable('sf-save-btn')
  const { error } = await saveProfileRow('suppliers', { ...vals, updated_at: new Date().toISOString() }, 'update', id)
  if (error) { showAlert('sf-alert', error.message); disable('sf-save-btn', false); return }
  toast('Supplier updated')
  closeModal()
  await loadSuppliers()
  openSupplierProfile(encodeURIComponent(vals.name))
}

function confirmDeleteSupplier(id, encodedName) {
  const name = decodeURIComponent(encodedName)
  openModal('Delete Supplier', `
    <div id="ds-alert" class="alert alert-error"></div>
    <p>Delete supplier profile <strong>${esc(name)}</strong>?</p>
    <p class="text-sm text-muted">Purchase bill history stays intact because it comes from inward inventory records.</p>
    <div class="modal-footer" style="padding:0;margin-top:1.5rem;">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" style="background:#ef4444;border-color:#ef4444" id="ds-btn" onclick="deleteSupplier('${id}','${safeArg(name)}')">Delete</button>
    </div>
  `)
}

async function deleteSupplier(id, encodedName) {
  const name = decodeURIComponent(encodedName)
  disable('ds-btn')
  const { error } = await deleteProfileRow('suppliers', id)
  if (error) { showAlert('ds-alert', error.message); disable('ds-btn', false); return }
  toast(`Supplier "${name}" deleted`)
  closeModal()
  closeSupplierProfile()
  await loadSuppliers()
}

init()
