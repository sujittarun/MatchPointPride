/* ============================================================
   Every raster of the mark, from one description of it.
   Run with `npm run icons`; the output is committed.

   Most of the icon is a vector and needs nothing from this file:
   android/.../drawable/ic_launcher_{background,foreground}.xml and
   logo_mark.xml are hand-written VectorDrawables, exact at any
   density. Three places still insist on pixels:

     - Android 7.0 and 7.1 (API 24-25), which predate adaptive icons
       and read a per-density ic_launcher.png out of mipmap-mdpi and
       its siblings
     - the Play Store listing, which wants a 512 PNG
     - the web app's manifest, whose icons were a flat lime square with
       no safe padding, marked "any maskable" — so an Android launcher
       cropped a maskable icon that had nothing to spare and cut the
       shuttlecock's corners off

   The shape below is BrandMark.tsx's, and it is the reason this script
   exists rather than a folder of exported PNGs: when the mark changes,
   this is the one edit, and every size follows.

   Rendered by headless Chrome because it is the renderer already on
   any machine that builds this app, and because it draws the same SVG
   the browser draws — no second implementation of the curve.
   ============================================================ */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/* --- the mark ---------------------------------------------------- */

const BRAND = '#C8FF4D'
const BRAND_DIM = '#A3D62F'
const INK = '#0B1004'

/** The shuttlecock, in BrandMark's 24-unit box. Copied, not re-drawn:
    a bound band, five converging feathers, and a domed cork. */
const SHUTTLE = `
  <path fill="${INK}" d="M8.05,4.3 H15.95 A1.05,1.05 0 0 1 17,5.35 V6.4 H7 V5.35 A1.05,1.05 0 0 1 8.05,4.3 Z M7,6 H8.7 L10.44,15.2 H9.9 Z M9.3,6 H10.7 L11.28,15.2 H11.04 Z M11.3,6 H12.7 L12.12,15.2 H11.88 Z M13.3,6 H14.7 L12.96,15.2 H12.72 Z M15.3,6 H17 L14.1,15.2 H13.56 Z"/>
  <path fill="${INK}" d="M10.1,14.9 H13.9 V17.8 A1.9,1.9 0 0 1 12,19.7 A1.9,1.9 0 0 1 10.1,17.8 Z"/>`

/**
 * @param size    pixels square
 * @param radius  corner rounding as a fraction of size. 0.3 is
 *                BrandMark's tile; 0.5 is a circle.
 * @param glyph   the shuttlecock's width as a fraction of size. 0.58
 *                is what BrandMark uses; a maskable icon needs less,
 *                because a launcher may crop up to 25% off each edge.
 */
function svg(size, radius, glyph) {
  const r = size * radius
  const g = size * glyph
  const off = (size - g) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="tile" x1="0.25" y1="0.067" x2="0.75" y2="0.933">
      <stop offset="0" stop-color="${BRAND}"/>
      <stop offset="1" stop-color="${BRAND_DIM}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="url(#tile)"/>
  <g transform="translate(${off} ${off}) scale(${g / 24})">${SHUTTLE}</g>
</svg>`
}

/* --- what gets written ------------------------------------------- */

const A = 'android/app/src/main/res'

const TARGETS = [
  // Android 7.x only. Rounded tile, and the round variant for launchers
  // that ask for one. Sizes are the launcher icon at each density.
  ...[
    ['mdpi', 48],
    ['hdpi', 72],
    ['xhdpi', 96],
    ['xxhdpi', 144],
    ['xxxhdpi', 192],
  ].flatMap(([d, px]) => [
    { out: `${A}/mipmap-${d}/ic_launcher.png`, size: px, radius: 0.3, glyph: 0.58 },
    { out: `${A}/mipmap-${d}/ic_launcher_round.png`, size: px, radius: 0.5, glyph: 0.52 },
  ]),

  // Play Store listing. Square, no rounding — Google applies its own.
  { out: 'docs/play-store-icon-512.png', size: 512, radius: 0, glyph: 0.58 },

  /* The web app's manifest icons, declared "any maskable". Maskable
     means a launcher may keep only the middle 80% and crop the rest,
     so the glyph is pulled in to 0.44 and the tile is left square —
     rounding it would put transparent corners inside the safe zone and
     read as a floating diamond on an Android home screen. */
  { out: 'public/icon-192.png', size: 192, radius: 0, glyph: 0.44 },
  { out: 'public/icon-512.png', size: 512, radius: 0, glyph: 0.44 },
]

/* --- render ------------------------------------------------------ */

const tmp = mkdtempSync(join(tmpdir(), 'mpp-icons-'))
let made = 0

try {
  for (const t of TARGETS) {
    const src = join(tmp, `in-${t.size}-${t.radius}-${t.glyph}.svg`)
    writeFileSync(src, svg(t.size, t.radius, t.glyph))

    /* --screenshot writes to the working directory as screenshot.png,
       so each render gets its own directory rather than a race. */
    const shot = mkdtempSync(join(tmp, 'shot-'))
    execFileSync(
      CHROME,
      [
        '--headless',
        '--disable-gpu',
        '--hide-scrollbars',
        '--default-background-color=00000000',
        `--screenshot=${join(shot, 'out.png')}`,
        `--window-size=${t.size},${t.size}`,
        `file://${src}`,
      ],
      { stdio: 'pipe' },
    )

    const dest = join(ROOT, t.out)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(join(shot, 'out.png'), dest)
    made++
    console.log(`  ${t.out}  ${t.size}x${t.size}`)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log(`\n${made} icons written from one shape.`)
