import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../lib/store'
import type { Reminder } from '../lib/types'
import { currentMonthKey, inr } from '../lib/format'
import { monthsPhrase, studentById } from '../lib/selectors'
import { attachProof, proofUrl } from '../lib/cloud'
import { compressToBlob } from '../lib/images'
import { reportIssue } from '../lib/telemetry'
import { Sheet } from './ui'
import {
  IconAlert,
  IconCheck,
  IconPhone,
  IconTrash,
  IconUpload,
  IconX,
} from './icons'

/* ------------------------------------------------------------------
   Renders a stored screenshot. Images live in IndexedDB, so this
   loads asynchronously and holds nothing in the JSON document.
   ------------------------------------------------------------------ */

export function ProofImage({ id, height = 150 }: { id: string; height?: number }) {
  const [src, setSrc] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [full, setFull] = useState(false)

  useEffect(() => {
    let alive = true
    /* `id` is an object key in a private bucket, so a fresh signed URL
       is asked for each time it is shown. Not cached deliberately: the
       link is the only thing between a bank screenshot and whoever gets
       hold of it, so it should expire. */
    proofUrl(id)
      .then((url) => {
        if (!alive) return
        if (url) setSrc(url)
        else setMissing(true)
      })
      .catch(() => alive && setMissing(true))
    return () => {
      alive = false
    }
  }, [id])

  if (missing) {
    return (
      <div className="t-mut" style={{ padding: '10px 0' }}>
        Screenshot could not be loaded.
      </div>
    )
  }
  if (!src) {
    return (
      <div
        style={{
          height,
          borderRadius: 'var(--r-md)',
          background: 'var(--surface-2)',
          border: '1px solid var(--line)',
        }}
      />
    )
  }
  return (
    <>
      <img
        src={src}
        alt="Payment screenshot"
        onClick={() => setFull(true)}
        style={{
          width: '100%',
          maxHeight: height,
          objectFit: 'cover',
          objectPosition: 'top',
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--line-strong)',
          display: 'block',
          cursor: 'zoom-in',
        }}
      />
      {/* A cropped thumbnail is no use for checking a UPI reference —
          tapping shows the whole receipt. */}
      {full &&
        createPortal(
          <div
            onClick={() => setFull(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 300,
              background: 'rgba(4,6,9,0.94)',
              display: 'grid',
              placeItems: 'center',
              padding: 16,
              cursor: 'zoom-out',
            }}
          >
            <img
              src={src}
              alt="Payment screenshot"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }}
            />
            <button
              className="btn btn--icon"
              onClick={() => setFull(false)}
              aria-label="Close"
              style={{ position: 'fixed', top: 'max(14px, env(safe-area-inset-top))', right: 14 }}
            >
              <IconX size={20} />
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}

/* ------------------------------------------------------------------
   Confirming a payment

   Confirming without evidence is how money quietly goes missing, so
   the sheet will not let you finish until there is either a
   screenshot or an explicit statement of how else it was checked.
   ------------------------------------------------------------------ */

type Method = 'bank' | 'call' | 'cash'

const METHODS: Array<{ value: Method; label: string; detail: string }> = [
  { value: 'bank', label: 'Seen in the bank statement', detail: 'Checked the account myself' },
  { value: 'call', label: 'Confirmed on a call', detail: 'Spoke to the parent' },
  { value: 'cash', label: 'Paid in cash', detail: 'Handed over at the court' },
]

