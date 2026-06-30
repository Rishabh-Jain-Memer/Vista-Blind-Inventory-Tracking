/*
  Admin test mode.
  When enabled, writes are captured in browser storage instead of being sent to
  Supabase. Reads still use Supabase and receive a small local overlay for
  inserted/updated/deleted rows where the page query is simple enough to merge.
*/

const VISTA_TEST_MODE = (() => {
  const ENABLED_KEY = 'vista.testMode.enabled'
  const STATE_KEY = 'vista.testMode.state.v2'
  const LEGACY_STATE_KEYS = ['vista.testMode.state.v1']
  const SAFE_RPC = new Set(['app_login', 'app_logout', 'app_profile_for_token'])

  function storageGet(key) {
    try { return localStorage.getItem(key) } catch { return '' }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value) } catch {}
  }

  function storageRemove(key) {
    try { localStorage.removeItem(key) } catch {}
  }

  function isEnabled() {
    return storageGet(ENABLED_KEY) === '1'
  }

  function isAdminSession() {
    try { return window.AUTH?.currentProfile?.()?.role === 'admin' } catch { return false }
  }

  function isActive() {
    return isEnabled() && isAdminSession() && isWrapped()
  }

  function isWrapped() {
    return window.VISTA_TEST_MODE_READY === true
  }

  function wrapError() {
    return window.VISTA_TEST_MODE_ERROR || ''
  }

  function readState() {
    try {
      return JSON.parse(storageGet(STATE_KEY) || '{"tables":{},"seq":1}')
    } catch {
      return { tables: {}, seq: 1 }
    }
  }

  function writeState(state) {
    storageSet(STATE_KEY, JSON.stringify(state))
  }

  function tableState(state, table) {
    state.tables[table] ||= { inserted: [], updates: {}, deletedIds: [], seq: 1 }
    return state.tables[table]
  }

  function fakeUuid(state) {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID()
    const n = Number(state.seq || 1)
    state.seq = n + 1
    const suffix = n.toString(16).padStart(12, '0').slice(-12)
    return `00000000-0000-4000-8000-${suffix}`
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value))
  }

  function rowMatches(row, filters) {
    return (filters || []).every(filter => {
      const value = row?.[filter.column]
      if (filter.type === 'eq') return String(value) === String(filter.value)
      if (filter.type === 'in') return (filter.values || []).map(String).includes(String(value))
      if (filter.type === 'is') return filter.value === null ? value == null : value === filter.value
      return true
    })
  }

  function mergeRows(table, data, filters, singleMode) {
    if (!isActive()) return data
    const state = readState()
    const tableData = state.tables?.[table]
    if (!tableData) return data

    const sourceRows = Array.isArray(data) ? data : (data ? [data] : [])
    const rows = sourceRows
      .filter(row => !tableData.deletedIds.includes(row?.id))
      .map(row => ({ ...row, ...(tableData.updates[row?.id] || {}) }))

    for (const inserted of tableData.inserted || []) {
      if (!tableData.deletedIds.includes(inserted.id) && rowMatches(inserted, filters)) {
        rows.push(clone(inserted))
      }
    }

    if (singleMode) return rows[0] || null
    return Array.isArray(data) ? rows : (rows[0] || null)
  }

  class SandboxBuilder {
    constructor(baseBuilder, table) {
      this.baseBuilder = baseBuilder
      this.table = table
      this.op = 'select'
      this.payload = null
      this.filters = []
      this.singleMode = false
      this.returning = false
    }

    forward(method, ...args) {
      if (this.baseBuilder && typeof this.baseBuilder[method] === 'function') {
        this.baseBuilder = this.baseBuilder[method](...args)
      }
      return this
    }

    select(columns, options) {
      if (this.op === 'select') this.baseBuilder = this.baseBuilder.select(columns, options)
      this.returning = true
      return this
    }

    insert(payload) {
      this.op = 'insert'
      this.payload = payload
      if (!isActive()) this.baseBuilder = this.baseBuilder.insert(payload)
      return this
    }

    upsert(payload, options) {
      this.op = 'upsert'
      this.payload = payload
      this.upsertOptions = options || {}
      if (!isActive()) this.baseBuilder = this.baseBuilder.upsert(payload, options)
      return this
    }

    update(payload) {
      this.op = 'update'
      this.payload = payload || {}
      if (!isActive()) this.baseBuilder = this.baseBuilder.update(payload)
      return this
    }

    delete() {
      this.op = 'delete'
      if (!isActive()) this.baseBuilder = this.baseBuilder.delete()
      return this
    }

    eq(column, value) {
      this.filters.push({ type: 'eq', column, value })
      return this.forward('eq', column, value)
    }

    neq(column, value) {
      return this.forward('neq', column, value)
    }

    gt(column, value) {
      return this.forward('gt', column, value)
    }

    gte(column, value) {
      return this.forward('gte', column, value)
    }

    lt(column, value) {
      return this.forward('lt', column, value)
    }

    lte(column, value) {
      return this.forward('lte', column, value)
    }

    like(column, pattern) {
      return this.forward('like', column, pattern)
    }

    ilike(column, pattern) {
      return this.forward('ilike', column, pattern)
    }

    not(column, operator, value) {
      return this.forward('not', column, operator, value)
    }

    or(filters, options) {
      return this.forward('or', filters, options)
    }

    in(column, values) {
      this.filters.push({ type: 'in', column, values })
      return this.forward('in', column, values)
    }

    is(column, value) {
      this.filters.push({ type: 'is', column, value })
      return this.forward('is', column, value)
    }

    order(column, options) {
      return this.forward('order', column, options)
    }

    limit(count) {
      return this.forward('limit', count)
    }

    range(from, to) {
      return this.forward('range', from, to)
    }

    match(query) {
      this.forward('match', query)
      Object.entries(query || {}).forEach(([column, value]) => this.filters.push({ type: 'eq', column, value }))
      return this
    }

    contains(column, value) {
      return this.forward('contains', column, value)
    }

    overlaps(column, value) {
      return this.forward('overlaps', column, value)
    }

    catch(reject) {
      return this.execute().catch(reject)
    }

    maybeSingle() {
      this.singleMode = true
      if (!isActive() || this.op === 'select') this.baseBuilder = this.baseBuilder.maybeSingle()
      return this
    }

    single() {
      this.singleMode = true
      if (!isActive() || this.op === 'select') this.baseBuilder = this.baseBuilder.single()
      return this
    }

    async execute() {
      if (!isActive() || this.op === 'select') {
        const result = await this.baseBuilder
        if (this.op === 'select' && !result.error) {
          return { ...result, data: mergeRows(this.table, result.data, this.filters, this.singleMode) }
        }
        return result
      }

      const state = readState()
      const table = tableState(state, this.table)

      if (this.op === 'insert' || this.op === 'upsert') {
        const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(row => ({
          ...clone(row),
          id: row?.id || fakeUuid(state),
          created_at: row?.created_at || new Date().toISOString(),
        }))
        for (const row of rows) {
          const existingIdx = table.inserted.findIndex(item => item.id === row.id)
          if (existingIdx >= 0) table.inserted[existingIdx] = { ...table.inserted[existingIdx], ...row }
          else table.inserted.push(row)
        }
        writeState(state)
        return { data: this.returning ? (this.singleMode ? rows[0] : rows) : null, error: null }
      }

      if (this.op === 'update') {
        const idFilter = this.filters.find(filter => filter.type === 'eq' && filter.column === 'id')
        if (idFilter) {
          const id = String(idFilter.value)
          const inserted = table.inserted.find(row => String(row.id) === id)
          if (inserted) Object.assign(inserted, clone(this.payload))
          table.updates[id] = { ...(table.updates[id] || {}), ...clone(this.payload) }
        }
        writeState(state)
        return { data: this.returning ? (this.singleMode ? { id: idFilter?.value, ...clone(this.payload) } : []) : null, error: null }
      }

      if (this.op === 'delete') {
        const idFilter = this.filters.find(filter => filter.type === 'eq' && filter.column === 'id')
        if (idFilter) {
          const id = String(idFilter.value)
          table.inserted = table.inserted.filter(row => String(row.id) !== id)
          if (!table.deletedIds.includes(id)) table.deletedIds.push(id)
        }
        writeState(state)
        return { data: null, error: null }
      }

      return { data: null, error: null }
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject)
    }
  }

  function wrapClient(client) {
    return new Proxy(client, {
      get(target, prop, receiver) {
        if (prop === 'from') {
          return table => new SandboxBuilder(target.from(table), table)
        }
        if (prop === 'rpc') {
          return async (fn, args, options) => {
            if (!isActive() || SAFE_RPC.has(fn)) return target.rpc(fn, args, options)
            if (fn === 'generate_order_uid') {
              return { data: `TEST-${Date.now()}`, error: null }
            }
            return { data: null, error: null }
          }
        }
        return Reflect.get(target, prop, receiver)
      },
    })
  }

  function setEnabled(enabled) {
    if (enabled) storageSet(ENABLED_KEY, '1')
    else {
      storageRemove(ENABLED_KEY)
      storageRemove(STATE_KEY)
      LEGACY_STATE_KEYS.forEach(storageRemove)
    }
  }

  function renderBadge() {
    if (!isActive()) return
    const add = () => {
      if (document.getElementById('vista-test-mode-badge')) return
      const badge = document.createElement('div')
      badge.id = 'vista-test-mode-badge'
      badge.textContent = 'TEST MODE - local changes only'
      badge.style.cssText = [
        'position:fixed',
        'left:12px',
        'bottom:12px',
        'z-index:99999',
        'background:#7c2d12',
        'color:#fff7ed',
        'font:700 12px/1.2 Arial,sans-serif',
        'padding:8px 10px',
        'border-radius:6px',
        'box-shadow:0 6px 18px rgba(0,0,0,.18)',
      ].join(';')
      document.body.appendChild(badge)
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add)
    else add()
  }

  return {
    isEnabled,
    isActive,
    isWrapped,
    wrapError,
    setEnabled,
    wrapClient,
    renderBadge,
  }
})()

window.VISTA_TEST_MODE = VISTA_TEST_MODE
try {
  db = VISTA_TEST_MODE.wrapClient(db)
  window.VISTA_TEST_MODE_READY = true
  window.VISTA_TEST_MODE_ERROR = ''
} catch (err) {
  window.VISTA_TEST_MODE_READY = false
  window.VISTA_TEST_MODE_ERROR = err?.message || String(err)
  console.error('Admin test mode could not wrap Supabase client:', err)
}
document.addEventListener('DOMContentLoaded', () => {
  VISTA_TEST_MODE.renderBadge()
  let checks = 0
  const timer = setInterval(() => {
    VISTA_TEST_MODE.renderBadge()
    checks += 1
    if (checks > 20 || VISTA_TEST_MODE.isActive()) clearInterval(timer)
  }, 500)
})
