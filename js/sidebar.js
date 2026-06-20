/*
  Shared application shell.
  Owns the left navigation, role-based page access, sign-out button, and mobile
  sidebar chrome. Page controllers should call initSidebar() before loading data.
*/

function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open')
  document.getElementById('sidebar-overlay')?.classList.toggle('open')
}

function injectMobileChrome() {
  if (document.getElementById('mobile-header')) return

  const mh = document.createElement('div')
  mh.id = 'mobile-header'
  mh.className = 'mobile-header'
  mh.innerHTML = `
    <button class="hamburger-btn" onclick="toggleSidebar()" aria-label="Open menu">
      <i class="fa-solid fa-bars"></i>
    </button>
    <div class="mobile-logo-row">
      <div class="mobile-logo-icon"><i class="fa-solid fa-blinds"></i></div>
      <div>
        <div class="mobile-logo-name">Vista Blinds</div>
        <div class="mobile-logo-sub">Tracking System</div>
      </div>
    </div>`
  document.body.prepend(mh)

  const overlay = document.createElement('div')
  overlay.id = 'sidebar-overlay'
  overlay.className = 'sidebar-overlay'
  overlay.addEventListener('click', toggleSidebar)
  document.body.appendChild(overlay)
}

async function initSidebar() {
  const session = await AUTH.requireAuth()
  if (!session) return null

  const profile = await AUTH.profile(session.user.id)
  const page = currentPageName()
  const role = profile?.role

  // Redirect restricted roles away from pages they can't access
  const adminOnlyPages = ['settings.html', 'inventory.html', 'create.html', 'activity-log.html', 'wastage.html', 'reports.html', 'recipes.html', 'rrp.html']
  const salesAllowedPages = ['orders.html', 'create.html', 'tickets.html', 'ticket-detail.html', 'settings.html', 'order-detail.html', 'account-settings.html']
  const executerAllowedPages = ['executer-dashboard.html', 'tickets.html', 'ticket-detail.html', 'account-settings.html']
  if (role === 'executer' && !executerAllowedPages.includes(page)) {
    window.location.href = 'executer-dashboard.html'; return null
  }
  if (role === 'sales' && !salesAllowedPages.includes(page)) {
    window.location.href = 'orders.html'; return null
  }

  const nav = []
  if (role === 'executer') {
    nav.push({ href: 'executer-dashboard.html', icon: 'fa-hammer',        label: 'Production Queue' })
    nav.push({ href: 'tickets.html',            icon: 'fa-ticket',        label: 'Tickets' })
    nav.push({ href: 'account-settings.html',  icon: 'fa-gear',          label: 'Settings' })
  } else if (role === 'sales') {
    nav.push({ href: 'create.html?tab=order',   icon: 'fa-square-plus',   label: 'Create Order' })
    nav.push({ href: 'tickets.html',            icon: 'fa-ticket',        label: 'Tickets' })
    nav.push({ href: 'orders.html',             icon: 'fa-cart-shopping', label: 'Orders' })
    nav.push({ href: 'settings.html',           icon: 'fa-address-book',  label: 'Profiles' })
    nav.push({ href: 'account-settings.html',   icon: 'fa-gear',          label: 'Settings' })
  } else {
    // admin
    nav.push({ href: 'dashboard.html',          icon: 'fa-chart-line',       label: 'Dashboard' })
    nav.push({ href: 'inventory.html',          icon: 'fa-boxes-stacked',    label: 'Inventory' })
    nav.push({ href: 'recipes.html',            icon: 'fa-book-open',        label: 'Components' })
    nav.push({ href: 'rrp.html',               icon: 'fa-tag',              label: 'RRP' })
    nav.push({ href: 'create.html',             icon: 'fa-square-plus',      label: 'Create' })
    nav.push({ href: 'tickets.html',            icon: 'fa-ticket',           label: 'Tickets' })
    nav.push({ href: 'orders.html',             icon: 'fa-cart-shopping',    label: 'Orders' })
    nav.push({ href: 'wastage.html',            icon: 'fa-scissors',         label: 'Wastage' })
    nav.push({ href: 'reports.html',            icon: 'fa-chart-bar',        label: 'Reports' })
    nav.push({ href: 'activity-log.html',       icon: 'fa-clock-rotate-left',label: 'Activity Log' })
    if (role === 'admin') {
      nav.push({ href: 'settings.html', icon: 'fa-address-book', label: 'Profiles' })
    }
    nav.push({ href: 'account-settings.html',   icon: 'fa-gear',             label: 'Settings' })
  }

  const orderedNav = applySidebarOrder(nav, role)
  const canReorder = !['executer', 'sales'].includes(role)
  const links = orderedNav.map(n => {
    const navPage = String(n.href).split('?')[0]
    const isActive = page === navPage
    return `
    <a href="${n.href}" class="nav-link ${isActive ? 'active' : ''}" data-href="${n.href}" ${canReorder ? 'draggable="true"' : ''} onclick="closeSidebarOnMobile()">
      <span class="nav-link-main"><i class="fa-solid ${n.icon}"></i> ${n.label}</span>
      ${canReorder ? '<i class="fa-solid fa-grip-lines nav-drag-handle" title="Drag to reorder"></i>' : ''}
    </a>`
  }).join('')

  document.getElementById('sidebar').innerHTML = `
    <div class="sidebar-logo">
      <div class="logo-icon"><i class="fa-solid fa-blinds"></i></div>
      <div><div class="logo-name">Vista Blinds</div><div class="logo-sub">Tracking System</div></div>
    </div>
    <nav class="sidebar-nav">${links}</nav>
    <div class="sidebar-footer">
      <div class="user-name">${profile?.full_name || profile?.email || 'User'}</div>
      <div class="user-role">${profile?.role || 'admin'}</div>
      <button class="signout-btn" onclick="AUTH.signOut()">
        <i class="fa-solid fa-right-from-bracket"></i> Sign out
      </button>
    </div>`

  injectMobileChrome()
  if (canReorder) enableSidebarReorder(role)

  return profile
}

