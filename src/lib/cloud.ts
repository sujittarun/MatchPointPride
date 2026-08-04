/* ============================================================
   The platform database.

   Match Point Pride is a tenant of Academy Manager, and the platform
   has one rule:

     Anything that computes money lives in Postgres.

   So this file does not compute anything. It signs in, moves rows, and
   calls the functions that already exist — `resolve_fee`,
   `reminder_queue`, `record_fee_payment`. Every rupee in this app comes
   back from one of those, or it is a bug.

   There is no offline queue. A write that cannot reach the database
   fails and says so — see the note where the outbox used to be. What
   this file will never do is compute: a ₹1,200 on screen is the
   database's ₹1,200, and a recomputed one is a second implementation
   waiting to disagree.
   ============================================================ */

import type { AttendanceStatus } from './types'
import { firstDueDate, renewalAfterFeeDayChange, toISO, todayISO } from './format'
/* One-way: telemetry.ts holds its own PROJECT/TENANT and imports
   nothing from here, so there is no cycle. */
import { device, platform, sessionId } from './telemetry'

const PROJECT = 'https://ugsklcipzyiogxynshnh.supabase.co'
// Public by design — it is in every tenant's front end. RLS is the
// control, and this key alone reads nothing.
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnc2tsY2lwenlpb2d4eW5zaG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTUyMzksImV4cCI6MjA5ODQ3MTIzOX0.w7xkjdTkYN2qA0oxMKLUNtua0ScKVHKQzfEyIayh9eo'

export const TENANT = 'mpp'

/* The key this used to be written under. Kept only to delete it — every
   phone that has ever run this app has a refresh token sitting in it. */
const LEGACY_SESSION_KEY = 'mpp.session.v1'

/** Tab-scoped, access token only. See the Session note below. */
const TAB_KEY = 'mpp.tab.v1'

/* ---------------------------------------------------------------
   Session

   THE REFRESH TOKEN NEVER TOUCHES STORAGE. The short-lived access
   token is kept in sessionStorage so a reload does not demand the PIN.

   Those two sentences are the whole design, and the split is the point.
   They are not the same kind of secret:

   · the REFRESH token is DURABLE. Anyone who reads one can mint access
     tokens for tenant mpp indefinitely — no PIN, no password, no
     expiry to wait out, and the attempt ladder never applies because
     nothing goes through the PIN at all. It lives in memory and, at
     rest, only inside the AES-GCM vault that `vault.ts` seals with
     600k PBKDF2 iterations of the PIN.
   · the ACCESS token EXPIRES, in an hour, on its own, whatever anyone
     does with it. It is already sent to PostgREST on every request.

   This app once wrote the whole session — refresh token and all — to
   localStorage, one key away from the vault that exists to encrypt
   exactly that token. The ciphertext was strong and the plaintext lay
   beside it. Removing that was right. Removing the access token WITH it
   was over-correction: it bought no security the expiry did not already
   provide, and it charged the owner a PIN entry for every reload.

   sessionStorage, not localStorage, and that difference is load-bearing:
   it is scoped to the tab and dies when the app is closed. Backgrounding
   the app on Android keeps the WebView alive, so resuming does not ask.
   A cold start does, because by then there is nothing left to resume
   from — which is the behaviour vault.ts always described.

   The consequence to keep in mind: after a reload the refresh token is
   NOT in memory, so when the restored access token expires it cannot be
   renewed. `refresh()` handles that by dropping the session, which sends
   the owner to the PIN screen rather than into a wall of failed reads.
   --------------------------------------------------------------- */

type Session = {
  access_token: string
  refresh_token: string
  /** epoch ms */
  expires_at: number
  email: string
  role: string
  tenant: string
}

let session: Session | null = null

/**
 * Remove the plaintext session this app used to persist.
 *
 * Runs at module load, before anything can read it, and is why the
 * constant above still exists. Without this the leaked token stays on
 * the owner's phone for ever — fixing the write does nothing for a
 * device that already made it.
 */
function purgeLegacySession(): void {
  try {
    localStorage.removeItem(LEGACY_SESSION_KEY)
  } catch {
    /* storage blocked — nothing was readable there either */
  }
}
purgeLegacySession()

/**
 * The half of the session that may be written down: everything except
 * the refresh token.
 *
 * Built by omission on purpose. Spelling out the fields that MAY be
 * stored means a field added to Session later is excluded by default —
 * the opposite (delete s.refresh_token) would quietly persist anything
 * new, which is how the first leak happened.
 */
function tabCopy(s: Session): string {
  return JSON.stringify({
    access_token: s.access_token,
    expires_at: s.expires_at,
    email: s.email,
    role: s.role,
    tenant: s.tenant,
  })
}

function writeSession(s: Session | null): void {
  session = s
  try {
    if (s) sessionStorage.setItem(TAB_KEY, tabCopy(s))
    else sessionStorage.removeItem(TAB_KEY)
  } catch {
    /* storage blocked (private mode, or a WebView with it disabled).
       The session still works for this page; a reload asks for the PIN,
       which is exactly the old behaviour. */
  }
}

/**
 * Restore the access token this tab was using, if it is still alive.
 *
 * `refresh_token: ''` is not a placeholder to be filled in later — it is
 * the accurate statement that this session cannot renew itself. refresh()
 * reads it and ends the session rather than looping on a 401.
 */
