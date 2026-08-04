import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { ACADEMY } from '../lib/academy'
import {
  EXPENSE_CATEGORIES,
  type BookingMode,
  type RevenueSource,
  type Transaction,
  type TxnType,
} from '../lib/types'
import {
  MAX_AMOUNT,
  currentMonthKey,
  dateLabel,
  hourLabel,
  hourRange,
  inr,
  lastMonths,
  monthLabel,
  monthShort,
  shiftMonth,
  todayISO,
} from '../lib/format'
import {
  collectionRate,
  expenseByCategory,
  moneyByMonth,
  moneyTree,
  monthTotals,
  revenueBySource,
  unpaidMonthsFor,
} from '../lib/selectors'
import { Confirm, Empty, Field, Sheet, Stat } from '../components/ui'
import { BarChart, Legend } from '../components/charts'
import { Breakdown } from '../components/charts/Breakdown'
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronLeft,
  IconChevronRight,
  IconRupee,
  IconTrash,
} from '../components/icons'

type ListFilter = 'all' | 'revenue' | 'expense'

const BOOKING_MODE_LABEL: Record<BookingMode, string> = {
  individual: 'One booking',
  daily: 'Day total',
  monthly: 'Month total',
}

/**
 * The sentence the ledger will print under a revenue row.
 *
 * One function so the form and the record cannot drift: whatever this
 * returns is exactly what is stored and exactly what is shown. A time is
 * only included for a single booking — a day's or a month's takings did
 * not happen at 7:00 PM, and printing one would be a detail the row does
 * not actually know.
 */
function revenueDetail(a: {
  source: RevenueSource
  bookingMode: BookingMode
  court: number
  hour: number
  partner: string
  payout: 'weekly' | 'monthly'
}): string | undefined {
  if (a.source === 'court_booking') {
    const head = `${BOOKING_MODE_LABEL[a.bookingMode]} · Court ${a.court}`
    return a.bookingMode === 'individual' ? `${head} · ${hourLabel(a.hour)}` : head
  }
  if (a.source === 'partner') {
    return `${a.partner} · ${a.payout === 'weekly' ? 'Weekly' : 'Monthly'} payout`
  }
  return undefined
}

