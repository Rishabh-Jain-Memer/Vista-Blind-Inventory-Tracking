/*
  Login page controller.
  Auth success should not depend on a perfect profile lookup. Role lookup only
  decides the landing page; if it fails, send the user to the admin dashboard.
*/

function loginLandingForRole(role) {
  if (role === 'customer') return 'customer-dashboard.html'
  if (role === 'executer') return 'executer-dashboard.html'
  if (role === 'sales') return 'orders.html'
  return 'dashboard.html'
}

async function loginProfileRole(userId) {
  if (!userId) return null
  const { data, error } = await db
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.warn('Profile role lookup failed:', error.message)
    return null
  }
  return data?.role || null
}

async function redirectForSession(session) {
  const role = await loginProfileRole(session?.user?.id)
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
      const { data, error } = await db.auth.signInWithPassword({
        email: val('email').trim(),
        password: val('password'),
      })
      if (error) throw error
      if (!data?.session) throw new Error('Sign in succeeded but no session was returned. Try refreshing and signing in again.')
      await redirectForSession(data.session)
    } catch (err) {
      showAlert('login-alert', err.message || 'Sign in failed')
      btn.disabled = false
      btn.innerHTML = 'Sign in'
    }
  })

  const { data: { session }, error } = await db.auth.getSession()
  if (error) console.warn('Existing session check failed:', error.message)
  if (session) await redirectForSession(session)
})()