function restoreTabSession(): void {
  try {
    const raw = sessionStorage.getItem(TAB_KEY)
    if (!raw) return
    const t = JSON.parse(raw) as Omit<Session, 'refresh_token'>
    // A minute of headroom, so a token about to die does not open an app
    // that immediately fails every read.
    if (!t?.access_token || !(t.expires_at - Date.now() > 60_000)) {
      sessionStorage.removeItem(TAB_KEY)
      return
    }
    if (t.tenant !== TENANT) {
      sessionStorage.removeItem(TAB_KEY)
      return
    }
    session = { ...t, refresh_token: '' }
  } catch {
    /* unreadable or malformed — start locked, which is the safe end */
  }
}
restoreTabSession()

/** Claims are read for display only; RLS is what actually enforces them. */
function claims(token: string): Record<string, unknown> {
  try {
    const body = token.split('.')[1]
    return JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return {}
  }
}

function toSession(raw: Record<string, unknown>): Session {
  const token = String(raw.access_token || '')
  const c = claims(token)
  const meta = (c.app_metadata ?? {}) as Record<string, unknown>
  return {
    access_token: token,
    refresh_token: String(raw.refresh_token || ''),
    expires_at: Date.now() + Number(raw.expires_in ?? 3600) * 1000,
    email: String((c.email as string) ?? ''),
    role: String(meta.am_role ?? ''),
    tenant: String(meta.tenant_id ?? ''),
  }
}

export class CloudError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/**
 * Sign in with the tenant's staff login.
 *
 * The password is never stored — only the tokens Supabase returns, which
 * are scoped by RLS to this tenant and expire.
 */
export async function signIn(email: string, password: string): Promise<Session> {
  const res = await fetch(`${PROJECT}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new CloudError(
      String(body.error_description || body.msg || 'Could not sign in'),
      res.status,
    )
  }
  const s = toSession(body)

  // Belt and braces. RLS would refuse the rows anyway, but a login that
  // silently sees nothing is far harder to diagnose than one that says
  // why — and this catches an account created without its claims set.
  if (s.tenant !== TENANT) {
    writeSession(null)
    throw new CloudError(
      `This login belongs to "${s.tenant || 'no tenant'}", not Match Point Pride.`,
      403,
    )
  }
  if (s.role !== 'staff' && s.role !== 'operator') {
    writeSession(null)
    throw new CloudError('This login has no staff role on the platform.', 403)
  }

  writeSession(s)
  return s
}

export function signOut(): void {
  writeSession(null)
}

export function currentSession(): Session | null {
  return session
}

/** The token the vault seals. Never leaves the device unencrypted. */
export function refreshToken(): string | null {
  return session?.refresh_token ?? null
}

/**
 * Resume from a refresh token the vault just decrypted.
 *
 * Returns the NEW refresh token so the caller can re-seal it: Supabase
 * rotates on use, and a vault still holding the spent one locks the
 * owner out on his next open.
 */
export async function resumeWith(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${PROJECT}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: token }),
    })
    if (!res.ok) return null
    const s = toSession(await res.json())
    if (s.tenant !== TENANT) return null
    writeSession(s)
    return s.refresh_token
  } catch {
    return null
  }
}

export function isSignedIn(): boolean {
  return !!session?.access_token
}

/** Swap the refresh token for a fresh access token. */
async function refresh(): Promise<boolean> {
  /* No refresh token means this session was restored from sessionStorage
     after a reload. It cannot be renewed, so end it — that flips the app
     back to the PIN screen, where the vault CAN produce a real one.
     Returning false while leaving the dead session in place would leave
     the owner staring at an app that fails every read. */
  if (session && !session.refresh_token) {
    writeSession(null)
    return false
  }
  if (!session?.refresh_token) return false
  try {
    const res = await fetch(`${PROJECT}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    })
    if (!res.ok) {
      // A rejected refresh token is dead — keeping it would loop.
      writeSession(null)
      return false
    }
    writeSession(toSession(await res.json()))
    return true
  } catch {
    return false // offline: keep the session, try again later
  }
}

/* ---------------------------------------------------------------
   Transport
   --------------------------------------------------------------- */

