import { useRef, useState, type ChangeEvent } from 'react'
import { useStore } from '../lib/store'
import { navigate } from '../lib/router'
import { todayISO } from '../lib/format'
import { Confirm, Field, Sheet } from '../components/ui'
import {
  IconAlert,
  IconDownload,
  IconLock,
  IconLogout,
  IconUpload,
} from '../components/icons'

export default function Settings() {
  const {
    data, setSettings, exportJSON, importJSON, resetToDemo, startFresh, logout, toast,
  } = useStore()
  const s = data.settings
  const fileRef = useRef<HTMLInputElement | null>(null)

  const [passOpen, setPassOpen] = useState(false)
  const [confirmFresh, setConfirmFresh] = useState(false)
  const [confirmDemo, setConfirmDemo] = useState(false)

  const download = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `matchpoint-pride-backup-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast('Backup downloaded.')
  }

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const res = importJSON(String(reader.result))
      toast(res.message, res.ok ? 'good' : 'bad')
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <main className="page">
      <div className="page__head">
        <h1 className="t-h1">Settings</h1>
        <p className="t-sub" style={{ marginTop: 3 }}>
          Everything here is editable — nothing is hard-coded.
        </p>
      </div>

      {/* ---------- landing page content ---------- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card__head">
          <div>
            <div className="card__title">Landing page</div>
            <div className="card__sub">What visitors see before logging in</div>
          </div>
        </div>
        <div className="form-grid">
          <Field label="Academy name" span>
            <input
              className="input"
              value={s.academyName}
              onChange={(e) => setSettings({ academyName: e.target.value })}
            />
          </Field>
          <Field label="Headline — first line" span>
            <input
              className="input"
              value={s.heroLine1}
              onChange={(e) => setSettings({ heroLine1: e.target.value })}
            />
          </Field>
          <Field label="Headline — second line" hint="Shown in the brand green." span>
            <input
              className="input"
              value={s.heroLine2}
              onChange={(e) => setSettings({ heroLine2: e.target.value })}
            />
          </Field>
          <Field label="Headline sub-text" span>
            <textarea
              className="textarea"
              value={s.heroSub}
              onChange={(e) => setSettings({ heroSub: e.target.value })}
            />
          </Field>
          <Field
            label="Coaching note"
            hint="The one place on the page where coaching credentials are stated."
            span
          >
            <textarea
              className="textarea"
              value={s.coachingNote}
              onChange={(e) => setSettings({ coachingNote: e.target.value })}
            />
          </Field>
          <Field label="Established">
            <input
              className="input"
              value={s.established}
              onChange={(e) => setSettings({ established: e.target.value })}
            />
          </Field>
          <Field label="Owner name" hint="Used for your dashboard greeting.">
            <input
              className="input"
              value={s.ownerName}
              onChange={(e) => setSettings({ ownerName: e.target.value })}
            />
          </Field>
          <Field label="Location" span>
            <input
              className="input"
              value={s.location}
              onChange={(e) => setSettings({ location: e.target.value })}
            />
          </Field>
          <Field label="Courts">
            <input
              className="input"
              value={s.courts}
              onChange={(e) => setSettings({ courts: e.target.value })}
              placeholder="7 indoor courts"
            />
          </Field>
          <Field label="Open hours">
            <input
              className="input"
              value={s.hours}
              onChange={(e) => setSettings({ hours: e.target.value })}
              placeholder="5 AM – 1 AM"
            />
          </Field>
          <Field
            label="Enquiry phone"
            hint="Add a number to show the WhatsApp enquiry buttons on the public page. Leave blank to hide them."
            span
          >
            <input
              className="input"
              type="tel"
              inputMode="tel"
              value={s.phone}
              onChange={(e) => setSettings({ phone: e.target.value })}
              placeholder="9876543210"
            />
          </Field>
          <Field label="Public email" hint="Optional." span>
            <input
              className="input"
              type="email"
              value={s.email}
              onChange={(e) => setSettings({ email: e.target.value })}
              placeholder="hello@example.com"
            />
          </Field>
        </div>
      </div>

      {/* ---------- reminders ---------- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card__head">
          <div>
            <div className="card__title">Reminder message</div>
            <div className="card__sub">The default template for every reminder</div>
          </div>
        </div>
        <div className="form-grid">
          <Field label="Country code" hint="For WhatsApp links. India is 91.">
            <input
              className="input"
              value={s.countryCode}
              onChange={(e) => setSettings({ countryCode: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field
            label="Template"
            hint="Placeholders: {student} {guardian} {amount} {due} {batch} {slot} {academy} {owner}"
            span
          >
            <textarea
              className="textarea"
              style={{ minHeight: 120 }}
              value={s.reminderTemplate}
              onChange={(e) => setSettings({ reminderTemplate: e.target.value })}
            />
          </Field>
        </div>
      </div>

      {/* ---------- access ---------- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card__head">
          <div>
            <div className="card__title">Access</div>
            <div className="card__sub">4-digit passcode for the login screen</div>
          </div>
        </div>
        <div className="row gap-8">
          <button className="btn grow" onClick={() => setPassOpen(true)}>
            <IconLock size={16} /> Change passcode
          </button>
          <button
            className="btn grow"
            onClick={() => {
              logout()
              navigate('/')
            }}
          >
            <IconLogout size={16} /> Log out
          </button>
        </div>
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
            This passcode hides the app on a shared phone — it is not real security. The page is
            public, so anyone who knows the URL can reach the data in this browser. Don’t store
            anything here you wouldn’t be comfortable being read.
          </p>
        </div>
      </div>

      {/* ---------- data ---------- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card__head">
          <div>
            <div className="card__title">Backup &amp; data</div>
            <div className="card__sub">
              {data.students.length} students · {data.transactions.length} transactions ·{' '}
              {data.attendance.length} attendance records
            </div>
          </div>
        </div>

        <div
          className="row gap-10"
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 'var(--r-md)',
            background: 'rgba(57,135,229,0.08)',
            border: '1px solid rgba(57,135,229,0.24)',
            alignItems: 'flex-start',
          }}
        >
          <IconAlert size={17} style={{ color: '#8bbcf3', flexShrink: 0, marginTop: 1 }} />
          <p className="t-mut" style={{ lineHeight: 1.5 }}>
            Everything is saved inside this browser on this phone. Clearing browser data, or
            switching phones, loses it. <strong>Download a backup regularly</strong> — it restores
            on any device.
          </p>
        </div>

        <div className="row gap-8">
          <button className="btn btn--primary grow" onClick={download}>
            <IconDownload size={16} /> Backup
          </button>
          <button className="btn grow" onClick={() => fileRef.current?.click()}>
            <IconUpload size={16} /> Restore
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={onFile}
          style={{ display: 'none' }}
        />

        <hr className="divider" style={{ margin: '16px 0' }} />

        <div className="col gap-8">
          <button className="btn btn--danger" onClick={() => setConfirmFresh(true)}>
            Clear demo data and start fresh
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => setConfirmDemo(true)}>
            Reload the demo dataset
          </button>
        </div>
      </div>

      <p className="t-mut" style={{ textAlign: 'center', padding: '8px 0 4px' }}>
        {s.academyName} · {s.location}
      </p>

      <PasscodeSheet open={passOpen} onClose={() => setPassOpen(false)} />

      <Confirm
        open={confirmFresh}
        title="Start fresh?"
        body="All demo students, staff, attendance, reminders and transactions are deleted. The six batches stay so you can start adding real students right away. Download a backup first if you're unsure."
        confirmLabel="Clear everything"
        onCancel={() => setConfirmFresh(false)}
        onConfirm={() => {
          startFresh()
          setConfirmFresh(false)
          toast('Cleared. Ready for real data.')
          navigate('/app')
        }}
      />

      <Confirm
        open={confirmDemo}
        title="Reload demo data?"
        body="This replaces everything currently in the app with the sample dataset. Any real data you've entered will be lost."
        confirmLabel="Reload demo"
        onCancel={() => setConfirmDemo(false)}
        onConfirm={() => {
          resetToDemo()
          setConfirmDemo(false)
          toast('Demo data reloaded.')
          navigate('/app')
        }}
      />
    </main>
  )
}

function PasscodeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, setSettings, toast } = useStore()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')

  const save = () => {
    if (current !== data.settings.passcode) {
      toast('Current passcode is wrong.', 'bad')
      return
    }
    if (!/^\d{4}$/.test(next)) {
      toast('New passcode must be 4 digits.', 'bad')
      return
    }
    setSettings({ passcode: next })
    setCurrent('')
    setNext('')
    toast('Passcode updated.')
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Change passcode"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save}>
            Update
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Current passcode" span>
          <input
            className="input"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={current}
            onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Field label="New passcode" hint="4 digits." span>
          <input
            className="input"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={next}
            onChange={(e) => setNext(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
      </div>
    </Sheet>
  )
}
