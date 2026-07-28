import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { navigate } from '../lib/router'
import type { AttendanceStatus } from '../lib/types'
import {
  currentMonthKey,
  dateLabelFull,
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
  { value: 'half', label: 'Half day' },
  { value: 'leave', label: 'Leave' },
  { value: 'absent', label: 'Absent' },
]

export default function StaffDetail({ id }: { id: string }) {
  const { data, update, toast } = useStore()
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
    const rid = `${staff.id}__${date}`
    update((d) => {
      if (status === null) {
        d.attendance = d.attendance.filter((r) => r.id !== rid)
        return
      }
      const existing = d.attendance.find((r) => r.id === rid)
      if (existing) existing.status = status
      else d.attendance.push({ id: rid, staffId: staff.id, date, status })
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
            <div className="row-between">
              <span className="t-sub">Present</span>
              <span className="num" style={{ fontWeight: 640 }}>
                {stats.present}
              </span>
            </div>
            <div className="row-between">
              <span className="t-sub">Half days</span>
              <span className="num" style={{ fontWeight: 640 }}>
                {stats.half}
              </span>
            </div>
            <div className="row-between">
              <span className="t-sub">Leaves</span>
              <span className="num" style={{ fontWeight: 640, color: '#8bbcf3' }}>
                {stats.leave}
              </span>
            </div>
            <div className="row-between">
              <span className="t-sub">Absent</span>
              <span className="num" style={{ fontWeight: 640, color: '#ff8f8f' }}>
                {stats.absent}
              </span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <ShareBar
            parts={[
              { label: 'Present', value: stats.present, color: ATT_COLOR.present },
              { label: 'Half', value: stats.half, color: ATT_COLOR.half },
              { label: 'Leave', value: stats.leave, color: ATT_COLOR.leave },
              { label: 'Absent', value: stats.absent, color: ATT_COLOR.absent },
            ]}
          />
          <div className="t-mut" style={{ marginTop: 7 }}>
            {stats.marked} of {stats.workingDays} working days marked. Half days count as half
            attendance; Sundays are excluded.
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
            <div className="card__title">Leaves &amp; absences</div>
            <div className="card__sub">Last 6 months</div>
          </div>
        </div>
        <BarChart
          data={trend.map((t) => ({ label: monthShort(t.key), leave: t.leave, absent: t.absent }))}
          series={[
            { key: 'leave', label: 'Leave', color: ATT_COLOR.leave },
            { key: 'absent', label: 'Absent', color: ATT_COLOR.absent },
          ]}
          format={(n) => `${n} day${n === 1 ? '' : 's'}`}
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
          label="Lifetime leaves"
          value={String(lifetime.leave)}
          foot={`${lifetime.absent} absences`}
          accent="var(--series-1)"
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
        body="Their attendance history is removed too. This cannot be undone."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          update((d) => {
            d.staff = d.staff.filter((s) => s.id !== staff.id)
            d.attendance = d.attendance.filter((r) => r.staffId !== staff.id)
          })
          toast('Staff member deleted.')
          navigate('/staff')
        }}
      />
    </main>
  )
}