async function request(
  method: string,
  path: string,
  body?: unknown,
  retried = false,
): Promise<unknown> {
  if (!session) throw new CloudError('Not signed in', 401)

  // Refresh a minute early rather than waiting for the 401.
  if (session.expires_at - Date.now() < 60_000 && !retried) {
    await refresh()
  }

  const res = await fetch(`${PROJECT}/rest/v1${path}`, {
    method,
    /* Never from the cache.

       PostgREST sends no Cache-Control, so a browser — and an Android
       WebView especially — is free to decide for itself how long a GET
       to the same URL stays fresh. The reads here all hit stable URLs,
       so the owner would add a student, the app would re-read, and the
       WebView would hand back the answer from before the write. The
       screen looked broken and the database was fine. */
    cache: 'no-store',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=representation' : 'return=minimal',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

  if (res.status === 401 && !retried && (await refresh())) {
    return request(method, path, body, true)
  }

  const text = await res.text()
  if (!res.ok) {
    let msg = text
    try {
      const j = JSON.parse(text)
      msg = j.message || j.hint || text
    } catch {
      /* not JSON — the raw body is the best message available */
    }
    throw new CloudError(msg || `${method} ${path} failed`, res.status)
  }
  return text ? JSON.parse(text) : null
}

/** Every read is already scoped by RLS; the filter is for volume, not safety. */
function select<T>(table: string, query = ''): Promise<T[]> {
  const sep = query ? '&' : ''
  return request('GET', `/${table}?tenant_id=eq.${TENANT}${sep}${query}`) as Promise<T[]>
}

/** POST with merge-duplicates, for tables with a natural key. */
async function requestUpsert(path: string, body: unknown): Promise<void> {
  if (!session) throw new CloudError('Not signed in', 401)
  if (session.expires_at - Date.now() < 60_000) await refresh()
  const res = await fetch(`${PROJECT}/rest/v1${path}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    let msg = t
    try {
      msg = JSON.parse(t).message || t
    } catch {
      /* raw body is the best available */
    }
    throw new CloudError(msg, res.status)
  }
}

function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  return request('POST', `/rpc/${fn}`, args) as Promise<T>
}

/* ---------------------------------------------------------------
   The money functions — the reason this file exists

   Nothing below computes. Each one hands the question to Postgres and
   returns the answer.
   --------------------------------------------------------------- */

/** One row of "who owes what", straight from `reminder_queue`. */
export type DueRow = {
  enrollment_id: number
  member_id: number
  member_name: string
  parent_name: string | null
  phone: string | null
  centre: string | null
  batch: string | null
  sport: string | null
  due_date: string
  days_since: number
  stage: 'heads_up' | 'due' | 'overdue'
  /** Already includes the plan; do not multiply it by anything. */
  amount: number | null
  months: number | null
  fee_source: string | null
  /** Non-null means do NOT send — missing phone, opted out, past +15. */
  blocked_reason: string | null
  already_sent: boolean
  last_sent_at: string | null
}

/**
 * Who is due today, and for how much. Replaces `planFeeReminders` and
 * `unpaidMonthsFor` outright — including the ladder (−2 heads-up, 0 due,
 * +5 first chase, +7–14 daily, +15 stop), which is a platform rule and
 * not this app's to redefine.
 */
export function dueToday(on?: string): Promise<DueRow[]> {
  return rpc<DueRow[]>('reminder_queue', { p_tenant: TENANT, p_on: on ?? null })
}

export type ResolvedFee = {
  amount: number | null
  monthly: number | null
  source: 'custom' | 'member' | 'batch' | 'centre_sport' | 'sport' | 'centre' | 'default' | 'unset'
  rule_id: number | null
  label?: string
  admission_fee: number
}

/** The 7-level fee chain. Never guess a fee from a batch's default. */
export function resolveFee(a: {
  memberId?: number | null
  centreId: number
  sport: string
  batchId?: number | null
  months?: number
  custom?: number | null
}): Promise<ResolvedFee> {
  return rpc<ResolvedFee>('resolve_fee', {
    p_tenant: TENANT,
    p_member: a.memberId ?? null,
    p_centre: a.centreId,
    p_sport: a.sport,
    p_batch: a.batchId ?? null,
    p_months: a.months ?? 1,
    p_custom: a.custom ?? null,
  })
}

/**
 * The ONE write path for a fee. Rolls `renewal_on` forward, writes the
 * payment with the period it covers, and closes the reminder — all in
 * one transaction, server-side. Do not write to `payments` directly.
 */
export function recordPayment(a: {
  enrollmentId: number
  amount: number
  months?: number
  mode?: string
  kind?: 'renewal' | 'admission'
  onDate?: string
  ref?: string
  note?: string
}): Promise<{ payment_id: number; renewal_on: string; period_from: string; period_to: string }> {
  return rpc('record_fee_payment', {
    p_tenant: TENANT,
    p_enrollment: a.enrollmentId,
    p_amount: a.amount,
    p_months: a.months ?? null,
    p_mode: a.mode ?? 'UPI',
    p_kind: a.kind ?? 'renewal',
    p_on_date: a.onDate ?? null,
    p_ref: a.ref ?? null,
    p_note: a.note ?? null,
  })
}

export function voidPayment(paymentId: number, reason?: string): Promise<unknown> {
  return rpc('void_payment', {
    p_tenant: TENANT,
    p_payment: paymentId,
    p_reason: reason ?? null,
  })
}

/** Staff attendance. Present or absent — the academy marks a day worked or not. */
export function markStaffAttendance(a: {
  coachId: number
  date: string
  status: AttendanceStatus
}): Promise<unknown> {
  return request('POST', '/attendance', {
    tenant_id: TENANT,
    date: a.date,
    kind: 'staff',
    person_id: String(a.coachId),
    present: a.status === 'present',
  })
}

/* ---------------------------------------------------------------
   Writes

   Each one lands in Postgres and nowhere else. The store re-reads
   afterwards rather than patching its copy, because a write often
   changes more than it says: recording a fee moves a renewal date and
   closes a reminder, and guessing at that here would be the same
   second-implementation mistake in a new place.
   --------------------------------------------------------------- */

/**
 * Add a student: a member row and the enrolment that carries the money.
 *
 * Two inserts rather than one because the platform models them
 * separately — a person, and their current arrangement with the
 * academy. Someone who leaves and comes back keeps this member row and
 * gains a second enrolment — see reenroll() — which is what makes their
 * history readable.
 */
export async function addStudent(a: {
  name: string
  phone: string
  guardian?: string
  centreId: number
  batchId: number
  joinedOn: string
  feeDueDay: number
  /** Only when the owner overrode the batch fee for this student. */
  customFee?: number | null
  note?: string
}): Promise<{ memberId: number; enrollmentId: number; renewalOn: string }> {
  const members = (await request('POST', '/members', {
    tenant_id: TENANT,
    name: a.name,
    parent_name: a.guardian ?? null,
    parent_phone: a.phone,
    program: 'badminton',
    joined: a.joinedOn,
    status: 'active',
    venue: 'narsingi',
    notes: a.note ?? null,
  })) as Array<{ id: number }>
  const memberId = members?.[0]?.id
  if (!memberId) throw new CloudError('The student was not created.', 500)

  const firstDue = firstDueDate(a.feeDueDay, a.joinedOn)
  const enrolments = (await request('POST', '/enrollments', {
    tenant_id: TENANT,
    member_id: memberId,
    centre_id: a.centreId,
    batch_id: a.batchId,
    sport: 'badminton',
    plan_months: 1,
    custom_amount: a.customFee ?? null,
    joined_on: a.joinedOn,
    /* The fee day on or after joining. Nothing else — no skip, no
       branch on whether they paid. When that date is soon the SHEET
       says so before saving; the arithmetic no longer decides quietly
       on the owner's behalf, which is what made three rounds of this
       look like arithmetic bugs. */
    renewal_on: firstDue,
    status: 'active',
  })) as Array<{ id: number }>
  const enrollmentId = enrolments?.[0]?.id
  if (!enrollmentId) throw new CloudError('The student was created without an enrolment.', 500)

  track('student_added', { batch: a.batchId })
  return { memberId, enrollmentId, renewalOn: firstDue }
}

/**
 * Edit the person and their current arrangement.
 *
 * Details only. Leaving and coming back are NOT field edits — they open
 * and close a spell across two tables that must agree — so they go
 * through discontinue() and reenroll() below, which do it in one
 * transaction server-side.
 */
/**
 * The person, without touching their arrangement.
 *
 * Split out because bringing a student back also edits them — a phone
 * corrected on the way in used to be typed, saved, and dropped, since
 * the rejoin path only ever wrote the enrolment.
 */
export async function updateMemberDetails(a: {
  memberId: number
  name: string
  phone: string
  guardian?: string
  note?: string
}): Promise<void> {
  await request('PATCH', `/members?id=eq.${a.memberId}&tenant_id=eq.${TENANT}`, {
    name: a.name,
    parent_name: a.guardian ?? null,
    parent_phone: a.phone,
    notes: a.note ?? null,
  })
}

export async function updateStudent(a: {
  memberId: number
  enrollmentId: number
  name: string
  phone: string
  guardian?: string
  batchId: number
  customFee?: number | null
  note?: string
  /** The billing day the owner wants from now on. */
  feeDueDay?: number
  /** What it is today, so an unchanged day is left alone. */
  currentRenewalOn?: string
  /** The start of their current spell, to re-derive from when unpaid. */
  joinedOn?: string
  /** Has any money arrived in THIS spell? Decides which rule applies. */
  settledThisSpell?: boolean
  /** Only meaningful while unpaid: did they settle on the day? */
}): Promise<void> {
  await updateMemberDetails(a)

  const patch: Record<string, unknown> = {
    batch_id: a.batchId,
    custom_amount: a.customFee ?? null,
  }
  /* The billing date moves ONLY when the owner actually moved it, and
     the rule for where it lands is in `renewalAfterFeeDayChange` — pure,
     and tested there, because the two ways this has gone wrong were both
     arithmetic rather than transport.

     Returning null rather than a date is the part that matters here.
     BatchDetail and StudentDetail build this input by hand and pass a
     fee day because the type demands one, with no current date; the
     Remove button did that and silently rewrote renewal_on months into
     the past before discontinue_member even ran, so a student removed
     and brought back landed straight in the +15 blocked bucket. */
  const moved = renewalAfterFeeDayChange({
    feeDay: a.feeDueDay ?? 0,
    currentRenewalOn: a.currentRenewalOn,
    joinedOn: a.joinedOn,
    settledThisSpell: a.settledThisSpell,
  })
  if (moved) patch.renewal_on = moved

  await request('PATCH', `/enrollments?id=eq.${a.enrollmentId}&tenant_id=eq.${TENANT}`, patch)
  track('student_updated', {})
}

/**
 * The student has stopped coming.
 *
 * One call, not two PATCHes. The member row and every live enrolment
 * have to move together: `active_players` in the operator console counts
 * `members.status`, while reminder_queue reads the enrolment — so a half
 * -applied change shows up as a wrong number in one place and a chased
 * parent in the other.
 *
 * Closing them is all that is needed to stop the chasing. The reminder
 * is not cancelled here because it is not stored anywhere — it simply
 * stops coming back from reminder_queue.
 */
/**
 * Put the billing date back after a registration payment.
 *
 * record_fee_payment rolls a whole cycle forward from the renewal,
 * which is right for every payment except the first: that one settles
 * the stretch between joining and the first billing day, and must not
 * push the billing day itself. The platform has no notion of a partial
 * opening period, so the app restores the date the owner chose. A date,
 * not an amount — the money stayed in the money function.
 */
export async function setRenewalOn(enrollmentId: number, on: string): Promise<void> {
  await request('PATCH', `/enrollments?id=eq.${enrollmentId}&tenant_id=eq.${TENANT}`, {
    renewal_on: on,
  })
}

export async function discontinue(a: {
  memberId: number
  onDate?: string
  reason?: string
}): Promise<void> {
  await rpc('discontinue_member', {
    p_tenant: TENANT,
    p_member: a.memberId,
    p_on_date: a.onDate ?? null,
    p_reason: a.reason ?? null,
  })
  track('student_discontinued', {})
}

/**
 * The student is back.
 *
 * A NEW enrolment against the SAME member, which is the whole point:
 * their payments, timeline and tenure stay under one id, and the gap
 * between the two spells is what the profile renders as "Rejoined".
 *
 * Reusing the old enrolment instead — which is what flipping a status
 * field would do — leaves renewal_on at the date they left, so
 * reminder_queue puts someone who walked back in this morning straight
 * into the +15-day blocked bucket. The renewal date is set from the fee
 * day the owner picks, so they enter the ladder at day 0.
 *
 * The server refuses a second live enrolment, so this cannot quietly
 * duplicate someone who never actually left.
 */
export async function reenroll(a: {
  memberId: number
  centreId: number
  batchId: number
  feeDueDay: number
  joinedOn?: string
  customFee?: number | null
}): Promise<{ enrollment_id: number; renewal_on: string }> {
  const out = await rpc<{ enrollment_id: number; renewal_on: string }>('reenroll_member', {
    p_tenant: TENANT,
    p_member: a.memberId,
    p_centre: a.centreId,
    p_batch: a.batchId,
    p_sport: 'badminton',
    p_joined_on: a.joinedOn ?? null,
    // Same single rule as joining: coming back IS joining again.
    p_renewal_on: firstDueDate(a.feeDueDay, a.joinedOn ?? todayISO()),
    p_plan_months: 1,
    p_custom_amount: a.customFee ?? null,
  })
  track('student_rejoined', { batch: a.batchId })
  return out
}

/* ---------------- batches ---------------- */

/**
 * A batch and the fee rule that prices it.
 *
 * MPP thinks of a batch as having a fee. The platform separates them:
 * the batch is a timetable slot, and what it costs is a row in
 * fee_rules that resolve_fee ranks against member overrides and centre
 * defaults. Changing "the fee" therefore updates the rule, never a
 * column on the batch — otherwise resolve_fee would keep returning the
 * old number and the two would disagree.
 */
export async function saveBatch(a: {
  id?: number
  code?: string
  name: string
  centreId: number
  days: number[]
  startTime: string
  endTime: string
  capacity?: number | null
  fee: number
  active?: boolean
  /** Collect this batch's fees to a different account. Blank = the
      academy's own, which is what resolve_upi falls back to. */
  upiId?: string | null
  upiName?: string | null
}): Promise<number> {
  const body = {
    tenant_id: TENANT,
    centre_id: a.centreId,
    name: a.name,
    sport: 'badminton',
    days: a.days,
    start_time: a.startTime,
    end_time: a.endTime,
    capacity: a.capacity ?? null,
    active: a.active ?? true,
  }

  let batchId = a.id
  if (batchId) {
    await request('PATCH', `/batches?id=eq.${batchId}&tenant_id=eq.${TENANT}`, body)
  } else {
    const code =
      (a.code || a.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) ||
      `batch-${Date.now()}`
    const rows = (await request('POST', '/batches', { ...body, code, sort: 99 })) as Array<{ id: number }>
    batchId = rows?.[0]?.id
    if (!batchId) throw new CloudError('The batch was not created.', 500)
  }

  // Retire any previous rule for this batch rather than editing it, so
  // a fee change does not silently rewrite what past months were priced
  // at. effective_to is what makes the old number still explicable.
  await request(
    'PATCH',
    `/fee_rules?tenant_id=eq.${TENANT}&batch_id=eq.${batchId}&active=is.true`,
    { active: false, effective_to: todayISO() },
  ).catch(() => {})

  /* The collection account goes through set_collection_account, not a
     PATCH on the row.

     It is a SECURITY DEFINER function that asserts staff for this tenant,
     validates the id against is_valid_upi (name@bank), refuses a batch
     belonging to another academy, and returns what resolve_upi will now
     answer. Writing batches.upi_id directly from here would skip all
     four — and the format check is the one that matters, because a
     mistyped UPI id does not fail, it silently sends a parent's money
     nowhere. */
  if (a.upiId !== undefined) {
    await rpc('set_collection_account', {
      p_tenant: TENANT,
      p_kind: 'batch',
      p_id: batchId,
      p_upi: a.upiId || null,
      p_name: a.upiName || null,
    })
  }

  await request('POST', '/fee_rules', {
    tenant_id: TENANT,
    label: a.name,
    centre_id: a.centreId,
    sport: 'badminton',
    batch_id: batchId,
    monthly_amount: a.fee,
    plan_amounts: {},
    admission_fee: 0,
    effective_from: todayISO(),
    active: true,
  })

  track(a.id ? 'batch_updated' : 'batch_added', { batch: batchId })
  return batchId
}

export async function deleteBatch(batchId: number): Promise<void> {
  // Deactivated, not deleted: enrolments and past payments point at it,
  // and a batch that vanishes takes their history's meaning with it.
  await request('PATCH', `/batches?id=eq.${batchId}&tenant_id=eq.${TENANT}`, { active: false })
  track('batch_removed', { batch: batchId })
}

/* ---------------- money ---------------- */

/** Revenue that is not a student's fee — court hire, memberships, sundry. */
export async function addRevenue(a: {
  label: string
  amount: number
  onDate: string
  kind: 'Court' | 'Partner' | 'Membership' | 'Coaching'
  /** Which court and when — "Court 3 · 7:00 PM". Free text by design. */
  detail?: string
  note?: string
}): Promise<void> {
  await request('POST', '/payments', {
    tenant_id: TENANT,
    name: a.label,
    type: a.kind,
    amount: Math.round(a.amount),
    mode: 'UPI',
    on_date: a.onDate,
    status: 'paid',
    detail: a.detail ?? null,
    note: a.note ?? null,
  })
  track('payment_recorded', { amount: Math.round(a.amount), mode: a.kind })
}

export async function addExpense(a: {
  category: string
  amount: number
  onDate: string
  note?: string
}): Promise<void> {
  await request('POST', '/expenses', {
    tenant_id: TENANT,
    category: a.category,
    amount: Math.round(a.amount),
    mode: 'UPI',
    on_date: a.onDate,
    detail: a.note ?? null,
  })
  track('expense_recorded', { amount: Math.round(a.amount), category: a.category })
}

/**
 * Record that a reminder actually went out.
 *
 * log_manual_reminder already exists for this — it writes the
 * reminder_events row that reminder_queue reads back as `already_sent`
 * and `last_sent_at`. Without it the queue has no idea the owner has
 * chased anyone, and would show the same student as un-chased tomorrow.
 */
export async function logReminderSent(a: {
  enrollmentId: number
  stage: string
  amount: number | null
  phone: string | null
  body: string
  channel: 'whatsapp' | 'sms' | 'call'
}): Promise<void> {
  await rpc('log_manual_reminder', {
    p_tenant: TENANT,
    p_enrollment: a.enrollmentId,
    p_stage: a.stage,
    p_amount: a.amount,
    p_phone: a.phone,
    p_body: a.body,
    p_channel: a.channel,
    p_by: currentSession()?.email ?? 'owner',
  })
  track('reminder_sent', { channel: a.channel })
}

/** Reverse a payment. Never a delete — the money moved, and the record
    of it moving is what makes a correction auditable. */
export async function voidPaymentById(paymentId: number, reason?: string): Promise<void> {
  await voidPayment(paymentId, reason)
  track('payment_voided', {})
}

export async function deleteExpense(id: number): Promise<void> {
  await request('DELETE', `/expenses?id=eq.${id}&tenant_id=eq.${TENANT}`)
  track('expense_removed', {})
}

/* ---------------- payment screenshots ---------------- */

/**
 * Upload the proof and attach it to the payment.
 *
 * Two steps on purpose. record_fee_payment moves money and is not
 * rewritten to carry an image: if this second step fails you have a
 * payment correctly recorded and an unreferenced object, which is a far
 * better outcome than a money function nobody has exercised.
 *
 * The bucket is private. Reading one back means asking for a signed URL
 * with a staff session — these are bank screenshots, with an account
 * name, a handle and an amount on them.
 */
export async function attachProof(paymentId: number, file: Blob): Promise<string> {
  const ext =
    file.type === 'image/png' ? 'png'
      : file.type === 'image/webp' ? 'webp'
        : file.type === 'image/heic' ? 'heic'
          : 'jpg'
  const path = `${TENANT}/${paymentId}.${ext}`

  if (!session) throw new CloudError('Not signed in', 401)
  if (session.expires_at - Date.now() < 60_000) await refresh()

  const res = await fetch(`${PROJECT}/storage/v1/object/payment-proofs/${path}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      'Content-Type': file.type || 'image/jpeg',
      'x-upsert': 'true',
    },
    body: file,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new CloudError(t.slice(0, 160) || 'Could not upload the screenshot.', res.status)
  }

  await request('PATCH', `/payments?id=eq.${paymentId}&tenant_id=eq.${TENANT}`, {
    proof_path: path,
  })
  track('payment_proof_attached', {})
  return path
}

/**
 * A short-lived URL for one screenshot.
 *
 * Signed rather than public, and not cached: the link is the only thing
 * standing between a bank screenshot and anyone who gets hold of it, so
 * it should expire.
 */
export async function proofUrl(path: string, seconds = 300): Promise<string | null> {
  try {
    if (!session) return null
    if (session.expires_at - Date.now() < 60_000) await refresh()
    const res = await fetch(`${PROJECT}/storage/v1/object/sign/payment-proofs/${path}`, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${session?.access_token ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: seconds }),
    })
    if (!res.ok) return null
    const out = (await res.json()) as { signedURL?: string }
    return out.signedURL ? `${PROJECT}/storage/v1${out.signedURL}` : null
  } catch {
    return null
  }
}

