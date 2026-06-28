/*
  Personal settings page controller.
  Lets any authenticated employee manage only their own password and view their
  own basic profile details. It does not expose admin profile management.
*/

let currentProfile = null

async function init() {
  const profile = await initSidebar()
  if (!profile) return
  currentProfile = profile
  renderAccountSummary()
  renderAdminTestMode()
  setVal('edit-name',  currentProfile.full_name || '')
  setVal('edit-username', currentProfile.username || '')
  hide('loading')
  show('content')
}

function renderAdminTestMode() {
  const card = document.getElementById('admin-test-mode-card')
  if (!card) return
  if (currentProfile?.role !== 'admin') {
    card.remove()
    return
  }
  const enabled = Boolean(window.VISTA_TEST_MODE?.isEnabled?.())
  const active = Boolean(window.VISTA_TEST_MODE?.isActive?.())
  const btn = document.getElementById('test-mode-toggle-btn')
  const status = document.getElementById('test-mode-status')
  if (btn) {
    btn.className = `btn btn-sm ${enabled ? 'btn-primary' : 'btn-secondary'}`
    btn.innerHTML = enabled
      ? '<i class="fa-solid fa-toggle-on"></i> Turn Off Test Mode'
      : '<i class="fa-solid fa-toggle-off"></i> Turn On Test Mode'
  }
  if (status) {
    status.className = `test-mode-status ${enabled ? 'is-active' : 'is-ready'}`
    status.textContent = enabled
      ? (active ? 'Active in this browser. Turning it off clears local test changes and reloads real data.' : 'Enabled, and it will activate after your admin session is confirmed.')
      : 'Ready. Actions currently write to the isolated Supabase project.'
  }
}

function toggleAdminTestMode() {
  if (currentProfile?.role !== 'admin') {
    toast('Only admin can use test mode', 'error')
    return
  }
  const next = !Boolean(window.VISTA_TEST_MODE?.isEnabled?.())
  if (!next && !confirm('Turn off test mode?\n\nAll local test changes will be discarded and the page will reload real data.')) return
  window.VISTA_TEST_MODE?.setEnabled?.(next)
  window.location.reload()
}

function renderAccountSummary() {
  html('account-summary', `
    <div class="stats-grid" style="margin-bottom:0;">
      <div class="stat-card"><div><div class="stat-label">Name</div><div class="stat-value" style="font-size:20px;">${esc(currentProfile.full_name || 'User')}</div></div><div class="stat-icon icon-indigo"><i class="fa-solid fa-user"></i></div></div>
      <div class="stat-card"><div><div class="stat-label">Username</div><div class="stat-value" style="font-size:18px;">${esc(currentProfile.username || '-')}</div></div><div class="stat-icon icon-blue"><i class="fa-solid fa-user-tag"></i></div></div>
      <div class="stat-card"><div><div class="stat-label">Role</div><div class="stat-value" style="font-size:20px;text-transform:capitalize;">${esc(currentProfile.role || '-')}</div></div><div class="stat-icon icon-green"><i class="fa-solid fa-shield-halved"></i></div></div>
    </div>
  `)
}

function clearPasswordForm() {
  setVal('new-password', '')
  setVal('current-password', '')
  setVal('confirm-password', '')
  hideAlert('password-alert')
}

function clearProfileForm() {
  setVal('edit-name',  currentProfile.full_name || '')
  setVal('edit-username', currentProfile.username || '')
  hideAlert('profile-alert')
}

async function saveProfile() {
  hideAlert('profile-alert')
  const newName  = val('edit-name').trim()
  const username = val('edit-username').trim().toLowerCase()

  if (!newName && !username) {
    showAlert('profile-alert', 'Enter a name or username to save')
    return
  }

  disable('save-profile-btn')
  const { data, error } = await db.rpc('app_update_own_profile', {
    p_token: AUTH.token(),
    p_username: username || currentProfile.username,
    p_full_name: newName || currentProfile.full_name || '',
  })
  disable('save-profile-btn', false)

  if (error) {
    showAlert('profile-alert', error.message)
    return
  }

  if (data?.[0]) {
    currentProfile = data[0]
    AUTH.cachedProfile = data[0]
  }
  renderAccountSummary()
  await logActivity('update', 'account', currentProfile.id, currentProfile.full_name || currentProfile.username, { username: currentProfile.username, full_name: currentProfile.full_name })
  toast('Profile updated')
}

async function savePassword() {
  hideAlert('password-alert')
  const current = document.getElementById('current-password')?.value || ''
  const password = document.getElementById('new-password')?.value || ''
  const confirm = document.getElementById('confirm-password')?.value || ''

  if (!current) {
    showAlert('password-alert', 'Current password is required')
    return
  }
  if (!password || password.length < 6) {
    showAlert('password-alert', 'Password must be at least 6 characters')
    return
  }
  if (password !== confirm) {
    showAlert('password-alert', 'Passwords do not match')
    return
  }

  disable('save-password-btn')
  const { error } = await db.rpc('app_change_password', {
    p_token: AUTH.token(),
    p_current_password: current,
    p_new_password: password,
  })
  disable('save-password-btn', false)
  if (error) {
    showAlert('password-alert', error.message)
    return
  }

  await logActivity('update', 'account', currentProfile.id, currentProfile.full_name || currentProfile.username, { password_changed: true })
  toast('Password updated')
  clearPasswordForm()
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

init()
