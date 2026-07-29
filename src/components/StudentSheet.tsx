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
  uid,
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
  const { data, update, toast } = useStore()
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

  const save = () => {
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
    let cancelled = 0
    update((d) => {
      // A student who has stopped coming shouldn't keep generating an
      // overdue badge, so close out anything still open for them.
      if (!active && s) {
        for (const r of d.reminders) {
          if (r.studentId === s.id && (r.status === 'pending' || r.status === 'sent')) {
            r.status = 'cancelled'
            r.history.push({
              at: new Date().toISOString(),
              action: 'cancelled',
              note: 'Student marked inactive',
            })
            cancelled++
          }
        }
      }
      if (isNew) {
        d.students.push({
          id: uid('stu'),
          name: trimmed,
          batchId: batch,
          phone: phone.replace(/\s/g, ''),
          guardian: guardian.trim() || undefined,
          joinedOn,
          monthlyFee: feeVal,
          feeDueDay: day,
          active,
        })
      } else if (s) {
        const t = d.students.find((x) => x.id === s.id)
        if (t) {
          t.name = trimmed
          t.batchId = batch
          t.phone = phone.replace(/\s/g, '')
          t.guardian = guardian.trim() || undefined
          t.joinedOn = joinedOn
          t.monthlyFee = feeVal
          t.feeDueDay = day
          t.active = active
        }
      }
    })
    toast(
      isNew
        ? 'Student added.'
        : cancelled > 0
          ? `Student marked inactive. ${cancelled} open reminder${cancelled === 1 ? '' : 's'} closed.`
          : 'Student updated.',
    )
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
          <button className="btn btn--primary" onClick={save}>
            {isNew ? 'Add student' : 'Save'}
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
            dueDay.trim()
              ? `The ${ordinal(clampDay(dueDay))} of every month. Reminders are dated from this.`
              : 'Day of the month the fee is due. Reminders are dated from this.'
          }
        >
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            max={28}
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
