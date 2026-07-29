import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { navigate } from '../lib/router'
import {
  inr,
  lastMonths,
  monthLabel,
  dateLabelFull,
  monthShort,
  todayISO,
  weekday,
} from '../lib/format'
import {
  activeStudentsOf,
  dashboard,
  moneyByMonth,
  awaitingFirstPayment,
  needsACall,
} from '../lib/selectors'
import { Stat } from '../components/ui'
import { ACADEMY } from '../lib/academy'
import { StudentSheet } from '../components/StudentSheet'
import { BarChart, HBarChart, seriesColor } from '../components/charts'
import {
  IconArrowDown,
  IconArrowUp,
  IconBell,
  IconChevronRight,
  IconPlus,
  IconRupee,
  IconStaff,
} from '../components/icons'

export default function Dashboard() {
  const { data } = useStore()
  const [addStudent, setAddStudent] = useState(false)
  const d = useMemo(() => dashboard(data), [data])
  const stopped = useMemo(() => needsACall(data), [data])
  const unpaid = useMemo(() => awaitingFirstPayment(data), [data])
  const months = useMemo(() => lastMonths(6), [])
  const series = useMemo(() => moneyByMonth(data.transactions, months), [data.transactions, months])

  const batchMix = useMemo(
    () =>
      data.batches
        .map((b) => ({
          label: b.name,
          value: activeStudentsOf(data, b.id).length,
          color: seriesColor(b.colorSlot),
          meta: b.slot,
        }))
        .filter((x) => x.value > 0)
        .sort((a, b) => b.value - a.value),
    [data],
  )

  const today = todayISO()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <main className="page">
      <div className="page__head">
        <p className="t-label" style={{ marginBottom: 5 }}>
          {weekday(today)} · {monthLabel(d.thisMonth)}
        </p>
        <h1 className="t-h1">
          {greeting}, {ACADEMY.ownerName}
        </h1>
      </div>

      {/* ---------- the ladder has stopped: these need a person ----------

          Above the overdue banner on purpose. Past +15 days the platform
          stops messaging, and before this the reminder simply vanished
          from every list — so the students who owed longest were the
          ones the owner saw least. Nothing here sends anything; the only
          actions are to call, or to record what they paid. */}
      {stopped.length > 0 && (
        <div
          className="card"
          style={{
            marginBottom: 14,
            background: 'rgba(208,59,59,0.10)',
            borderColor: 'rgba(208,59,59,0.34)',
          }}
        >
          <div className="row gap-10" style={{ alignItems: 'center', marginBottom: 10 }}>
            <span className="pulse-dot" aria-hidden="true" />
            <div className="grow">
              <div className="card__title">
                {stopped.length} need{stopped.length === 1 ? 's' : ''} a call
              </div>
              <div className="card__sub">
                More than 15 days overdue — automatic reminders have stopped
              </div>
            </div>
          </div>
          <div className="list">
            {stopped.slice(0, 4).map((r) => {
              const s = data.students.find((x) => x.id === r.studentId)
              return (
                <div className="listrow" key={r.id}>
                  <button
                    className="listrow__main tap"
                    style={{ cursor: 'pointer', textAlign: 'left', background: 'none', border: 0 }}
                    onClick={() => navigate(`/student/${r.studentId}`)}
                  >
                    <div className="listrow__title">{s?.name ?? 'Student'}</div>
                    <div className="listrow__meta">
                      {r.daysSince} days overdue
                      {r.amount ? ` · ${inr(r.amount)}` : ''}
                    </div>
                  </button>
                  {s?.phone && (
                    <a className="btn btn--sm" href={`tel:${s.phone}`} aria-label={`Call ${s.name}`}>
                      Call
                    </a>
                  )}
                </div>
              )
            })}
          </div>
          {stopped.length > 4 && (
            <button
              className="btn btn--sm btn--block"
              style={{ marginTop: 10 }}
              onClick={() => navigate('/reminders')}
            >
              See all {stopped.length}
            </button>
          )}
        </div>
      )}

      {/* ---------- registered, never paid ----------

          The ladder cannot see these: it chases a date, and their date
          has not arrived. Someone joining on the 2nd with a fee day of
          the 1st is not late until September, so without this they
          train a month while the app says nothing. */}
      {unpaid.length > 0 && (
        <div
          className="card"
          style={{
            marginBottom: 14,
            background: 'rgba(250,178,25,0.09)',
            borderColor: 'rgba(250,178,25,0.30)',
          }}
        >
          <div className="row gap-10" style={{ alignItems: 'center', marginBottom: 10 }}>
            <span
              className="avatar avatar--sm"
              style={{ background: 'rgba(250,178,25,0.16)', color: '#ffd166' }}
            >
              <IconRupee size={15} />
            </span>
            <div className="grow">
              <div className="card__title">
                {unpaid.length} {unpaid.length === 1 ? 'has' : 'have'} not paid yet
              </div>
              <div className="card__sub">On the roll, nothing received since they started</div>
            </div>
          </div>
          <div className="list">
            {unpaid.slice(0, 4).map((s) => {
              const b = data.batches.find((x) => x.id === s.batchId)
              const since = s.spells?.[s.spells.length - 1]?.from ?? s.joinedOn
              return (
                <button
                  key={s.id}
                  className="listrow tap"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/student/${s.id}`)}
                >
                  <div className="listrow__main">
                    <div className="listrow__title">{s.name}</div>
                    <div className="listrow__meta">
                      {b?.name ?? 'No batch'} · joined {dateLabelFull(since)}
                    </div>
                  </div>
                  <div className="listrow__end">
                    <span className="badge badge--warn">
                      {s.feePending ? 'No fee set' : inr(s.monthlyFee)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
          {unpaid.length > 4 && (
            <button
              className="btn btn--sm btn--block"
              style={{ marginTop: 10 }}
              onClick={() => navigate('/batches')}
            >
              See all {unpaid.length}
            </button>
          )}
        </div>
      )}

      {/* ---------- needs attention ---------- */}
      {(d.overdue > 0 || d.unmarked > 0) && (
        <div className="col gap-8" style={{ marginBottom: 18 }}>
          {d.overdue > 0 && (
            <button
              className="listrow tap"
              onClick={() => navigate('/reminders')}
              style={{
                cursor: 'pointer',
                background: 'rgba(208,59,59,0.09)',
                borderColor: 'rgba(208,59,59,0.28)',
              }}
            >
              <span
                className="avatar avatar--sm"
                style={{ background: 'rgba(208,59,59,0.16)', color: '#ff8f8f' }}
              >
                <IconBell size={15} />
              </span>
              <div className="listrow__main">
                <div className="listrow__title">
                  {d.overdue} overdue reminder{d.overdue === 1 ? '' : 's'}
                </div>
                <div className="listrow__meta">
                  {inr(d.reminders.outstanding, { compact: true })} still to collect
                </div>
              </div>
              <IconChevronRight size={17} className="t-mut" />
            </button>
          )}
          {d.unmarked > 0 && (
            <button
              className="listrow tap"
              onClick={() => navigate('/staff')}
              style={{
                cursor: 'pointer',
                background: 'rgba(250,178,25,0.08)',
                borderColor: 'rgba(250,178,25,0.26)',
              }}
            >
              <span
                className="avatar avatar--sm"
                style={{ background: 'rgba(250,178,25,0.16)', color: '#ffd166' }}
              >
                <IconStaff size={15} />
              </span>
              <div className="listrow__main">
                <div className="listrow__title">
                  {d.unmarked} staff not marked today
                </div>
                <div className="listrow__meta">Tap to mark attendance</div>
              </div>
              <IconChevronRight size={17} className="t-mut" />
            </button>
          )}
        </div>
      )}

      {/* ---------- net ---------- */}
      <button
        className="card tap"
        onClick={() => navigate('/finance')}
        style={{
          width: '100%',
          textAlign: 'left',
          marginBottom: 14,
          background:
            d.net >= 0
              ? 'linear-gradient(155deg, rgba(25,158,112,0.15), rgba(25,158,112,0.03))'
              : 'linear-gradient(155deg, rgba(230,103,103,0.15), rgba(230,103,103,0.03))',
          borderColor: d.net >= 0 ? 'rgba(25,158,112,0.28)' : 'rgba(230,103,103,0.28)',
        }}
      >
        <div className="row-between">
          <span className="t-label">Net this month</span>
          <IconChevronRight size={17} className="t-mut" />
        </div>
        <div
          className="num"
          style={{
            fontSize: '2.1rem',
            fontWeight: 690,
            letterSpacing: '-0.045em',
            marginTop: 6,
            color: d.net >= 0 ? '#5fd3a5' : '#ff8f8f',
          }}
        >
          {d.net < 0 ? '−' : ''}
          {inr(Math.abs(d.net))}
        </div>
        <div className="row gap-14" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          <span className="row gap-4 t-sub">
            <IconArrowUp size={13} style={{ color: 'var(--money-in)' }} />
            In {inr(d.revenue, { compact: true })}
          </span>
          <span className="row gap-4 t-sub">
            <IconArrowDown size={13} style={{ color: 'var(--money-out)' }} />
            Out {inr(d.expense, { compact: true })}
          </span>
        </div>
      </button>

      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        <Stat
          label="Students"
          value={String(d.activeStudents)}
          foot={`in ${data.batches.length} batches`}
          accent="var(--series-1)"
        />
        <Stat
          label="Fee collection"
          value={`${d.collection.rate.toFixed(0)}%`}
          foot={`${d.collection.paid}/${d.collection.total} paid`}
          accent="var(--series-4)"
        />
        <Stat
          label="To collect"
          value={inr(Math.max(0, d.collection.expected - d.collection.collected), { compact: true })}
          foot="this month"
          accent="var(--warning)"
        />
        <Stat
          label="Staff today"
          value={`${d.presentToday}/${d.activeStaff}`}
          foot={d.unmarked > 0 ? `${d.unmarked} not marked` : 'all marked'}
          accent="var(--good)"
        />
      </div>

      {/* ---------- money trend ---------- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card__head">
          <div>
            <div className="card__title">Six-month picture</div>
            <div className="card__sub">Revenue against expenses</div>
          </div>
        </div>
        <BarChart
          data={series.map((m) => ({
            label: monthShort(m.key),
            revenue: m.revenue,
            expense: m.expense,
          }))}
          series={[
            { key: 'revenue', label: 'Revenue', color: 'var(--money-in)' },
            { key: 'expense', label: 'Expenses', color: 'var(--money-out)' },
          ]}
          format={(n) => inr(n)}
        />
      </div>

      {/* ---------- batches ---------- */}
      {batchMix.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card__head">
            <div>
              <div className="card__title">Batch strength</div>
              <div className="card__sub">Active students per batch</div>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => navigate('/batches')}>
              All
            </button>
          </div>
          <HBarChart data={batchMix} format={(n) => `${n}`} />
        </div>
      )}

      {/* ---------- quick actions ---------- */}
      <div className="section">
        <div className="section__head">
          <h2 className="t-h2">Quick actions</h2>
        </div>
        <div className="grid grid-2">
          <button className="btn" onClick={() => navigate('/finance')}>
            <IconPlus size={16} /> Add money
          </button>
          <button className="btn" onClick={() => navigate('/reminders')}>
            <IconBell size={16} /> Reminders
          </button>
          <button className="btn" onClick={() => navigate('/staff')}>
            <IconStaff size={16} /> Attendance
          </button>
          <button className="btn" onClick={() => setAddStudent(true)}>
            <IconPlus size={16} /> Add student
          </button>
        </div>
      </div>

      <StudentSheet
        value={addStudent ? 'new' : null}
        onClose={() => setAddStudent(false)}
      />
    </main>
  )
}
