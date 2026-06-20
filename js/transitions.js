/*
  Lightweight page transition helpers.
  This file intentionally has no business logic; it only adds small visual state
  changes around navigation so page controllers stay focused on data.
*/

(function () {
  // Animate only the main content area on page entry — sidebar stays solid
  function animateMainIn() {
    const main = document.querySelector('.main')
    if (!main) return
    main.style.opacity = '0'
    main.style.transform = 'translateX(10px)'
    main.style.transition = 'none'
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        main.style.transition = 'opacity 200ms ease, transform 200ms cubic-bezier(.22,1,.36,1)'
        main.style.opacity = '1'
        main.style.transform = 'none'
      })
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', animateMainIn)
  } else {
    animateMainIn()
  }

  // On exit: fade out only .main, then navigate
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]')
    if (!a) return
    const href = a.getAttribute('href')
    if (!href || href.startsWith('#') || href.startsWith('javascript') || a.target === '_blank') return
    try {
      const dest = new URL(href, location.href)
      if (dest.origin !== location.origin) return
      if (dest.pathname === location.pathname && dest.search === location.search) return
    } catch { return }

    e.preventDefault()

    const main = document.querySelector('.main')
    if (main) {
      main.style.transition = 'opacity 120ms ease, transform 120ms ease'
      main.style.opacity = '0'
      main.style.transform = 'translateX(-8px)'
    }
    setTimeout(() => { location.href = href }, 130)
  }, true)
})()