/* ---------------- staff ---------------- */

export async function saveStaff(a: {
  id?: number
  name: string
  role: string
  phone?: string
  active?: boolean
}): Promise<void> {
  const body = {
    tenant_id: TENANT,
    name: a.name,
    role: a.role,
    phone: a.phone || null,
    active: a.active ?? true,
  }
  if (a.id) await request('PATCH', `/coaches?id=eq.${a.id}&tenant_id=eq.${TENANT}`, body)
  else await request('POST', '/coaches', body)
  track(a.id ? 'staff_updated' : 'staff_added', {})
}

export async function deleteStaff(id: number): Promise<void> {
  await request('PATCH', `/coaches?id=eq.${id}&tenant_id=eq.${TENANT}`, { active: false })
  track('staff_removed', {})
}

/**
 * Mark a staff member present or absent.
 *
 * attendance has one row per person per day, so a second tap on the
 * same day is an update, not an insert — a plain POST 409s. Sent as an
 * upsert via Prefer: resolution=merge-duplicates.
 */
/**
 * Record one day's shifts for one person.
 *
 * Each half is THREE states, not two: `true` worked, `false` did not,
 * `null` nobody has said. That is what a nullable boolean already gave
 * us, so this needed no schema change — and it is the difference
 * between "the evening is off" and "the evening has not been marked
 * yet", which a two-state pill could not express.
 *
 * Both null means the day is unmarked, and an unmarked day has NO ROW —
 * so this deletes rather than writing a row full of nulls. An absent
 * row and no row have always meant different things here.
 */
