/* ============================================================
   Error reporting.

   This app runs on one phone, in one hand, with nobody watching. When
   it throws, the owner sees a blank screen and has no way to tell
   anyone what happened — and no way for anyone to find out.

   So an uncaught error posts one row to the platform's `events` table
   as `name='client_error'`, which is what Academy Manager reads through
   platform_errors(). Same shape Leo already sends, so one query covers
   both. Grouping and counting happen in SQL, not here.

   What it deliberately does NOT send: no student names, no guardian
   phone numbers, no amounts, no localStorage. A message, where in the
   bundle it came from, a stack, the app version and the screen size.
   Nothing that would make this table a place personal data leaks to.

   Failure here must never be louder than the bug it is reporting, so
   every path swallows its own errors and nothing is awaited.
   ============================================================ */

const PROJECT = 'https://ugsklcipzyiogxynshnh.supabase.co'
// The anon key is public by design — it is in every tenant's front end.
// Row-level security is the control; this key on its own reads nothing.
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnc2tsY2lwenlpb2d4eW5zaG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTUyMzksImV4cCI6MjA5ODQ3MTIzOX0.w7xkjdTkYN2qA0oxMKLUNtua0ScKVHKQzfEyIayh9eo'

const TENANT = 'mpp'
// Vite substitutes this at build time. The test bundle has no `define`,
// and a module-level throw there takes the whole suite down with a
// ReferenceError that says nothing about the real cause — so fall back.
const VER = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

/** One error is a bug; forty are the same bug in a render loop. */
const MAX_REPORTS = 5
let sent = 0

/** Suppresses the identical message repeating within a session. */
const seen = new Set<string>()

export function sessionId(): string | null {
  try {
    let id = sessionStorage.getItem('mpp-sid')
    if (!id) {
      id = Math.random().toString(36).slice(2)
      sessionStorage.setItem('mpp-sid', id)
    }
    return id
  } catch {
    return null // private mode, or storage disabled
  }
}

/* 'android' inside the APK, 'web' everywhere else.

   Read off the global rather than imported from @capacitor/core, so
   this file stays importable by the Node test harness, which bundles
   it with esbuild and has no WebView, no window and no bridge. The
   global is set by the native bridge before the bundle runs, and by
   @capacitor/core itself when the app imports it. */
export const platform: string = (() => {
  try {
    const cap = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor
    return cap?.getPlatform?.() ?? 'web'
  } catch {
    return 'web'
  }
})()

function viewport(): string {
  try {
    return `${window.innerWidth}x${window.innerHeight}`
  } catch {
    return '?'
  }
}

/**
 * The device, as one short string for the activity feed.
 *
 * ANDROID IS TESTED FIRST, and reordering the alternation would not have
 * been enough. An Android user agent reads
 *
 *   Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 …
 *
 * and JavaScript alternation matches at the leftmost POSITION in the
 * string, not the leftmost alternative — so `(…|Android|…|Linux)` still
 * matched "Linux", because "Linux" occurs earlier in the text. Android
 * was already ahead of Linux in that pattern and every phone still
 * reported as Linux. It needs its own test, not a different order.
 */
export function device(): string {
  try {
    const ua = navigator.userAgent
    if (/Android/.test(ua)) return (ua.match(/Android[^;)]*/) ?? ['Android'])[0]
    const m = ua.match(/(iPhone|iPad|Macintosh|Windows|CrOS|Linux)[^;)]*/)
    return m ? m[0] : '?'
  } catch {
    return '?'
  }
}

export type ErrorReport = {
  msg: string
  /** file:line:col, or the React component stack for render errors */
  src?: string | null
  stack?: string | null
  /**
   * 'crash' — it threw and the screen broke.
   * 'operation' — the app coped, but the work did not happen.
   * The second is the one that goes unnoticed, so Academy Manager
   * needs to be able to tell them apart.
   */
  kind?: 'crash' | 'operation'
}

/**
 * Which SCREEN this happened on — the route, never the query string.
 *
 * `location.hash` is not safe to record whole. The fee reminder links a
 * parent to `#/pay?a=2200&n=Aadhya%20Raju&u=7732077327@ybl`, so the
 * hash carries a student's NAME and the academy's UPI id, and this
 * column was storing the first 60 characters of it — which is exactly
 * long enough to reach the name. Rows like that are already in the
 * table for mpp.
 *
 * That matters more here than it looks. `events` takes inserts from the
 * anon key by design, so it is the one table on the platform written
 * with a credential that is public — which is precisely why PLATFORM.md
 * says it carries "counts only, never a name or a phone number". A
 * student's name in it breaks the reason the table is allowed to be
 * open at all.
 *
 * Cutting at '?' keeps everything the console actually uses: which
 * screen, how often. `#/student/804` still carries an id, which is
 * meaningless outside the tenant and is what makes the activity feed
 * clickable.
 */
