/* ============================================================
   The PIN.

   PLATFORM.md is blunt about this: "A PIN compared in JavaScript is not
   access control. Where a tenant app uses one, it must sit on top of a
   real Supabase session, not instead of one."

   So it does. The owner signs in with email and password ONCE on his
   phone. What comes back is a real Supabase session; its refresh token
   is encrypted with a key derived from his PIN and kept on the device.
   Every day after that, the PIN decrypts that token and swaps it for a
   fresh session.

   The differences from the old gate matter:

     before   code === settings.passcode, in JavaScript, on a public
              page, with the whole dataset sitting in plaintext beside it
     now      the PIN is not compared to anything. It is the key. A wrong
              one fails to decrypt — AES-GCM's tag check — so there is no
              equality test to skip past in a console.

   No password is ever stored, and none is in the bundle.

   HONEST LIMITS. Four digits is ten thousand guesses. Against someone
   holding the unlocked phone and willing to attack the stored blob
   offline, PBKDF2 buys hours, not safety. What actually protects a short
   PIN is that guessing has to go through the app, where the attempt
   ladder in store.tsx escalates and, past the cap, the vault is wiped
   and the owner re-enrols with his password. That is the bank-card
   bargain: a short secret, a hard stop on attempts. Six digits is
   offered for anyone who wants the extra two orders of magnitude.
   ============================================================ */

const VAULT_KEY = 'mpp.vault.v1'

/** OWASP's 2023+ floor for PBKDF2-HMAC-SHA256, and what WebCrypto can do natively. */
const ITERATIONS = 600_000

export type PinLength = 4 | 6

type Vault = {
  v: 1
  /** How many digits the owner chose, so the pad knows what to draw. */
  len: PinLength
  salt: string
  iv: string
  blob: string
  email: string
}

const b64 = {
  enc: (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))),
  dec: (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
}

function readVault(): Vault | null {
  try {
    const raw = localStorage.getItem(VAULT_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Vault
    return v?.blob ? v : null
  } catch {
    return null
  }
}

export function isEnrolled(): boolean {
  return readVault() !== null
}

/** Digits this device was set up with, so the keypad draws the right boxes. */
export function pinLength(): PinLength {
  return readVault()?.len ?? 4
}

/** The account this device is enrolled to, for the "signed in as" line. */
export function enrolledEmail(): string | null {
  return readVault()?.email ?? null
}

export function forget(): void {
  try {
    localStorage.removeItem(VAULT_KEY)
  } catch {
    /* nothing useful to do */
  }
}

async function keyFromPin(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Called once, right after a successful email+password sign-in. */
export async function enrol(a: {
  pin: string
  refreshToken: string
  email: string
}): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await keyFromPin(a.pin, salt)
  const blob = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(a.refreshToken),
  )
  const v: Vault = {
    v: 1,
    len: (a.pin.length === 6 ? 6 : 4) as PinLength,
    salt: b64.enc(salt.buffer as ArrayBuffer),
    iv: b64.enc(iv.buffer as ArrayBuffer),
    blob: b64.enc(blob),
    email: a.email,
  }
  localStorage.setItem(VAULT_KEY, JSON.stringify(v))
}

/**
 * Open the vault with a PIN.
 *
 * Returns null on a wrong PIN — AES-GCM refuses to decrypt rather than
 * handing back rubbish, so there is no way to tell a wrong PIN from a
 * corrupted blob, and no way to brute-force it without doing the full
 * key derivation for every guess.
 */
export async function unlock(pin: string): Promise<string | null> {
  const v = readVault()
  if (!v) return null
  try {
    const key = await keyFromPin(pin, b64.dec(v.salt))
    const out = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64.dec(v.iv) as BufferSource },
      key,
      b64.dec(v.blob) as BufferSource,
    )
    return new TextDecoder().decode(out)
  } catch {
    return null
  }
}

/**
 * Supabase rotates refresh tokens on use, so the stored one goes stale
 * the moment it is redeemed. Re-seal the new one under the same PIN.
 *
 * Deliberately keeps the old salt and derives again rather than reusing
 * the key: a fresh IV per encryption is required, and re-deriving costs
 * one PBKDF2 pass on a path that already made a network round trip.
 */
export async function reseal(pin: string, refreshToken: string): Promise<void> {
  const v = readVault()
  if (!v) return
  const salt = b64.dec(v.salt)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await keyFromPin(pin, salt)
  const blob = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(refreshToken),
  )
  localStorage.setItem(
    VAULT_KEY,
    JSON.stringify({ ...v, iv: b64.enc(iv.buffer as ArrayBuffer), blob: b64.enc(blob) }),
  )
}

/** Is WebCrypto usable here? Needs a secure context; GitHub Pages is one. */
export function available(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle
}
