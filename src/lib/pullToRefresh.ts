import { useEffect, useRef, useState } from 'react'

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

/* The finger has to travel THRESHOLD / RESISTANCE pixels to fire.

   It was 70 / 0.5 — a 140px drag, about a fifth of a phone screen, which
   is why it felt like it needed a hard pull and often did not fire at
   all. 52 / 0.62 is ~84px, which is roughly what iOS asks for and what a
   thumb produces without a deliberate heave. */
const THRESHOLD = 52
const RESISTANCE = 0.62

/** Past this the indicator stops growing, so it cannot be dragged silly. */
const MAX = 96

export type PullState = {
  /** 0 → nothing, 1 → far enough to fire. Drives the indicator. */
  progress: number
  /** True from release until the reload settles. */
  refreshing: boolean
}

export function usePullToRefresh(onRefresh: () => void | Promise<void>): PullState {
  const [progress, setProgress] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  /* Held in refs so the listeners can be attached ONCE. With `refreshing`
     in the dependency array every completed refresh tore the listeners
     down and rebuilt them, and `onRefresh` changing identity would do
     the same mid-gesture. */
  const busy = useRef(false)
  const cb = useRef(onRefresh)
  cb.current = onRefresh

  useEffect(() => {
    let startY = 0
    let armed = false
    let pulled = 0

    /* `document.scrollingElement` is the one that actually scrolls, and
       it is not always documentElement — this app sets html/body to
       height:100%, so which element carries the scroll depends on the
       browser. A couple of pixels of tolerance because momentum can
       leave a scrollTop of 0.5 that never settles to a clean zero. */
    const scroller = () => document.scrollingElement || document.documentElement
    const atTop = () => (scroller()?.scrollTop ?? window.scrollY ?? 0) <= 2

    /* Was the finger inside something with its OWN scrollbar that is not
       at ITS top? A sheet's body, mainly. Pulling a half-scrolled list
       must scroll that list, not reload the academy. */
    const inScrolledChild = (target: EventTarget | null) => {
      let el = target as HTMLElement | null
      while (el && el !== document.body) {
        if (el.scrollHeight > el.clientHeight + 2 && el.scrollTop > 2) return true
        el = el.parentElement
      }
      return false
    }

    const onStart = (e: TouchEvent) => {
      // Decided ONCE, here. See the note above.
      armed = atTop() && e.touches.length === 1 && !inScrolledChild(e.target)
      startY = e.touches[0]?.clientY ?? 0
      pulled = 0
    }

    const onMove = (e: TouchEvent) => {
      if (!armed || busy.current) return
      const dy = (e.touches[0]?.clientY ?? 0) - startY
      if (dy <= 0) {
        // Scrolling up again — give the page back immediately.
        pulled = 0
        setProgress(0)
        armed = false
        return
      }
      // Resistance, so it feels like pulling against something.
      pulled = Math.min(MAX, dy * RESISTANCE)
      setProgress(Math.min(1, pulled / THRESHOLD))
    }

    const onEnd = () => {
      if (!armed) return
      armed = false
      if (pulled >= THRESHOLD && !busy.current) {
        busy.current = true
        setRefreshing(true)
        setProgress(1)
        void Promise.resolve(cb.current()).finally(() => {
          busy.current = false
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
  }, [])

  return { progress, refreshing }
}
