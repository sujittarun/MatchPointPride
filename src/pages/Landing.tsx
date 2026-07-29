import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import '../styles/landing.css'
import { lockedForMs, useStore } from '../lib/store'
import { navigate } from '../lib/router'
import { forget as forgetVault, isEnrolled, pinLength } from '../lib/vault'
import { Sheet } from '../components/ui'
import { IconLock, IconTrophy, IconWhatsApp } from '../components/icons'
import BrandMark from '../components/BrandMark'
import { ACADEMY as A } from '../lib/academy'

const COURT = `${import.meta.env.BASE_URL}court.jpg`

export default function Landing() {
  const { login, authed } = useStore()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (authed) navigate('/app')
  }, [authed])

  const waHref = A.enquiryPhone
    ? `https://wa.me/${A.countryCode.replace(/\D/g, '')}${A.enquiryPhone.replace(/\D/g, '')}` +
      `?text=${encodeURIComponent(`Hi, I'd like to know about badminton coaching at ${A.name}.`)}`
    : null

  return (
    <div className="lp">
      <header className="hero">
        <div className="hero__media">
          <img
            src={COURT}
            alt={`Indoor badminton courts at ${A.name}`}
            fetchPriority="high"
            decoding="async"
          />
        </div>
        <div className="hero__scrim" />

        <div className="hero__top">
          <BrandMark size={34} />
          <span className="hero__wordmark">{A.name}</span>
        </div>

        <div className="hero__body">
          <Rise>
            <span className="eyebrow">
              <IconTrophy size={13} />
              {A.area} · Since {A.established}
            </span>
          </Rise>

          <Rise delay={80}>
            <h1 className="hero__title">
              {A.heroLine1}
              <span>{A.heroLine2}</span>
            </h1>
          </Rise>

          <Rise delay={150}>
            <p className="hero__sub">{A.heroSub}</p>
          </Rise>

          <Rise delay={220}>
            <div className="ladder">
              {A.ladder.map((label, i) => (
                <div className={`rung${i === 0 ? ' rung--first' : ''}`} key={label}>
                  <span className="rung__dot" />
                  <span className="rung__label">{label}</span>
                </div>
              ))}
            </div>
          </Rise>

          {waHref && (
            <Rise delay={290}>
              <div className="hero__cta">
                <a
                  className="btn btn--primary btn--block"
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <IconWhatsApp size={17} />
                  Ask about a trial session
                </a>
              </div>
            </Rise>
          )}

          <Rise delay={350}>
            <div className="hero__facts">
              <span>
                <b>{A.courts}</b>
              </span>
              <i />
              <span>
                Open <b>{A.hours}</b>
              </span>
            </div>
          </Rise>
        </div>
      </header>

      <footer className="close">
        <Rise>
          <p className="close__note">{A.coachingNote}</p>
          <p className="close__loc">{A.location}</p>

          {waHref && (
            <div className="close__actions">
              <a
                className="btn btn--block"
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                <IconWhatsApp size={16} />
                Message the academy
              </a>
            </div>
          )}

          <button className="owner-link" onClick={() => setOpen(true)}>
            <IconLock size={13} />
            Academy login
          </button>
        </Rise>
      </footer>

      <PasscodeSheet
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={login}
        pinLen={pinLength()}
        enrolled={isEnrolled()}
      />
    </div>
  )
}

/** Entrance animation. Plays on load — the page is one screen, so there is
    nothing below the fold worth waiting on a scroll observer for. */
function Rise({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <div className="rise" style={{ '--d': `${delay}ms` } as CSSProperties}>
      {children}
    </div>
  )
}

/* First run on a device.
   The only moment a password is involved, and it is never stored: what
   is kept is the session Supabase hands back, sealed under the PIN. */
