import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import type { Reminder, ReminderChannel, ReminderStatus } from '../lib/types'
import {
  dateLabelFull,
  dueLabel,
  inr,
  initials,
  monthShort,
  todayISO,
  uid,
} from '../lib/format'
import {
  batchById,
  monthsPhrase,
  reminderActivity,
  reminderStats,
  renderReminderMessage,
  smsLink,
  studentById,
  whatsappLink,
} from '../lib/selectors'
import { Confirm, Empty, Field, Sheet, Stat } from '../components/ui'
import { ACADEMY } from '../lib/academy'
import { ConfirmPayment, ProofImage } from '../components/ConfirmPayment'
import { BarChart } from '../components/charts'
import {
  IconAlert,
  IconBell,
  IconCheck,
  IconClock,
  IconPhone,
  IconPlus,
  IconTrash,
  IconWhatsApp,
  IconX,
} from '../components/icons'

type Filter = 'due' | 'pending' | 'sent' | 'paid' | 'all'

const STATUS_BADGE: Record<ReminderStatus, string> = {
  pending: 'badge--warn',
  sent: 'badge--info',
  paid: 'badge--good',
  cancelled: 'badge--mute',
}

const STATUS_LABEL: Record<ReminderStatus, string> = {
  pending: 'Not sent',
  sent: 'Sent',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

export default function Reminders() {
  const { data } = useStore()
  const [filter, setFilter] = useState<Filter>('due')
  const [open, setOpen] = useState<Reminder | null>(null)
  const [creating, setCreating] = useState(false)

  const stats = useMemo(() => reminderStats(data), [data])
  const activity = useMemo(() => reminderActivity(data, 6), [data])
  const today = todayISO()

  const list = useMemo(() => {
    const all = [...data.reminders].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
    switch (filter) {
      case 'due':
        return all.filter(
          (r) => (r.status === 'pending' || r.status === 'sent') && r.dueDate <= today,
        )
      case 'pending':
        return all.filter((r) => r.status === 'pending')
      case 'sent':
        return all.filter((r) => r.status === 'sent')
      case 'paid':
        return all.filter((r) => r.status === 'paid').reverse()
      default:
        return all
    }
  }, [data.reminders, filter, today])

  return (
    <main className="page">
      <div className="page__head">
        <h1 className="t-h1">Reminders</h1>
        <p className="t-sub" style={{ marginTop: 3 }}>
          {stats.pending + stats.sent} open · {inr(stats.outstanding, { compact: true })} outstanding
        </p>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <Stat
          label="Outstanding"
          value={inr(stats.outstanding, { compact: true })}
          foot={`${stats.pending + stats.sent} reminders`}
          accent="var(--money-out)"
        />
        <Stat
          label="Not sent yet"
          value={String(stats.pending)}
          foot="waiting on you"
          accent="var(--warning)"
        />
        <Stat
          label="Response rate"
          value={`${stats.responseRate.toFixed(0)}%`}
          foot="sent → paid"
          accent="var(--good)"
        />
        <Stat
          label="Total sends"
          value={String(stats.totalSends)}
          foot="all time"
          accent="var(--series-1)"
        />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card__head">
          <div>
            <div className="card__title">Reminder tracking</div>
            <div className="card__sub">Sent vs. paid, last 6 months</div>
          </div>
        </div>
        {activity.some((a) => a.sent > 0 || a.paid > 0) ? (
          <BarChart
            data={activity.map((a) => ({ label: monthShort(a.key), sent: a.sent, paid: a.paid }))}
            series={[
              { key: 'sent', label: 'Sent', color: 'var(--series-1)' },
              { key: 'paid', label: 'Paid after reminder', color: 'var(--series-3)' },
            ]}
            format={(n) => `${n}`}
          />
        ) : (
          <p className="t-mut" style={{ padding: '18px 0', textAlign: 'center' }}>
            Nothing sent yet. Once you start sending reminders, this chart tracks how many go
            out each month and how many end in payment.
          </p>
        )}
      </div>

      <p className="t-mut" style={{ marginBottom: 12, lineHeight: 1.5 }}>
        This list keeps itself up to date from the payment record. Nothing is sent
        automatically — you send each one.
      </p>

      <button
        className="btn btn--block"
        style={{ marginBottom: 14 }}
        onClick={() => setCreating(true)}
      >
        <IconPlus size={17} /> One-off reminder
      </button>

      <div className="chiprow" style={{ marginBottom: 14 }}>
        {(
          [
            ['due', `Due now (${list.length && filter === 'due' ? list.length : data.reminders.filter((r) => (r.status === 'pending' || r.status === 'sent') && r.dueDate <= today).length})`],
            ['pending', `Not sent (${stats.pending})`],
            ['sent', `Sent (${stats.sent})`],
            ['paid', `Paid (${stats.paid})`],
            ['all', `All (${stats.total})`],
          ] as Array<[Filter, string]>
        ).map(([k, label]) => (
          <button
            key={k}
            className={`chip${filter === k ? ' chip--on' : ''}`}
            onClick={() => setFilter(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Empty
          icon={<IconBell size={22} />}
          title={filter === 'due' ? 'Nothing due' : 'Nothing here'}
          text={
            filter === 'due'
              ? 'Nobody owes anything right now. Unpaid fees appear here on their own.'
              : 'Try another filter.'
          }
        />
      ) : (
        <div className="list">
          {list.map((r) => (
            <ReminderRow key={r.id} reminder={r} onOpen={() => setOpen(r)} />
          ))}
        </div>
      )}

      <ReminderDetail reminder={open} onClose={() => setOpen(null)} />
      <NewReminderSheet open={creating} onClose={() => setCreating(false)} />
    </main>
  )
}

/* ------------------------------------------------------------------
   Row
   ------------------------------------------------------------------ */

function ReminderRow({ reminder, onOpen }: { reminder: Reminder; onOpen: () => void }) {
  const { data } = useStore()
  const student = studentById(data, reminder.studentId)
  const batch = batchById(data, student?.batchId)
  const today = todayISO()
  const overdue = reminder.dueDate < today && (reminder.status === 'pending' || reminder.status === 'sent')

  return (
    <button className="listrow tap" onClick={onOpen} style={{ cursor: 'pointer' }}>
      <div
        className="avatar"
        style={{
          background: overdue ? 'rgba(208,59,59,0.14)' : 'rgba(255,255,255,0.05)',
          color: overdue ? '#ff8f8f' : 'var(--ink-secondary)',
          border: `1px solid ${overdue ? 'rgba(208,59,59,0.3)' : 'var(--line)'}`,
        }}
      >
        {initials(student?.name ?? '?')}
      </div>
      <div className="listrow__main">
        <div className="listrow__title">{student?.name ?? 'Unknown student'}</div>
        <div className="listrow__meta">
          {(reminder.months?.length ?? 0) > 1
            ? `${reminder.months!.length} months · ${monthsPhrase(reminder.months)}`
            : `${batch?.name ?? '—'} · ${overdue ? dueLabel(reminder.dueDate) : dateLabelFull(reminder.dueDate)}`}
        </div>
      </div>
      <div className="listrow__end">
        {reminder.amount ? (
          <span className="num" style={{ fontWeight: 640, fontSize: '0.88rem' }}>
            {inr(reminder.amount)}
          </span>
        ) : null}
        {reminder.awaitingProof ? (
          <span className="badge badge--warn">Awaiting proof</span>
        ) : (
          <span className={`badge ${overdue && reminder.status !== 'paid' ? 'badge--crit' : STATUS_BADGE[reminder.status]}`}>
            {overdue && reminder.status !== 'paid' ? 'Overdue' : STATUS_LABEL[reminder.status]}
            {reminder.sendCount > 1 ? ` ×${reminder.sendCount}` : ''}
          </span>
        )}
      </div>
    </button>
  )
}

/* ------------------------------------------------------------------
   Detail + send
   ------------------------------------------------------------------ */

function ReminderDetail({ reminder, onClose }: { reminder: Reminder | null; onClose: () => void }) {
  const { data, update, toast } = useStore()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirming, setConfirming] = useState(false)

  if (!reminder) return null
  const live = data.reminders.find((r) => r.id === reminder.id) ?? reminder
  const student = studentById(data, live.studentId)
  const batch = batchById(data, student?.batchId)
  const message = renderReminderMessage(data, live)

  const logSend = (channel: ReminderChannel) => {
    update((d) => {
      const r = d.reminders.find((x) => x.id === live.id)
      if (!r) return
      const first = r.sendCount === 0
      r.sendCount += 1
      r.lastSentAt = new Date().toISOString()
      if (r.status === 'pending') r.status = 'sent'
      r.history.push({
        at: new Date().toISOString(),
        action: first ? 'sent' : 'resent',
        channel,
      })
    })
    toast(`Logged as sent on ${channel === 'whatsapp' ? 'WhatsApp' : channel === 'sms' ? 'SMS' : 'call'}.`)
  }

  const send = (channel: ReminderChannel) => {
    if (!student?.phone) {
      toast('This student has no phone number.', 'bad')
      return
    }
    if (channel === 'whatsapp') {
      window.open(whatsappLink(ACADEMY.countryCode, student.phone, message), '_blank', 'noopener')
    } else if (channel === 'sms') {
      window.location.href = smsLink(student.phone, message)
    } else {
      window.location.href = `tel:${student.phone}`
    }
    logSend(channel)
  }

  const reopen = () => {
    update((d) => {
      const r = d.reminders.find((x) => x.id === live.id)
      if (!r) return
      r.status = r.sendCount > 0 ? 'sent' : 'pending'
      r.history.push({ at: new Date().toISOString(), action: 'reopened' })
    })
    toast('Reminder reopened.')
  }

  const closed = live.status === 'paid' || live.status === 'cancelled'

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={student?.name ?? 'Reminder'}
        subtitle={`${batch?.name ?? '—'} · ${dueLabel(live.dueDate)}`}
        footer={
          closed ? (
            <>
              <button className="btn" onClick={reopen}>
                Reopen
              </button>
              <button className="btn btn--danger" onClick={() => setConfirmDelete(true)}>
                <IconTrash size={15} /> Delete
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => setConfirming(true)}>
                <IconCheck size={16} /> Record payment
              </button>
              <button
                className="btn btn--primary"
                onClick={() => send('whatsapp')}
                disabled={!student?.phone}
              >
                <IconWhatsApp size={16} />
                {live.sendCount > 0 ? 'Send again' : 'Send'}
              </button>
            </>
          )
        }
      >
        <div className="grid grid-2" style={{ marginBottom: 16 }}>
          <Stat
            label={live.months && live.months.length > 1 ? `${live.months.length} months owed` : 'Amount'}
            value={live.amount ? inr(live.amount) : '—'}
            foot={live.months?.length ? monthsPhrase(live.months) : live.title}
            accent={live.months && live.months.length > 1 ? 'var(--critical)' : 'var(--money-in)'}
          />
          <Stat
            label="Times sent"
            value={String(live.sendCount)}
            foot={live.lastSentAt ? `last ${dateLabelFull(live.lastSentAt.slice(0, 10))}` : 'not yet sent'}
            accent="var(--series-1)"
          />
        </div>

        {live.awaitingProof && (
          <div
            className="row gap-10"
            style={{
              padding: 12,
              borderRadius: 'var(--r-md)',
              background: 'rgba(250,178,25,0.08)',
              border: '1px solid rgba(250,178,25,0.24)',
              alignItems: 'flex-start',
              marginBottom: 14,
            }}
          >
            <IconAlert size={17} style={{ color: '#ffd166', flexShrink: 0, marginTop: 1 }} />
            <div className="grow">
              <div style={{ fontSize: '0.86rem', fontWeight: 600 }}>Waiting on a screenshot</div>
              <p className="t-mut" style={{ lineHeight: 1.5, marginTop: 3 }}>
                The parent says this is paid. Call them back or check the bank statement
                before confirming it.
              </p>
              {student?.phone && (
                <a
                  className="btn btn--sm"
                  style={{ marginTop: 9 }}
                  href={`tel:${student.phone}`}
                >
                  <IconPhone size={14} /> Call back
                </a>
              )}
            </div>
          </div>
        )}

        {live.proofImageId && (
          <div className="card card--tight" style={{ marginBottom: 14 }}>
            <div className="t-label" style={{ marginBottom: 8 }}>
              Payment screenshot
            </div>
            <ProofImage id={live.proofImageId} height={190} />
          </div>
        )}

        <div className="card card--tight" style={{ marginBottom: 14 }}>
          <div className="t-label" style={{ marginBottom: 7 }}>
            Message preview
          </div>
          <p className="t-sub" style={{ lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
            {message}
          </p>
        </div>

        {!closed && (
          <div className="row gap-8" style={{ marginBottom: 16 }}>
            <button
              className="btn btn--sm grow"
              onClick={() => send('sms')}
              disabled={!student?.phone}
            >
              SMS
            </button>
            <button
              className="btn btn--sm grow"
              onClick={() => send('call')}
              disabled={!student?.phone}
            >
              <IconPhone size={14} /> Call
            </button>
            <button
              className="btn btn--sm grow"
              onClick={() => {
                update((d) => {
                  const r = d.reminders.find((x) => x.id === live.id)
                  if (!r) return
                  r.status = 'cancelled'
                  r.history.push({ at: new Date().toISOString(), action: 'cancelled' })
                })
                toast('Reminder cancelled.')
                onClose()
              }}
            >
              <IconX size={14} /> Cancel
            </button>
          </div>
        )}

        <div className="t-label" style={{ marginBottom: 9 }}>
          History
        </div>
        <div className="col gap-10">
          {[...live.history].reverse().map((h, i) => (
            <div className="row gap-10" key={i} style={{ alignItems: 'flex-start' }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 99,
                  marginTop: 6,
                  flexShrink: 0,
                  background:
                    h.action === 'paid'
                      ? 'var(--good)'
                      : h.action === 'cancelled'
                        ? 'var(--ink-muted)'
                        : h.action === 'created'
                          ? 'var(--series-6)'
                          : 'var(--series-1)',
                }}
              />
              <div className="grow">
                <div style={{ fontSize: '0.845rem', fontWeight: 550, textTransform: 'capitalize' }}>
                  {h.action}
                  {h.channel ? ` · ${h.channel === 'whatsapp' ? 'WhatsApp' : h.channel.toUpperCase()}` : ''}
                </div>
                <div className="t-mut row gap-4">
                  <IconClock size={11} />
                  {new Date(h.at).toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </div>
                {h.note && <div className="t-mut">{h.note}</div>}
                {h.imageId && (
                  <div style={{ marginTop: 8, maxWidth: 220 }}>
                    <ProofImage id={h.imageId} height={130} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Sheet>

      <ConfirmPayment
        reminder={confirming ? live : null}
        onClose={() => {
          setConfirming(false)
          onClose()
        }}
      />

      <Confirm
        open={confirmDelete}
        title="Delete this reminder?"
        body="The reminder and its history are removed. Any payment already recorded stays in Finance."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          update((d) => {
            d.reminders = d.reminders.filter((r) => r.id !== live.id)
          })
          toast('Reminder deleted.')
          setConfirmDelete(false)
          onClose()
        }}
      />
    </>
  )
}

/* ------------------------------------------------------------------
   New one-off reminder
   ------------------------------------------------------------------ */

function NewReminderSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, toast } = useStore()
  const active = data.students.filter((s) => s.active)
  const [studentId, setStudentId] = useState('')
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [due, setDue] = useState(todayISO())
  const [message, setMessage] = useState('')

  const chosen = studentById(data, studentId || active[0]?.id)

  const save = () => {
    const sid = studentId || active[0]?.id
    if (!sid) {
      toast('Add a student first.', 'bad')
      return
    }
    const now = new Date().toISOString()
    update((d) => {
      d.reminders.push({
        id: uid('rem'),
        studentId: sid,
        kind: 'custom',
        title: title.trim() || 'Reminder',
        message: message.trim(),
        dueDate: due,
        amount: Number(amount) || undefined,
        status: 'pending',
        createdAt: now,
        sendCount: 0,
        history: [{ at: now, action: 'created' }],
      })
    })
    toast('Reminder created.')
    setTitle('')
    setAmount('')
    setMessage('')
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New reminder"
      subtitle="One-off — fee, renewal or anything else"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save}>
            Create
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Student" span>
          <select
            className="select"
            value={studentId || active[0]?.id || ''}
            onChange={(e) => setStudentId(e.target.value)}
          >
            {active.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="What for" span>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tournament fee"
            autoComplete="off"
          />
        </Field>

        <Field label="Amount (₹)" hint="Optional.">
          <input
            className="input"
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={chosen ? String(chosen.monthlyFee) : '0'}
          />
        </Field>

        <Field label="Due date">
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>

        <Field
          label="Custom message"
          hint="Leave blank to use the standard fee message. Placeholders: {student} {guardian} {amount} {due} {batch} {academy} {owner}"
          span
        >
          <textarea
            className="textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Hi {guardian}, …"
          />
        </Field>
      </div>
    </Sheet>
  )
}