export default function Finance() {
  const { data, toast, removeEntry } = useStore()
  const [month, setMonth] = useState(currentMonthKey())
  const [filter, setFilter] = useState<ListFilter>('all')
  const [adding, setAdding] = useState<TxnType | null>(null)
  const [delTxn, setDelTxn] = useState<Transaction | null>(null)
  /* Which month's split is open. A month key, not a boolean — the chart
     shows six and the sheet has to know which was tapped. */
  const [breakdown, setBreakdown] = useState<string | null>(null)

  const months = useMemo(() => lastMonths(6, currentMonthKey()), [])
  const series = useMemo(() => moneyByMonth(data.transactions, months), [data.transactions, months])
  const totals = useMemo(() => monthTotals(data.transactions, month), [data.transactions, month])
  const prev = useMemo(
    () => monthTotals(data.transactions, shiftMonth(month, -1)),
    [data.transactions, month],
  )
  const collection = useMemo(() => collectionRate(data, month), [data, month])

  const tree = useMemo(() => moneyTree(data.transactions, month), [data.transactions, month])

  /* Who paid, and for what. Both come off the row already: `studentId`
     from payments.member_id, `feeKind` from payments.kind. */
  const nameOf = (id?: string) =>
    id ? data.students.find((s) => s.id === id)?.name : undefined

  const titleOf = (t: Transaction) => {
    if (t.source === 'student_fee') return nameOf(t.studentId) ?? 'Student fee'
    /* `category` is the raw payments.type, which is the bare word "Court".
       With the court and time now in the subtitle that read "Court ·
       Court 3 · 7:00 PM". */
    if (t.source === 'court_booking') return 'Court booking'
    if (t.source === 'partner') return 'Partner payout'
    return t.category
  }

  const subtitleOf = (t: Transaction) => {
    // "Court 3 · 7:00 PM", exactly as it was written when recorded.
    if (t.detail) return ` · ${t.detail}`
    if (t.source !== 'student_fee') return ''
    const what =
      t.feeKind === 'admission' ? 'Joining fee'
      : t.feeKind === 'custom' ? 'One-off'
      : 'Renewal'
    // The month it is FOR, which is not always the month it arrived in.
    const forM = t.forMonth && t.forMonth !== t.date.slice(0, 7)
      ? ` for ${monthLabel(t.forMonth)}`
      : ''
    return ` · ${what}${forM}`
  }

  const txns = useMemo(() => {
    return data.transactions
      .filter((t) => t.date.startsWith(month))
      .filter((t) => (filter === 'all' ? true : t.type === filter))
      .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1))
  }, [data.transactions, month, filter])

  const revDelta = prev.revenue > 0 ? ((totals.revenue - prev.revenue) / prev.revenue) * 100 : 0
  const expDelta = prev.expense > 0 ? ((totals.expense - prev.expense) / prev.expense) * 100 : 0

  return (
    <main className="page">
      <div className="page__head">
        <h1 className="t-h1">Finance</h1>
        <p className="t-sub" style={{ marginTop: 3 }}>
          Revenue, expenses and what’s left
        </p>
      </div>

      <div className="row-between" style={{ marginBottom: 14 }}>
        <button
          className="btn btn--ghost btn--icon btn--sm"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          aria-label="Previous month"
        >
          <IconChevronLeft size={17} />
        </button>
        <span style={{ fontWeight: 620, fontSize: '0.95rem' }}>{monthLabel(month)}</span>
        <button
          className="btn btn--ghost btn--icon btn--sm"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          disabled={month >= currentMonthKey()}
          aria-label="Next month"
        >
          <IconChevronRight size={17} />
        </button>
      </div>

      {/* ---------- headline ---------- */}
      <div
        className="card"
        style={{
          marginBottom: 14,
          background:
            totals.net >= 0
              ? 'linear-gradient(155deg, rgba(25,158,112,0.14), rgba(25,158,112,0.03))'
              : 'linear-gradient(155deg, rgba(230,103,103,0.14), rgba(230,103,103,0.03))',
          borderColor: totals.net >= 0 ? 'rgba(25,158,112,0.28)' : 'rgba(230,103,103,0.28)',
        }}
      >
        <div className="t-label">Net this month</div>
        <div
          className="num"
          style={{
            fontSize: '2.15rem',
            fontWeight: 690,
            letterSpacing: '-0.045em',
            marginTop: 6,
            color: totals.net >= 0 ? '#5fd3a5' : '#ff8f8f',
          }}
        >
          {totals.net < 0 ? '−' : ''}
          {inr(Math.abs(totals.net))}
        </div>
        <div className="row gap-14" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          <span className="row gap-4 t-sub">
            <IconArrowUp size={13} style={{ color: 'var(--money-in)' }} />
            In {inr(totals.revenue, { compact: true })}
          </span>
          <span className="row gap-4 t-sub">
            <IconArrowDown size={13} style={{ color: 'var(--money-out)' }} />
            Out {inr(totals.expense, { compact: true })}
          </span>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <Stat
          label="Revenue"
          value={inr(totals.revenue, { compact: true })}
          delta={prev.revenue > 0 ? { value: revDelta } : undefined}
          foot={prev.revenue > 0 ? 'vs last month' : 'this month'}
          accent="var(--money-in)"
        />
        <Stat
          label="Expenses"
          value={inr(totals.expense, { compact: true })}
          delta={prev.expense > 0 ? { value: expDelta, higherIsBetter: false } : undefined}
          foot={prev.expense > 0 ? 'vs last month' : 'this month'}
          accent="var(--money-out)"
        />
        <Stat
          label="Fee collection"
          value={`${collection.rate.toFixed(0)}%`}
          foot={`${collection.paid}/${collection.total} students`}
          accent="var(--series-4)"
        />
        <Stat
          label="Yet to collect"
          value={inr(Math.max(0, collection.expected - collection.collected), { compact: true })}
          foot="from active students"
          accent="var(--warning)"
        />
      </div>

      <div className="row gap-8" style={{ marginBottom: 18 }}>
        <button className="btn btn--primary grow" onClick={() => setAdding('revenue')}>
          <IconArrowUp size={16} /> Add revenue
        </button>
        <button className="btn grow" onClick={() => setAdding('expense')}>
          <IconArrowDown size={16} /> Add expense
        </button>
      </div>

      {/* ---------- charts ---------- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card__head">
          <div>
            <div className="card__title">In vs out</div>
            <div className="card__sub">Last 6 months · tap a month for the split</div>
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
          onSelect={(_label, i) => setBreakdown(series[i].key)}
          /* The legend is rendered below the net row instead, so nothing
             sits between the columns and the figures derived from them. */
          showLegend={false}
        />

        {/* Net, as a figure per month, directly under the two bars it is
            the difference of.

            This replaces a second full "Net trend" card that plotted the
            same six numbers as a line. Two charts of one dataset make the
            reader do the subtraction twice — once by eye against the bars,
            once against a line on a different scale — and neither ever
            says what the number IS. A figure does, in a fraction of the
            height.

            The cells are a 6-column grid inside the same 4px side padding
            the chart uses for its plot area, so each net sits exactly under
            the month it belongs to and needs no label of its own; the
            chart's own axis labels are directly above. Tapping one opens
            the same month breakdown the bars do. */}
        <div className="netrow">
          <div className="netrow__cells">
            {series.map((m) => (
              <button
                key={m.key}
                className="netrow__cell"
                onClick={() => setBreakdown(m.key)}
                aria-label={`${monthLabel(m.key)} net ${m.net < 0 ? 'minus ' : ''}${inr(Math.abs(m.net))}`}
              >
                <span
                  className={`netrow__v${m.net < 0 ? ' is-neg' : m.net > 0 ? ' is-pos' : ''}`}
                >
                  {m.net === 0
                    ? '—'
                    : (m.net < 0 ? '−' : '+') + inr(Math.abs(m.net), { compact: true })}
                </span>
              </button>
            ))}
          </div>
          <div className="netrow__cap">Net each month · tap for the split</div>
        </div>

        <Legend
          items={[
            { label: 'Revenue', color: 'var(--money-in)' },
            { label: 'Expenses', color: 'var(--money-out)' },
          ]}
        />
      </div>

      {/* One card where there were two.

          "Where revenue came from" (a donut of four sources) and "Where
          the money went" (a bar chart of expense categories) answered
          halves of one question and could not be compared, because
          neither ever showed the other side. This shows both, and opens:
          Revenue splits into new admissions, renewals, court bookings
          and memberships; Expense into its categories; and a long tail
          folds into a group you can open again.

          The joining-vs-renewal split is `payments.kind`, recorded by
          record_fee_payment when the money was taken — not guessed here
          from how new the student is. */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card__head">
          <div>
            <div className="card__title">Where the money went</div>
            <div className="card__sub">{monthLabel(month)} · tap a group to open it</div>
          </div>
        </div>
        <Breakdown data={tree} format={(n) => inr(n)} />
      </div>

      {/* ---------- ledger ---------- */}
      <div className="section__head" style={{ marginTop: 22 }}>
        <h2 className="t-h2">Transactions</h2>
        <div className="seg">
          {(['all', 'revenue', 'expense'] as ListFilter[]).map((f) => (
            <button
              key={f}
              className={`seg__item${filter === f ? ' seg__item--on' : ''}`}
              style={{ padding: '6px 10px', fontSize: '0.76rem', minHeight: 32 }}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'revenue' ? 'In' : 'Out'}
            </button>
          ))}
        </div>
      </div>

      {txns.length === 0 ? (
        <Empty
          icon={<IconRupee size={22} />}
          title="Nothing recorded"
          text={`No ${filter === 'all' ? 'transactions' : filter === 'revenue' ? 'revenue' : 'expenses'} in ${monthLabel(month)}.`}
        />
      ) : (
        <div className="list">
          {txns.map((t) => {
            const income = t.type === 'revenue'
            return (
              <div className="listrow" key={t.id}>
                <span
                  className="avatar avatar--sm"
                  style={{
                    background: income ? 'rgba(25,158,112,0.14)' : 'rgba(230,103,103,0.13)',
                    color: income ? '#5fd3a5' : '#ff8f8f',
                    border: `1px solid ${income ? 'rgba(25,158,112,0.3)' : 'rgba(230,103,103,0.3)'}`,
                  }}
                >
                  {income ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />}
                </span>
                <div className="listrow__main">
                  {/* A fee is somebody's fee. The row used to say
                      "Coaching" for all of them, which told the owner
                      the least useful true thing available — the name
                      and whether it was a joining fee or a renewal were
                      both already on the row, unread. */}
                  <div className="listrow__title">{titleOf(t)}</div>
                  <div className="listrow__meta">
                    {dateLabel(t.date)}
                    {subtitleOf(t)}
                    {t.source === 'court_booking' && t.bookingMode
                      ? ` · ${t.bookingMode === 'daily' ? 'day total' : t.bookingMode === 'monthly' ? 'month total' : 'single booking'}`
                      : ''}
                    {t.note ? ` · ${t.note}` : ''}
                  </div>
                </div>
                <div className="listrow__end">
                  <span
                    className="num"
                    style={{ fontWeight: 650, color: income ? '#5fd3a5' : '#ff8f8f' }}
                  >
                    {income ? '+' : '−'}
                    {inr(t.amount)}
                  </span>
                  <button
                    className="btn btn--ghost btn--icon btn--sm"
                    onClick={() => setDelTxn(t)}
                    aria-label="Delete transaction"
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* The split behind one bar.

          The chart answers "how much" and the tooltip repeats it. The
          question underneath — what is that made of — needed room, so it
          gets a sheet: every revenue source and every expense category
          for that month, with the net at the top. Reuses the same
          selectors the month view already uses, so a figure here can
          never disagree with the one above it. */}
      <Sheet
        open={breakdown !== null}
        onClose={() => setBreakdown(null)}
        title={breakdown ? monthLabel(breakdown) : ''}
        subtitle="Where the money came from and went"
      >
        {breakdown && (() => {
          const t = monthTotals(data.transactions, breakdown)
          const rev = revenueBySource(data.transactions, breakdown)
          const exp = expenseByCategory(data.transactions, breakdown)
          const row = (label: string, value: number, total: number, color: string) => (
            <div className="split__row" key={label}>
              <div className="split__head">
                <span className="split__label">{label}</span>
                <span className="split__value num">{inr(value)}</span>
              </div>
              <div className="split__track">
                <span
                  className="split__fill"
                  style={{ width: `${total > 0 ? (value / total) * 100 : 0}%`, background: color }}
                />
              </div>
              <span className="split__pct">
                {total > 0 ? `${Math.round((value / total) * 100)}%` : '—'}
              </span>
            </div>
          )
          return (
            <div className="split">
              <div className="split__net">
                <span className="t-label">Net</span>
                <span
                  className="num"
                  style={{
                    fontSize: '1.6rem', fontWeight: 690, letterSpacing: '-0.03em',
                    color: t.net >= 0 ? '#5fd3a5' : '#ff8f8f',
                  }}
                >
                  {t.net < 0 ? '−' : ''}{inr(Math.abs(t.net))}
                </span>
              </div>

              <div className="split__group">
                <div className="split__title">
                  <IconArrowUp size={14} style={{ color: 'var(--money-in)' }} />
                  In · {inr(t.revenue)}
                </div>
                {rev.length === 0
                  ? <p className="t-mut">Nothing came in this month.</p>
                  : rev.map((r) => row(r.label, r.value, t.revenue, 'var(--money-in)'))}
              </div>

              <div className="split__group">
                <div className="split__title">
                  <IconArrowDown size={14} style={{ color: 'var(--money-out)' }} />
                  Out · {inr(t.expense)}
                </div>
                {exp.length === 0
                  ? <p className="t-mut">Nothing went out this month.</p>
                  : exp.map((e) => row(e.label, e.value, t.expense, 'var(--money-out)'))}
              </div>
            </div>
          )
        })()}
      </Sheet>

      <TxnSheet type={adding} month={month} onClose={() => setAdding(null)} />

      <Confirm
        open={delTxn !== null}
        title="Delete this entry?"
        body={
          delTxn
            ? `${delTxn.category} · ${inr(delTxn.amount)} on ${dateLabel(delTxn.date)}. This cannot be undone.`
            : ''
        }
        onCancel={() => setDelTxn(null)}
        onConfirm={() => {
          const id = delTxn!.id
          /* Payments are voided, not deleted: the money moved, and the
             record of it moving is what makes a correction auditable.
             Expenses have no such history, so they go. */
          void removeEntry(
            id.startsWith('pay_')
              ? { kind: 'payment', id: Number(id.slice(4)) }
              : { kind: 'expense', id: Number(id.slice(4)) },
          ).then((r) => {
            if (!r.ok) toast(r.message, 'bad')
          })
          toast('Entry deleted.')
          setDelTxn(null)
        }}
      />
    </main>
  )
}

/* ------------------------------------------------------------------
   Add revenue / expense
   ------------------------------------------------------------------ */

function TxnSheet({
  type,
  month,
  onClose,
}: {
  type: TxnType | null
  month: string
  onClose: () => void
}) {
  const { data, toast, addRevenue, addExpense, recordFee } = useStore()
  const [tab, setTab] = useState<TxnType>('revenue')
  const [source, setSource] = useState<RevenueSource>('court_booking')
  const [court, setCourt] = useState(1)
  const [hour, setHour] = useState(18)
  const [bookingMode, setBookingMode] = useState<BookingMode>('individual')
  const [partner, setPartner] = useState<string>(ACADEMY.partners[0])
  const [payout, setPayout] = useState<'weekly' | 'monthly'>('weekly')
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0])
  const [studentId, setStudentId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [key, setKey] = useState<string | null>(null)

  const openKey = type === null ? null : `${type}:${month}`
  if (openKey !== key) {
    setKey(openKey)
    if (type) {
      setTab(type)
      setAmount('')
      setNote('')
      // Default the date into the month being viewed.
      const today = todayISO()
      setDate(today.startsWith(month) ? today : `${month}-01`)
    }
  }

  const activeStudents = data.students.filter((s) => s.active)
  const chosenStudent = activeStudents.find((s) => s.id === studentId)
  const owedMonths = chosenStudent ? unpaidMonthsFor(data, chosenStudent) : []
  /* Offer every month in the arrears window so a mistake can be corrected,
     but mark which are actually outstanding. */

  const save = async () => {
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      toast('Enter an amount greater than zero.', 'bad')
      return
    }
    if (amt > MAX_AMOUNT) {
      toast('That amount looks too large — check the digits.', 'bad')
      return
    }
    /* A student's fee goes through record_fee_payment, which is the one
       write path for fees: it sets the period the money covers, rolls
       the renewal forward and closes the reminder. Everything else is
       plain revenue or an expense. */
    let r: { ok: boolean; message: string }
    if (tab === 'revenue') {
      if (source === 'student_fee') {
        const student = data.students.find((s) => s.id === studentId)
        if (!student?.enrollmentId) {
          toast('Pick a student who is enrolled in the database.', 'bad')
          return
        }
        r = await recordFee({ enrollmentId: student.enrollmentId, amount: amt, onDate: date, note: note.trim() || undefined })
      } else {
        r = await addRevenue({
          label:
            source === 'court_booking' ? 'Court Booking'
              : source === 'partner' ? `${partner} payout`
                : 'Other income',
          amount: amt,
          onDate: date,
          kind:
            source === 'court_booking' ? 'Court'
              : source === 'partner' ? 'Partner'
                : 'Coaching',
          /* Written as the sentence it will be read as, and stored in
             payments.detail — the column the seeded court rows already
             use for exactly this. Never parsed back apart: the ledger
             prints it verbatim, so there is no format to break. */
          detail: revenueDetail({ source, bookingMode, court, hour, partner, payout }),
          note: note.trim() || undefined,
        })
      }
    } else {
      r = await addExpense({ category, amount: amt, onDate: date, note: note.trim() || undefined })
    }
    if (!r.ok) {
      toast(r.message, 'bad')
      return
    }
    toast(tab === 'revenue' ? 'Revenue added.' : 'Expense added.')
    onClose()
  }

  return (
    <Sheet
      open={type !== null}
      onClose={onClose}
      title={tab === 'revenue' ? 'Add revenue' : 'Add expense'}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save}>
            Add
          </button>
        </>
      }
    >
      <div className="seg" style={{ width: '100%', marginBottom: 16 }}>
        <button
          className={`seg__item grow${tab === 'revenue' ? ' seg__item--on' : ''}`}
          onClick={() => setTab('revenue')}
        >
          Money in
        </button>
        <button
          className={`seg__item grow${tab === 'expense' ? ' seg__item--on' : ''}`}
          onClick={() => setTab('expense')}
        >
          Money out
        </button>
      </div>

      <div className="form-grid">
        {tab === 'revenue' ? (
          <>
            {/* Two sources, not four.

                A student's fee is not added here any more. It has its own
                path — the reminder, or the student's own screen — which
                goes through record_fee_payment and therefore rolls the
                renewal forward and closes the reminder. The copy on this
                sheet did call recordFee, but it was a second door into
                the money that looked like plain data entry, and
                Membership was a source nothing at Pride sells. */}
            <Field label="Source" span>
              <select
                className="select"
                value={source}
                onChange={(e) => setSource(e.target.value as RevenueSource)}
              >
                <option value="court_booking">Court booking</option>
                <option value="partner">Partner app (Playo, Hudle…)</option>
                <option value="other">Other</option>
              </select>
            </Field>

            {source === 'court_booking' && (
              <>
                {/* This control is back, and this time it is recorded.
                    It previously set `bookingMode` and save() never read
                    it — a control that looked like it changed the record
                    and did not. It now goes into the detail line. */}
                <Field label="Booking entry" span>
                  <div className="seg" style={{ width: '100%' }}>
                    {(
                      [
                        ['individual', 'Single'],
                        ['daily', 'Per day'],
                        ['monthly', 'Per month'],
                      ] as Array<[BookingMode, string]>
                    ).map(([m, label]) => (
                      <button
                        key={m}
                        type="button"
                        className={`seg__item grow${bookingMode === m ? ' seg__item--on' : ''}`}
                        onClick={() => setBookingMode(m)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Court">
                  <select
                    className="select"
                    value={court}
                    onChange={(e) => setCourt(Number(e.target.value))}
                  >
                    {Array.from({ length: ACADEMY.courtCount }, (_, i) => i + 1).map((c) => (
                      <option key={c} value={c}>
                        Court {c}
                      </option>
                    ))}
                  </select>
                </Field>

                {/* A day's or a month's takings did not happen at one
                    o'clock, so the field is not offered for them. */}
                {bookingMode === 'individual' && (
                  <Field label="Time">
                    <select
                      className="select"
                      value={hour}
                      onChange={(e) => setHour(Number(e.target.value))}
                    >
                      {hourRange(ACADEMY.bookingHours.from, ACADEMY.bookingHours.to).map((h) => (
                        <option key={h} value={h}>
                          {hourLabel(h)}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </>
            )}

            {source === 'partner' && (
              <>
                {/* Playo and Hudle settle in a lump on their own cycle, so
                    the date on this sheet is the day the payout landed —
                    not the day any one court was booked. Which is why this
                    is a separate source and not a kind of court booking. */}
                <Field label="App">
                  <select
                    className="select"
                    value={partner}
                    onChange={(e) => setPartner(e.target.value)}
                  >
                    {ACADEMY.partners.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Payout">
                  <select
                    className="select"
                    value={payout}
                    onChange={(e) => setPayout(e.target.value as 'weekly' | 'monthly')}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </Field>
              </>
            )}

            {source === 'student_fee' && (
              <>
                <Field
                  label="Student"
                  hint={
                    owedMonths.length > 1
                      ? `Goes against the oldest of ${owedMonths.length} unpaid months.`
                      : 'Clears that month from their dues.'
                  }
                  span
                >
                  <select
                    className="select"
                    value={studentId}
                    onChange={(e) => {
                      const id = e.target.value
                      setStudentId(id)
                      const s = activeStudents.find((x) => x.id === id)
                      if (s && !amount) setAmount(String(s.monthlyFee))
                    }}
                  >
                    <option value="">— not linked to a student —</option>
                    {activeStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>

                {/* There was a "Fee for" month picker here. It was read by
                    nothing: `save()` calls recordFee, which calls
                    record_fee_payment, which takes a COUNT of months and
                    derives the period from renewal_on — there is no "which
                    month" parameter, deliberately, because
                    apply_payment_coverage() owns coverage.

                    So the owner chose "June — unpaid", the money landed
                    wherever the server put it, and the two agreed only by
                    coincidence. A control that decides nothing while
                    looking like it decides something is worse than no
                    control: it is the fee arithmetic moving back into the
                    client, badly. The arrears count moved into the hint
                    above, which is the part that was true. */}
              </>
            )}
          </>
        ) : (
          <Field label="Category" span>
            <select
              className="select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Amount (₹)">
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            autoFocus
          />
        </Field>

        <Field label="Date">
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>

        <Field label="Note" hint="Optional." span>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              tab === 'revenue' ? '6 hours of court time' : 'New shuttles — 10 boxes'
            }
            autoComplete="off"
          />
        </Field>
      </div>
    </Sheet>
  )
}
