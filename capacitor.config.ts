import type { CapacitorConfig } from '@capacitor/cli'

/* ============================================================
   The Android app.

   It is not a second app. It is this app — the same React bundle,
   the same CSS, the same `cloud.ts` — inside a native shell. The
   alternative was a React Native rewrite, which would have meant
   reimplementing ~6,000 lines of pages and 1,900 lines of CSS in a
   different rendering model and then keeping the two in step
   forever. Two implementations of one screen disagree; that is the
   same argument PLATFORM.md makes about money living in one place,
   applied to pixels.

   So: one codebase, one `npm run build`, and the phone gets the
   bundle on-device instead of over the network.

   THE ONE THING THAT MUST NOT CHANGE. `androidScheme: 'https'` makes
   the WebView origin `https://localhost`, which is a secure context.
   `vault.ts` needs `crypto.subtle` to exist — the whole PIN design is
   a key derivation, not a comparison — and WebCrypto is unavailable
   on an insecure origin. Switch this to `http` and the app opens to
   "this device cannot store a session securely".

   A secure origin is also what makes `localStorage` durable here, so
   the sealed vault survives a restart the way it does on the web.
   ============================================================ */

const config: CapacitorConfig = {
  // Permanent once it reaches the Play Store — an installed app cannot
  // change its applicationId without becoming a different app.
  appId: 'in.matchpoint.pride',
  appName: 'Match Point Pride',

  // Built by `npm run build:android`, not `npm run build`. The Pages
  // build is rooted at /MatchPointPride/; this one is relative, and
  // keeping them in separate directories means a relative-base build
  // can never be the thing that gets deployed to the web.
  webDir: 'dist-android',

  // --plane. Anything the WebView has not painted yet is this colour,
  // so a cold start has no white flash to it.
  backgroundColor: '#080B0F',

  android: {
    androidScheme: 'https',
    // The bundle is on-device; there is nothing to fetch over http.
    allowMixedContent: false,
  },

  plugins: {
    /* Built into @capacitor/core in Capacitor 8 — this replaced the
       separate status-bar plugin, whose `overlaysWebView` and
       `backgroundColor` options stopped doing anything at targetSdk 36
       because Android 16 enforces edge-to-edge and no longer allows
       opting out.

       'DARK' means dark bars, so the system draws light icons — right
       for a surface committed to dark in tokens.css.

       `insetsHandling: 'css'` is what keeps the existing stylesheet
       correct without edits: on WebView 140+ with viewport-fit=cover
       (index.html has it) the real insets pass through to
       env(safe-area-inset-*), and on older WebViews the plugin pads
       the WebView itself and reports zero — either way the bottom tab
       bar clears the gesture bar and the top bar clears the notch,
       and neither is double-counted. */
    SystemBars: {
      style: 'DARK',
      insetsHandling: 'css',
    },

    SplashScreen: {
      // Earliest of: React mounted (main.tsx hides it), or this.
      // Held briefly rather than not at all so the first frame the
      // owner sees is the app, not a half-built one.
      launchAutoHide: true,
      launchShowDuration: 500,
      launchFadeOutDuration: 200,
      backgroundColor: '#080B0F',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
  },
}

export default config
