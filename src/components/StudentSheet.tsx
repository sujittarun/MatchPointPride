import { useState } from 'react'
import { useStore } from '../lib/store'
import type { Student } from '../lib/types'
import {
  FIRST_FEE_WARN_DAYS,
  MAX_AMOUNT,
  clampDay,
  dateLabelFull,
  daysBetween,
  firstDueDate,
  nonNegative,
  ordinal,
  todayISO,
} from '../lib/format'
import { findExisting } from '../lib/selectors'
import { Confirm, Field, Sheet } from './ui'

/* Add / edit a student. Lives here rather than inside a page so it can
   be opened from the dashboard, the batch list or a batch itself. */

export function StudentSheet({
  value,
  batchId,
  defaultFee,
  onClose,
}: {
  value: Student | 'new' | null
  batchId?: string
  defaultFee?: number
  onClose: () => void
}) {
  const { data, saveStudent, toast } = useStore()
  const [saving, setSaving] = useState(false)

  /* Someone the phone lookup found and the owner picked. Held here so
     the sheet can switch from "new student" to editing or bringing back
     an existing one without the caller having to reopen it. */
  const [picked, setPicked] = useState<Student | null>(null)
  const [ignoreMatches, setIgnoreMatches] = useState(false)

  const isNew = value === 'new' && picked === null
  const s = picked ?? (value === 'new' ? null : value)
  /* A student with no live enrolment is not being edited, they are being
     brought back — which is a new spell, not a status field. */
  const rejoining = picked !== null && !picked.active

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [guardian, setGuardian] = useState('')
  const [batch, setBatch] = useState(batchId ?? data.batches[0]?.id ?? '')
  const [fee, setFee] = useState('')
  const [dueDay, setDueDay] = useState('1')
  const [paidNow, setPaidNow] = useState('')
  const [joinedOn, setJoinedOn] = useState(todayISO())
  const [active, setActive] = useState(true)
  const [key, setKey] = useState('')
  /* The confirm step in front of Add. `confirmedFee` latches once the
     owner says go, so pressing Add again writes instead of re-asking. */
  const [confirmingFee, setConfirmingFee] = useState(false)
  const [confirmedFee, setConfirmedFee] = useState(false)

  const feeOf = (id: string) => data.batches.find((b) => b.id === id)?.fee
  const batchName = data.batches.find((b) => b.id === batch)?.name ?? 'the batch'
  /* Quiet while it is the batch's own rate; full strength the moment
     it is overridden, so the styling says which it is. */
  const inheritedFee = fee.trim() === '' || nonNegative(fee) === (feeOf(batch) ?? -1)

  // The mode is part of the key: switching an inactive student from
  // "edit" to "bring back" has to re-run the reset below, because a new
  // spell starts today rather than on their original joining date.
  const openKey =
    value === null ? '' : s ? `s:${s.id}:${rejoining ? 'back' : 'edit'}` : `new:${batchId}`
  if (openKey !== key) {
    const startBatch = s?.batchId ?? batchId ?? data.batches[0]?.id ?? ''
    setKey(openKey)
    setName(s?.name ?? '')
    // Keep what was typed when a match was picked — the number is how
    // they were found, and blanking it would look like a lost keystroke.
    setPhone(s?.phone ?? phone)
    setGuardian(s?.guardian ?? '')
    setBatch(startBatch)
    // A new student inherits the batch's fee — otherwise opening this from
    // the dashboard, where no batch is pre-selected, silently saves ₹0.
    setFee(
      s
        ? String(s.monthlyFee)
        : String(defaultFee ?? feeOf(startBatch) ?? ''),
    )
    setDueDay(s ? String(s.feeDueDay) : '1')
    setPaidNow(s && !rejoining ? '' : String(defaultFee ?? feeOf(startBatch) ?? ''))
    // A rejoin starts today. Their original joining date is history, and
    // it is kept — it is the start of their first spell, not this one.
    setJoinedOn(rejoining ? todayISO() : (s?.joinedOn ?? todayISO()))
    setActive(rejoining ? true : (s?.active ?? true))
    setConfirmingFee(false)
    setConfirmedFee(false)
  }

  /* The lookup.
   *
   * BOTH the name and the number have to match. A number alone is not
   * enough: brothers and sisters are on the same parent's phone, so a
   * number-only match would offer to bring back the wrong child.
   *
   * The name match is deliberately forgiving on trailing words, because
   * a surname gets typed sometimes and not others — "Aarav" finds
   * "Aarav Sharma" — but it is a word boundary, so "Ram" never matches
   * "Ramesh". Everyone is already in memory, so this costs no request.
   */
  const matches =
    isNew && !ignoreMatches ? findExisting(data.students, name, phone) : []

  /* When the first fee lands, and whether that is soon.

     Under FIRST_FEE_MIN_GAP days `firstDueDate` has already moved it to
     the next month, so nothing here ever has to argue with an absurd
     date — the amber band is the range in between, where the date is
     defensible and the owner should simply know: a parent who signed up
     on Tuesday may hear from us a fortnight on.

     Shown when Add is pressed, not while the form is being filled in.
     A notice about a date the owner has not finished choosing is read by
     nobody, and one that has been on screen since the sheet opened has
     stopped being a notice at all. At the point of saving it is a
     decision with two answers. */
  const firstFee = (isNew || rejoining) && joinedOn ? firstDueDate(clampDay(dueDay), joinedOn) : null
  const daysToFee = firstFee ? daysBetween(joinedOn, firstFee) : null
  const feeIsSoon = daysToFee !== null && daysToFee < FIRST_FEE_WARN_DAYS

  /* Switching batch on a new student re-applies that batch's fee. */
  const pickBatch = (id: string) => {
    setBatch(id)
    if (isNew || rejoining) {
      setFee(String(feeOf(id) ?? ''))
      setPaidNow(String(feeOf(id) ?? ''))
    }
  }

  /* Pressing Add validates, then STOPS to show when the first fee lands.

     It used to be a banner sitting in the form the whole time, updating
     as the owner typed. That is the wrong moment: nobody reads a notice
     about a date they have not finished choosing, and by the time it is
     true it has been on screen so long it is furniture. Asked at the
     point of saving, it is a decision — go back and move the fee day, or
     go ahead knowing when the parent will hear from us. */
  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast('Enter the student name.', 'bad')
      return
    }
    if (!batch) {
      toast('Pick a batch first.', 'bad')
      return
    }
    if (Number(fee) < 0) {
      toast('Fee cannot be negative.', 'bad')
      return
    }
    if (nonNegative(fee) > MAX_AMOUNT) {
      toast('That fee looks too large — check the digits.', 'bad')
      return
    }
    // Only for someone starting a spell — an edit is not choosing a
    // first fee date, so there is nothing to confirm.
    if ((isNew || rejoining) && firstFee && !confirmedFee) {
      setConfirmingFee(true)
      return
    }
    await write()
  }

  const write = async () => {
    const trimmed = name.trim()
    const feeVal = nonNegative(fee)
    const day = clampDay(dueDay)

    /* Straight to Postgres. The reminder that used to be cancelled here
       by hand is closed by the database: a discontinued enrolment drops
       out of reminder_queue on its own, so there is nothing to tidy and
       nothing that can disagree. */
    setSaving(true)
    const r = await saveStudent({
      id: s?.id,
      memberId: s?.memberId,
      // Withheld on a rejoin: no enrolment id means "open a new spell
      // for this person" rather than "edit the one they had".
      enrollmentId: rejoining ? undefined : s?.enrollmentId,
      name: trimmed,
      phone: phone.replace(/\s/g, ''),
      guardian: guardian.trim() || undefined,
      batchId: batch,
      joinedOn,
      feeDueDay: day,
      /* Blank means "not decided", NOT zero. An empty field used to be
         read as 0 and stored as a real override, and resolve_fee honours
         an override of 0 — so registering a student without a fee priced
         them free for ever and the batch's own rate never applied.
         Blank now sends null and the batch rule owns the fee, which is
         also what makes registering someone before their fee is settled
         a normal thing to do. An explicit 0 is still an explicit 0. */
      customFee:
        fee.trim() === '' || feeVal === (feeOf(batch) ?? -1) ? null : feeVal,
      active,
      currentRenewalOn: s?.renewalOn,
      // 0 or blank means they walked in without paying.
      paidNow: isNew || rejoining ? nonNegative(paidNow) : undefined,
    })
    setSaving(false)

    if (!r.ok) {
      toast(r.message, 'bad')
      return
    }
    toast(
      rejoining
        ? `${trimmed} is back on the roll.`
        : isNew
          ? 'Student added.'
          : !active && s?.active
            ? `${trimmed} marked as left. Reminders stop.`
            : 'Student updated.',
    )
    close()
  }

  /* Picking a match rewrites what this sheet is about, so the reset
     above has to run — it keys off the subject's id. */
  const close = () => {
    setPicked(null)
    setIgnoreMatches(false)
    onClose()
  }

  const sheet = (
    <Sheet
      open={value !== null}
      onClose={close}
      title={rejoining ? 'Bring back' : isNew ? 'New student' : 'Edit student'}
      subtitle={
        rejoining && s
          ? `Last trained here ${s.spells?.length ? dateLabelFull(s.spells[s.spells.length - 1].to ?? s.joinedOn) : dateLabelFull(s.joinedOn)}`
          : s
            ? `Joined ${dateLabelFull(s.joinedOn)}`
            : undefined
      }
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : rejoining ? 'Bring back' : isNew ? 'Add student' : 'Save'}
          </button>
        </>
      }
    >
      {matches.length > 0 && (
        <div
          className="card card--tight"
          style={{
            marginBottom: 14,
            borderColor: 'rgba(250,178,25,0.28)',
            background: 'rgba(250,178,25,0.06)',
          }}
        >
          <div className="t-label" style={{ marginBottom: 3 }}>
            {matches.length === 1 ? 'This student is already on file' : 'Already on file'}
          </div>
          <p className="t-mut" style={{ lineHeight: 1.5, marginBottom: 10 }}>
            Same name, same number. Bringing them back keeps their fee history,
            attendance and everything else under one record.
          </p>
          <div className="col gap-8">
            {matches.map((x) => {
              const b = data.batches.find((z) => z.id === x.batchId)
              const left = x.spells?.[x.spells.length - 1]?.to
              return (
                <button
                  key={x.id}
                  className="listrow tap"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setPicked(x)}
                >
                  <div className="listrow__main">
                    <div className="listrow__title">{x.name}</div>
                    <div className="listrow__meta">
                      {b?.name ?? 'No batch'}
                      {x.active
                        ? ' · on the roll now'
                        : left
                          ? ` · left ${dateLabelFull(left)}`
                          : ' · not training'}
                    </div>
                  </div>
                  <div className="listrow__end">
                    <span className={`badge ${x.active ? 'badge--good' : 'badge--warn'}`}>
                      {x.active ? 'Open' : 'Bring back'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
          <button
            className="btn btn--sm btn--block"
            style={{ marginTop: 10 }}
            onClick={() => setIgnoreMatches(true)}
          >
            Not the same person — add anyway
          </button>
        </div>
      )}


      <div className="form-grid">
        <Field label="Name" span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Aarav Reddy"
            autoComplete="off"
          />
        </Field>

        <Field label="Phone" hint="Used for WhatsApp reminders." span>
          <input
            className="input"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="9876543210"
          />
        </Field>

        <Field label="Parent / guardian" hint="Optional." span>
          <input
            className="input"
            value={guardian}
            onChange={(e) => setGuardian(e.target.value)}
            placeholder="Mrs. Reddy"
            autoComplete="off"
          />
        </Field>

        <Field label="Batch" span>
          <select className="select" value={batch} onChange={(e) => pickBatch(e.target.value)}>
            {data.batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.slot ? ` — ${b.slot}` : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Monthly fee (₹)"
          hint={inheritedFee ? `${batchName} rate` : 'Just this student'}
        >
          <input
            className={`input${inheritedFee ? ' input--inherited' : ''}`}
            type="number"
            inputMode="numeric"
            min={0}
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            placeholder="2000"
          />
        </Field>

        {(isNew || rejoining) && (
          <Field
            label="Paid now (₹)"
            hint={nonNegative(paidNow) > 0 ? 'Recorded straight away' : 'Shows on Home until paid'}
          >
            <input
              className={`input${nonNegative(paidNow) > 0 ? ' input--live' : ''}`}
              type="number"
              inputMode="numeric"
              min={0}
              value={paidNow}
              onChange={(e) => setPaidNow(e.target.value)}
              placeholder="0"
            />
          </Field>
        )}

        <Field
          label="Fee due on"
          span={isNew || rejoining}
          hint={
            !dueDay.trim()
              ? 'Day of the month, every month'
              : clampDay(dueDay) > 28
                ? `The ${ordinal(clampDay(dueDay))} — or the last day in shorter months`
                : `The ${ordinal(clampDay(dueDay))} of every month`
          }
        >
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
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

        {/* On the roll: the one status change available is leaving. */}
        {s && s.active && !rejoining && (
          <Field
            label="Status"
            hint={
              active
                ? undefined
                : 'Reminders stop, and they come off the active count in Academy Manager.'
            }
            span
          >
            <div className="seg" style={{ width: '100%' }}>
              <button
                type="button"
                className={`seg__item grow${active ? ' seg__item--on' : ''}`}
                onClick={() => setActive(true)}
              >
                Training
              </button>
              <button
                type="button"
                className={`seg__item grow${!active ? ' seg__item--on' : ''}`}
                onClick={() => setActive(false)}
              >
                Has left
              </button>
            </div>
          </Field>
        )}

        {/* Not on the roll. Coming back is a new spell, not a toggle:
            reusing the old enrolment would leave the renewal date at
            whenever they left, and reminder_queue would greet them with
            "more than 15 days overdue" on their first morning back. */}
        {s && !s.active && !rejoining && (
          <Field label="Status" span>
            <div
              className="row gap-10"
              style={{
                padding: 12,
                borderRadius: 'var(--r-md)',
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                alignItems: 'center',
              }}
            >
              <div className="grow">
                <div style={{ fontSize: '0.86rem', fontWeight: 600 }}>Not training</div>
                <div className="t-mut">
                  {s.spells?.[s.spells.length - 1]?.to
                    ? `Left ${dateLabelFull(s.spells[s.spells.length - 1].to!)}`
                    : 'No longer on the roll'}
                </div>
              </div>
              <button className="btn btn--sm" onClick={() => setPicked(s)}>
                Bring back
              </button>
            </div>
          </Field>
        )}
      </div>
    </Sheet>
  )

  return (
    <>
      {sheet}
      <Confirm
        open={confirmingFee}
        title={feeIsSoon ? 'That first fee is soon' : 'First fee'}
        body={
          firstFee && daysToFee !== null
            ? `${name.trim() || 'This student'}'s first fee is ${dateLabelFull(firstFee)} — ` +
              `${daysToFee} day${daysToFee === 1 ? '' : 's'} after joining, and the first ` +
              `reminder goes out then.` +
              (feeIsSoon ? ' Go back if you would rather move the fee day.' : '')
            : ''
        }
        confirmLabel={rejoining ? 'Bring back' : 'Add student'}
        onConfirm={() => {
          setConfirmingFee(false)
          setConfirmedFee(true)
          void write()
        }}
        onCancel={() => setConfirmingFee(false)}
      />
    </>
  )
}