export function ConfirmPayment({
  reminder,
  onClose,
}: {
  reminder: Reminder | null
  onClose: () => void
}) {
  const { data, toast, recordFee, refresh } = useStore()
  const fileRef = useRef<HTMLInputElement | null>(null)

  /* Held in memory until the payment row exists, because the object is
     keyed on the payment id. Nothing is written to the device. */
  const [pending, setPending] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [method, setMethod] = useState<Method | null>(null)
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState<string | null>(null)

  const openKey = reminder?.id ?? null
  if (openKey !== key) {
    setKey(openKey)
    setPending(null)
    setPreview(null)
    setMethod(null)
    setBusy(false)
  }

  if (!reminder) return null

  const student = studentById(data, reminder.studentId)
  const months = reminder.months?.length ? reminder.months : [currentMonthKey()]
  /* The amount comes from reminder_queue, which already applied the fee
     chain and the plan. Recomputing it from monthlyFee x months would be
     a second opinion on a number the database has already given. */
  const total = reminder.amount ?? student?.monthlyFee ?? 0

  const attach = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const small = await compressToBlob(file)
      setPending(small)
      setPreview(URL.createObjectURL(small))
      setMethod(null)
    } catch {
      toast('Could not read that image. Try another one.', 'bad')
    } finally {
      setBusy(false)
    }
  }

  const evidenced = pending !== null || method !== null

  const confirm = async () => {
    /* record_fee_payment does all of it in one transaction: writes the
       payment, sets the months it covers, rolls the renewal forward and
       closes the reminder. The reminder is not marked paid here because
       it is not stored here — it disappears from reminder_queue on its
       own once the money is recorded. */
    if (!student?.enrollmentId) {
      toast('That student is not enrolled in the database yet.', 'bad')
      return
    }
    const res = await recordFee({
      enrollmentId: student.enrollmentId,
      amount: total,
      note: pending ? 'screenshot attached' : (method ?? undefined),
    })
    if (!res.ok) {
      toast(res.message, 'bad')
      return
    }

    /* The money is recorded. The screenshot is attached second and on
       purpose: if the upload fails the payment still stands, and the
       owner is told the proof did not attach rather than losing both. */
    if (pending && res.paymentId) {
      try {
        await attachProof(res.paymentId, pending)
        await refresh()
      } catch (err) {
        reportIssue('attach proof', err)
        toast('Payment saved, but the screenshot did not upload.', 'bad')
        onClose()
        return
      }
    }
    toast(
      months.length > 1
        ? `${months.length} months cleared and added to Finance.`
        : 'Payment confirmed and added to Finance.',
    )
    onClose()
  }

  /* Parent says they've paid but nothing has arrived — keep it open and
     flag it, rather than either confirming blind or losing the claim. */
  const awaitProof = () => {
    /* "Parent says paid, no screenshot yet" is a note about a
       conversation, not a fact about money, and the platform has
       nowhere to put it. Left unrecorded rather than written somewhere
       it would vanish on the next refresh. */
    toast('Leave it open and confirm once the screenshot arrives.', 'bad')
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Confirm payment"
      subtitle={`${student?.name ?? 'Student'} · ${monthsPhrase(reminder.months)} · ${inr(
        reminder.amount ?? 0,
      )}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={confirm} disabled={!evidenced || busy}>
            <IconCheck size={16} /> Confirm
          </button>
        </>
      }
    >
      {/* ---------- screenshot ---------- */}
      <div className="t-label" style={{ marginBottom: 8 }}>
        Payment screenshot
      </div>

      {preview ? (
        <div style={{ marginBottom: 14 }}>
          {/* Local preview until the payment exists — the upload is named
              after the payment id, so it cannot happen before the money
              is recorded. */}
          <img
            src={preview}
            alt="Payment screenshot"
            style={{ width: '100%', height: 190, objectFit: 'cover', borderRadius: 'var(--r-md)' }}
          />
          <button
            className="btn btn--sm btn--danger btn--block"
            style={{ marginTop: 8 }}
            onClick={() => {
              if (preview) URL.revokeObjectURL(preview)
              setPending(null)
              setPreview(null)
            }}
          >
            <IconTrash size={14} /> Remove
          </button>
        </div>
      ) : (
        <button
          className="btn btn--block"
          style={{ marginBottom: 14, minHeight: 88, flexDirection: 'column', gap: 6 }}
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          <IconUpload size={20} />
          {busy ? 'Reading image…' : 'Attach the screenshot the parent sent'}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={attach}
        style={{ display: 'none' }}
      />

      {/* ---------- no screenshot: verify another way ---------- */}
      {!pending && (
        <>
          <div
            className="row gap-10"
            style={{
              padding: 12,
              borderRadius: 'var(--r-md)',
              background: 'rgba(250,178,25,0.07)',
              border: '1px solid rgba(250,178,25,0.22)',
              alignItems: 'flex-start',
              marginBottom: 14,
            }}
          >
            <IconAlert size={17} style={{ color: '#ffd166', flexShrink: 0, marginTop: 1 }} />
            <p className="t-mut" style={{ lineHeight: 1.5 }}>
              No screenshot attached. Check the bank statement or call the parent before
              confirming — once confirmed this counts as revenue and the dues clear.
            </p>
          </div>

          <div className="t-label" style={{ marginBottom: 8 }}>
            Or confirm how you checked it
          </div>
          <div className="col gap-8" style={{ marginBottom: 14 }}>
            {METHODS.map((m) => (
              <button
                key={m.value}
                className="listrow tap"
                onClick={() => setMethod(method === m.value ? null : m.value)}
                style={{
                  cursor: 'pointer',
                  borderColor: method === m.value ? 'var(--brand)' : 'var(--line)',
                  background: method === m.value ? 'var(--brand-wash)' : 'var(--surface-1)',
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 99,
                    flexShrink: 0,
                    display: 'grid',
                    placeItems: 'center',
                    border: `2px solid ${method === m.value ? 'var(--brand)' : 'var(--line-strong)'}`,
                    background: method === m.value ? 'var(--brand)' : 'transparent',
                    color: 'var(--brand-ink)',
                  }}
                >
                  {method === m.value && <IconCheck size={12} strokeWidth={3} />}
                </span>
                <div className="listrow__main">
                  <div className="listrow__title" style={{ fontSize: '0.86rem' }}>
                    {m.label}
                  </div>
                  <div className="listrow__meta">{m.detail}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="row gap-8">
            {student?.phone && (
              <a className="btn btn--sm grow" href={`tel:${student.phone}`}>
                <IconPhone size={14} /> Call parent
              </a>
            )}
            <button className="btn btn--sm grow" onClick={awaitProof}>
              Ask for screenshot
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}
