import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { navigate } from '../lib/router'
import type { Batch, BatchKind } from '../lib/types'
import { MAX_AMOUNT, inr, nonNegative, nonNegativeOrUndef } from '../lib/format'
import { activeStudentsOf, studentsOf } from '../lib/selectors'
import { Empty, Sheet, Field } from '../components/ui'
import { Donut, seriesColor } from '../components/charts'
import {
  IconBatches,
  IconChevronRight,
  IconClock,
  IconPlus,
  IconUserPlus,
  IconUsers,
} from '../components/icons'
import { StudentSheet } from '../components/StudentSheet'

const KIND_LABEL: Record<BatchKind, string> = {
  kids: 'Kids',
  professional: 'Professional',
  membership: 'Membership',
}

const KIND_BADGE: Record<BatchKind, string> = {
  kids: 'badge--info',
  professional: 'badge--brand',
  membership: 'badge--mute',
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** "4:30 PM – 5:30 PM" -> ["16:30","17:30"]. Blank means all day. */
function parseSlot(text: string): [string, string] {
  const m = text.match(/(\d{1,2}):(\d{2})\s*([AP]M)\s*[\u2013-]\s*(\d{1,2}):(\d{2})\s*([AP]M)/i)
  if (!m) return ['05:00', '23:59']
  const to24 = (h: string, mm: string, ap: string) => {
    let hh = parseInt(h, 10)
    if (/pm/i.test(ap) && hh !== 12) hh += 12
    if (/am/i.test(ap) && hh === 12) hh = 0
    return `${String(hh).padStart(2, '0')}:${mm}`
  }
  return [to24(m[1], m[2], m[3]), to24(m[4], m[5], m[6])]
}

export default function Batches() {
  const { data  } = useStore()
  const [editing, setEditing] = useState<Batch | 'new' | null>(null)
  const [addStudent, setAddStudent] = useState(false)
  const [filter, setFilter] = useState<BatchKind | 'all'>('all')
  const [query, setQuery] = useState('')

  const batches = useMemo(
    () => (filter === 'all' ? data.batches : data.batches.filter((b) => b.kind === filter)),
    [data.batches, filter],
  )

  const mix = useMemo(
    () =>
      data.batches
        .map((b) => ({
          label: b.name,
          value: activeStudentsOf(data, b.id).length,
          color: seriesColor(b.colorSlot),
        }))
        .filter((d) => d.value > 0),
    [data],
  )

  const totalActive = data.students.filter((s) => s.active).length

  /* Find anyone, including the students who have left.
   *
   * Without this the only way to reach someone who stopped coming is to
   * remember which batch they were in and scroll its roster — and those
   * rosters only ever grow, because a departed student stays on the one
   * they left. Name or number, because the owner remembers one or the
   * other, rarely both. */
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const digits = q.replace(/\D/g, '')
    return data.students
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (digits.length >= 3 && s.phone.includes(digits)),
      )
      .sort((a, b) => (a.active === b.active ? a.name.localeCompare(b.name) : a.active ? -1 : 1))
      .slice(0, 12)
  }, [data.students, query])

  return (
    <main className="page">
      <div className="page__head">
        <h1 className="t-h1">Batches</h1>
        <p className="t-sub" style={{ marginTop: 3 }}>
          {data.batches.length} batches · {totalActive} active students
        </p>
      </div>

      <input
        className="input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a student by name or number"
        aria-label="Find a student"
        autoComplete="off"
        style={{ marginBottom: 14 }}
      />

      {query.trim().length >= 2 && (
        <div className="card card--tight" style={{ marginBottom: 16 }}>
          {hits.length === 0 ? (
            <p className="t-mut" style={{ padding: '6px 0' }}>
              Nobody by that name or number — including students who have left.
            </p>
          ) : (
            <div className="list">
              {hits.map((s) => {
                const b = data.batches.find((z) => z.id === s.batchId)
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
                        {b?.name ?? 'No batch'}
                        {s.phone ? ` · ${s.phone}` : ''}
                      </div>
                    </div>
                    <div className="listrow__end">
                      {s.active ? (
                        <span className="badge badge--good">Training</span>
                      ) : (
                        <span className="badge badge--mute">Has left</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {mix.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card__head">
            <div>
              <div className="card__title">Where the students are</div>
              <div className="card__sub">Active students by batch</div>
            </div>
          </div>
          <Donut
            data={mix}
            format={(n) => `${n} student${n === 1 ? '' : 's'}`}
            centerValue={String(totalActive)}
            centerLabel="Active"
          />
        </div>
      )}

      <div className="chiprow" style={{ marginBottom: 14 }}>
        {(['all', 'kids', 'professional', 'membership'] as const).map((k) => (
          <button
            key={k}
            className={`chip${filter === k ? ' chip--on' : ''}`}
            onClick={() => setFilter(k)}
          >
            {k === 'all' ? 'All' : KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="section__head">
        <h2 className="t-h2">
          {filter === 'all' ? 'All batches' : `${KIND_LABEL[filter]} batches`}
        </h2>
        <button className="btn btn--ghost btn--sm" onClick={() => setEditing('new')}>
          <IconPlus size={15} /> New batch
        </button>
      </div>

      {batches.length === 0 ? (
        <Empty
          icon={<IconBatches size={22} />}
          title="No batches here"
          text="Add a batch to start grouping students by slot."
          action={
            <button className="btn btn--primary btn--sm" onClick={() => setEditing('new')}>
              <IconPlus size={15} /> Add batch
            </button>
          }
        />
      ) : (
        <div className="list">
          {batches.map((b) => (
            <BatchCard key={b.id} batch={b} />
          ))}
        </div>
      )}

      {/* Students get added far more often than batches, so the thumb-reachable
          button is the one for students. */}
      <button className="fab" onClick={() => setAddStudent(true)} aria-label="Add student">
        <IconUserPlus size={24} />
      </button>

      <BatchSheet value={editing} onClose={() => setEditing(null)} />
      <StudentSheet
        value={addStudent ? 'new' : null}
        onClose={() => setAddStudent(false)}
      />
    </main>
  )
}

function BatchCard({ batch }: { batch: Batch }) {
  const { data } = useStore()
  const all = studentsOf(data, batch.id)
  const active = all.filter((s) => s.active).length
  const cap = batch.capacity ?? 0
  const fill = cap > 0 ? Math.min(100, (active / cap) * 100) : 0
  const color = seriesColor(batch.colorSlot)
  const monthly = all.filter((s) => s.active).reduce((a, s) => a + s.monthlyFee, 0)

  return (
    <button className="card tap" style={{ textAlign: 'left' }} onClick={() => navigate(`/batches/${batch.id}`)}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
        <span
          style={{
            width: 4,
            alignSelf: 'stretch',
            minHeight: 42,
            borderRadius: 99,
            background: color,
            flexShrink: 0,
          }}
        />
        <div className="grow">
          <div className="row-between" style={{ alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div className="t-h2 truncate">{batch.name}</div>
              <div className="row gap-6" style={{ marginTop: 5, flexWrap: 'wrap' }}>
                <span className={`badge ${KIND_BADGE[batch.kind]}`}>{KIND_LABEL[batch.kind]}</span>
                {batch.slot ? (
                  <span className="t-mut row gap-4">
                    <IconClock size={12} /> {batch.slot}
                  </span>
                ) : (
                  <span className="t-mut">No fixed slot</span>
                )}
              </div>
            </div>
            <IconChevronRight size={18} className="t-mut" />
          </div>

          <div className="row-between" style={{ marginTop: 12 }}>
            <span className="t-mut row gap-4">
              <IconUsers size={13} />
              {active} active{cap > 0 ? ` / ${cap}` : ''}
            </span>
            <span className="num t-sub" style={{ fontWeight: 600 }}>
              {inr(monthly, { compact: true })}/mo
            </span>
          </div>

          {cap > 0 && (
            <div
              style={{
                height: 5,
                borderRadius: 99,
                background: 'var(--surface-3)',
                marginTop: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${fill}%`,
                  height: '100%',
                  background: color,
                  borderRadius: 99,
                  transition: 'width 520ms var(--ease-out)',
                }}
              />
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

/* ------------------------------------------------------------------
   Add / edit batch
   ------------------------------------------------------------------ */

export function BatchSheet({
  value,
  onClose,
}: {
  value: Batch | 'new' | null
  onClose: () => void
}) {
  const { toast, data, saveBatch } = useStore()
  const isNew = value === 'new'
  const b = isNew ? null : value

  const [name, setName] = useState('')
  const [kind, setKind] = useState<BatchKind>('kids')
  const [slot, setSlot] = useState('')
  const [days, setDays] = useState<string[]>([])
  const [fee, setFee] = useState('')
  const [capacity, setCapacity] = useState('')
  const [upiId, setUpiId] = useState('')
  const [upiName, setUpiName] = useState('')
  const [note, setNote] = useState('')
  const [key, setKey] = useState('')

  /* UPI IDs already in use, so a second batch can be pointed at the same
     account with one tap instead of retyping it. */
  const knownUpis = [...new Set(data.batches.map((x) => x.upiId).filter(Boolean))] as string[]

  // Re-seed the form whenever a different batch is opened.
  const openKey = value === null ? '' : isNew ? 'new' : (b as Batch).id
  if (openKey !== key) {
    setKey(openKey)
    setName(b?.name ?? '')
    setKind(b?.kind ?? 'kids')
    setSlot(b?.slot ?? '')
    setDays(b?.days ?? [])
    setFee(b ? String(b.fee) : '')
    setCapacity(b?.capacity ? String(b.capacity) : '')
    setUpiId(b?.upiId ?? '')
    setUpiName(b?.upiName ?? '')
    setNote(b?.note ?? '')
  }

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast('Give the batch a name.', 'bad')
      return
    }
    if (Number(fee) < 0 || Number(capacity) < 0) {
      toast('Fee and capacity cannot be negative.', 'bad')
      return
    }
    if (nonNegative(fee) > MAX_AMOUNT) {
      toast('That fee looks too large — check the digits.', 'bad')
      return
    }
    const upi = upiId.trim()
    if (upi && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(upi)) {
      toast('That UPI ID doesn\u2019t look right — it should read like name@bank.', 'bad')
      return
    }
    /* The fee is not a column on the batch — it is a fee_rules row that
       resolve_fee ranks. saveBatch writes both, retiring the previous
       rule rather than editing it, so past months stay explicable. */
    const DAY_NUM: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
    /* The platform stores start and end times; MPP shows one "4:30 PM –
       5:30 PM" string. A batch with no slot (open-play membership) takes
       the venue's hours, because the column is NOT NULL. */
    const [slotStart, slotEnd] = parseSlot(slot)
    const r = await saveBatch({
      id: b?.id,
      name: trimmed,
      days: days.map((d) => DAY_NUM[d]).filter(Boolean),
      startTime: slotStart,
      endTime: slotEnd,
      capacity: nonNegativeOrUndef(capacity) ?? null,
      fee: nonNegative(fee),
    })
    if (!r.ok) {
      toast(r.message, 'bad')
      return
    }
    toast(isNew ? 'Batch added.' : 'Batch updated.')
    onClose()
  }

  const toggleDay = (d: string) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))

  return (
    <Sheet
      open={value !== null}
      onClose={onClose}
      title={isNew ? 'New batch' : 'Edit batch'}
      subtitle={isNew ? `${data.batches.length} batches so far` : b?.name}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save}>
            {isNew ? 'Add batch' : 'Save'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Batch name" span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kids Batch A"
            autoComplete="off"
          />
        </Field>

        <Field label="Type" span>
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as BatchKind)}>
            <option value="kids">Kids training</option>
            <option value="professional">Professional training</option>
            <option value="membership">Membership</option>
          </select>
        </Field>

        <Field label="Slot time" hint="Optional — leave blank for open play." span>
          <input
            className="input"
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
            placeholder="4:30 PM – 5:30 PM"
            autoComplete="off"
          />
        </Field>

        <Field label="Days" hint="Optional." span>
          <div className="row gap-6 wrap" style={{ marginTop: 2 }}>
            {DAYS.map((d) => (
              <button
                key={d}
                type="button"
                className={`chip${days.includes(d) ? ' chip--on' : ''}`}
                style={{ minHeight: 34, padding: '6px 11px', fontSize: '0.78rem' }}
                onClick={() => toggleDay(d)}
              >
                {d}
              </button>
            ))}
          </div>
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

        <Field label="Capacity">
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="12"
          />
        </Field>

        <Field
          label="Collect fees at (UPI ID)"
          hint="Added to this batch's reminder messages. Leave blank to send no payment details."
          span
        >
          <input
            className="input"
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            placeholder="matchpoint@ybl"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>

        {knownUpis.length > 0 && (
          <div className="span-2" style={{ marginTop: -4 }}>
            <div className="t-mut" style={{ marginBottom: 6 }}>
              Use the same as another batch:
            </div>
            <div className="row gap-6 wrap">
              {knownUpis.map((u) => (
                <button
                  key={u}
                  type="button"
                  className={`chip${upiId === u ? ' chip--on' : ''}`}
                  style={{ minHeight: 34, padding: '6px 11px', fontSize: '0.76rem' }}
                  onClick={() => setUpiId(u)}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        )}

        <Field label="Payee name" hint="Optional — shown in the message so parents can check." span>
          <input
            className="input"
            value={upiName}
            onChange={(e) => setUpiName(e.target.value)}
            placeholder="Match Point Pride"
            autoComplete="off"
          />
        </Field>

        <Field label="Note" span>
          <textarea
            className="textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Beginners, ages 6–9."
          />
        </Field>
      </div>
    </Sheet>
  )
}
