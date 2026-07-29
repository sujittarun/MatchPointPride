/* ============================================================
   Payment screenshots.

   These cannot live in localStorage: one phone screenshot is
   comfortably larger than the whole rest of the document, and a
   handful would blow the ~5 MB quota and take the academy's data
   down with them. So images go to IndexedDB (tens of MB), keyed by
   id, and the JSON document only ever stores the key.

   Every screenshot is downscaled and re-encoded before it is stored:
   a 3 MB camera-roll capture becomes ~60 KB and is still perfectly
   readable as a UPI receipt.
   ============================================================ */

const DB = 'mpp-images'
const STORE = 'images'
const MAX_EDGE = 1100
const QUALITY = 0.72

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        t.oncomplete = () => db.close()
      }),
  )
}

/** Shrink and re-encode so a screenshot costs kilobytes, not megabytes. */
export async function compress(file: File | Blob): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read that image.')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  return canvas.toDataURL('image/jpeg', QUALITY)
}

export async function putImage(file: File | Blob): Promise<string> {
  const dataUrl = await compress(file)
  const id = `img_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await tx('readwrite', (s) => s.put(dataUrl, id))
  return id
}

/** Stores an already-encoded data URL — used when restoring a backup. */
export async function putRaw(id: string, dataUrl: string): Promise<void> {
  await tx('readwrite', (s) => s.put(dataUrl, id))
}

export async function getImage(id: string): Promise<string | null> {
  try {
    return (await tx<string>('readonly', (s) => s.get(id))) ?? null
  } catch {
    return null
  }
}

export async function deleteImage(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id))
  } catch {
    /* nothing to clean up */
  }
}

/** Every stored screenshot, so backups carry the evidence with the record. */
export async function allImages(): Promise<Record<string, string>> {
  try {
    const db = await open()
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly')
      const store = t.objectStore(STORE)
      const keys = store.getAllKeys()
      const vals = store.getAll()
      t.oncomplete = () => {
        const out: Record<string, string> = {}
        ;(keys.result as string[]).forEach((k, i) => {
          out[k] = (vals.result as string[])[i]
        })
        db.close()
        resolve(out)
      }
      t.onerror = () => reject(t.error)
    })
  } catch {
    return {}
  }
}
