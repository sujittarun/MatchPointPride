/* ============================================================
   The four things the Android build needs that a browser does not.

   Everything else — every page, every chart, every fee — is the same
   code running in the same engine. This file is the whole of the
   difference, and it is deliberately small: the moment the native
   build starts needing its own screens, there are two apps to keep in
   step, and PLATFORM.md's argument about two implementations of one
   rule applies to pixels as much as to money.

     1. the splash goes away when the app is actually ready
     2. the back gesture does what an Android user means by it
     3. reopening the app shows today's numbers, not Tuesday's
     4. none of this runs in a browser

   On the web every one of these is a no-op, so `App.tsx` calls the
   hook unconditionally and never asks which platform it is on.
   ============================================================ */

import { useEffect } from 'react'
import { App as CapApp } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { Capacitor } from '@capacitor/core'
import { dismissTop } from './dismiss'
import { currentPath, navigate } from './router'

/** True inside the APK, false in any browser — including `npm run dev`. */
export const isNative = Capacitor.isNativePlatform()

/** 'android' | 'ios' | 'web'. Stamped on error reports so a crash can
    be pinned to the build it came from: the same version number ships
    to the Play Store and to GitHub Pages. */
export const platform = Capacitor.getPlatform()

/* A tab is a destination, not a step in a journey. Material's rule is
   that back from a tab returns to the first tab rather than retracing
   which tabs you visited, so these are handled by name. Everything
   deeper — a batch, a student, a staff member — is a step, and back
   retraces it. */
const TAB_ROOTS = ['/app', '/batches', '/reminders', '/staff', '/finance', '/settings']

/** Where back goes from a detail screen with no history behind it. */
function parentOf(path: string): string {
  if (path.startsWith('/batches/')) return '/batches'
  if (path.startsWith('/staff/')) return '/staff'
  return '/app'
}

function handleBack(): void {
  // 1. A sheet is open: close it, and do not touch the page under it.
  if (dismissTop()) return

  const path = currentPath()

  // 2. Home, or the locked gate: leave the app running in the
  //    background. `exitApp()` would kill it, and the next open would
  //    pay for a cold start and another PIN — for a phone the owner
  //    picks up thirty times a day, that is the wrong trade.
  if (path === '/app' || path === '/') {
    void CapApp.minimizeApp()
    return
  }

  // 3. Any other tab returns home.
  if (TAB_ROOTS.includes(path)) {
    navigate('/app')
    return
  }

  // 4. A detail screen retraces the way in — a student opened from a
  //    batch goes back to that batch, not to a guess about where
  //    students live. Hash navigation always pushes an entry, so the
  //    fallback only fires on the very first screen of a session.
  if (window.history.length > 1) window.history.back()
  else navigate(parentOf(path))
}

/**
 * Wire the shell. Safe to call on the web, where it does nothing.
 *
 * @param refresh the store's reload, called when the app is brought
 *                back to the foreground.
 */
export function useNativeShell(refresh: () => void | Promise<void>): void {
  useEffect(() => {
    if (!isNative) return

    /* The first commit has happened, so there is an app behind the
       splash. `launchAutoHide` in capacitor.config.ts is the safety
       net for the case where React never gets this far — without it, a
       crash on boot would leave the owner staring at a logo. */
    void SplashScreen.hide()

    const back = CapApp.addListener('backButton', handleBack)

    /* Android keeps the app in memory for days. Without this, the
       owner opens it on Thursday and reads Tuesday's dues, which for
       an app whose whole job is who has paid is worse than showing
       nothing. The threshold stops a two-second app switch — checking
       a payment in a banking app and coming straight back — from
       reloading everything. */
    let lastRefresh = Date.now()
    const STALE_MS = 60_000
    const state = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return
      if (Date.now() - lastRefresh < STALE_MS) return
      lastRefresh = Date.now()
      void refresh()
    })

    return () => {
      void back.then((h) => h.remove())
      void state.then((h) => h.remove())
    }
  }, [refresh])
}
