import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { navigate } from '../lib/router'
import { ACADEMY } from '../lib/academy'
import {
  dateLabel,
  dateLabelFull,
  inr,
  initials,
  monthLabel,
  ordinal,
} from '../lib/format'
import { monthsPhrase, studentProfile } from '../lib/selectors'
import { Confirm, Empty, Stat } from '../components/ui'
import { seriesColor } from '../components/charts'
import { StudentSheet } from '../components/StudentSheet'
import {
  IconCheck,
  IconChevronLeft,
  IconClock,
  IconPencil,
  IconTrash,
  IconUsers,
  IconWhatsApp,
  IconX,
} from '../components/icons'

export default function StudentDetail({ id }: { id: string }) {
  const { data, update, toast } = useStore()
  const p = useMemo(() => studentProfile(data, id), [data, id])
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!p) {
    return (
      <main className="page">
        <Empty
          icon={<IconUsers size={22} />}
          title="Student not found"
          action={
            <button className="btn btn--sm" onClick={() => navigate('/batches')}>
              Back to batches
            </button>
          }
        />
      </main>
    )
  }

  const { student: s, batch } = p
  const color = batch ? seriesColor(batch.colorSlot) : 'var(--series-1)'
  const months = Math.floor(p.tenureDays / 30.44)

  return (
    <main className="page">
      <button
        className="btn btn--ghost btn--sm"
        style={{ marginLeft: -8, marginBottom: 8 }}
        onClick={() => navigate(batch ? `/batches/${batch.id}` : '/batches')}
      >
        <IconChevronLeft size={16} /> {batch?.name ?? 'Batches'}
      </button>

      {/* ---------- header ---------- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row gap-12" style={{ alignItems: 'flex-start' }}>
          <div
            className="avatar"
            style={{
              width: 46,
              height: 46,
              borderRadius: 15,
              fontSize: '0.92rem',
              marginTop: 2,
              background: `${color}22`,
              color,
              border: `1px solid ${color}44`,
            }}
          >
            {initials(s.name)}
          </div>
          <div className="grow" style={{ minWidth: 0 }}>
            <h1 className="t-h1 truncate">{s.name}</h1>
            <div className="row gap-8" style={{ marginTop: 5, flexWrap: 'wrap' }}>
              <span className="badge badge--mute">{batch?.name ?? 'No batch'}</span>
              {s.active ? (
                <span className="badge badge--good">
                  <span className="badge__dot" /> Training
                </span>
              ) : (
                <span className="badge badge--crit">Discontinued</span>
              )}
              {p.returned && <span className="badge badge--info">Rejoined</span>}
            </div>
            {s.guardian && (
              <div className="t-mut" style={{ marginTop: 5 }}>
                {s.guardian}
              </div>
            )}
          </div>
        </div>

        <div className="row gap-8" style={{ marginTop: 14 }}>
          {s.phone && (
            <a
              className="btn btn--sm grow"
              href={`https://wa.me/${ACADEMY.countryCode}${s.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconWhatsApp size={15} /> Message
            </a>
          )}
          <button className="btn btn--sm grow" onClick={() => setEditing(true)}>
            <IconPencil size={15} /> Edit
          </button>
          <button className="btn btn--sm btn--danger" onClick={() => setConfirmDelete(true)}>
            <IconTrash size={15} />
          </button>
        </div>
      </div>

      {/* ---------- the numbers they asked for ---------- */}
      <div className="grid grid-2" style={{ marginBottom: 14 }}>
        <Stat
          label="With the academy"
          value={months >= 1 ? `${months} mo` : `${p.tenureDays} d`}
          foot={`${p.tenureDays} days on the roll`}
          accent={color}
        />
        <Stat
          label="Total paid"
          value={inr(p.totalPaid, { compact: true })}
          foot={`${p.payments.length} payment${p.payments.length === 1 ? '' : 's'}`}
          accent="var(--money-in)"
        />
        <Stat
          label="Reminders sent"
          value={String(p.remindersSent)}
          foot={`across ${p.remindersCount} reminder${p.remindersCount === 1 ? '' : 's'}`}
          accent="var(--series-1)"
        />
        <Stat
          label="Currently owes"
          value={p.owed > 0 ? inr(p.owed) : '—'}
          foot={p.unpaidMonths.length ? monthsPhrase(p.unpaidMonths) : 'up to date'}
          accent={p.owed > 0 ? 'var(--critical)' : 'var(--good)'}
        />
      </div>

      {/* ---------- membership periods ---------- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card__head">
          <div>
            <div className="card__title">Time at the academy</div>
            <div className="card__sub">
              {p.returned
                ? `${p.spells.length} separate spells — the break in between isn't counted`
                : 'One continuous spell'}
            </div>
          </div>
        </div>
        <div className="col gap-10">
          {p.spells.map((sp, i) => (
            <div className="row gap-10" key={i} style={{ alignItems: 'flex-start' }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 99,
                  marginTop: 6,
                  flexShrink: 0,
                  background: sp.to ? 'var(--ink-muted)' : 'var(--good)',
                }}
              />
              <div className="grow">
                <div style={{ fontSize: '0.87rem', fontWeight: 560 }}>
                  {dateLabelFull(sp.from)} — {sp.to ? dateLabelFull(sp.to) : 'now'}
                </div>
                <div className="t-mut">
                  {sp.to ? 'Left' : 'Currently training'}
                  {i > 0 ? ' · rejoined' : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
        <hr className="divider" style={{ margin: '14px 0 12px' }} />
        <div className="t-mut">
          Fee of {inr(s.monthlyFee)} due on the {ordinal(s.feeDueDay)} of each month.
        </div>
      </div>

      {/* ---------- month by month ---------- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card__head">
          <div>
            <div className="card__title">Month by month</div>
            <div className="card__sub">
              {p.ledgerTruncated ? 'Last 12 months' : 'Since they joined'} · dues are chased
              for 6 months
            </div>
          </div>
        </div>
        <div className="col gap-6">
          {p.ledger.map((row) => (
            <div
              key={row.month}
              className="row-between"
              style={{
                padding: '9px 11px',
                borderRadius: 'var(--r-sm)',
                background: row.enrolled ? 'var(--surface-2)' : 'transparent',
                border: row.enrolled ? '1px solid var(--line)' : '1px dashed var(--line)',
                opacity: row.enrolled ? 1 : 0.55,
              }}
            >
              <span style={{ fontSize: '0.855rem', fontWeight: 540 }}>
                {monthLabel(row.month)}
              </span>
              {!row.enrolled ? (
                <span className="badge badge--mute">Away</span>
              ) : row.paid ? (
                <span className="badge badge--good">
                  <IconCheck size={11} /> {inr(row.amount)}
                </span>
              ) : row.chased ? (
                <span className="badge badge--crit">
                  <IconX size={11} /> Unpaid
                </span>
              ) : (
                /* Outside the 6-month window: no payment on record, but the
                   academy isn't chasing it — don't dress it up as a debt. */
                <span className="badge badge--mute">No record</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ---------- payments ---------- */}
      <div className="card">
        <div className="card__head">
          <div>
            <div className="card__title">Payments</div>
            <div className="card__sub">
              {p.payments.length} recorded · {inr(p.totalPaid)} in total
            </div>
          </div>
        </div>
        {p.payments.length === 0 ? (
          <p className="t-mut" style={{ padding: '10px 0' }}>
            No payments recorded yet.
          </p>
        ) : (
          <div className="col gap-8">
            {p.payments.slice(0, 24).map((t) => (
              <div className="row-between" key={t.id}>
                <span className="row gap-6 t-sub">
                  <IconClock size={12} className="t-mut" />
                  {dateLabel(t.date)}
                  {t.forMonth && (
                    <span className="t-mut">· for {monthLabel(t.forMonth)}</span>
                  )}
                </span>
                <span className="num" style={{ fontWeight: 620, color: '#5fd3a5' }}>
                  {inr(t.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <StudentSheet value={editing ? s : null} onClose={() => setEditing(false)} />

      <Confirm
        open={confirmDelete}
        title={`Remove ${s.name}?`}
        body="Their reminders are removed too. Past payments stay in Finance."
        confirmLabel="Remove"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          update((d) => {
            d.students = d.students.filter((x) => x.id !== s.id)
            d.reminders = d.reminders.filter((r) => r.studentId !== s.id)
          })
          toast('Student removed.')
          navigate(batch ? `/batches/${batch.id}` : '/batches')
        }}
      />
    </main>
  )
}