/**
 * Mark several people at once, in ONE request.
 *
 * "Mark all present" used to call markStaffDay per person, and every one
 * of those went through the store's write() — which refetches the whole
 * tenant. Eight staff meant eight upserts and eight full reloads,
 * roughly 144 requests for one button press. PostgREST takes an array
 * body with the merge-duplicates header requestUpsert already sets, so
 * the whole roster is a single round trip.
 */
export async function markStaffDays(
  rows: Array<{ coachId: string; date: string; am: boolean | null; pm: boolean | null }>,
): Promise<void> {
  const body = rows.map((a) => ({
    tenant_id: TENANT,
    date: a.date,
    kind: 'staff',
    person_id: String(a.coachId),
    present: a.am === true || a.pm === true,
    am: a.am,
    pm: a.pm,
  }))
  if (!body.length) return
  await requestUpsert('/attendance', body)
  track('attendance_marked', { bulk: body.length })
}

export async function markStaffDay(a: {
  coachId: string
  date: string
  am: boolean | null
  pm: boolean | null
}): Promise<void> {
  const scope =
    `tenant_id=eq.${TENANT}&date=eq.${a.date}&kind=eq.staff` +
    `&person_id=eq.${encodeURIComponent(String(a.coachId))}`

  if (a.am === null && a.pm === null) {
    await request('DELETE', `/attendance?${scope}`)
    track('attendance_marked', { cleared: true })
    return
  }

  /* `present` is DERIVED here and stored, never derived on read. It is
     the column every other tenant and the whole of history rely on, and
     a shared CHECK (attendance_mpp_halves_agree) refuses the row if it
     disagrees with the halves — so getting this wrong fails loudly
     rather than quietly making a worked day look absent.

     `=== true` on purpose: null is not false. A morning marked worked
     with the evening still unsaid is a day worked. */
  const present = a.am === true || a.pm === true
  await requestUpsert('/attendance', {
    tenant_id: TENANT,
    date: a.date,
    kind: 'staff',
    person_id: String(a.coachId),
    present,
    am: a.am,
    pm: a.pm,
  })
  track('attendance_marked', { present })
}

