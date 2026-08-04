/* Does the DURABLE credential ever reach the disk?
   npm test runs this after the unit suite.

   It is separate from scripts/test.ts because it has to drive the real
   cloud.ts, and cloud.ts touches localStorage at module load — so the
   stub has to be installed before the import, which a top-level import
   in the main suite cannot do.

   The bug this exists to prevent: cloud.ts used to JSON.stringify the
   whole session into localStorage['mpp.session.v1'], refresh token
   included, one key away from the vault whose entire purpose is to
   encrypt that exact token. The ciphertext was strong and the plaintext
   was lying beside it. Nothing failed, no test went red, and the app
   worked perfectly — which is what makes it worth a test rather than a
   comment.

   The line the app now draws, and what this file holds it to:

     REFRESH token — durable, mints sessions for ever, never written
                     anywhere but the AES-GCM vault. Asserted below
                     against localStorage AND sessionStorage.
     ACCESS token  — expires in an hour on its own. Allowed in
                     sessionStorage (tab-scoped, dies with the app) so a
                     reload does not demand the PIN. Asserted to be
                     there, and asserted NOT to be in localStorage.

   So "no credential on disk" became "no DURABLE credential on disk",
   and the test says which is which rather than banning both. */

const VAULT = '{"v":1,"blob":"sealed"}'
const LEAKED = 'OLD_REFRESH_TOKEN_LEAKED'
const REFRESH = 'SUPER_SECRET_REFRESH_TOKEN'

/* A phone that has run the old build is carrying this right now. */
const store: Record<string, string> = {
  'mpp.session.v1': JSON.stringify({
    access_token: 'OLD_ACCESS',
    refresh_token: LEAKED,
    expires_at: 4102444800000,
    email: 'owner@example.in',
    role: 'staff',
    tenant: 'mpp',
  }),
  'mpp.vault.v1': VAULT,
}
const writes: string[] = []
;(globalThis as never as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => {
    store[k] = v
    writes.push(k)
  },
  removeItem: (k: string) => {
    delete store[k]
  },
}
/* A real one this time — the access token is expected to land here. */
const tab: Record<string, string> = {}
const tabWrites: string[] = []
;(globalThis as never as { sessionStorage: unknown }).sessionStorage = {
  getItem: (k: string) => (k in tab ? tab[k] : null),
  setItem: (k: string, v: string) => {
    tab[k] = v
    tabWrites.push(k)
  },
  removeItem: (k: string) => {
    delete tab[k]
  },
}

/* app_metadata carries the claims signIn checks; the signature is never
   verified client-side, only read for display. */
const jwt =
  'h.' +
  Buffer.from(
    JSON.stringify({
      email: 'owner@example.in',
      app_metadata: { am_role: 'staff', tenant_id: 'mpp' },
    }),
  ).toString('base64url') +
  '.s'

;(globalThis as never as { fetch: unknown }).fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ access_token: jwt, refresh_token: REFRESH, expires_in: 3600 }),
  text: async () => '[]',
})

let pass = 0
const fails: string[] = []
function ok(name: string, cond: boolean, detail = '') {
  if (cond) pass++
  else fails.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

void (async () => {
  const c = await import('../src/lib/cloud')

  // The legacy plaintext session is gone before anything can read it.
  // Fixing the write does nothing for a device that already made it.
  ok('legacy plaintext session purged at load', !('mpp.session.v1' in store))

  await c.signIn('owner@example.in', 'password')
  ok('signIn establishes a session', c.isSignedIn())
  ok('signIn persists nothing', writes.length === 0, writes.join(', '))

  const dump = JSON.stringify(store)
  const tabDump = JSON.stringify(tab)

  // The durable credential, in either store. This is the whole point.
  ok('no refresh token in localStorage', !dump.includes(REFRESH))
  ok('no refresh token in sessionStorage', !tabDump.includes(REFRESH))
  ok('no leaked refresh token either', !dump.includes(LEAKED))
  ok('no access token in localStorage', !dump.includes(jwt))

  // The short-lived one is allowed exactly one home, so a reload does
  // not ask for the PIN.
  ok('access token IS kept for the tab', tabDump.includes(jwt))
  ok('tab copy carries no refresh_token key', !tabDump.includes('refresh_token'))
  ok('tab copy is the one key', Object.keys(tab).join() === 'mpp.tab.v1', Object.keys(tab).join())

  // Still reachable in memory — the vault has to be able to seal it.
  ok('refreshToken() returns it from memory', c.refreshToken() === REFRESH)
  ok('the vault is untouched', store['mpp.vault.v1'] === VAULT)

  c.signOut()
  ok('signOut drops the session', !c.isSignedIn())
  ok('signOut persists nothing to localStorage', writes.length === 0, writes.join(', '))
  ok('signOut clears the tab copy', Object.keys(tab).length === 0, Object.keys(tab).join())

  if (fails.length) {
    console.log(`\n  SESSION ${pass} passed, ${fails.length} FAILED\n`)
    for (const f of fails) console.log(`   ✗ ${f}`)
    console.log('')
    process.exit(1)
  }
  console.log(`\n  SESSION ${pass}   FAIL 0\n`)
})()
