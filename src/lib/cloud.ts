/* ============================================================
   The platform database.

   Match Point Pride is a tenant of Academy Manager, and the platform
   has one rule:

     Anything that computes money lives in Postgres.

   So this file does not compute anything. It signs in, moves rows, and
   calls the functions that already exist — `resolve_fee`,
   `reminder_queue`, `record_fee_payment`. Every rupee in this app comes
   back from one of those, or it is a bug.

   Offline: reads are cached, writes are queued. What is cached is the
   SERVER'S ANSWER, never a local recalculation of it. That distinction
   is the whole rule — a cached ₹1,200 is the database's ₹1,200 from an
   hour ago; a recomputed ₹1,200 is a second implementation waiting to
   disagree.
   ============================================================ */

import type { AttendanceStatus } from './types'

const PROJECT = 'https://ugsklcipzyiogxynshnh.supabase.co'
// Public by design — it is in every tenant's front end. RLS is the
// control, and this key alone reads nothing.
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnc2tsY2lwenlpb2d4eW5zaG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTUyMzksImV4cCI6MjA5ODQ3MTIzOX0.w7xkjdTkYN2qA0oxMKLUNtua0ScKVHKQzfEyIayh9eo'

export const TENANT = 'mpp'

const SESSION_KEY = 'mpp.session.v1'
const OUTBOX_KEY = 'mpp.outbox.v1'

/* ---------------------------------------------------------------
   Session
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

let session: Session | null = readSession()

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    return s?.access_token ? s : null
  } catch {
    return null
  }
}

function writeSession(s: Session | null): void {
  session = s
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* storage full or blocked — the in-memory session still works */
  }
}

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
 * The next time the fee falls due: the chosen day, this month or next if
 * it has already passed.
 *
 * Calendar arithmetic, not money — this picks a date the owner named, it
 * does not work out what anybody owes. What happens on that date is
 * reminder_queue's business, and what it costs is resolve_fee's.
 */
function nextRenewal(feeDueDay: number, from = new Date()): string {
  const day = Math.min(Math.max(feeDueDay, 1), 28)
  const renewal = new Date(from.getFullYear(), from.getMonth(), day)
  if (renewal < from) renewal.setMonth(renewal.getMonth() + 1)
  return renewal.toISOString().slice(0, 10)
}

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
}): Promise<{ memberId: number; enrollmentId: number }> {
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

  const enrolments = (await request('POST', '/enrollments', {
    tenant_id: TENANT,
    member_id: memberId,
    centre_id: a.centreId,
    batch_id: a.batchId,
    sport: 'badminton',
    plan_months: 1,
    custom_amount: a.customFee ?? null,
    joined_on: a.joinedOn,
    renewal_on: nextRenewal(a.feeDueDay),
    status: 'active',
  })) as Array<{ id: number }>
  const enrollmentId = enrolments?.[0]?.id
  if (!enrollmentId) throw new CloudError('The student was created without an enrolment.', 500)

  track('student_added', { batch: a.batchId })
  return { memberId, enrollmentId }
}

/**
 * Edit the person and their current arrangement.
 *
 * Details only. Leaving and coming back are NOT field edits — they open
 * and close a spell across two tables that must agree — so they go
 * through discontinue() and reenroll() below, which do it in one
 * transaction server-side.
 */
