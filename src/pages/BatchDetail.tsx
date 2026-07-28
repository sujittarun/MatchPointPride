import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { navigate } from '../lib/router'
import type { Student } from '../lib/types'
import {
  currentMonthKey,
  dateLabelFull,
  inr,
  initials,
  todayISO,
  uid,
} from '../lib/format'
import { studentsOf } from '../lib/selectors'
import { Confirm, Empty, Field, Sheet, Stat } from '../components/ui'
import { seriesColor } from '../components/charts'
import { BatchSheet } from './Batches'
import {
  IconCheck,
  IconChevronLeft,
  IconClock,
  IconPencil,
  IconPlus,
  IconTrash,
  IconUsers,
  IconWhatsApp,
} from '../components/icons'

export default function BatchDetail({ id }: { id: string }) {
  const { data, update, toast } = useStore()
  const batch = data.batches.find((b) => b.id === id)

  const [editBatch, setEditBatch] = useState(false)
  const [delBatch, setDelBatch] = useState(false)
  const [editStudent, setEditStudent] = useState<Student | 'new' | null>(null)
  const [delStudent, setDelStudent] = useState<Student | null>(null)

  const roster = useMemo(() => (batch ? studentsOf(data, batch.id) : []), [data, batch])
  const thisMonth = currentMonthKey()

  const paidThisMonth = useMemo(() => {
    const set = new Set<string>()
    for (const t of data.transactions) {
      if (t.source === 'student_fee' && t.date.startsWith(thisMonth) && t.studentId) {
        set.add(t.studentId)
      }
    }
    return set
  }, [data.transactions, thisMonth])

  if (!batch) {
    return (
      <main className="page">
        <Empty
          icon={<IconUsers size={22} />}
          title="Batch not found"
          action={
            <button className="btn btn--sm" onClick={() => navigate('/batches')}>
              Back to batches
            </button>
          }
        />
      </main>
    )
  }

  const active = roster.filter((s) => s.active)
  const monthlyValue = active.reduce((a, s) => a + s.monthlyFee, 0)
  const collected = active
    .filter((s) => paidThisMonth.has(s.id))
    .reduce((a, s) => a + s.monthlyFee, 0)
  const color = seriesColor(batch.colorSlot)

  const recordPayment = (s: Student) => {
    update((d) => {
      d.transactions.unshift({
        id: uid('txn'),
        type: 'revenue',
        date: todayISO(),
        amount: s.monthlyFee,
        category: 'Student Fee',
        source: 'student_fee',
        studentId: s.id,
        batchId: s.batchId,
        note: batch.name,
        createdAt: new Date().toISOString(),
      })
      // Close any open fee reminder for this student.
      for (const r of d.reminders) {
        if (r.studentId === s.id && r.kind === 'fee' && (r.status === 'pending' || r.status === 'sent')) {
          r.status = 'paid'
          r.history.push({ at: new Date().toISOString(), action: 'paid', note: 'Marked from batch roster' })
        }
      }
    })
    toast(`${s.name}'s fee recorded.`)
  }

  return (
    <main className="page">
      <button
        className="btn btn--ghost btn--sm"
        style={{ marginLeft: -8, marginBottom: 8 }}
        onClick={() => navigate('/batches')}
      >
        <IconChevronLeft size={16} /> Batches
      </button>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
          <span
            style={{
              width: 4,
              alignSelf: 'stretch',
              minHeight: 40,
              borderRadius: 99,
              background: color,
            }}
          />
          <div className="grow">
            <h1 className="t-h1">{batch.name}</h1>
            <div className="row gap-8" style={{ marginTop: 6, flexWrap: 'wrap' }}>
              <span className="badge badge--mute">
                {batch.kind === 'kids'
                  ? 'Kids'
                  : batch.kind === 'professional'
                    ? 'Professional'
                    : 'Membership'}
              </span>
              {batch.slot && (
                <span className="t-mut row gap-4">
                  <IconClock size={12} /> {batch.slot}
                </span>
              )}
            </div>
            {batch.days && batch.days.length > 0 && (
              <div className="t-mut" style={{ marginTop: 6 }}>
                {batch.days.join(' · ')}
              </div>
            )}
            {batch.note && (
              <p className="t-sub" style={{ marginTop: 9, lineHeight: 1.5 }}>
                {batch.note}
              </p>
            )}
          </div>
        </div>

        <div className="row gap-8" style={{ marginTop: 14 }}>
          <button className="btn btn--sm grow" onClick={() => setEditBatch(true)}>
            <IconPencil size={15} /> Edit
          </button>
          <button className="btn btn--sm btn--danger grow" onClick={() => setDelBatch(true)}>
            <IconTrash size={15} /> Delete
          </button>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        <Stat
          label="Active"
          value={String(active.length)}
          foot={batch.capacity ? `of ${batch.capacity} seats` : 'students'}
          accent={color}
        />
        <Stat
          label="Monthly value"
          value={inr(monthlyValue, { compact: true })}
          foot="if all pay"
          accent="var(--money-in)"
        />
        <Stat
          label="Collected"
          value={inr(collected, { compact: true })}
          foot="this month"
          accent="var(--good)"
        />
        <Stat
          label="Default fee"
          value={inr(batch.fee, { compact: true })}
          foot="per month"
          accent="var(--series-6)"
        />
      </div>

      <div className="section__head">
        <h2 className="t-h2">Students ({roster.length})</h2>
        <button className="btn btn--sm" onClick={() => setEditStudent('new')}>
          <IconPlus size={15} /> Add
        </button>
      </div>

      {roster.length === 0 ? (
        <Empty
          icon={<IconUsers size={22} />}
          title="No students yet"
          text="Add the first student to this batch."
          action={
            <button className="btn btn--primary btn--sm" onClick={() => setEditStudent('new')}>
              <IconPlus size={15} /> Add student
            </button>
          }
        />
      ) : (
        <div className="list">
          {roster.map((s) => {
            const paid = paidThisMonth.has(s.id)
            return (
              <div className="listrow" key={s.id}>
                <div
                  className="avatar"
                  style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
                >
                  {initials(s.name)}
                </div>
                <div className="listrow__main">
                  <div className="listrow__title">
                    {s.name}
                    {!s.active && <span className="badge badge--mute" style={{ marginLeft: 7 }}>Inactive</span>}
                  </div>
                  <div className="listrow__meta">
                    {inr(s.monthlyFee)} · due {s.feeDueDay}
                    {s.feeDueDay === 1 ? 'st' : s.feeDueDay === 2 ? 'nd' : s.feeDueDay === 3 ? 'rd' : 'th'}
                  </div>
                </div>
                <div className="listrow__end">
                  {paid ? (
                    <span className="badge badge--good">
                      <IconCheck size={11} /> Paid
                    </span>
                  ) : s.active ? (
                    <button
                      className="btn btn--sm"
                      style={{ minHeight: 32, padding: '5px 10px', fontSize: '0.75rem' }}
                      onClick={() => recordPayment(s)}
                    >
                      Mark paid
                    </button>
                  ) : null}
                  <div className="row gap-2">
                    {s.phone && (
                      <a
                        className="btn btn--ghost btn--icon btn--sm"
                        href={`https://wa.me/${data.settings.countryCode}${s.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`WhatsApp ${s.name}`}
                        style={{ color: '#25D366' }}
                      >
                        <IconWhatsApp size={16} />
                      </a>
                    )}
                    <button
                      className="btn btn--ghost btn--icon btn--sm"
                      onClick={() => setEditStudent(s)}
                      aria-label={`Edit ${s.name}`}
                    >
                      <IconPencil size={15} />
                    </button>
                    <button
                      className="btn btn--ghost btn--icon btn--sm"
                      onClick={() => setDelStudent(s)}
                      aria-label={`Remove ${s.name}`}
                    >
                      <IconTrash size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <BatchSheet value={editBatch ? batch : null} onClose={() => setEditBatch(false)} />

      <StudentSheet
        value={editStudent}
        batchId={batch.id}
        defaultFee={batch.fee}
        onClose={() => setEditStudent(null)}
      />

      <Confirm
        open={delBatch}
        title={`Delete ${batch.name}?`}
        body={
          roster.length > 0
            ? `${roster.length} student${roster.length === 1 ? '' : 's'} in this batch will also be removed. Past transactions stay in Finance. This cannot be undone.`
            : 'This cannot be undone.'
        }
        onCancel={() => setDelBatch(false)}
        onConfirm={() => {
          update((d) => {
            const ids = new Set(d.students.filter((s) => s.batchId === batch.id).map((s) => s.id))
            d.students = d.students.filter((s) => s.batchId !== batch.id)
            d.reminders = d.reminders.filter((r) => !ids.has(r.studentId))
            d.batches = d.batches.filter((b) => b.id !== batch.id)
          })
          toast('Batch deleted.')
          navigate('/batches')
        }}
      />

      <Confirm
        open={delStudent !== null}
        title={`Remove ${delStudent?.name ?? ''}?`}
        body="Their open reminders are removed too. Past payments stay in Finance."
        confirmLabel="Remove"
        onCancel={() => setDelStudent(null)}
        onConfirm={() => {
          const sid = delStudent!.id
          update((d) => {
            d.students = d.students.filter((s) => s.id !== sid)
            d.reminders = d.reminders.filter((r) => r.studentId !== sid)
          })
          toast('Student removed.')
          setDelStudent(null)
        }}
      />
    </main>
  )
}

/* ------------------------------------------------------------------
   Add / edit student
   ------------------------------------------------------------------ */

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

  const openKey = value === null ? '' : isNew ? `new:${batchId}` : (s as Student).id
  if (openKey !== key) {
    setKey(openKey)
    setName(s?.name ?? '')
    setPhone(s?.phone ?? '')
    setGuardian(s?.guardian ?? '')
    setBatch(s?.batchId ?? batchId ?? data.batches[0]?.id ?? '')
    setFee(s ? String(s.monthlyFee) : defaultFee ? String(defaultFee) : '')
    setDueDay(s ? String(s.feeDueDay) : '1')
    setJoinedOn(s?.joinedOn ?? todayISO())
    setActive(s?.active ?? true)
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
    const day = Math.min(28, Math.max(1, Number(dueDay) || 1))
    update((d) => {
      if (isNew) {
        d.students.push({
          id: uid('stu'),
          name: trimmed,
          batchId: batch,
          phone: phone.replace(/\s/g, ''),
          guardian: guardian.trim() || undefined,
          joinedOn,
          monthlyFee: Number(fee) || 0,
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
          t.monthlyFee = Number(fee) || 0
          t.feeDueDay = day
          t.active = active
        }
      }
    })
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
          <select className="select" value={batch} onChange={(e) => setBatch(e.target.value)}>
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
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            placeholder="2000"
          />
        </Field>

        <Field label="Fee due day" hint="1–28">
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
