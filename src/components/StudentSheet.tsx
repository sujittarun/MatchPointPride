import { useState } from 'react'
import { useStore } from '../lib/store'
import type { Student } from '../lib/types'
import {
  MAX_AMOUNT,
  clampDay,
  dateLabelFull,
  nonNegative,
  ordinal,
  todayISO,
} from '../lib/format'
import { Field, Sheet } from './ui'

/* Add / edit a student. Lives here rather than inside a page so it can
   be opened from the dashboard, the batch list or a batch itself. */

export function StudentSheet({
  value,
  batchId,
  defaultFee,
  onClose,
}: {
  value: Student | 'new' | null
  batchId?: string
  defaultFee?: number
  onClose: () => void
}) {
  const { data, saveStudent, toast } = useStore()
  const [saving, setSaving] = useState(false)
  const isNew = value === 'new'
  const s = isNew ? null : value

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [guardian, setGuardian] = useState('')
  const [batch, setBatch] = useState(batchId ?? data.batches[0]?.id ?? '')
  const [fee, setFee] = useState('')
  const [dueDay, setDueDay] = useState('1')
  const [joinedOn, setJoinedOn] = useState(todayISO())
  const [active, setActive] = useState(true)
  const [key, setKey] = useState('')

  const feeOf = (id: string) => data.batches.find((b) => b.id === id)?.fee

  const openKey = value === null ? '' : isNew ? `new:${batchId}` : (s as Student).id
  if (openKey !== key) {
    const startBatch = s?.batchId ?? batchId ?? data.batches[0]?.id ?? ''
    setKey(openKey)
    setName(s?.name ?? '')
    setPhone(s?.phone ?? '')
    setGuardian(s?.guardian ?? '')
    setBatch(startBatch)
    // A new student inherits the batch's fee — otherwise opening this from
    // the dashboard, where no batch is pre-selected, silently saves ₹0.
    setFee(
      s
        ? String(s.monthlyFee)
        : String(defaultFee ?? feeOf(startBatch) ?? ''),
    )
    setDueDay(s ? String(s.feeDueDay) : '1')
    setJoinedOn(s?.joinedOn ?? todayISO())
    setActive(s?.active ?? true)
  }

  /* Switching batch on a new student re-applies that batch's fee. */
  const pickBatch = (id: string) => {
    setBatch(id)
    if (isNew) setFee(String(feeOf(id) ?? ''))
  }

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast('Enter the student name.', 'bad')
      return
    }
    if (!batch) {
      toast('Pick a batch first.', 'bad')
      return
    }
    if (Number(fee) < 0) {
      toast('Fee cannot be negative.', 'bad')
      return
    }
    if (nonNegative(fee) > MAX_AMOUNT) {
      toast('That fee looks too large — check the digits.', 'bad')
      return
    }
    const feeVal = nonNegative(fee)
    const day = clampDay(dueDay)

    /* Straight to Postgres. The reminder that used to be cancelled here
       by hand is closed by the database: a discontinued enrolment drops
       out of reminder_queue on its own, so there is nothing to tidy and
       nothing that can disagree. */
    setSaving(true)
    const r = await saveStudent({
      id: s?.id,
      memberId: s?.memberId,
      enrollmentId: s?.enrollmentId,
      name: trimmed,
      phone: phone.replace(/\s/g, ''),
      guardian: guardian.trim() || undefined,
      batchId: batch,
      joinedOn,
      feeDueDay: day,
      // Only send a fee when it differs from what the batch resolves to;
      // otherwise the batch rule keeps owning it.
      customFee: feeVal === (feeOf(batch) ?? -1) ? null : feeVal,
      active,
    })
    setSaving(false)

    if (!r.ok) {
      toast(r.message, 'bad')
      return
    }
    toast(isNew ? 'Student added.' : 'Student updated.')
    onClose()
  }

  return (
    <Sheet
      open={value !== null}
      onClose={onClose}
      title={isNew ? 'New student' : 'Edit student'}
      subtitle={s ? `Joined ${dateLabelFull(s.joinedOn)}` : undefined}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Add student' : 'Save'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Name" span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Aarav Reddy"
            autoComplete="off"
          />
        </Field>

        <Field label="Phone" hint="Used for WhatsApp reminders." span>
          <input
            className="input"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="9876543210"
          />
        </Field>

        <Field label="Parent / guardian" hint="Optional." span>
          <input
            className="input"
            value={guardian}
            onChange={(e) => setGuardian(e.target.value)}
            placeholder="Mrs. Reddy"
            autoComplete="off"
          />
        </Field>

        <Field label="Batch" span>
          <select className="select" value={batch} onChange={(e) => pickBatch(e.target.value)}>
            {data.batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.slot ? ` — ${b.slot}` : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Monthly fee (₹)">
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            placeholder="2000"
          />
        </Field>

        <Field
          label="Fee due on"
          hint={
            !dueDay.trim()
              ? 'Day of the month the fee is due. Reminders are dated from this.'
              : clampDay(dueDay) > 28
                ? `The ${ordinal(clampDay(dueDay))} of every month — the last day in shorter months.`
                : `The ${ordinal(clampDay(dueDay))} of every month. Reminders are dated from this.`
          }
        >
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
          />
        </Field>

        <Field label="Joined on" span>
          <input
            className="input"
            type="date"
            value={joinedOn}
            onChange={(e) => setJoinedOn(e.target.value)}
          />
        </Field>

        <Field label="Status" span>
          <div className="seg" style={{ width: '100%' }}>
            <button
              type="button"
              className={`seg__item grow${active ? ' seg__item--on' : ''}`}
              onClick={() => setActive(true)}
            >
              Active
            </button>
            <button
              type="button"
              className={`seg__item grow${!active ? ' seg__item--on' : ''}`}
              onClick={() => setActive(false)}
            >
              Inactive
            </button>
          </div>
        </Field>
      </div>
    </Sheet>
  )
}
