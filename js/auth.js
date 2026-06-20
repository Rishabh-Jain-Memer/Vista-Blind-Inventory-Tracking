/*
  Shared authentication helper.
  Every protected page calls initSidebar(), and initSidebar() calls AUTH.requireAuth()
  from this file. Keep redirects and profile lookup rules centralized here so pages
  do not each invent their own login behavior.
*/

const AUTH = {
  async session() {
    const { data: { session } } = await db.auth.getSession()
    return session
  },

  async requireAuth() {
    const s = await this.session()
    if (!s) { window.location.href = 'login.html'; return null }
    return s
  },

  async profile(userId) {
    const { data } = await db.from('profiles').select('*').eq('id', userId).single()
    return data
  },

  async signOut() {
    await db.auth.signOut()
    window.location.href = 'login.html'
  }
}
