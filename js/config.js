/*
  Supabase client configuration.
  This file creates the global `db` client used by every page controller.
  Only the public anon key belongs in browser code. Service-role keys must stay
  on Supabase/server-side functions and must never be committed or shipped.

  This isolated clone is wired to the separate Supabase project below. Only the
  public anon/publishable key belongs in this browser code.
*/

const LIVE_SUPABASE_URL = 'https://knawjdrsdqgyfzqzddix.supabase.co'
const LIVE_SUPABASE_ANON_KEY = 'sb_publishable_hG8vWGKjis6mmoXlvjlVmw_eqIpMI2C'

function readVistaSupabaseConfig() {
  return { url: LIVE_SUPABASE_URL, anonKey: LIVE_SUPABASE_ANON_KEY }
}

function showVistaConfigError() {
  const addMessage = () => {
    const box = document.createElement('div')
    box.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:100000',
      'background:#111827',
      'color:#f9fafb',
      'font:16px/1.5 Arial,sans-serif',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:24px',
      'text-align:center',
    ].join(';')
    box.innerHTML = '<div><strong>Supabase is not configured for this isolated clone.</strong><br>Set the isolated project URL and anon key in js/config.js.</div>'
    document.body.appendChild(box)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addMessage)
  else addMessage()
}

const VISTA_SUPABASE_CONFIG = readVistaSupabaseConfig()
const SUPABASE_URL = VISTA_SUPABASE_CONFIG.url
const SUPABASE_ANON_KEY = VISTA_SUPABASE_CONFIG.anonKey

window.VISTA_SUPABASE_URL = SUPABASE_URL

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  showVistaConfigError()
  throw new Error('Supabase is not configured for this isolated Vista Blind clone.')
}

function clearLegacySupabaseAuthStorage() {
  try {
    Object.keys(localStorage || {}).forEach(key => {
      const lower = key.toLowerCase()
      if (lower.startsWith('sb-') && lower.includes('auth-token')) {
        localStorage.removeItem(key)
      }
    })
  } catch {}
  try {
    Object.keys(sessionStorage || {}).forEach(key => {
      const lower = key.toLowerCase()
      if (lower.startsWith('sb-') && lower.includes('auth-token')) {
        sessionStorage.removeItem(key)
      }
    })
  } catch {}
}

clearLegacySupabaseAuthStorage()

let db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  },
})
