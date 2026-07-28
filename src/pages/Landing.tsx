import { useEffect, useState } from 'react'
import '../styles/landing.css'
import { useStore } from '../lib/store'
import { navigate } from '../lib/router'
import { Sheet } from '../components/ui'
import {
  IconLock,
  IconShuttle,
  IconTrophy,
  IconUsers,
} from '../components/icons'
import { initials } from '../lib/format'
import BrandMark from '../components/BrandMark'

export default function Landing() {
  const { data, login, authed } = useStore()
  const s = data.settings
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (authed) navigate('/app')
  }, [authed])

  return (
    <div className="landing">
      <svg
        className="landing__court"
        viewBox="0 0 400 200"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* court in perspective */}
        <path d="M60 200 L150 20 L250 20 L340 200" />
        <path d="M22 200 L136 20 L264 20 L378 200" />
        <line x1="112" y1="94" x2="288" y2="94" />
        <line x1="86" y1="146" x2="314" y2="146" />
        <line x1="200" y1="20" x2="200" y2="200" />
        <line x1="146" y1="42" x2="254" y2="42" />
      </svg>

      <div className="landing__inner">
        <div className="landing__top">
          <BrandMark size={34} />
          <span style={{ fontWeight: 620, letterSpacing: '-0.02em', fontSize: '0.92rem' }}>
            {s.academyName}
          </span>
        </div>

        <div className="landing__hero">
          <span className="landing__eyebrow">
            <IconTrophy size={14} />
            {s.location.split(',').slice(-1)[0].trim() || 'Hyderabad'} · Since {s.established}
          </span>

          <h1 className="landing__title">
            Match Point
            <em>Pride</em>
          </h1>

          <p className="landing__tagline">{s.tagline}</p>

          <div className="owner">
            <div className="owner__mark">{initials(s.ownerName)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="owner__name">{s.ownerName}</div>
              <div className="owner__title">{s.ownerTitle}</div>
              <p className="owner__bio">{s.ownerBio}</p>
            </div>
          </div>

          <div className="landing__pills">
            <span className="pill">
              <IconUsers size={14} /> Kids batches
            </span>
            <span className="pill">
              <IconTrophy size={14} /> Professional squad
            </span>
            <span className="pill">
              <IconShuttle size={14} /> Membership
            </span>
          </div>
        </div>

        <div className="landing__foot">
          <button className="btn btn--primary btn--block" onClick={() => setOpen(true)}>
            <IconLock size={17} />
            Log in to manage
          </button>
          <div className="landing__meta">{s.location}</div>
        </div>
      </div>

      <PasscodeSheet open={open} onClose={() => setOpen(false)} onSubmit={login} />
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

  useEffect(() => {
    if (!open) {
      setCode('')
      setErr(false)
    }
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

  const press = (d: string) => {
    if (err) return
    setCode((c) => (c.length >= 4 ? c : c + d))
  }

  return (
    <Sheet open={open} onClose={onClose} title="Enter passcode" subtitle="Owner access">
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
        style={{ textAlign: 'center', minHeight: 18, color: err ? '#ff8f8f' : undefined }}
      >
        {err ? 'Wrong passcode — try again' : 'Default is 1234. Change it in Settings.'}
      </p>

      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} className="key" onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button className="key key--muted" onClick={() => setCode('')}>
          Clear
        </button>
        <button className="key" onClick={() => press('0')}>
          0
        </button>
        <button className="key key--muted" onClick={() => setCode((c) => c.slice(0, -1))}>
          Delete
        </button>
      </div>
    </Sheet>
  )
}
