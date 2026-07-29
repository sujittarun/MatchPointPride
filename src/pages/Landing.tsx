import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import '../styles/landing.css'
import { lockedForMs, useStore } from '../lib/store'
import { navigate } from '../lib/router'
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

      <PasscodeSheet open={open} onClose={() => setOpen(false)} onSubmit={login} />
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

function PasscodeSheet({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (code: string) => boolean
}) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState(false)
  const [lockMs, setLockMs] = useState(0)

  useEffect(() => {
    if (!open) {
      setCode('')
      setErr(false)
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
    if (code.length !== 4) return
    const t = setTimeout(() => {
      if (onSubmit(code)) {
        navigate('/app')
      } else {
        setErr(true)
        setTimeout(() => {
          setCode('')
          setErr(false)
        }, 460)
      }
    }, 90)
    return () => clearTimeout(t)
  }, [code, onSubmit])

  const locked = lockMs > 0
  const press = (d: string) => {
    if (err || locked) return
    setCode((c) => (c.length >= 4 ? c : c + d))
  }

  return (
    <Sheet open={open} onClose={onClose} title="Academy login" subtitle="Owner access only">
      <div className="pass">
        {[0, 1, 2, 3].map((i) => (
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
    </Sheet>
  )
}
