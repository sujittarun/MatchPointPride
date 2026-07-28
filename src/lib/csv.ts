import type { AppData, Student } from './types'
import { clampDay, nonNegative, todayISO, uid } from './format'

/* ============================================================
   Student spreadsheet in and out.

   CSV rather than .xlsx: Excel, Numbers and Google Sheets all open
   it by double-click, and it needs no library — which matters when
   the whole app is 78 kB and has one runtime dependency.
   ============================================================ */

const COLUMNS = [
  'Name',
  'Batch',
  'Phone',
  'Guardian',
  'Monthly Fee',
  'Fee Due Day',
  'Joined On',
  'Status',
  'Note',
] as const

function esc(v: string | number | undefined): string {
  const s = String(v ?? '')
  // Quote when the value could otherwise break the row.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function studentsToCSV(data: AppData): string {
  const batchName = new Map(data.batches.map((b) => [b.id, b.name]))
  const rows = data.students.map((s) =>
    [
      s.name,
      batchName.get(s.batchId) ?? '',
      s.phone,
      s.guardian ?? '',
      s.monthlyFee,
      s.feeDueDay,
      s.joinedOn,
      s.active ? 'Active' : 'Inactive',
      s.note ?? '',
    ]
      .map(esc)
      .join(','),
  )
  // BOM so Excel reads UTF-8 names correctly instead of mangling them.
  return '﻿' + [COLUMNS.join(','), ...rows].join('\r\n')
}

/** Split CSV text into rows of cells, honouring quotes and embedded newlines. */
export function parseCSV(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cell += c
      }
      continue
    }
    if (c === '"') {
      quoted = true
    } else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += c
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

export interface ImportReport {
  ok: boolean
  added: number
  updated: number
  skipped: Array<{ row: number; name: string; why: string }>
  message: string
}

/**
 * Upsert students from a spreadsheet. Matching is by name within a batch,
 * so re-importing a corrected sheet edits rows instead of duplicating them.
 * Batches are matched by name and are never created — an unknown batch is
 * reported rather than guessed at.
 */
export function studentsFromCSV(text: string, data: AppData): ImportReport {
  const rows = parseCSV(text)
  if (rows.length < 2) {
    return {
      ok: false,
      added: 0,
      updated: 0,
      skipped: [],
      message: 'That file has no rows under the header.',
    }
  }

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name.toLowerCase())
  const iName = col('Name')
  const iBatch = col('Batch')

  if (iName === -1 || iBatch === -1) {
    return {
      ok: false,
      added: 0,
      updated: 0,
      skipped: [],
      message: 'The sheet needs at least a "Name" and a "Batch" column.',
    }
  }

  const iPhone = col('Phone')
  const iGuardian = col('Guardian')
  const iFee = col('Monthly Fee')
  const iDue = col('Fee Due Day')
  const iJoined = col('Joined On')
  const iStatus = col('Status')
  const iNote = col('Note')

  const byBatchName = new Map(
    data.batches.map((b) => [b.name.trim().toLowerCase(), b]),
  )
  const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')

  const added: Student[] = []
  const updates: Array<{ id: string; patch: Partial<Student> }> = []
  const skipped: ImportReport['skipped'] = []
  const seen = new Set<string>()

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const name = at(row, iName)
    const batchLabel = at(row, iBatch)

    if (!name) {
      skipped.push({ row: r + 1, name: '(blank)', why: 'no name' })
      continue
    }
    const batch = byBatchName.get(batchLabel.toLowerCase())
    if (!batch) {
      skipped.push({
        row: r + 1,
        name,
        why: batchLabel ? `no batch called "${batchLabel}"` : 'no batch given',
      })
      continue
    }

    const key = `${name.toLowerCase()}__${batch.id}`
    if (seen.has(key)) {
      skipped.push({ row: r + 1, name, why: 'duplicate row in the file' })
      continue
    }
    seen.add(key)

    const feeCell = at(row, iFee).replace(/[^0-9.-]/g, '')
    const fee = feeCell ? nonNegative(feeCell) : batch.fee
    const dueCell = at(row, iDue)
    const statusCell = at(row, iStatus).toLowerCase()
    const joined = /^\d{4}-\d{2}-\d{2}$/.test(at(row, iJoined))
      ? at(row, iJoined)
      : todayISO()

    const fields = {
      name,
      batchId: batch.id,
      phone: at(row, iPhone).replace(/\s/g, ''),
      guardian: at(row, iGuardian) || undefined,
      monthlyFee: fee,
      feeDueDay: dueCell ? clampDay(dueCell) : 1,
      joinedOn: joined,
      active: statusCell ? !statusCell.startsWith('in') : true,
      note: at(row, iNote) || undefined,
    }

    const existing = data.students.find(
      (s) => s.name.trim().toLowerCase() === name.toLowerCase() && s.batchId === batch.id,
    )
    if (existing) updates.push({ id: existing.id, patch: fields })
    else added.push({ id: uid('stu'), ...fields })
  }

  const total = added.length + updates.length
  return {
    ok: total > 0,
    added: added.length,
    updated: updates.length,
    skipped,
    message:
      total === 0
        ? 'Nothing could be imported — check the batch names match your batches exactly.'
        : `${added.length} added, ${updates.length} updated` +
          (skipped.length ? `, ${skipped.length} skipped.` : '.'),
    // carried on the object so the caller can apply it in one update()
    ...({ _added: added, _updates: updates } as object),
  } as ImportReport
}

/** Applies what studentsFromCSV worked out. Kept separate so parsing stays pure. */
export function applyImport(draft: AppData, report: ImportReport) {
  const r = report as ImportReport & {
    _added?: Student[]
    _updates?: Array<{ id: string; patch: Partial<Student> }>
  }
  for (const s of r._added ?? []) draft.students.push(s)
  for (const u of r._updates ?? []) {
    const t = draft.students.find((s) => s.id === u.id)
    if (t) Object.assign(t, u.patch)
  }
}

export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
