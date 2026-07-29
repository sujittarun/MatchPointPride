import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { navigate } from '../lib/router'
import type { Student } from '../lib/types'
import { currentMonthKey, inr, initials, todayISO, uid } from '../lib/format'
import { studentsOf } from '../lib/selectors'
import { ACADEMY } from '../lib/academy'
import { Confirm, Empty, Stat } from '../components/ui'
import { seriesColor } from '../components/charts'
import { BatchSheet } from './Batches'
import { StudentSheet } from '../components/StudentSheet'
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
                        href={`https://wa.me/${ACADEMY.countryCode}${s.phone.replace(/\D/g, '')}`}
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
