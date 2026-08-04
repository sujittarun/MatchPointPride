import { useEffect, useState } from 'react'

/* ============================================================
   Pull down to reload.

   The gesture the owner reached for and did not find. On a phone it is
   the only reload there is — there is no address bar to pull in an
   installed app, and Capacitor's WebView has no browser chrome at all,
   so without this the app genuinely cannot be refreshed by hand.

   Written against raw touch events rather than a library because the
   whole thing is forty lines and a library would be another dependency
   in a bundle that has almost none.

   THE RULE THAT MAKES IT NOT ANNOY ANYONE

   It only arms when the page is ALREADY at the top when the finger
   lands. Arming mid-scroll is what makes home-grown pull-to-refresh
   infuriating: you flick up through a long list, overshoot back to the
   top, and the app reloads underneath you. Checking scroll position at
   touchstart — once — means a pull that began anywhere else can never
   trigger it, however far it travels.
   ============================================================ */

/** How far the finger must travel before it counts as a pull. */
const THRESHOLD = 70

/** Past this the indicator stops growing, so it cannot be dragged silly. */
const MAX = 110

export type PullState = {
  /** 0 → nothing, 1 → far enough to fire. Drives the indicator. */
  progress: number
  /** True from release until the reload settles. */
  refreshing: boolean
}

export function usePullToRefresh(onRefresh: () => void | Promise<void>): PullState {
  const [progress, setProgress] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let startY = 0
    let armed = false
    let pulled = 0

    const atTop = () =>
      (window.scrollY || document.documentElement.scrollTop || 0) <= 0

    const onStart = (e: TouchEvent) => {
      // Decided ONCE, here. See the note above.
      armed = atTop() && e.touches.length === 1
      startY = e.touches[0]?.clientY ?? 0
      pulled = 0
    }

    const onMove = (e: TouchEvent) => {
      if (!armed || refreshing) return
      const dy = (e.touches[0]?.clientY ?? 0) - startY
      if (dy <= 0) {
        // Scrolling up again — give the page back immediately.
        pulled = 0
        setProgress(0)
        armed = false
        return
      }
      // Resistance, so it feels like pulling against something.
      pulled = Math.min(MAX, dy * 0.5)
      setProgress(Math.min(1, pulled / THRESHOLD))
    }

    const onEnd = () => {
      if (!armed) return
      armed = false
      if (pulled >= THRESHOLD && !refreshing) {
        setRefreshing(true)
        setProgress(1)
        void Promise.resolve(onRefresh()).finally(() => {
          setRefreshing(false)
          setProgress(0)
        })
      } else {
        setProgress(0)
      }
    }

    /* passive: the handler never calls preventDefault, so the browser
       does not have to wait on it to decide whether to scroll. */
    const opts = { passive: true } as const
    window.addEventListener('touchstart', onStart, opts)
    window.addEventListener('touchmove', onMove, opts)
    window.addEventListener('touchend', onEnd, opts)
    window.addEventListener('touchcancel', onEnd, opts)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [onRefresh, refreshing])

  return { progress, refreshing }
}