/**
 * An activity ping for Academy Manager.
 *
 * The console's activity feed reads `events`, not `members` — so a
 * student added without one of these is real in the database and
 * invisible in the console, which is exactly the gap that made this
 * function necessary. Carries no names or numbers: what was done, not
 * to whom.
 */
export function track(name: string, props: Record<string, unknown>): void {
  try {
    void fetch(`${PROJECT}/rest/v1/events`, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        tenant_id: TENANT,
        name,
        /* The same envelope page_view has always sent.

           An ACTION — a payment recorded, a student added, a batch
           created — used to arrive with only `ver`: no session, no
           platform, no device. So the console could show that something
           happened but not from where, and "does the APK report like the
           web app?" could not be answered from the data at all. It can
           now: the feed reads "marked attendance — Android". */
        session_id: sessionId(),
        page: (location.hash || '#/').slice(0, 60),
        props: { ...props, ver: __APP_VERSION__, plat: platform, ua: device() },
      }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* an unreported action is better than a broken one */
  }
}

/* ---------------------------------------------------------------
   Structure reads
   --------------------------------------------------------------- */

export type CentreRow = { id: number; code: string; name: string; short_name: string }
export type BatchRow = {
  id: number
  centre_id: number
  code: string
  name: string
  sport: string
  /** ISO day numbers, 1 = Monday. Not day names — the column is integer[]. */
  days: number[] | null
  start_time: string | null
  end_time: string | null
  capacity: number | null
  active: boolean
  /* Where this batch's fees are collected. resolve_upi() reads THESE
     columns — batch, then centre, then the tenant's account — so this is
     the only source that agrees with where the money actually goes. */
  upi_id: string | null
  upi_name: string | null
}
export type MemberRow = {
  id: number
  name: string
  phone: string | null
  parent_name: string | null
  parent_phone: string | null
  joined: string | null
  status: string
  notes: string | null
}
export type EnrollmentRow = {
  id: number
  member_id: number
  centre_id: number
  batch_id: number | null
  sport: string
  plan_months: number
  custom_amount: number | null
  joined_on: string | null
  renewal_on: string | null
  status: string
  discontinued_on: string | null
}
export type PaymentRow = {
  id: number
  member_id: number | null
  enrollment_id: number | null
  type: string
  kind: string | null
  amount: number
  mode: string | null
  on_date: string
  period_from: string | null
  period_to: string | null
  status: string | null
  ref: string | null
  note: string | null
  detail: string | null
  proof_path: string | null
}
export type CoachRow = { id: number; name: string; role: string; phone: string | null; active: boolean }
export type ExpenseRow = {
  id: number
  category: string
  payee: string | null
  detail: string | null
  amount: number
  mode: string | null
  on_date: string | null
}