export function pageKey(hash: string | undefined): string {
  const h = hash || '#/'
  const q = h.indexOf('?')
  return (q === -1 ? h : h.slice(0, q)).slice(0, 60)
}

/** One POST to the platform's event sink. Never awaited, never throws. */
function post(name: string, props: Record<string, unknown>): void {
  try {
    const body = JSON.stringify({
      tenant_id: TENANT,
      name,
      session_id: sessionId(),
      // hash routing, so the route is the meaningful part
      page: pageKey(location.hash),
      props,
    })
    void fetch(`${PROJECT}/rest/v1/events`, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body,
      keepalive: true, // survives the tab closing straight after the throw
    }).catch(() => {})
  } catch {
    /* nothing about telemetry is worth breaking the app for */
  }
}

/**
 * One ping per app open.
 *
 * Not vanity metrics. Academy Manager derives a tenant's status from the
 * newest event it has ever seen — no events at all reads as "Onboarding"
 * forever, however live the academy actually is. Every other tenant on
 * the platform sends this; MPP did not, so it sat at Onboarding with
 * nothing wrong with it.
 *
 * It also makes silence meaningful: if this stops arriving, the owner
 * has stopped opening the app, and that is worth knowing.
 */
export function trackOpen(): void {
  post('page_view', { ver: VER, plat: platform, ua: device(), vw: viewport() })
}

export function reportError(e: ErrorReport): void {
  try {
    if (sent >= MAX_REPORTS) return
    const msg = String(e.msg || '').slice(0, 200)
    if (!msg || seen.has(msg)) return
    seen.add(msg)
    sent++

    post('client_error', {
        msg,
        src: e.src ? String(e.src).slice(0, 120) : null,
        stack: e.stack ? String(e.stack).slice(0, 300) : null,
        kind: e.kind ?? 'crash',
        ver: VER,
        // The same version number ships to the Play Store and to
        // GitHub Pages, so without this there is no way to tell a
        // crash in the installed app from one in the browser — and
        // they have different WebViews. platform_errors() groups on
        // message and version, so an extra prop splits nothing.
        plat: platform,
        ua: device(),
        vw: viewport(),
      role: 'owner', // single-operator app; there is no other role
    })
  } catch {
    /* nothing about telemetry is worth breaking the app for */
  }
}

/**
 * A failure the app HANDLED — a save that did not save, a delete that
 * did not delete.
 *
 * These matter more than crashes, and are invisible without this. A
 * crash is loud: the screen goes blank and the owner rings you. A
 * failed save shows a toast, the owner taps it away, and three weeks
 * later a student is missing with nothing anywhere to say why.
 *
 * Reported as `client_error` on purpose, so it lands in the same
 * platform_errors() view Academy Manager already reads — no second
 * pipe, no second thing to remember to look at. `kind` tells them
 * apart.
 */
export function reportIssue(op: string, err: unknown): void {
  // Deliberately no varying detail — no byte counts, no ids, no names.
  // platform_errors() groups on the message, so anything that differs
  // between two occurrences of the same fault splits it into two rows
  // and destroys the count. The first version of this included the
  // document size and produced exactly that: one bug, two entries,
  // "x1" each.
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? '')
  reportError({
    msg: `${op} failed${detail ? ` — ${detail}` : ''}`,
    src: op,
    stack: err instanceof Error ? (err.stack ?? null) : null,
    kind: 'operation',
  })
}

/** Uncaught throws and rejected promises outside React's tree. */
export function installErrorReporting(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('error', (ev) => {
    reportError({
      msg: ev.message,
      src: `${String(ev.filename || '').split('/').pop()}:${ev.lineno || 0}:${ev.colno || 0}`,
      stack: ev.error?.stack ?? null,
    })
  })

  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason
    reportError({
      msg: r instanceof Error ? r.message : `Unhandled rejection: ${String(r)}`,
      src: 'promise',
      stack: r instanceof Error ? (r.stack ?? null) : null,
    })
  })
}
