import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { navigate } from '../lib/router'
import type { AttendanceStatus, Staff as StaffT } from '../lib/types'
import {
  currentMonthKey,
  dateLabelFull,
  initials,
  isSunday,
  monthLabel,
  shiftMonth,
  todayISO,
  uid,
} from '../lib/format'
import { attendanceMap, staffMonthStats, staffTrend } from '../lib/selectors'
import { Empty, Field, Sheet, Stat } from '../components/ui'
import { ATT_COLOR, Ring, ShareBar, Sparkline } from '../components/charts'
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconStaff,
} from '../components/icons'

const STATUSES: Array<{ value: AttendanceStatus; short: string; label: string }> = [
  { value: 'present', short: 'P', label: 'Present' },
  { value: 'half', short: 'H', label: 'Half day' },
  { value: 'leave', short: 'L', label: 'Leave' },
  { value: 'absent', short: 'A', label: 'Absent' },
]

export default function Staff() {
  const { data, update, toast } = useStore()
  const [month, setMonth] = useState(currentMonthKey())
  const [markDate, setMarkDate] = useState(todayISO())
  const [editing, setEditing] = useState<StaffT | 'new' | null>(null)

  const active = useMemo(() => data.staff.filter((s) => s.active), [data.staff])
  const map = useMemo(() => attendanceMap(data.attendance), [data.attendance])

  const teamStats = useMemo(
    () => active.map((s) => ({ staff: s, stats: staffMonthStats(data, s.id, month) })),
    [active, data, month],
  )

  const teamConsistency =
    teamStats.length > 0
      ? teamStats.reduce((a, t) => a + t.stats.consistency, 0) / teamStats.length
      : 0

  const totalLeaves = teamStats.reduce((a, t) => a + t.stats.leave, 0)
  const totalAbsent = teamStats.reduce((a, t) => a + t.stats.absent, 0)
  const unmarked = isSunday(markDate)
    ? 0
    : active.filter((s) => !map.get(`${s.id}__${markDate}`)).length

  const mark = (staffId: string, status: AttendanceStatus) => {
    const id = `${staffId}__${markDate}`
    update((d) => {
      const existing = d.attendance.find((r) => r.id === id)
      if (existing) {
        // Tapping the same status again clears it.
        if (existing.status === status) {
          d.attendance = d.attendance.filter((r) => r.id !== id)
        } else {
          existing.status = status
        }
      } else {
        d.attendance.push({ id, staffId, date: markDate, status })
      }
    })
  }

  const markAllPresent = () => {
    update((d) => {
      for (const s of d.staff.filter((x) => x.active)) {
        const id = `${s.id}__${markDate}`
        if (!d.attendance.some((r) => r.id === id)) {
          d.attendance.push({ id, staffId: s.id, date: markDate, status: 'present' })
        }
      }
    })
    toast('Everyone marked present.')
  }

  return (
    <main className="page">
      <div className="page__head">
        <h1 className="t-h1">Staff</h1>
        <p className="t-sub" style={{ marginTop: 3 }}>
          {active.length} active · {unmarked > 0 ? `${unmarked} unmarked today` : 'all marked today'}
        </p>
      </div>

      {/* ---------- daily marking ---------- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card__head">
          <div>
            <div className="card__title">Mark attendance</div>
            <div className="card__sub">{dateLabelFull(markDate)}</div>
          </div>
          <input
            className="input"
            type="date"
            value={markDate}
            max={todayISO()}
            onChange={(e) => setMarkDate(e.target.value || todayISO())}
            style={{ width: 150, minHeight: 38, padding: '7px 10px', fontSize: '0.82rem' }}
          />
        </div>

        {isSunday(markDate) && (
          <p className="t-mut" style={{ marginBottom: 12 }}>
            Sunday is the weekly off — marking is optional and it doesn’t count against consistency.
          </p>
        )}

        {active.length === 0 ? (
          <Empty
            icon={<IconStaff size={22} />}
            title="No staff yet"
            text="Add your coaches and support staff to start tracking attendance."
            action={
              <button className="btn btn--primary btn--sm" onClick={() => setEditing('new')}>
                <IconPlus size={15} /> Add staff
              </button>
            }
          />
        ) : (
          <div className="col gap-8">
            {active.map((s) => {
              const cur = map.get(`${s.id}__${markDate}`)
              return (
                <div key={s.id} className="row gap-10">
                  <div
                    className="avatar avatar--sm"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--line)',
                      color: 'var(--ink-secondary)',
                    }}
                  >
                    {initials(s.name)}
                  </div>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="truncate" style={{ fontSize: '0.86rem', fontWeight: 570 }}>
                      {s.name}
                    </div>
                    <div className="t-mut truncate">{s.role}</div>
                  </div>
                  <div className="row gap-4" style={{ flexShrink: 0 }}>
                    {STATUSES.map((st) => {
                      const on = cur === st.value
                      return (
                        <button
                          key={st.value}
                          onClick={() => mark(s.id, st.value)}
                          aria-label={`${s.name}: ${st.label}`}
                          aria-pressed={on}
                          title={st.label}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            border: `1px solid ${on ? 'transparent' : 'var(--line-strong)'}`,
                            background: on ? ATT_COLOR[st.value] : 'var(--surface-2)',
                            color: on ? 'rgba(0,0,0,0.78)' : 'var(--ink-muted)',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                            transition: 'background 140ms var(--ease)',
                          }}
                        >
                          {st.short}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {unmarked > 0 && (
              <button className="btn btn--sm" style={{ marginTop: 4 }} onClick={markAllPresent}>
                Mark all present
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---------- month picker ---------- */}
      <div className="row-between" style={{ marginBottom: 12 }}>
        <button
          className="btn btn--ghost btn--icon btn--sm"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          aria-label="Previous month"
        >
          <IconChevronLeft size={17} />
        </button>
        <span className="row gap-6" style={{ fontWeight: 610, fontSize: '0.92rem' }}>
          <IconCalendar size={15} className="t-mut" />
          {monthLabel(month)}
        </span>
        <button
          className="btn btn--ghost btn--icon btn--sm"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          disabled={month >= currentMonthKey()}
          aria-label="Next month"
        >
          <IconChevronRight size={17} />
        </button>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <Stat
          label="Team consistency"
          value={`${teamConsistency.toFixed(0)}%`}
          foot={monthLabel(month)}
          accent="var(--good)"
        />
        <Stat
          label="Leaves taken"
          value={String(totalLeaves)}
          foot={`${totalAbsent} unplanned absences`}
          accent="var(--series-1)"
        />
      </div>

      <div className="section__head">
        <h2 className="t-h2">Each staff member</h2>
        <button className="btn btn--sm" onClick={() => setEditing('new')}>
          <IconPlus size={15} /> Add
        </button>
      </div>

      {teamStats.length === 0 ? (
        <Empty icon={<IconStaff size={22} />} title="No active staff" />
      ) : (
        <div className="list">
          {teamStats
            .slice()
            .sort((a, b) => b.stats.consistency - a.stats.consistency)
            .map(({ staff, stats }) => (
              <StaffCard key={staff.id} staff={staff} month={month} stats={stats} />
            ))}
        </div>
      )}

      <StaffSheet value={editing} onClose={() => setEditing(null)} />
    </main>
  )
}

