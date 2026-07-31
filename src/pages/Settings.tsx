import { useState } from 'react'
import { useStore } from '../lib/store'
import { changePin } from '../lib/vault'
import { Field, Sheet } from '../components/ui'
import { IconAlert, IconLock } from '../components/icons'

/* Export, import and backup are gone.

   A backup downloaded to a phone is a file full of student names and
   parents' phone numbers, stale the moment it is written, sitting in
   Downloads for ever. The academy's records live in Postgres and are
   backed up there nightly; nothing about this app is the copy of record.

   Import was worse than useless — it was untrue. It called setData,
   which writes React state and nothing else, so the next read from the
   database replaced whatever it loaded. The owner saw "12 students
   imported" and had imported nothing. That is the same silent-success
   failure this app has removed twice before, and the reason to delete
   it rather than fix it: bulk-loading students belongs in the one-shot
   import script, run once, not behind a button that can be pressed
   every day.

   The CSV export went with them. On its own it was harmless, but it is
   the same personal data leaving the same building through the same
   door, and nothing reads it back. */

export default function Settings() {
  const [passOpen, setPassOpen] = useState(false)

  return (
    <main className="page">
      <div className="page__head">
        <h1 className="t-h1">Settings</h1>
        <p className="t-sub" style={{ marginTop: 3 }}>
          The PIN that unlocks this phone.
        </p>
      </div>

      {/* ---------- access ---------- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card__head">
          <div>
            <div className="card__title">PIN</div>
            <div className="card__sub">The digits on the login screen</div>
          </div>
        </div>

        <button className="btn btn--block" onClick={() => setPassOpen(true)}>
          <IconLock size={16} /> Change PIN
        </button>

        <div
          className="row gap-10"
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 'var(--r-md)',
            background: 'rgba(250,178,25,0.07)',
            border: '1px solid rgba(250,178,25,0.22)',
            alignItems: 'flex-start',
          }}
        >
          <IconAlert size={17} style={{ color: '#ffd166', flexShrink: 0, marginTop: 1 }} />
          <p className="t-mut" style={{ lineHeight: 1.5 }}>
            The PIN unlocks this phone's saved sign-in — it is the key the session is
            encrypted with, not a password checked in the page. Someone with the link and
            no PIN reaches nothing.
          </p>
        </div>
      </div>

      <PinSheet open={passOpen} onClose={() => setPassOpen(false)} />
    </main>
  )
}

/* Changing the PIN re-seals the vault, because the PIN IS the vault key.
   There is no stored PIN to overwrite.

   What this used to do: compare the current PIN against
   `settings.passcode` — a field that was always the literal '1234',
   never loaded from anywhere — then write the new one to React state
   that nothing persisted and `unlock()` never read. The vault stayed
   sealed under the old PIN. The owner was told "PIN updated.", closed
   the app, and could only get back in with the PIN he thought he had
   just replaced. Silent success, third time in this codebase.

   The current PIN is checked the only way it can be: by whether it
   opens the vault. No ladder here — this screen is already behind an
   unlocked session, so guessing at it means holding an unlocked phone,
   which the login ladder cannot help with either. */
function PinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useStore()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)

  const close = () => {
    setCurrent('')
    setNext('')
    onClose()
  }

  const save = async () => {
    if (busy) return
    if (!/^(\d{4}|\d{6})$/.test(next)) {
      toast('New PIN must be 4 or 6 digits.', 'bad')
      return
    }
    // Two key derivations at 600k iterations each — a second or so on a
    // phone, and long enough that a second tap would otherwise land.
    setBusy(true)
    try {
      const ok = await changePin(current, next)
      if (!ok) {
        toast('Current PIN is wrong.', 'bad')
        return
      }
      toast('PIN updated.')
      close()
    } catch {
      // A failure here leaves the OLD vault in place — enrol() writes
      // once, at the end — so the owner's existing PIN still works.
      toast('Could not change the PIN. Your current one still works.', 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Change PIN"
      footer={
        <>
          <button className="btn" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Changing…' : 'Update'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Current PIN" span>
          <input
            className="input"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={current}
            onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Field label="New PIN" hint="4 or 6 digits." span>
          <input
            className="input"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={next}
            onChange={(e) => setNext(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
      </div>
    </Sheet>
  )
}
