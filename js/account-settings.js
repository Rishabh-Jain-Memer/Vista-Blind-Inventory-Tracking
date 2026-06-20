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
  setVal('edit-name',  currentProfile.full_name || '')
  setVal('edit-email', currentProfile.email || '')
  hide('loading')
  show('content')
}

function renderAccountSummary() {
  html('account-summary', `
    <div class="stats-grid" style="margin-bottom:0;">
      <div class="stat-card"><div><div class="stat-label">Name</div><div class="stat-value" style="font-size:20px;">${esc(currentProfile.full_name || 'User')}</div></div><div class="stat-icon icon-indigo"><i class="fa-solid fa-user"></i></div></div>
      <div class="stat-card"><div><div class="stat-label">Email</div><div class="stat-value" style="font-size:18px;">${esc(currentProfile.email || '-')}</div></div><div class="stat-icon icon-blue"><i class="fa-solid fa-envelope"></i></div></div>
      <div class="stat-card"><div><div class="stat-label">Role</div><div class="stat-value" style="font-size:20px;text-transform:capitalize;">${esc(currentProfile.role || '-')}</div></div><div class="stat-icon icon-green"><i class="fa-solid fa-shield-halved"></i></div></div>
    </div>
  `)
}

function clearPasswordForm() {
  setVal('new-password', '')
  setVal('confirm-password', '')
  hideAlert('password-alert')
}

function clearProfileForm() {
  setVal('edit-name',  currentProfile.full_name || '')
  setVal('edit-email', currentProfile.email || '')
  hideAlert('profile-alert')
}

async function saveProfile() {
  hideAlert('profile-alert')
  const newName  = val('edit-name').trim()
  const newEmail = val('edit-email').trim()

  if (!newName && !newEmail) {
    showAlert('profile-alert', 'Enter a name or email to save')
    return
  }

  const updates = {}
  if (newName)  updates.full_name = newName
  if (newEmail) updates.email     = newEmail

  disable('save-profile-btn')
  const { error } = await db.from('profiles').update(updates).eq('id', currentProfile.id)
  disable('save-profile-btn', false)

  if (error) {
    showAlert('profile-alert', error.message)
    return
  }

  if (newName)  currentProfile.full_name = newName
  if (newEmail) currentProfile.email     = newEmail
  renderAccountSummary()
  await logActivity('update', 'account', currentProfile.id, currentProfile.full_name || currentProfile.email, updates)
  toast('Profile updated')
}

async function savePassword() {
  hideAlert('password-alert')
  const password = document.getElementById('new-password')?.value || ''
  const confirm = document.getElementById('confirm-password')?.value || ''

  if (!password || password.length < 6) {
    showAlert('password-alert', 'Password must be at least 6 characters')
    return
  }
  if (password !== confirm) {
    showAlert('password-alert', 'Passwords do not match')
    return
  }

  disable('save-password-btn')
  const { error } = await db.auth.updateUser({ password })
  disable('save-password-btn', false)
  if (error) {
    showAlert('password-alert', error.message)
    return
  }

  await logActivity('update', 'account', currentProfile.id, currentProfile.full_name || currentProfile.email, { password_changed: true })
  toast('Password updated')
  clearPasswordForm()
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

init()
