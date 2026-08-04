/* Does a reload actually skip the PIN — and does the wrong one still ask?
   npm test runs this three times, once per mode.

   It has to be its own process per mode. cloud.ts decides whether to
   restore at MODULE LOAD, and the suite is bundled to one CJS file, so a
   second `import` inside one run returns the same already-initialised
   module and proves nothing. One process, one load, one question:

     fresh    a live access token in sessionStorage  -> signed in, no PIN
     expired  the same token, past its expiry        -> locked
     tenant   a token minted for another tenant      -> locked

   The last two matter more than the first. The first is the feature; the
   other two are the reasons it is allowed to exist. */

type Mode = 'fresh' | 'expired' | 'tenant'
const mode = (process.argv[2] ?? 'fresh') as Mode

const REFRESH = 'SUPER_SECRET_REFRESH_TOKEN'

function jwtFor(tenant: string): string {
  return (
    'h.' +
    Buffer.from(
      JSON.stringify({
        email: 'owner@example.in',
        app_metadata: { am_role: 'staff', tenant_id: tenant },
      }),
    ).toString('base64url') +
    '.s'
  )
}

const HOUR = 3600_000
const token = jwtFor(mode === 'tenant' ? 'leo' : 'mpp')

/* What a previous page left behind for this tab. Written by hand rather
   than by calling signIn(), because that is what a reload actually finds:
   storage, and no memory at all. */
const tab: Record<string, string> = {
  'mpp.tab.v1': JSON.stringify({
    access_token: token,
    expires_at: mode === 'expired' ? Date.now() - HOUR : Date.now() + HOUR,
    email: 'owner@example.in',
    role: 'staff',
    tenant: mode === 'tenant' ? 'leo' : 'mpp',
  }),
}

;(globalThis as never as { sessionStorage: unknown }).sessionStorage = {
  getItem: (k: string) => (k in tab ? tab[k] : null),
  setItem: (k: string, v: string) => {
    tab[k] = v
  },
  removeItem: (k: string) => {
    delete tab[k]
  },
}
;(globalThis as never as { localStorage: unknown }).localStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {},
}
;(globalThis as never as { fetch: unknown }).fetch = async () => ({
  ok: false,
  status: 400,
  json: async () => ({}),
  text: async () => '',
})

let pass = 0
const fails: string[] = []
function ok(name: string, cond: boolean, detail = '') {
  if (cond) pass++
  else fails.push(`[${mode}] ${name}${detail ? ` — ${detail}` : ''}`)
}

void (async () => {
  const c = await import('../src/lib/cloud')

  if (mode === 'fresh') {
    ok('a reload is still signed in', c.isSignedIn())
    ok('…without the durable credential', c.refreshToken() === null || c.refreshToken() === '')
    ok('the tab copy survived the read', 'mpp.tab.v1' in tab)
    ok('the session reports the right tenant', c.currentSession()?.tenant === 'mpp')
    ok('no refresh token appeared from nowhere', !JSON.stringify(tab).includes(REFRESH))
  }

  if (mode === 'expired') {
    ok('an expired token does NOT open the app', !c.isSignedIn())
    ok('and is dropped rather than left to fail every read', !('mpp.tab.v1' in tab))
  }

  if (mode === 'tenant') {
    // Belt and braces: RLS is the real boundary, but a session for
    // another academy must never be adopted just because it parses.
    ok("another tenant's token does NOT open the app", !c.isSignedIn())
    ok('and is dropped', !('mpp.tab.v1' in tab))
  }

  if (fails.length) {
    console.log(`\n  RELOAD:${mode} ${pass} passed, ${fails.length} FAILED\n`)
    for (const f of fails) console.log(`   ✗ ${f}`)
    console.log('')
    process.exit(1)
  }
  console.log(`  RELOAD:${mode} ${pass}   FAIL 0`)
})()
