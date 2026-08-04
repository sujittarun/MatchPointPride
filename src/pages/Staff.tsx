import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { navigate } from '../lib/router'
import type { AttendanceRecord, Staff as StaffT } from '../lib/types'
import {
  MAX_AMOUNT,
  currentMonthKey,
  dateLabelFull,
  fmtDays,
  initials,
  isSunday,
  monthLabel,
  nonNegative,
  shiftMonth,
  todayISO,
} from '../lib/format'
import { attendanceMap, staffMonthStats, staffTrend } from '../lib/selectors'
import { Empty, Field, Sheet } from '../components/ui'
import { ATT_COLOR, Ring, ShareBar, Sparkline } from '../components/charts'
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconStaff,
} from '../components/icons'

/**
 * What a half currently says: worked, did not, or nobody has said.
 *
 * `undefined` is NOT `false`. A day recorded before shifts existed has
 * neither half set and IS a full day — so a present row with nothing on
 * either half reads as both worked, not as two blanks.
 */
type Half = 'yes' | 'no' | null

function halfState(rec: AttendanceRecord | undefined, half: 'am' | 'pm'): Half {
  if (!rec) return null
  if (rec.am === undefined && rec.pm === undefined) {
    // A pre-shift row. `present` was the whole of what it said.
    return rec.status === 'present' ? 'yes' : 'no'
  }
  const v = rec[half]
  return v === undefined ? null : v ? 'yes' : 'no'
}

/* not marked -> present -> absent -> not marked. Three taps returns the
   day to untouched, which is the only way back to "nobody has said" — a
   state a two-way toggle could not express and could not restore. */
const NEXT: Record<'null' | 'yes' | 'no', Half> = { null: 'yes', yes: 'no', no: null }

function cycle(cur: Half): Half {
  return NEXT[cur === null ? 'null' : cur]
}

/** What goes in the pill: a tick, a cross, or nothing at all. */
const GLYPH: Record<'yes' | 'no', string> = { yes: '✓', no: '✕' }

export default function Staff() {
  const { data, toast, markStaffDay, markStaffDays } = useStore()
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

  const totalAbsent = teamStats.reduce((a, t) => a + t.stats.absent, 0)
  /* Every record by id, so a tap can read the day's other half. */
  const byId = useMemo(
    () => new Map(data.attendance.map((r) => [r.id, r])),
    [data.attendance],
  )

  const unmarked = isSunday(markDate)
    ? 0
    : active.filter((s) => !map.get(`${s.id}__${markDate}`)).length

  /* Toggle one shift. The other half is read from what is already
     recorded, so tapping PM never silently clears the morning.

     `present` is not passed — cloud.ts derives and stores it, because it
     is the column every other tenant and all of history read. Turning
     both halves off therefore writes an ABSENT row, not a deleted one:
     an absent row and no row mean different things, and "no record" is
     not something a tap should be able to assert. */
  const mark = (staffId: string, half: 'am' | 'pm') => {
    const rec = byId.get(`${staffId}__${markDate}`)
    const cur = { am: halfState(rec, 'am'), pm: halfState(rec, 'pm') }
    const next = { ...cur, [half]: cycle(cur[half]) }
    const toBool = (h: Half) => (h === null ? null : h === 'yes')
    void markStaffDay({
      coachId: staffId,
      date: markDate,
      am: toBool(next.am),
      pm: toBool(next.pm),
    }).then((r) => {
      if (!r.ok) toast(r.message, 'bad')
    })
  }

  /* ONE request, one repaint. This used to call markStaffDay per person,
     and each of those refetched the entire tenant — eight staff meant
     eight upserts and eight full reloads, about 144 requests for one
     button press. */
  const markAllPresent = () => {
    void (async () => {
      const roster = data.staff.filter((x) => x.active)
      const r = await markStaffDays(
        roster.map((st) => ({ coachId: st.id, date: markDate, am: true, pm: true })),
      )
      if (!r.ok) toast(r.message, 'bad')
      else toast('Everyone marked present.')
    })()
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
                  <div className="row gap-6" style={{ flexShrink: 0 }}>
                    {(['am', 'pm'] as const).map((half) => {
                      const st = halfState(byId.get(`${s.id}__${markDate}`), half)
                      const shift = half === 'am' ? 'morning' : 'evening'
                      return (
                        <button
                          key={half}
                          className={`shift${st ? ` shift--${st}` : ''}`}
                          onClick={() => mark(s.id, half)}
                          aria-label={`${s.name}, ${shift}: ${
                            st === 'yes' ? 'present' : st === 'no' ? 'absent' : 'not marked'
                          }. Tap to change`}
                        >
                          {half.toUpperCase()}
                          {/* Always rendered, empty when unmarked: the
                              slot is reserved in CSS so the pill never
                              changes size and the row never reflows
                              under the thumb. */}
                          <span className="shift__mark">{st ? GLYPH[st] : ''}</span>
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

      {/* One honest summary: the team average, and how many absences sit
          behind it. Per-person figures belong on the cards below, not in a
          total that mixes everyone's days together. */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row gap-14" style={{ alignItems: 'center' }}>
          <Ring value={teamConsistency} size={64} stroke={7} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="card__title">{monthLabel(month)}</div>
            <div className="t-mut" style={{ marginTop: 4, lineHeight: 1.5 }}>
              {totalAbsent === 0
                ? `No absences across ${active.length} staff.`
                : `${totalAbsent} absence${totalAbsent === 1 ? '' : 's'} across ${active.length} staff.`}
            </div>
            <div className="t-mut" style={{ marginTop: 2 }}>
              Average of each person's attendance.
            </div>
          </div>
        </div>
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
              <strong style={{ color: 'var(--ink-primary)' }}>{fmtDays(stats.worked)}</strong> worked
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
                /* Worked, not days-present. A month of mornings is 20
                   present days and 10 days of work; splitting on
                   `present` drew a full green bar for someone who
                   worked half the month. The red side is everything
                   marked that was not worked, so the bar always adds up
                   to the days actually marked. */
                { label: 'Worked', value: stats.worked, color: ATT_COLOR.present },
                { label: 'Not worked', value: Math.max(0, stats.marked - stats.worked), color: ATT_COLOR.absent },
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
  const { toast, saveStaff } = useStore()
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

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast('Enter a name.', 'bad')
      return
    }
    if (Number(salary) < 0) {
      toast('Salary cannot be negative.', 'bad')
      return
    }
    if (nonNegative(salary) > MAX_AMOUNT) {
      toast('That salary looks too large — check the digits.', 'bad')
      return
    }
    /* monthlySalary has nowhere to go on the platform's coaches table
       and is not used to compute anything, so it is not sent. Payroll is
       an expense the owner records; inventing a column for it here would
       be a money rule in a client. */
    const r = await saveStaff({
      id: s?.id,
      name: trimmed,
      role: role.trim() || 'Coach',
      phone: phone.replace(/\s/g, '') || undefined,
      active,
    })
    if (!r.ok) {
      toast(r.message, 'bad')
      return
    }
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
            min={0}
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