export type AttendanceRow = {
  date: string
  kind: string
  person_id: string
  present: boolean
  /** null for every row written before shifts, and for every other
      tenant. Not false — nobody said. */
  am: boolean | null
  pm: boolean | null
}

export type TenantSettings = {
  brand: string | null
  tagline?: string | null
  city?: string | null
  venues?: Record<string, unknown>
  billing?: {
    payee?: string | null
    upiIds?: string[] | null
    upiByBatch?: Record<string, { upi: string; payee: string }> | null
  }
}

export const read = {
  centres: () => select<CentreRow>('centres', 'select=id,code,name,short_name&order=sort'),
  batches: () =>
    select<BatchRow>(
      'batches',
      'select=id,centre_id,code,name,sport,days,start_time,end_time,capacity,active,upi_id,upi_name&order=sort',
    ),
  members: () =>
    select<MemberRow>(
      'members',
      'select=id,name,phone,parent_name,parent_phone,joined,status,notes&order=name',
    ),
  enrollments: () =>
    select<EnrollmentRow>(
      'enrollments',
      'select=id,member_id,centre_id,batch_id,sport,plan_months,custom_amount,joined_on,renewal_on,status,discontinued_on',
    ),
  payments: (sinceISO: string) =>
    select<PaymentRow>(
      'payments',
      `select=id,member_id,enrollment_id,type,kind,amount,mode,on_date,period_from,period_to,status,ref,note,detail,proof_path&on_date=gte.${sinceISO}&order=on_date.desc`,
    ),
  coaches: () => select<CoachRow>('coaches', 'select=id,name,role,phone,active&order=name'),
  expenses: (sinceISO: string) =>
    select<ExpenseRow>(
      'expenses',
      `select=id,category,payee,detail,amount,mode,on_date&on_date=gte.${sinceISO}&order=on_date.desc`,
    ),
  attendance: (sinceISO: string) =>
    select<AttendanceRow>(
      'attendance',
      `select=date,kind,person_id,present,am,pm&kind=eq.staff&date=gte.${sinceISO}&order=date.desc`,
    ),
  settings: () => rpc<TenantSettings>('tenant_settings', { p_tenant: TENANT }),
}

