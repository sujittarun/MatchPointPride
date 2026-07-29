import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
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
  inr,
  lastMonths,
  monthLabel,
  monthShort,
  shiftMonth,
  todayISO,
  uid,
} from '../lib/format'
import {
  ARREARS_MONTHS,
  collectionRate,
  expenseByCategory,
  moneyByMonth,
  monthTotals,
  revenueBySource,
  unpaidMonthsFor,
} from '../lib/selectors'
import { Confirm, Empty, Field, Sheet, Stat } from '../components/ui'
import { BarChart, Donut, HBarChart, TrendChart, seriesColor } from '../components/charts'
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronLeft,
  IconChevronRight,
  IconRupee,
  IconTrash,
} from '../components/icons'

type ListFilter = 'all' | 'revenue' | 'expense'

const SOURCE_LABEL: Record<RevenueSource, string> = {
  student_fee: 'Student fee',
  court_booking: 'Court booking',
  membership: 'Membership',
  other: 'Other',
}

export default function Finance() {
  const { data, update, toast } = useStore()
  const [month, setMonth] = useState(currentMonthKey())
  const [filter, setFilter] = useState<ListFilter>('all')
  const [adding, setAdding] = useState<TxnType | null>(null)
  const [delTxn, setDelTxn] = useState<Transaction | null>(null)

  const months = useMemo(() => lastMonths(6, currentMonthKey()), [])
  const series = useMemo(() => moneyByMonth(data.transactions, months), [data.transactions, months])
  const totals = useMemo(() => monthTotals(data.transactions, month), [data.transactions, month])
  const prev = useMemo(
    () => monthTotals(data.transactions, shiftMonth(month, -1)),
    [data.transactions, month],
  )
  const collection = useMemo(() => collectionRate(data, month), [data, month])

  const bySource = useMemo(
    () => revenueBySource(data.transactions, month),
    [data.transactions, month],
  )
  const byCategory = useMemo(
    () => expenseByCategory(data.transactions, month),
    [data.transactions, month],
  )

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
            <div className="card__sub">Last 6 months</div>
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

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card__head">
          <div>
            <div className="card__title">Net trend</div>
            <div className="card__sub">Revenue minus expenses, last 6 months</div>
          </div>
        </div>
        <TrendChart
          data={series.map((m) => ({ label: monthShort(m.key), value: m.net }))}
          format={(n) => (n < 0 ? `−${inr(Math.abs(n))}` : inr(n))}
          color="var(--brand)"
          allowNegative
        />
      </div>

      {bySource.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card__head">
            <div>
              <div className="card__title">Where revenue came from</div>
              <div className="card__sub">{monthLabel(month)}</div>
            </div>
          </div>
          <Donut
            data={bySource}
            format={(n) => inr(n)}
            centerValue={inr(totals.revenue, { compact: true })}
            centerLabel="Revenue"
          />
        </div>
      )}

      {byCategory.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card__head">
            <div>
              <div className="card__title">Where the money went</div>
              <div className="card__sub">{monthLabel(month)} · {byCategory.length} categories</div>
            </div>
          </div>
          <HBarChart
            data={byCategory.map((c, i) => ({ ...c, color: seriesColor(i + 1) }))}
            format={(n) => inr(n, { compact: true })}
          />
        </div>
      )}

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
                  <div className="listrow__title">{t.category}</div>
                  <div className="listrow__meta">
                    {dateLabel(t.date)}
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
          update((d) => {
            d.transactions = d.transactions.filter((t) => t.id !== id)
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
  const { data, update, toast } = useStore()
  const [tab, setTab] = useState<TxnType>('revenue')
  const [source, setSource] = useState<RevenueSource>('court_booking')
  const [bookingMode, setBookingMode] = useState<BookingMode>('daily')
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0])
  const [studentId, setStudentId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [forMonth, setForMonth] = useState(currentMonthKey())
  const [key, setKey] = useState<string | null>(null)

  const openKey = type === null ? null : `${type}:${month}`
  if (openKey !== key) {
    setKey(openKey)
    if (type) {
      setTab(type)
      setAmount('')
      setNote('')
      setForMonth(currentMonthKey())
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
  const monthChoices = lastMonths(ARREARS_MONTHS)

  const save = () => {
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      toast('Enter an amount greater than zero.', 'bad')
      return
    }
    if (amt > MAX_AMOUNT) {
      toast('That amount looks too large — check the digits.', 'bad')
      return
    }
    update((d) => {
      if (tab === 'revenue') {
        const student = source === 'student_fee' ? d.students.find((s) => s.id === studentId) : undefined
        d.transactions.unshift({
          id: uid('txn'),
          type: 'revenue',
          date,
          amount: amt,
          category:
            source === 'student_fee'
              ? 'Student Fee'
              : source === 'court_booking'
                ? 'Court Booking'
                : source === 'membership'
                  ? 'Membership'
                  : 'Other Income',
          source,
          forMonth: source === 'student_fee' ? forMonth : undefined,
          bookingMode: source === 'court_booking' ? bookingMode : undefined,
          studentId: student?.id,
          batchId: student?.batchId,
          note: note.trim() || undefined,
          createdAt: new Date().toISOString(),
        })
      } else {
        d.transactions.unshift({
          id: uid('txn'),
          type: 'expense',
          date,
          amount: amt,
          category,
          note: note.trim() || undefined,
          createdAt: new Date().toISOString(),
        })
      }
    })
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
            <Field label="Source" span>
              <select
                className="select"
                value={source}
                onChange={(e) => setSource(e.target.value as RevenueSource)}
              >
                {(Object.keys(SOURCE_LABEL) as RevenueSource[]).map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>

            {source === 'court_booking' && (
              <Field
                label="Booking entry"
                hint="Log one booking, a day’s total, or a whole month in one go."
                span
              >
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
            )}

            {source === 'student_fee' && (
              <>
                <Field label="Student" hint="Clears that month from their dues." span>
                  <select
                    className="select"
                    value={studentId}
                    onChange={(e) => {
                      const id = e.target.value
                      setStudentId(id)
                      const s = activeStudents.find((x) => x.id === id)
                      if (s && !amount) setAmount(String(s.monthlyFee))
                      // Default to the oldest month they still owe.
                      const owed = s ? unpaidMonthsFor(data, s) : []
                      setForMonth(owed[0] ?? currentMonthKey())
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

                {chosenStudent && (
                  <Field
                    label="Fee for"
                    hint={
                      owedMonths.length > 1
                        ? `${chosenStudent.name} owes ${owedMonths.length} months.`
                        : undefined
                    }
                    span
                  >
                    <select
                      className="select"
                      value={forMonth}
                      onChange={(e) => setForMonth(e.target.value)}
                    >
                      {monthChoices.map((m) => (
                        <option key={m} value={m}>
                          {monthLabel(m)}
                          {owedMonths.includes(m) ? ' — unpaid' : ' — already paid'}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
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