function StaffCard({
  staff,
  month,
  stats,
}: {
  staff: StaffT
  month: string
  stats: ReturnType<typeof staffMonthStats>
}) {
  const { data } = useStore()
  const trend = useMemo(() => staffTrend(data, staff.id, 6), [data, staff.id])

  return (
    <button
      className="card tap"
      style={{ textAlign: 'left' }}
      onClick={() => navigate(`/staff/${staff.id}`)}
    >
      <div className="row gap-12" style={{ alignItems: 'center' }}>
        <Ring value={stats.consistency} size={62} stroke={7} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row-between">
            <div style={{ minWidth: 0 }}>
              <div className="t-h2 truncate">{staff.name}</div>
              <div className="t-mut truncate">{staff.role}</div>
            </div>
            <IconChevronRight size={17} className="t-mut" />
          </div>

          <div className="row gap-10" style={{ marginTop: 9 }}>
            <span className="t-mut">
              <strong style={{ color: 'var(--ink-primary)' }}>{stats.leave}</strong> leave
            </span>
            <span className="t-mut">
              <strong style={{ color: 'var(--ink-primary)' }}>{stats.absent}</strong> absent
            </span>
            <span className="grow" />
            <Sparkline
              values={trend.map((t) => t.value)}
              color={stats.consistency >= 90 ? 'var(--good)' : 'var(--warning)'}
              width={68}
              height={24}
            />
          </div>

          <div style={{ marginTop: 9 }}>
            <ShareBar
              parts={[
                { label: 'Present', value: stats.present, color: ATT_COLOR.present },
                { label: 'Half', value: stats.half, color: ATT_COLOR.half },
                { label: 'Leave', value: stats.leave, color: ATT_COLOR.leave },
                { label: 'Absent', value: stats.absent, color: ATT_COLOR.absent },
              ]}
              height={6}
            />
            <div className="t-mut" style={{ marginTop: 5 }}>
              {stats.marked} of {stats.workingDays} working days marked · {monthLabel(month)}
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

/* ------------------------------------------------------------------
   Add / edit staff
   ------------------------------------------------------------------ */

export function StaffSheet({
  value,
  onClose,
}: {
  value: StaffT | 'new' | null
  onClose: () => void
}) {
  const { update, toast } = useStore()
  const isNew = value === 'new'
  const s = isNew ? null : value

  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [phone, setPhone] = useState('')
  const [salary, setSalary] = useState('')
  const [joinedOn, setJoinedOn] = useState(todayISO())
  const [active, setActive] = useState(true)
  const [key, setKey] = useState('')

  const openKey = value === null ? '' : isNew ? 'new' : (s as StaffT).id
  if (openKey !== key) {
    setKey(openKey)
    setName(s?.name ?? '')
    setRole(s?.role ?? '')
    setPhone(s?.phone ?? '')
    setSalary(s?.monthlySalary ? String(s.monthlySalary) : '')
    setJoinedOn(s?.joinedOn ?? todayISO())
    setActive(s?.active ?? true)
  }

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast('Enter a name.', 'bad')
      return
    }
    update((d) => {
      if (isNew) {
        d.staff.push({
          id: uid('stf'),
          name: trimmed,
          role: role.trim() || 'Coach',
          phone: phone.replace(/\s/g, '') || undefined,
          joinedOn,
          monthlySalary: Number(salary) || undefined,
          active,
        })
      } else if (s) {
        const t = d.staff.find((x) => x.id === s.id)
        if (t) {
          t.name = trimmed
          t.role = role.trim() || 'Coach'
          t.phone = phone.replace(/\s/g, '') || undefined
          t.joinedOn = joinedOn
          t.monthlySalary = Number(salary) || undefined
          t.active = active
        }
      }
    })
    toast(isNew ? 'Staff added.' : 'Staff updated.')
    onClose()
  }

  return (
    <Sheet
      open={value !== null}
      onClose={onClose}
      title={isNew ? 'New staff member' : 'Edit staff'}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save}>
            {isNew ? 'Add' : 'Save'}
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
            placeholder="Srikanth B"
            autoComplete="off"
          />
        </Field>

        <Field label="Role" span>
          <input
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Assistant Coach"
            autoComplete="off"
          />
        </Field>

        <Field label="Phone" hint="Optional.">
          <input
            className="input"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="9876543210"
          />
        </Field>

        <Field label="Monthly salary (₹)" hint="Optional.">
          <input
            className="input"
            type="number"
            inputMode="numeric"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            placeholder="24000"
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