function currentPageName() {
  const path = window.location.pathname.replace(/\/+$/, '')
  const raw = path.split('/').pop() || 'index.html'
  if (raw.includes('.')) return raw
  return `${raw}.html`
}

function sidebarOrderKey(role) {
  return `vista.sidebar.order.${role || 'admin'}`
}

function applySidebarOrder(nav, role) {
  const raw = localStorage.getItem(sidebarOrderKey(role))
  if (!raw) return nav
  let saved = []
  try { saved = JSON.parse(raw) } catch { return nav }
  const byHref = new Map(nav.map(item => [item.href, item]))
  const ordered = saved.map(href => byHref.get(href)).filter(Boolean)
  const missing = nav.filter(item => !saved.includes(item.href))
  return [...ordered, ...missing]
}

function enableSidebarReorder(role) {
  const navEl = document.querySelector('.sidebar-nav')
  if (!navEl) return
  let dragged = null

  navEl.querySelectorAll('.nav-link[draggable="true"]').forEach(link => {
    link.addEventListener('dragstart', e => {
      dragged = link
      link.classList.add('dragging')
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', link.dataset.href || '')
    })
    link.addEventListener('dragend', () => {
      link.classList.remove('dragging')
      dragged = null
      saveSidebarOrder(role)
    })
  })

  navEl.addEventListener('dragover', e => {
    if (!dragged) return
    e.preventDefault()
    const after = getDragAfterLink(navEl, e.clientY)
    if (!after) navEl.appendChild(dragged)
    else navEl.insertBefore(dragged, after)
  })
}

function getDragAfterLink(container, y) {
  const links = [...container.querySelectorAll('.nav-link[draggable="true"]:not(.dragging)')]
  return links.reduce((closest, child) => {
    const box = child.getBoundingClientRect()
    const offset = y - box.top - box.height / 2
    if (offset < 0 && offset > closest.offset) return { offset, element: child }
    return closest
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element
}

function saveSidebarOrder(role) {
  const hrefs = [...document.querySelectorAll('.sidebar-nav .nav-link')]
    .map(link => link.dataset.href)
    .filter(Boolean)
  localStorage.setItem(sidebarOrderKey(role), JSON.stringify(hrefs))
}

function closeSidebarOnMobile() {
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar')?.classList.remove('open')
    document.getElementById('sidebar-overlay')?.classList.remove('open')
  }
}