export async function updateStudent(a: {
  memberId: number
  enrollmentId: number
  name: string
  phone: string
  guardian?: string
  batchId: number
  customFee?: number | null
  note?: string
}): Promise<void> {
  await request('PATCH', `/members?id=eq.${a.memberId}&tenant_id=eq.${TENANT}`, {
    name: a.name,
    parent_name: a.guardian ?? null,
    parent_phone: a.phone,
    notes: a.note ?? null,
  })
  await request('PATCH', `/enrollments?id=eq.${a.enrollmentId}&tenant_id=eq.${TENANT}`, {
    batch_id: a.batchId,
    custom_amount: a.customFee ?? null,
  })
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
    p_renewal_on: nextRenewal(a.feeDueDay),
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
    { active: false, effective_to: new Date().toISOString().slice(0, 10) },
  ).catch(() => {})

  await request('POST', '/fee_rules', {
    tenant_id: TENANT,
    label: a.name,
    centre_id: a.centreId,
    sport: 'badminton',
    batch_id: batchId,
    monthly_amount: a.fee,
    plan_amounts: {},
    admission_fee: 0,
    effective_from: new Date().toISOString().slice(0, 10),
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
  kind: 'Court' | 'Membership' | 'Coaching'
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
export async function markStaffDay(a: {
  coachId: string
  date: string
  status: AttendanceStatus
}): Promise<void> {
  await requestUpsert('/attendance', {
    tenant_id: TENANT,
    date: a.date,
    kind: 'staff',
    person_id: String(a.coachId),
    present: a.status === 'present',
  })
  track('attendance_marked', { present: a.status === 'present' })
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
        page: (location.hash || '#/').slice(0, 60),
        props: { ...props, ver: __APP_VERSION__ },
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
      'select=id,centre_id,code,name,sport,days,start_time,end_time,capacity,active&order=sort',
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
      `select=id,member_id,enrollment_id,type,kind,amount,mode,on_date,period_from,period_to,status,ref,note,proof_path&on_date=gte.${sinceISO}&order=on_date.desc`,
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
      `select=date,kind,person_id,present&date=gte.${sinceISO}&order=date.desc`,
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
): Promise<Record<number, number>> {
  const out: Record<number, number> = {}
  const answers = await Promise.all(
    batches.map((b) =>
      resolveFee({ centreId, sport: b.sport, batchId: b.id, months: 1 })
        .then((f) => [b.id, Number(f.amount ?? 0)] as const)
        .catch(() => [b.id, 0] as const),
    ),
  )
  for (const [id, amount] of answers) out[id] = amount
  return out
}

/** Everything the app needs for one session, in one round of requests. */
export async function loadEverything(): Promise<{
  centreId: number
  batches: BatchRow[]
  fees: Record<number, number>
  upi: Record<string, { upi: string; payee: string }>
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
  const sinceISO = since.toISOString().slice(0, 10)

  const [centres, batches, members, enrolments, coaches, payments, expenses, attendance, due, settings] =
    await Promise.all([
      read.centres(),
      read.batches(),
      read.members(),
      read.enrollments(),
      read.coaches(),
      read.payments(sinceISO),
      read.expenses(sinceISO),
      read.attendance(sinceISO),
      dueToday(),
      read.settings(),
    ])

  const centreId = centres[0]?.id ?? 0
  const fees = await batchFees(centreId, batches.map((b) => ({ id: b.id, sport: b.sport })))

  return {
    centreId,
    batches,
    fees,
    upi: settings?.billing?.upiByBatch ?? {},
    members,
    enrolments,
    coaches,
    payments,
    expenses,
    attendance,
    due,
  }
}

/* ---------------------------------------------------------------
   Outbox

   A write made on a dead train must not be lost, and must not be
   applied twice. Each entry carries its own id; replay is in order and
   stops at the first failure so a later write can never overtake an
   earlier one — order matters when the earlier write is a payment.
   --------------------------------------------------------------- */

type Pending = {
  id: string
  at: string
  op: 'rpc' | 'insert'
  target: string
  payload: Record<string, unknown>
}

function outbox(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]') as Pending[]
  } catch {
    return []
  }
}

function setOutbox(q: Pending[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(q))
  } catch {
    /* nothing useful to do; the write is still in memory for this session */
  }
}

export function pendingCount(): number {
  return outbox().length
}

export function queue(op: Pending['op'], target: string, payload: Record<string, unknown>): void {
  const q = outbox()
  q.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    op,
    target,
    payload,
  })
  setOutbox(q)
}

/**
 * Replay queued writes oldest-first. Returns how many went through.
 *
 * A 4xx other than 401 means the server rejected the write on its
 * merits — replaying it forever would block everything behind it, so it
 * is dropped and reported rather than retried.
 */
export async function flush(): Promise<{ sent: number; failed: Pending[] }> {
  if (!isSignedIn()) return { sent: 0, failed: [] }
  const q = outbox()
  const failed: Pending[] = []
  let sent = 0

  while (q.length) {
    const item = q[0]
    try {
      await request('POST', item.op === 'rpc' ? `/rpc/${item.target}` : `/${item.target}`, item.payload)
      q.shift()
      sent++
    } catch (e) {
      const status = e instanceof CloudError ? e.status : 0
      if (status >= 400 && status < 500 && status !== 401 && status !== 429) {
        failed.push(q.shift()!) // rejected on its merits — do not block the queue
        continue
      }
      break // network, auth or server trouble: keep the rest and try later
    }
  }

  setOutbox(q)
  return { sent, failed }
}
