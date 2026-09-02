import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import '../styles/landing.css'
import { classifyPinKey } from '../lib/keys'
import { lockedForMs, useStore } from '../lib/store'
import { navigate } from '../lib/router'
import { forget as forgetVault, isEnrolled, pinLength } from '../lib/vault'
import { Sheet } from '../components/ui'
import { IconLock, IconTrophy, IconWhatsApp } from '../components/icons'
import BrandMark from '../components/BrandMark'
import { ACADEMY as A } from '../lib/academy'

/* 146KB of JPEG became 48KB of WebP at the same 1200px, a 66% cut on the
   single largest asset the owner downloads. It matters more than it
   looks: the access token lives in sessionStorage and dies when the app
   closes, so this hero is on the path of EVERY cold start, before the
   PIN pad — not just a marketing page seen once.

   The <picture> keeps the JPEG as a fallback rather than deleting it.
   Every browser this app targets decodes WebP, but the fallback costs
   nothing on the ones that do. */
const COURT_WEBP = `${import.meta.env.BASE_URL}court.webp`
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
          {/* `fetchpriority` lowercase, not the React 19 `fetchPriority`
              casing: on React 18 that prop is unrecognised, so it is
              passed straight through to the DOM AND logged as an error on
              every render of the first screen the owner sees. */}
          <picture>
            <source srcSet={COURT_WEBP} type="image/webp" />
            <img
              src={COURT}
              alt={`Indoor badminton courts at ${A.name}`}
              {...{ fetchpriority: 'high' }}
              decoding="async"
            />
          </picture>
        </div>
        <div className="hero__scrim" />

        {/* The lock that used to sit up here is gone. It existed because
            the only way in was to scroll the whole page to a button in
            the footer; the page does not scroll any more and the button
            is on screen, so a second entrance was just clutter. */}
        <div className="hero__top">
          <BrandMark size={34} />
          <span className="hero__wordmark">{A.name}</span>
        </div>

        <div className="hero__body">
          <Rise>
            <p className="kicker">
              <IconTrophy size={12} />
              {A.area} · Since {A.established}
            </p>
          </Rise>

          {/* Two clauses, two sizes. They used to be set at the same size,
              so the setup and the payoff carried equal weight and neither
              landed — the line that sells the place was just the green
              one. The scale step does the work that colour was being
              asked to do alone. */}
          <Rise delay={80}>
            <h1 className="hero__title">
              <span className="hero__setup">{A.heroLine1}</span>
              <span className="hero__payoff">{A.heroLine2}</span>
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

          <Rise delay={290}>
            <div className="hero__facts">
              <span>
                <b>{A.courts}</b>
              </span>
              <i />
              <span>
                Open <b>{A.hours}</b>
              </span>
              <i />
              <span>{A.area}</span>
            </div>
          </Rise>

          {/* The whole footer folded up into here.

              It held the coaching note, the address and the login, and
              it put all three below the fold — so the owner scrolled a
              marketing page every time he opened his own app, and a
              parent had to scroll to find out where the place is. The
              note is the hero sub now, the area is a fact, and the door
              is on screen. */}
          <Rise delay={360}>
            <div className="hero__enter">
              {waHref && (
                <a
                  className="btn btn--primary btn--block"
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <IconWhatsApp size={17} />
                  Ask about a trial session
                </a>
              )}
              <button className="owner-link" onClick={() => setOpen(true)}>
                <IconLock size={14} />
                Academy login
              </button>
            </div>
          </Rise>
        </div>
      </header>

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

  /* The keypad is buttons, and on a laptop that was the ONLY way in.
     Typing 1-2-3-4 did nothing at all, with a numeric pad on screen
     inviting exactly that — the app is phone-first, but it is served
     from a URL and the owner opens it on a desktop.

     A window listener rather than an <input>: the dots are the display,
     there is no field to focus, and a hidden input would fight the
     on-screen pad for the value. Both routes go through press(), so the
     lockout and the length cap apply identically however a digit
     arrives.

     Guards, in order: the sheet has to be open and past enrolment (the
     setup branch is a real form and owns its own keys); modifier
     combinations are left alone so refresh and devtools still work; and
     anything typed while a real field has focus belongs to that field.
     e.key covers the number row and the numpad alike. */
  /* Held in a ref so the listener attaches ONCE per open rather than on
     every render — press() closes over `err`, `locked` and `pinLen`, so
     a plain dependency-free effect would add and remove a listener each
     time a digit landed. Same shape as usePullToRefresh. */
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {})
  keyHandler.current = (e: KeyboardEvent) => {
    // Anything typed while a real field has focus belongs to that field.
    const el = document.activeElement
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
    const k = classifyPinKey(e)
    if (k.kind === 'digit') {
      e.preventDefault()
      press(k.value)
    } else if (k.kind === 'delete') {
      e.preventDefault()
      if (!locked) setCode((c) => c.slice(0, -1))
    }
  }

  useEffect(() => {
    if (!open || !enrolled || forgotten) return
    const onKey = (e: KeyboardEvent) => keyHandler.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, enrolled, forgotten])

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
        {/* Not "Default is 1234" — there is no default. The PIN is chosen
            when the phone is set up and it is the key the saved session is
            encrypted with, so printing a guess for it on a public page was
            both untrue and the one sentence worth deleting. */}
        {locked
          ? `Too many wrong tries — wait ${Math.ceil(lockMs / 1000)}s`
          : err
            ? 'Wrong PIN — try again'
            : 'The PIN you set up this phone with'}
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
