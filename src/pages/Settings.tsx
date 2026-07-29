import { useRef, useState, type ChangeEvent } from 'react'
import { useStore } from '../lib/store'
import { todayISO } from '../lib/format'
import {
  downloadText,
  studentsFromCSV,
  studentsToCSV,
  type ImportReport,
} from '../lib/csv'
import { Field, Sheet } from '../components/ui'
import {
  IconAlert,
  IconDownload,
  IconLock,
  IconUpload,
} from '../components/icons'

export default function Settings() {
  const {
    data, exportJSON, toast, saveStudent,
  } = useStore()
  const csvRef = useRef<HTMLInputElement | null>(null)

  const [passOpen, setPassOpen] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [busy, setBusy] = useState(false)

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
      setReport(res)
      if (!res.ok) return
      /* Each row is a real insert, one at a time, so a bad row fails on
         its own instead of taking the file down with it. The count the
         owner sees is what actually landed, not what was parsed. */
      void (async () => {
        let ok = 0
        for (const st of res.rows ?? []) {
          const batch = data.batches.find((b) => b.id === st.batchId)
          if (!batch) continue
          const r = await saveStudent({
            name: st.name,
            phone: st.phone,
            guardian: st.guardian,
            batchId: batch.id,
            joinedOn: st.joinedOn,
            feeDueDay: st.feeDueDay,
            active: true,
          })
          if (r.ok) ok++
        }
        toast(
          ok === (res.rows?.length ?? 0)
            ? `${ok} student${ok === 1 ? '' : 's'} imported.`
            : `${ok} of ${res.rows?.length ?? 0} imported — the rest were rejected.`,
          ok === (res.rows?.length ?? 0) ? 'good' : 'bad',
        )
      })()
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  /* ---------------- full backup ---------------- */

  const backup = async () => {
    setBusy(true)
    try {
      downloadText(
        `matchpoint-backup-${todayISO()}.json`,
        await exportJSON(),
        'application/json',
      )
      toast('Backup downloaded — screenshots included.')
    } finally {
      setBusy(false)
    }
  }

  /* Restore, Start fresh and Reload demo are gone.

     All three rewrote a local document, and there is no local document
     — the next read from Postgres replaced whatever they wrote, so the
     button appeared to work and changed nothing. Clearing the academy's
     real data is a deliberate act that belongs in the operator console,
     not behind a button on the owner's phone. */



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

        {report && (
          <p className={report.ok ? 't-mut' : 't-bad'} style={{ marginTop: 12, lineHeight: 1.5 }}>
            {report.message}
            {report.skipped.length > 0 && (
              <>
                {' '}
                Skipped: {report.skipped.map((x) => `${x.name} (${x.why})`).join(', ')}.
              </>
            )}
          </p>
        )}

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
            <div className="card__title">Backup</div>
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
            Everything is kept in the academy database, not on this phone. Clearing
            browser data or switching phones loses nothing —{' '}
            <strong>sign in again and it is all there</strong>. A backup is still worth
            downloading now and then as your own copy.
          </p>
        </div>

        <div className="row gap-8">
          <button className="btn btn--primary grow" onClick={backup} disabled={busy}>
            <IconDownload size={16} /> {busy ? 'Packing…' : 'Download a backup'}
          </button>
        </div>
      </div>

      <PinSheet open={passOpen} onClose={() => setPassOpen(false)} />
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
