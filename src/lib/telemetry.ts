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
const VER = __APP_VERSION__

/** One error is a bug; forty are the same bug in a render loop. */
const MAX_REPORTS = 5
let sent = 0

/** Suppresses the identical message repeating within a session. */
const seen = new Set<string>()

function sessionId(): string | null {
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

function viewport(): string {
  try {
    return `${window.innerWidth}x${window.innerHeight}`
  } catch {
    return '?'
  }
}

function device(): string {
  try {
    const m = navigator.userAgent.match(/(iPhone|iPad|Android|Macintosh|Windows|CrOS|Linux)[^;)]*/)
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
}

export function reportError(e: ErrorReport): void {
  try {
    if (sent >= MAX_REPORTS) return
    const msg = String(e.msg || '').slice(0, 200)
    if (!msg || seen.has(msg)) return
    seen.add(msg)
    sent++

    const body = JSON.stringify({
      tenant_id: TENANT,
      name: 'client_error',
      session_id: sessionId(),
      // hash routing, so the route is the meaningful part
      page: (location.hash || '#/').slice(0, 60),
      props: {
        msg,
        src: e.src ? String(e.src).slice(0, 120) : null,
        stack: e.stack ? String(e.stack).slice(0, 300) : null,
        ver: VER,
        ua: device(),
        vw: viewport(),
        role: 'owner', // single-operator app; there is no other role
      },
    })

    // Not awaited, and not allowed to reject — reporting a crash must
    // never itself crash, and must not delay the fallback UI.
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
