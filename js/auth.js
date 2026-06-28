/*
  Shared app-level authentication helper.
  This clone uses database username/password sessions, not Supabase Auth users.
*/

const APP_SESSION_KEY = 'vista.app.session'

const AUTH = {
  cachedProfile: null,

  token() {
    try { return localStorage.getItem(APP_SESSION_KEY) || '' } catch { return '' }
  },

  setToken(token) {
    try {
      if (token) localStorage.setItem(APP_SESSION_KEY, token)
      else localStorage.removeItem(APP_SESSION_KEY)
    } catch {}
  },

  async session() {
    const token = this.token()
    if (!token) return null

    const { data, error } = await db.rpc('app_profile_for_token', { p_token: token })
    if (error || !data?.length) {
      this.setToken('')
      this.cachedProfile = null
      return null
    }

    const profile = data[0]
    this.cachedProfile = profile
    return { token, user: { id: profile.id }, profile }
  },

  async requireAuth() {
    const s = await this.session()
    if (!s) { window.location.href = 'login.html'; return null }
    return s
  },

  async profile(userId) {
    if (this.cachedProfile && (!userId || this.cachedProfile.id === userId)) return this.cachedProfile
    const { data } = await db.from('profiles').select('id, username, email, role, full_name, created_at, is_active').eq('id', userId).single()
    return data
  },

  currentProfile() {
    return this.cachedProfile
  },

  currentUserId() {
    return this.cachedProfile?.id || null
  },

  async signOut() {
    const token = this.token()
    if (token) {
      try { await db.rpc('app_logout', { p_token: token }) } catch {}
    }
    this.setToken('')
    this.cachedProfile = null
    window.location.href = 'login.html'
  }
}