/**
 * Every batch's monthly fee, each one from resolve_fee.
 *
 * One call per batch rather than reading fee_rules directly. Reading the
 * table would mean re-implementing the seven-level chain here — member
 * override beats batch beats centre+sport beats sport beats centre beats
 * tenant default — which is the precise thing this rewrite exists to
 * delete. Six batches is six cheap calls.
 */
export async function batchFees(
  centreId: number,
  batches: { id: number; sport: string }[],
): Promise<Record<number, number | null>> {
  // null, not 0. resolve_fee returning nothing means no rule exists
  // anywhere in the chain, which is a different fact from a fee of
  // zero and has to stay tellable apart all the way to the screen.
  const out: Record<number, number | null> = {}
  const answers = await Promise.all(
    batches.map((b) =>
      resolveFee({ centreId, sport: b.sport, batchId: b.id, months: 1 })
        .then((f) => [b.id, f.amount == null ? null : Number(f.amount)] as const)
        .catch(() => [b.id, null] as const),
    ),
  )
  for (const [id, amount] of answers) out[id] = amount
  return out
}

/** Everything the app needs for one session, in one round of requests. */
export async function loadEverything(): Promise<{
  centreId: number
  batches: BatchRow[]
  fees: Record<number, number | null>
  members: MemberRow[]
  enrolments: EnrollmentRow[]
  coaches: CoachRow[]
  payments: PaymentRow[]
  expenses: ExpenseRow[]
  attendance: AttendanceRow[]
  due: DueRow[]
}> {
  // Twelve months back: the app charts six and the year-on-year
  // comparisons need the ones before them.
  const since = new Date()
  since.setMonth(since.getMonth() - 12)
  /* Local, like every other date this app writes or compares. Whole
     hours before midnight IST, toISOString() reports yesterday — the
     bug that once dated every renewal a day early, and the reason no
     date in this file goes through it. */
  const sinceISO = toISO(since)

  /* ONE wave, not two.

     batchFees needs only `centres` and `batches`, but it used to be
     awaited AFTER the whole Promise.all — so every load and every write
     paid a second full round-trip of latency waiting on payments and
     reminder_queue, neither of which it looks at. Starting it as soon
     as its own two inputs land lets it overlap the other eight.

     It still resolves each fee through resolve_fee() in Postgres; the
     seven-level chain has not moved, only the waiting. */
  const centresP = read.centres()
  const batchesP = read.batches()
  const feesP = Promise.all([centresP, batchesP]).then(([c, b]) =>
    batchFees(
      c[0]?.id ?? 0,
      // Only batches still in use. deleteBatch just sets active=false,
      // so without this every batch ever retired costs one resolve_fee
      // request on every load and every write, for ever.
      b.filter((x) => x.active !== false).map((x) => ({ id: x.id, sport: x.sport })),
    ),
  )

  /* tenant_settings is no longer read on load.

     Its only consumer was config.billing.upiByBatch, a second answer to
     "where does this batch's money go" that resolve_upi never consulted
     — it reads batches.upi_id. With the batch row as the single source,
     this RPC had nothing left to supply, so it is one fewer request on
     every load. read.settings() stays defined for a caller that needs
     the brand or WhatsApp config later; nothing pays for it now. */
  const [centres, batches, members, enrolments, coaches, payments, expenses, attendance, due, fees] =
    await Promise.all([
      centresP,
      batchesP,
      read.members(),
      read.enrollments(),
      read.coaches(),
      read.payments(sinceISO),
      read.expenses(sinceISO),
      read.attendance(sinceISO),
      dueToday(),
      feesP,
    ])

  const centreId = centres[0]?.id ?? 0

  return {
    centreId,
    batches,
    fees,
    members,
    enrolments,
    coaches,
    payments,
    expenses,
    attendance,
    due,
  }
}

/* The outbox is gone.

   Roughly ninety lines implemented a durable write queue — enqueue on
   failure, replay oldest-first, drop a 4xx rather than block the queue —
   and nothing in src/ ever called queue() or flush(). Not one write
   path referenced it.

   That made the promise at the top of this file false: writes were NOT
   queued offline. A payment taken on a dead connection threw, showed a
   toast, and was gone. Code that does nothing is survivable; code that
   does nothing while the file says it does is how someone decides not
   to write the retry that was needed.

   If offline writes are wanted, they should be built against the real
   failure — record_fee_payment is not idempotent, so a replayed payment
   is a second payment, and that is the problem to solve first. */
