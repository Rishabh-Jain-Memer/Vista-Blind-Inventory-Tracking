/*
  Supabase client configuration.
  This file creates the global `db` client used by every page controller.
  Only the public anon key belongs in browser code. Service-role keys must stay
  on Supabase/server-side functions and must never be committed or shipped.

  This isolated clone is intentionally not wired to the production Supabase
  project. Add the new project's public URL and anon/publishable key below, or
  use dev-environment.html on localhost to test against a separate project.
*/

const LIVE_SUPABASE_URL = ''
const LIVE_SUPABASE_ANON_KEY = ''

const VISTA_ENV_KEYS = {
  env: 'vista_supabase_env',
  stagingUrl: 'vista_supabase_staging_url',
  stagingAnonKey: 'vista_supabase_staging_anon_key',
}

function isVistaLocalHost() {
  return ['localhost', '127.0.0.1', '::1', ''].includes(window.location.hostname)
}

function vistaStorageGet(key) {
  try { return localStorage.getItem(key) } catch { return '' }
}

function vistaStorageSet(key, value) {
  try { localStorage.setItem(key, value) } catch {}
}

function readVistaSupabaseConfig() {
  const isLocal = isVistaLocalHost()
  const params = new URLSearchParams(window.location.search)

  if (isLocal) {
    const requestedEnv = params.get('vista_env')
    const stagingUrl = params.get('staging_url')
    const stagingAnonKey = params.get('staging_key')

    if (requestedEnv === 'live' || requestedEnv === 'staging') {
      vistaStorageSet(VISTA_ENV_KEYS.env, requestedEnv)
    }
    if (stagingUrl) vistaStorageSet(VISTA_ENV_KEYS.stagingUrl, stagingUrl)
    if (stagingAnonKey) vistaStorageSet(VISTA_ENV_KEYS.stagingAnonKey, stagingAnonKey)
  }

  const env = isLocal ? (vistaStorageGet(VISTA_ENV_KEYS.env) || 'live') : 'live'
  const stagingUrl = vistaStorageGet(VISTA_ENV_KEYS.stagingUrl) || ''
  const stagingAnonKey = vistaStorageGet(VISTA_ENV_KEYS.stagingAnonKey) || ''

  if (isLocal && env === 'staging' && stagingUrl && stagingAnonKey) {
    return { name: 'staging', url: stagingUrl, anonKey: stagingAnonKey }
  }

  return { name: 'live', url: LIVE_SUPABASE_URL, anonKey: LIVE_SUPABASE_ANON_KEY }
}

function showVistaEnvironmentBadge(envName, url) {
  if (envName === 'live') return

  const addBadge = () => {
    const badge = document.createElement('div')
    badge.textContent = `STAGING DB: ${url.replace(/^https?:\/\//, '')}`
    badge.style.cssText = [
      'position:fixed',
      'right:12px',
      'bottom:12px',
      'z-index:99999',
      'background:#f59e0b',
      'color:#111827',
      'font:700 12px/1.2 Arial,sans-serif',
      'padding:8px 10px',
      'border:1px solid rgba(17,24,39,.25)',
      'box-shadow:0 6px 18px rgba(0,0,0,.18)',
      'border-radius:6px',
      'max-width:320px',
    ].join(';')
    document.body.appendChild(badge)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addBadge)
  else addBadge()
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
    box.innerHTML = '<div><strong>Supabase is not configured for this isolated clone.</strong><br>Set the new project URL and anon key in js/config.js, or use dev-environment.html on localhost.</div>'
    document.body.appendChild(box)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addMessage)
  else addMessage()
}

const VISTA_SUPABASE_CONFIG = readVistaSupabaseConfig()
const SUPABASE_URL = VISTA_SUPABASE_CONFIG.url
const SUPABASE_ANON_KEY = VISTA_SUPABASE_CONFIG.anonKey

window.VISTA_SUPABASE_ENV = VISTA_SUPABASE_CONFIG.name
window.VISTA_SUPABASE_URL = SUPABASE_URL

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  showVistaConfigError()
  throw new Error('Supabase is not configured for this isolated Vista Blind clone.')
}

if (window.VISTA_SUPABASE_ENV === 'staging') {
  console.warn('Vista is using the STAGING Supabase project:', SUPABASE_URL)
}

showVistaEnvironmentBadge(window.VISTA_SUPABASE_ENV, SUPABASE_URL)

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
