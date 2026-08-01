/* The academy mark: a shuttlecock silhouette in ink on the brand lime.
   Shared by the landing hero and the app top bar so the two never drift.

   The geometry lives in three more places — the Android adaptive icon,
   the splash drawable and scripts/icons.mjs — because a launcher cannot
   read a React component. They are all this drawing; if it changes,
   `npm run icons` and the two XML vectors change with it.

   Why it is shaped the way it is. The first version was a plain
   trapezoid with a detached circle under it, which is a fair shorthand
   for a shuttlecock at 36px in a top bar with the academy's name beside
   it. As a home-screen icon at 48dp with nothing around it, it read as
   an exclamation mark. Two changes fix that and cost nothing anywhere
   else: the feathers are separated, and the cork is joined to them. */

/* The proportion that matters is flare: the skirt is 10 units across
   the top and 4.2 across the bottom, against 15.4 tall overall. Drawn
   narrower it reads as a whisk or a paintbrush, which is the failure
   mode this shape has at 48dp. */

/** Feather skirt: the binding band, then five converging feathers. */
const SKIRT =
  // the binding the feathers are gathered into
  'M8.05,4.3 H15.95 A1.05,1.05 0 0 1 17,5.35 V6.4 H7 V5.35 A1.05,1.05 0 0 1 8.05,4.3 Z ' +
  // five feathers. They start at 6.0, inside the band's 6.4, so the
  // join is an overlap rather than a seam that shows at every size.
  'M7,6 H8.7 L10.44,15.2 H9.9 Z ' +
  'M9.3,6 H10.7 L11.28,15.2 H11.04 Z ' +
  'M11.3,6 H12.7 L12.12,15.2 H11.88 Z ' +
  'M13.3,6 H14.7 L12.96,15.2 H12.72 Z ' +
  'M15.3,6 H17 L14.1,15.2 H13.56 Z'

/** Cork: a flat top the feathers bind into, and a domed base. Overlaps
    the feathers by the same trick and for the same reason. */
const CORK = 'M10.1,14.9 H13.9 V17.8 A1.9,1.9 0 0 1 12,19.7 A1.9,1.9 0 0 1 10.1,17.8 Z'

export default function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="brandmark__logo"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      <svg
        width={Math.round(size * 0.58)}
        height={Math.round(size * 0.58)}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path d={SKIRT} fill="#0B1004" />
        <path d={CORK} fill="#0B1004" />
      </svg>
    </span>
  )
}