function SetupForm({ onDone }: { onDone: () => void }) {
  const { enrol } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [len, setLen] = useState<4 | 6>(4)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const ready = email.includes('@') && password.length > 0 && pin.length === len && pin === pin2

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setErr('')
    const r = await enrol(email.trim(), password, pin)
    setBusy(false)
    if (r.ok) onDone()
    else setErr(r.message)
  }

  return (
    <form className="setup" onSubmit={submit}>
      <p className="setup__note">
        Sign in once with the academy account. After this the app opens with your PIN —
        you will not need the password again on this phone.
      </p>
      {/* Setting up a second time usually means the phone's storage was
          cleared, not that anything is wrong. The PIN itself is never
          stored — only a blob it decrypts — so there is nothing left to
          recover and the app genuinely cannot know the old one. Say the
          same PIN is fine, or he will sit here wondering. */}
      <p className="setup__note setup__note--quiet">
        Done this before? Use the same PIN as last time — it still works.
      </p>

      <label className="field">
        <span>Academy email</span>
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="staff@matchpointpride.com"
        />
      </label>

      <label className="field">
        <span>Password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      <div className="field">
        <span>PIN length</span>
        <div className="seg">
          {([4, 6] as const).map((n) => (
            <button
              key={n}
              type="button"
              className={n === len ? 'seg__on' : ''}
              onClick={() => {
                setLen(n)
                setPin('')
                setPin2('')
              }}
            >
              {n} digits
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>Your PIN</span>
        <input
          inputMode="numeric"
          type="password"
          maxLength={len}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
      </label>

      <label className="field">
        <span>Type it again</span>
        <input
          inputMode="numeric"
          type="password"
          maxLength={len}
          value={pin2}
          onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
        />
      </label>

      {pin.length === len && pin2.length === len && pin !== pin2 && (
        <p className="setup__err">Those two PINs are different.</p>
      )}
      {err && <p className="setup__err">{err}</p>}

      <button className="btn btn--primary setup__go" type="submit" disabled={!ready || busy}>
        {busy ? 'Signing in…' : 'Set up this phone'}
      </button>
    </form>
  )
}

function PasscodeSheet({
  open,
  onClose,
  onSubmit,
  pinLen,
  enrolled,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (code: string) => Promise<boolean>
  pinLen: 4 | 6
  enrolled: boolean
}) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState(false)
  const [lockMs, setLockMs] = useState(0)
  const [forgotten, setForgotten] = useState(false)

  useEffect(() => {
    if (!open) {
      setCode('')
      setErr(false)
      setForgotten(false)
    }
  }, [open])

  /* Tick the lockout down so the pad re-enables itself without a reload. */
  useEffect(() => {
    if (!open) return
    const tick = () => setLockMs(lockedForMs())
    tick()
    const t = setInterval(tick, 500)
    return () => clearInterval(t)
  }, [open])

  useEffect(() => {
    if (code.length !== pinLen) return
    let cancelled = false
    const t = setTimeout(() => {
      /* Unlocking is a key derivation and a network round trip now, not
         a string compare, so this waits for the answer. */
      void onSubmit(code).then((ok) => {
        if (cancelled) return
        if (ok) {
          navigate('/app')
        } else {
          setErr(true)
          setTimeout(() => {
            if (cancelled) return
            setCode('')
            setErr(false)
          }, 460)
        }
      })
    }, 90)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [code, onSubmit, pinLen])

  const locked = lockMs > 0
  const press = (d: string) => {
    if (err || locked) return
    setCode((c) => (c.length >= pinLen ? c : c + d))
  }

  if (forgotten) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title="Sign in with your password"
        subtitle="Then pick a PIN again"
      >
        <SetupForm onDone={() => navigate('/app')} />
      </Sheet>
    )
  }

  if (!enrolled) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title="Set up this phone"
        subtitle="Once only — a PIN after this"
      >
        <SetupForm onDone={() => navigate('/app')} />
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title="Academy login" subtitle="Owner access only">
      <div className="pass">
        {Array.from({ length: pinLen }, (_, i) => i).map((i) => (
          <div
            key={i}
            className={`pass__dot${code.length > i ? ' pass__dot--filled' : ''}${
              err ? ' pass__dot--err' : ''
            }`}
          >
            {code.length > i ? '•' : ''}
          </div>
        ))}
      </div>

      <p
        className="t-mut"
        style={{
          textAlign: 'center',
          minHeight: 18,
          color: err || locked ? '#ff8f8f' : undefined,
        }}
      >
        {locked
          ? `Too many wrong tries — wait ${Math.ceil(lockMs / 1000)}s`
          : err
            ? 'Wrong PIN — try again'
            : 'Default is 1234. Change it in Settings.'}
      </p>

      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} className="key" onClick={() => press(d)} disabled={locked}>
            {d}
          </button>
        ))}
        <button className="key key--muted" onClick={() => setCode('')} disabled={locked}>
          Clear
        </button>
        <button className="key" onClick={() => press('0')} disabled={locked}>
          0
        </button>
        <button className="key key--muted" onClick={() => setCode((c) => c.slice(0, -1))}>
          Delete
        </button>
      </div>

      {/* Without this the only way back to the password was failing ten
          times through escalating lockouts — thirty seconds, then a
          minute, then five, then fifteen — which punishes forgetting.
          Forgetting the vault is safe: it holds a refresh token, not the
          records, and the records are in the database. */}
      <button
        type="button"
        className="pin-forgot"
        onClick={() => {
          forgetVault()
          setForgotten(true)
        }}
      >
        Forgot your PIN? Sign in with your password
      </button>
    </Sheet>
  )
}
