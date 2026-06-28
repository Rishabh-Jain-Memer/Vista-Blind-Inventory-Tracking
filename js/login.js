/*
  Login page controller for app-level username/password sessions.
*/

function loginLandingForRole(role) {
  if (role === 'executer') return 'executer-dashboard.html'
  if (role === 'sales') return 'tickets.html'
  if (role === 'management') return 'dashboard.html'
  return 'dashboard.html'
}

async function redirectForSession(session) {
  const role = session?.profile?.role || null
  window.location.href = loginLandingForRole(role)
}

(async () => {
  const form = document.getElementById('login-form')
  const btn = document.getElementById('login-btn')

  form.addEventListener('submit', async e => {
    e.preventDefault()
    hideAlert('login-alert')
    btn.disabled = true
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Signing in...'

    try {
      const { data, error } = await db.rpc('app_login', {
        p_username: val('username').trim(),
        p_password: val('password'),
      })
      if (error) throw error
      const row = data?.[0]
      if (!row?.token) throw new Error('Sign in succeeded but no session was returned. Try refreshing and signing in again.')
      AUTH.setToken(row.token)
      AUTH.cachedProfile = row
      await redirectForSession({ token: row.token, profile: row, user: { id: row.id } })
    } catch (err) {
      showAlert('login-alert', err.message || 'Sign in failed')
      btn.disabled = false
      btn.innerHTML = 'Sign in'
    }
  })

  const session = await AUTH.session()
  if (session) await redirectForSession(session)
})()
