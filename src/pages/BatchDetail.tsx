import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { navigate } from '../lib/router'
import type { Student } from '../lib/types'
import { currentMonthKey, inr, initials, ordinal } from '../lib/format'
import { activeStudentsOf, paidForMonth, unpaidMonthsFor } from '../lib/selectors'
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
  const { data, toast, recordFee, removeBatch, saveStudent } = useStore()
  const batch = data.batches.find((b) => b.id === id)

  const [editBatch, setEditBatch] = useState(false)
  const [delBatch, setDelBatch] = useState(false)
  const [editStudent, setEditStudent] = useState<Student | 'new' | null>(null)
  const [delStudent, setDelStudent] = useState<Student | null>(null)

  /* Who is training, not who ever trained. A batch someone left two
     years ago is not their batch any more, and a roster that keeps them
     only ever grows — the owner scrolls past leavers to find the people
     actually on court. They are still one search away on Batches. */
  const roster = useMemo(() => (batch ? activeStudentsOf(data, batch.id) : []), [data, batch])
  const thisMonth = currentMonthKey()

  const paidThisMonth = useMemo(() => {
    const set = new Set<string>()
    for (const t of data.transactions) {
      if (t.source === 'student_fee' && t.studentId && paidForMonth(t) === thisMonth) {
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

  const monthlyValue = roster.reduce((a, s) => a + s.monthlyFee, 0)
  const collected = roster
    .filter((s) => paidThisMonth.has(s.id))
    .reduce((a, s) => a + s.monthlyFee, 0)
  const color = seriesColor(batch.colorSlot)

  /* Settles this month only — the roster is a this-month view. Anything
     still owed from earlier months stays visible under Reminders, and the
     reminder list re-syncs itself from this payment. */
  const recordPayment = async (s: Student) => {
    /* record_fee_payment, not an insert. It writes the payment, the
       period it covers, rolls the renewal forward and closes the
       reminder — in one transaction. An insert here would record the
       money and none of the consequences. */
    if (!s.enrollmentId) {
      toast('That student is not enrolled in the database yet.', 'bad')
      return
    }
    const res = await recordFee({ enrollmentId: s.enrollmentId, amount: s.monthlyFee })
    if (!res.ok) {
      toast(res.message, 'bad')
      return
    }
    const stillOwed = unpaidMonthsFor(data, s).filter((m) => m !== thisMonth).length
    toast(
      stillOwed > 0
        ? `${s.name}'s fee recorded. Still ${stillOwed} earlier month${stillOwed === 1 ? '' : 's'} owing.`
        : `${s.name}'s fee recorded.`,
    )
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
          value={String(roster.length)}
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
                {/* the name is the way into their full history */}
                <button
                  className="listrow__main"
                  onClick={() => navigate(`/student/${s.id}`)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div className="listrow__title">{s.name}</div>
                  <div className="listrow__meta">
                    {s.feePending ? 'Fee pending' : inr(s.monthlyFee)} · due{' '}
                    {ordinal(s.feeDueDay)}
                  </div>
                </button>
                <div className="listrow__end">
                  {paid ? (
                    <span className="badge badge--good">
                      <IconCheck size={11} /> Paid
                    </span>
                  ) : (
                    <button
                      className="btn btn--sm"
                      style={{ minHeight: 32, padding: '5px 10px', fontSize: '0.75rem' }}
                      onClick={() => recordPayment(s)}
                    >
                      Mark paid
                    </button>
                  )}
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
          /* Deactivated, not deleted. Enrolments and past payments point at
             this batch, and removing it would strip the meaning from
             their history. Students stay where they are. */
          void removeBatch(batch.id).then((r) => {
            if (!r.ok) {
              toast(r.message, 'bad')
              return
            }
            toast('Batch closed.')
            navigate('/batches')
          })
        }}
      />

      <Confirm
        open={delStudent !== null}
        title={`Remove ${delStudent?.name ?? ''}?`}
        body="They come off this roster and out of the reminder list. Past payments stay in Finance, and you can bring them back later from the search on Batches."
        confirmLabel="Remove"
        onCancel={() => setDelStudent(null)}
        onConfirm={() => {
          void saveStudent({
            memberId: delStudent!.memberId,
            enrollmentId: delStudent!.enrollmentId,
            name: delStudent!.name,
            phone: delStudent!.phone,
            guardian: delStudent!.guardian,
            batchId: delStudent!.batchId,
            joinedOn: delStudent!.joinedOn,
            feeDueDay: delStudent!.feeDueDay,
            active: false,
          }).then((r) => {
            if (!r.ok) toast(r.message, 'bad')
            else toast('Student removed.')
            setDelStudent(null)
          })
        }}
      />
    </main>
  )
}
