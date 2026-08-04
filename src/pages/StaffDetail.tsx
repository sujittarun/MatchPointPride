import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { navigate } from '../lib/router'
import type { AttendanceStatus } from '../lib/types'
import {
  currentMonthKey,
  dateLabelFull,
  fmtDays,
  initials,
  inr,
  monthLabel,
  monthShort,
  shiftMonth,
} from '../lib/format'
import {
  attendanceMap,
  staffLifetime,
  staffMonthStats,
  staffTrend,
  workingDays,
} from '../lib/selectors'
import { Confirm, Empty, Sheet, Stat } from '../components/ui'
import {
  ATT_COLOR,
  BarChart,
  MonthHeatmap,
  Ring,
  ShareBar,
} from '../components/charts'
import { StaffSheet } from './Staff'
import {
  IconChevronLeft,
  IconChevronRight,
  IconPencil,
  IconStaff,
  IconTrash,
} from '../components/icons'

const STATUSES: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
]

export default function StaffDetail({ id }: { id: string }) {
  const { data, toast, markStaffDay, removeStaff } = useStore()
  const staff = data.staff.find((s) => s.id === id)

  const [month, setMonth] = useState(currentMonthKey())
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dayEdit, setDayEdit] = useState<string | null>(null)

  const map = useMemo(() => attendanceMap(data.attendance), [data.attendance])
  const stats = useMemo(
    () => (staff ? staffMonthStats(data, staff.id, month) : null),
    [data, staff, month],
  )
  const trend = useMemo(() => (staff ? staffTrend(data, staff.id, 6) : []), [data, staff])
  const lifetime = useMemo(() => (staff ? staffLifetime(data, staff.id) : null), [data, staff])

  if (!staff || !stats || !lifetime) {
    return (
      <main className="page">
        <Empty
          icon={<IconStaff size={22} />}
          title="Staff member not found"
          action={
            <button className="btn btn--sm" onClick={() => navigate('/staff')}>
              Back to staff
            </button>
          }
        />
      </main>
    )
  }

  const days = workingDays(month, month === currentMonthKey())
  const setStatus = (date: string, status: AttendanceStatus | null) => {
    /* "No record" is no longer something a tap can assert: the database
       stores present or absent, and clearing a day would mean deleting
       a fact rather than correcting it. Tapping now sets a value. */
    if (status === null) {
      setDayEdit(null)
      return
    }
    /* This screen marks a whole day, not a shift — the AM/PM split lives
       on the roster where the day is actually being worked through. So
       present means both halves and absent means neither, which is
       exactly what `present` alone used to mean. */
    void markStaffDay({
      coachId: staff.id,
      date,
      am: status === 'present',
      pm: status === 'present',
    }).then((r) => {
      if (!r.ok) toast(r.message, 'bad')
    })
    setDayEdit(null)
  }

  return (
    <main className="page">
      <button
        className="btn btn--ghost btn--sm"
        style={{ marginLeft: -8, marginBottom: 8 }}
        onClick={() => navigate('/staff')}
      >
        <IconChevronLeft size={16} /> Staff
      </button>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row gap-12">
          <div
            className="avatar"
            style={{
              width: 46,
              height: 46,
              borderRadius: 15,
              background: 'rgba(200,255,77,0.12)',
              border: '1px solid rgba(200,255,77,0.25)',
              color: 'var(--brand)',
              fontSize: '0.92rem',
            }}
          >
            {initials(staff.name)}
          </div>
          <div className="grow" style={{ minWidth: 0 }}>
            <h1 className="t-h1 truncate">{staff.name}</h1>
            <div className="t-mut">{staff.role}</div>
            <div className="t-mut" style={{ marginTop: 3 }}>
              Joined {dateLabelFull(staff.joinedOn)}
              {staff.monthlySalary ? ` · ${inr(staff.monthlySalary)}/mo` : ''}
            </div>
          </div>
        </div>

        <div className="row gap-8" style={{ marginTop: 14 }}>
          <button className="btn btn--sm grow" onClick={() => setEditing(true)}>
            <IconPencil size={15} /> Edit
          </button>
          <button className="btn btn--sm btn--danger grow" onClick={() => setConfirmDelete(true)}>
            <IconTrash size={15} /> Delete
          </button>
        </div>
      </div>

      {/* ---------- month ---------- */}
      <div className="row-between" style={{ marginBottom: 12 }}>
        <button
          className="btn btn--ghost btn--icon btn--sm"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          aria-label="Previous month"
        >
          <IconChevronLeft size={17} />
        </button>
        <span style={{ fontWeight: 610, fontSize: '0.92rem' }}>{monthLabel(month)}</span>
        <button
          className="btn btn--ghost btn--icon btn--sm"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          disabled={month >= currentMonthKey()}
          aria-label="Next month"
        >
          <IconChevronRight size={17} />
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row gap-16" style={{ alignItems: 'center' }}>
          <Ring value={stats.consistency} size={96} stroke={10} label="Consistency" />
          <div className="grow col gap-8">
            {/* Worked, not days-present: this is the screen the owner
                opens before paying someone, and "2.5 of 3" is the
                sentence he is looking for. */}
            <div className="row-between">
              <span className="t-sub">Worked</span>
              <span className="num" style={{ fontWeight: 640 }}>
                {fmtDays(stats.worked)} / {stats.marked}
              </span>
            </div>
            <div className="row-between">
              <span className="t-sub">Absent</span>
              <span className="num" style={{ fontWeight: 640, color: '#ff8f8f' }}>
                {stats.absent}
              </span>
            </div>
            <div className="row-between">
              <span className="t-sub">Marked</span>
              <span className="num" style={{ fontWeight: 640 }}>
                {stats.marked} / {stats.workingDays}
              </span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <ShareBar
            parts={[
              { label: 'Worked', value: stats.worked, color: ATT_COLOR.present },
              { label: 'Not worked', value: Math.max(0, stats.marked - stats.worked), color: ATT_COLOR.absent },
            ]}
          />
          <div className="t-mut" style={{ marginTop: 7 }}>
            {stats.marked} of {stats.workingDays} working days marked. Consistency is measured
            against days actually marked; Sundays are excluded.
          </div>
        </div>
      </div>

      {/* ---------- calendar ---------- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card__head">
          <div>
            <div className="card__title">{monthLabel(month)} calendar</div>
            <div className="card__sub">Tap any day to change it</div>
          </div>
        </div>
        <MonthHeatmap
          days={days}
          statusOf={(d) => map.get(`${staff.id}__${d}`)}
          onTap={(d) => setDayEdit(d)}
        />
      </div>

      {/* ---------- history ---------- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card__head">
          <div>
            <div className="card__title">Consistency over time</div>
            <div className="card__sub">Last 6 months</div>
          </div>
        </div>
        <BarChart
          data={trend.map((t) => ({ label: monthShort(t.key), value: Math.round(t.value) }))}
          series={[{ key: 'value', label: 'Consistency %', color: 'var(--series-3)' }]}
          format={(n) => `${n}%`}
          valueLabels
        />
        <div className="t-mut" style={{ marginTop: 10 }}>
          Share of marked working days attended, month by month.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card__head">
          <div>
            <div className="card__title">Days worked</div>
            <div className="card__sub">Last 6 months · halves counted</div>
          </div>
        </div>
        {/* This was "Days absent", which plotted the same fact as the
            consistency chart above it — consistency is 100 × (1 −
            absent/marked), so with `marked` near-constant month to month
            one chart was an exact reflection of the other. A count and a
            rate are genuinely different answers; a count and its own
            complement are not. */}
        <BarChart
          data={trend.map((t) => ({
            label: monthShort(t.key),
            worked: t.worked,
            absent: t.absent,
          }))}
          series={[
            { key: 'worked', label: 'Worked', color: ATT_COLOR.present },
            { key: 'absent', label: 'Absent', color: ATT_COLOR.absent },
          ]}
          format={(n) => `${fmtDays(n)} day${n === 1 ? '' : 's'}`}
          empty="Nothing marked in these six months"
        />
      </div>

      <div className="grid grid-2">
        <Stat
          label="Lifetime consistency"
          value={`${lifetime.consistency.toFixed(0)}%`}
          foot={`${lifetime.marked} days marked`}
          accent="var(--good)"
        />
        <Stat
          label="Lifetime absences"
          value={String(lifetime.absent)}
          foot={`${fmtDays(lifetime.worked)} days worked`}
          accent="var(--critical)"
        />
      </div>

      <StaffSheet value={editing ? staff : null} onClose={() => setEditing(false)} />

      <Sheet
        open={dayEdit !== null}
        onClose={() => setDayEdit(null)}
        title={dayEdit ? dateLabelFull(dayEdit) : ''}
        subtitle={staff.name}
      >
        <div className="col gap-8">
          {STATUSES.map((st) => {
            const on = dayEdit ? map.get(`${staff.id}__${dayEdit}`) === st.value : false
            return (
              <button
                key={st.value}
                className="listrow tap"
                onClick={() => dayEdit && setStatus(dayEdit, st.value)}
                style={{ minHeight: 52, cursor: 'pointer' }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 4,
                    background: ATT_COLOR[st.value],
                    flexShrink: 0,
                  }}
                />
                <span className="grow" style={{ fontWeight: 560 }}>
                  {st.label}
                </span>
                {on && <span className="badge badge--brand">Current</span>}
              </button>
            )
          })}
          <button
            className="btn btn--ghost"
            style={{ marginTop: 4 }}
            onClick={() => dayEdit && setStatus(dayEdit, null)}
          >
            Clear this day
          </button>
        </div>
      </Sheet>

      <Confirm
        open={confirmDelete}
        title={`Delete ${staff.name}?`}
        body="They stop appearing on the attendance sheet. Their past days stay on record."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          /* Deactivated rather than deleted, and the attendance history
             stays: it is a record of days worked, and those days
             happened whether or not the person is still on the staff. */
          void removeStaff(staff.id).then((r) => {
            if (!r.ok) {
              toast(r.message, 'bad')
              return
            }
            toast('Staff member removed.')
            navigate('/staff')
          })
        }}
      />
    </main>
  )
}
