import { useRef, useState, type ChangeEvent } from 'react'
import { useStore } from '../lib/store'
import { navigate } from '../lib/router'
import { todayISO } from '../lib/format'
import { ACADEMY } from '../lib/academy'
import {
  applyImport,
  downloadText,
  studentsFromCSV,
  studentsToCSV,
  type ImportReport,
} from '../lib/csv'
import { Confirm, Field, Sheet } from '../components/ui'
import {
  IconAlert,
  IconDownload,
  IconLock,
  IconLogout,
  IconUpload,
  IconUsers,
} from '../components/icons'

export default function Settings() {
  const {
    data, exportJSON, importJSON, update, resetToDemo, startFresh, logout, toast,
  } = useStore()

  const backupRef = useRef<HTMLInputElement | null>(null)
  const csvRef = useRef<HTMLInputElement | null>(null)

  const [passOpen, setPassOpen] = useState(false)
  const [confirmFresh, setConfirmFresh] = useState(false)
  const [confirmDemo, setConfirmDemo] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)

  /* ---------------- students spreadsheet ---------------- */

  const exportStudents = () => {
    downloadText(
      `matchpoint-students-${todayISO()}.csv`,
      studentsToCSV(data),
      'text/csv;charset=utf-8',
    )
    toast(
      data.students.length > 0
        ? `${data.students.length} students exported.`
        : 'Empty sheet exported — use it as your template.',
    )
  }

  const onCSV = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const res = studentsFromCSV(String(reader.result), data)
      if (res.ok) update((d) => applyImport(d, res))
      setReport(res)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  /* ---------------- full backup ---------------- */

  const backup = () => {
    downloadText(
      `matchpoint-backup-${todayISO()}.json`,
      exportJSON(),
      'application/json',
    )
    toast('Backup downloaded.')
  }

  const onBackupFile = (e: ChangeEvent<HTMLInputElement>) => {
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
          PIN, student sheet and backups.
        </p>
      </div>

      {/* ---------- access ---------- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card__head">
          <div>
            <div className="card__title">PIN</div>
            <div className="card__sub">The 4 digits on the login screen</div>
          </div>
        </div>

        <div className="row gap-8">
          <button className="btn grow" onClick={() => setPassOpen(true)}>
            <IconLock size={16} /> Change PIN
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
            The PIN hides the app on a shared phone — it is not real security. The page is
            public, so anyone with the link can reach the data stored in that browser.
          </p>
        </div>
      </div>

      {/* ---------- students sheet ---------- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card__head">
          <div>
            <div className="card__title">Student sheet</div>
            <div className="card__sub">
              {data.students.length} students · opens in Excel, Numbers or Google Sheets
            </div>
          </div>
        </div>

        <div className="row gap-8">
          <button className="btn btn--primary grow" onClick={exportStudents}>
            <IconDownload size={16} /> Export
          </button>
          <button className="btn grow" onClick={() => csvRef.current?.click()}>
            <IconUpload size={16} /> Import
          </button>
        </div>
        <input
          ref={csvRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onCSV}
          style={{ display: 'none' }}
        />

        <ul className="t-mut" style={{ marginTop: 12, lineHeight: 1.6 }}>
          <li>
            • Only <b>Name</b> and <b>Batch</b> are required — the batch name has to match one
            of yours.
          </li>
          <li>• A student already in that batch is updated, not duplicated.</li>
          <li>• Export with no students to get a blank template.</li>
        </ul>
      </div>

      {/* ---------- backup ---------- */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card__head">
          <div>
            <div className="card__title">Backup &amp; restore</div>
            <div className="card__sub">
              {data.transactions.length} transactions · {data.attendance.length} attendance
              records
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
            Everything lives in this browser on this phone. Clearing browser data, or
            switching phones, loses it. <strong>Download a backup regularly</strong> — it
            restores everything on any device.
          </p>
        </div>

        <div className="row gap-8">
          <button className="btn btn--primary grow" onClick={backup}>
            <IconDownload size={16} /> Backup
          </button>
          <button className="btn grow" onClick={() => backupRef.current?.click()}>
            <IconUpload size={16} /> Restore
          </button>
        </div>
        <input
          ref={backupRef}
          type="file"
          accept="application/json,.json"
          onChange={onBackupFile}
          style={{ display: 'none' }}
        />

        <hr className="divider" style={{ margin: '16px 0' }} />

        <div className="col gap-8">
          <button className="btn btn--danger" onClick={() => setConfirmFresh(true)}>
            Clear everything and start fresh
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => setConfirmDemo(true)}>
            Reload the demo dataset
          </button>
        </div>
      </div>

      <p className="t-mut" style={{ textAlign: 'center', padding: '8px 0 4px', lineHeight: 1.5 }}>
        {ACADEMY.name} · {ACADEMY.location}
      </p>

      <PinSheet open={passOpen} onClose={() => setPassOpen(false)} />

      {/* import result */}
      <Sheet
        open={report !== null}
        onClose={() => setReport(null)}
        title={report?.ok ? 'Import finished' : 'Nothing imported'}
        subtitle={report?.message}
        footer={
          <button className="btn btn--primary" onClick={() => setReport(null)}>
            Done
          </button>
        }
      >
        {report && (
          <>
            <div className="grid grid-2" style={{ marginBottom: 14 }}>
              <div className="stat" style={{ ['--accent' as string]: 'var(--good)' }}>
                <div className="t-label">Added</div>
                <div className="stat__value num">{report.added}</div>
              </div>
              <div className="stat" style={{ ['--accent' as string]: 'var(--series-1)' }}>
                <div className="t-label">Updated</div>
                <div className="stat__value num">{report.updated}</div>
              </div>
            </div>

            {report.skipped.length > 0 && (
              <>
                <div className="t-label" style={{ marginBottom: 8 }}>
                  Skipped {report.skipped.length}
                </div>
                <div className="col gap-6">
                  {report.skipped.slice(0, 25).map((s, i) => (
                    <div className="listrow" key={i} style={{ minHeight: 44, padding: '9px 12px' }}>
                      <IconUsers size={15} className="t-mut" />
                      <div className="listrow__main">
                        <div className="listrow__title" style={{ fontSize: '0.83rem' }}>
                          Row {s.row} · {s.name}
                        </div>
                        <div className="listrow__meta">{s.why}</div>
                      </div>
                    </div>
                  ))}
                  {report.skipped.length > 25 && (
                    <p className="t-mut">…and {report.skipped.length - 25} more.</p>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </Sheet>

      <Confirm
        open={confirmFresh}
        title="Start fresh?"
        body="All students, staff, attendance, reminders and transactions are deleted. The six batches stay. Download a backup first if you're unsure."
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

function PinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, setSettings, toast } = useStore()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')

  const save = () => {
    if (current !== data.settings.passcode) {
      toast('Current PIN is wrong.', 'bad')
      return
    }
    if (!/^\d{4}$/.test(next)) {
      toast('New PIN must be 4 digits.', 'bad')
      return
    }
    setSettings({ passcode: next })
    setCurrent('')
    setNext('')
    toast('PIN updated.')
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Change PIN"
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
        <Field label="Current PIN" span>
          <input
            className="input"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={current}
            onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Field label="New PIN" hint="4 digits." span>
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
