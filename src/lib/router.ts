import { useEffect, useState } from 'react'

/* Hash routing. GitHub Pages serves static files only, so a hash
   route never 404s on refresh or deep-link — no server rewrite and
   no 404.html trickery needed. */

export function currentPath(): string {
  const h = window.location.hash.replace(/^#/, '')
  return h || '/'
}

export function useRoute(): string {
  const [path, setPath] = useState(currentPath)
  useEffect(() => {
    const on = () => setPath(currentPath())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return path
}

export function navigate(to: string) {
  if (currentPath() === to) return
  window.location.hash = to
  window.scrollTo({ top: 0 })
}

/** `/staff/abc` against `/staff/:id` → `{ id: 'abc' }`, else null. */
export function match(path: string, pattern: string): Record<string, string> | null {
  const p = path.split('/').filter(Boolean)
  const q = pattern.split('/').filter(Boolean)
  if (p.length !== q.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < q.length; i++) {
    if (q[i].startsWith(':')) params[q[i].slice(1)] = decodeURIComponent(p[i])
    else if (q[i] !== p[i]) return null
  }
  return params
}
