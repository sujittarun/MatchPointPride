import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { navigate } from '../lib/router'
import type { Batch, BatchKind } from '../lib/types'
import { MAX_AMOUNT, inr, nonNegative, nonNegativeOrUndef, uid } from '../lib/format'
import { activeStudentsOf, studentsOf } from '../lib/selectors'
import { Empty, Sheet, Field } from '../components/ui'
import { Donut, seriesColor } from '../components/charts'
import {
  IconBatches,
  IconChevronRight,
  IconClock,
  IconPlus,
  IconUsers,
} from '../components/icons'

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

export default function Batches() {
  const { data } = useStore()
  const [editing, setEditing] = useState<Batch | 'new' | null>(null)
  const [filter, setFilter] = useState<BatchKind | 'all'>('all')

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

  return (
    <main className="page">
      <div className="page__head">
        <h1 className="t-h1">Batches</h1>
        <p className="t-sub" style={{ marginTop: 3 }}>
          {data.batches.length} batches · {totalActive} active students
        </p>
      </div>

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

      <button className="fab" onClick={() => setEditing('new')} aria-label="Add batch">
        <IconPlus size={24} />
      </button>

      <BatchSheet
        value={editing}
        onClose={() => setEditing(null)}
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
  const { update, toast, data } = useStore()
  const isNew = value === 'new'
  const b = isNew ? null : value

  const [name, setName] = useState('')
  const [kind, setKind] = useState<BatchKind>('kids')
  const [slot, setSlot] = useState('')
  const [days, setDays] = useState<string[]>([])
  const [fee, setFee] = useState('')
  const [capacity, setCapacity] = useState('')
  const [note, setNote] = useState('')
  const [key, setKey] = useState('')

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
    setNote(b?.note ?? '')
  }

  const save = () => {
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
    const feeVal = nonNegative(fee)
    const capVal = nonNegativeOrUndef(capacity)
    update((d) => {
      if (isNew) {
        const usedSlots = new Set(d.batches.map((x) => x.colorSlot))
        let colorSlot = 1
        for (let i = 1; i <= 6; i++) {
          if (!usedSlots.has(i)) {
            colorSlot = i
            break
          }
          colorSlot = (d.batches.length % 6) + 1
        }
        d.batches.push({
          id: uid('batch'),
          name: trimmed,
          kind,
          slot: slot.trim() || undefined,
          days: days.length ? days : undefined,
          fee: feeVal,
          capacity: capVal,
          colorSlot,
          note: note.trim() || undefined,
          createdAt: new Date().toISOString(),
        })
      } else if (b) {
        const t = d.batches.find((x) => x.id === b.id)
        if (t) {
          t.name = trimmed
          t.kind = kind
          t.slot = slot.trim() || undefined
          t.days = days.length ? days : undefined
          t.fee = feeVal
          t.capacity = capVal
          t.note = note.trim() || undefined
        }
      }
    })
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
