/* ============================================================
   Downscaling a payment screenshot before it is uploaded.

   This file used to be an IndexedDB store as well, because there was
   nowhere else to put an image: localStorage cannot hold one. Now the
   screenshot goes straight to the private payment-proofs bucket, keyed
   to the payment it evidences, so nothing is kept on the device and the
   whole store has gone.

   What is left is the resize. A phone screenshot is 2-4 MB and the
   useful part is a few hundred kilobytes; uploading the original spends
   the owner's data allowance on a photo of a bank app.
   ============================================================ */

const MAX_EDGE = 1100
const QUALITY = 0.72

async function compress(file: File | Blob): Promise<string> {
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

/** The downscale, as a Blob ready to upload. */
export async function compressToBlob(file: File | Blob): Promise<Blob> {
  const dataUrl = await compress(file)
  const res = await fetch(dataUrl)
  return res.blob()
}
