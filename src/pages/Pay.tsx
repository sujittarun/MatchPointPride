import { useMemo, useState } from 'react'
import '../styles/pay.css'
import { ACADEMY as A } from '../lib/academy'
import BrandMark from '../components/BrandMark'
import { IconCheck, IconCopy, IconRupee } from '../components/icons'
import { UPI_SCHEMES, needsNamedUpiApps, upiQuery, type UpiApp } from '../lib/upi'

/* ============================================================
   The page a parent lands on from a fee reminder.

   PUBLIC. No session, no PIN, no data read from the database — the
   parent will never be signed in, and nothing here needs them to be.

   It COMPUTES NOTHING. The amount, the UPI id and the payee all arrive
   in the link, because the app that built that link was signed in as
   staff and had already resolved them the proper way — `resolve_upi()`
   picks the account (batch → centre → tenant) and `reminder_queue()`
   says what is owed. Re-deriving either here would be a second opinion
   about money living on a public page, which is exactly what the house
   rule forbids. This screen displays and hands off.
   ============================================================ */

type Params = {
  amount: number
  student: string
  upi: string
  payee: string
  months: string
}

/** Hash routing means the query lives inside the hash: `#/pay?a=1500`. */
function readParams(): Params {
  const hash = window.location.hash.replace(/^#/, '')
  const q = new URLSearchParams(hash.slice(hash.indexOf('?') + 1))
  return {
    amount: Math.max(0, Number(q.get('a')) || 0),
    student: q.get('n') ?? '',
    upi: q.get('u') ?? A.billing.upiId,
    payee: q.get('p') ?? A.billing.payee,
    months: q.get('m') ?? '',
  }
}

const NAMED_APPS: Array<{ id: UpiApp; label: string }> = [
  { id: 'phonepe', label: 'PhonePe' },
  { id: 'gpay', label: 'Google Pay' },
  { id: 'paytm', label: 'Paytm' },
  { id: 'bhim', label: 'BHIM' },
]

export default function Pay() {
  const initial = useMemo(readParams, [])
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount) : '')
  const [copied, setCopied] = useState<'upi' | 'amount' | null>(null)
  const [chooser, setChooser] = useState(false)

  const amt = Math.max(0, Number(amount) || 0)
  const configured = Boolean(initial.upi)

  const query = useMemo(
    () => upiQuery({ amount: amt, upi: initial.upi, payee: initial.payee, months: initial.months }),
    [initial.upi, initial.payee, initial.months, amt],
  )

  const copy = async (what: 'upi' | 'amount', value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(what)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      /* clipboard blocked — the value is on screen to read anyway */
    }
  }

  const open = (app: UpiApp) => {
    window.location.href = UPI_SCHEMES[app] + query
  }

  const payNow = () => {
    if (!configured) return
    // Named apps on Apple hardware, the system chooser on Android.
    if (needsNamedUpiApps(navigator)) setChooser(true)
    else open('any')
  }

  return (
    <main className="pay">
      <div className="pay__card">
        <BrandMark size={44} />
        <p className="pay__kicker">Fee payment</p>
        <h1 className="pay__academy">{A.name}</h1>

        {initial.student && (
          <p className="pay__for">
            for <b>{initial.student}</b>
            {initial.months ? ` · ${initial.months}` : ''}
          </p>
        )}

        <label className="pay__amount">
          <span>Amount</span>
          <div className="pay__amount-row">
            <IconRupee size={19} />
            <input
              type="number"
              inputMode="decimal"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              aria-label="Amount in rupees"
            />
          </div>
        </label>

        {configured ? (
          <>
            <button className="btn btn--primary btn--block pay__go" onClick={payNow} disabled={amt <= 0}>
              Pay now
            </button>

            {chooser && (
              <div className="pay__apps">
                <p className="pay__apps-note">Choose your UPI app</p>
                <div className="pay__apps-grid">
                  {NAMED_APPS.map((app) => (
                    <button key={app.id} className="pay__app" onClick={() => open(app.id)}>
                      {app.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Always present, never behind a "having trouble?" link. A
                UPI deep link can fail silently on any phone — a missing
                app, a locked scheme, an in-app browser — and when it
                does, the id and the amount are the whole recovery. */}
            <div className="pay__manual">
              <div className="pay__row">
                <div>
                  <span className="pay__label">UPI ID</span>
                  <span className="pay__value">{initial.upi}</span>
                </div>
                <button className="pay__copy" onClick={() => copy('upi', initial.upi)}>
                  {copied === 'upi' ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  {copied === 'upi' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="pay__row">
                <div>
                  <span className="pay__label">Amount</span>
                  <span className="pay__value">{amt > 0 ? `₹${amt.toLocaleString('en-IN')}` : '—'}</span>
                </div>
                <button
                  className="pay__copy"
                  onClick={() => copy('amount', String(amt))}
                  disabled={amt <= 0}
                >
                  {copied === 'amount' ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  {copied === 'amount' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="pay__payee">Paying to {initial.payee}</p>
            </div>
          </>
        ) : (
          <p className="pay__missing">
            This link is missing the academy's payment details. Please ask {A.ownerName} for a
            fresh one.
          </p>
        )}

        <p className="pay__after">
          Once it's done, send us the screenshot on WhatsApp and we'll mark it off. 🙏
        </p>
      </div>
    </main>
  )
}
