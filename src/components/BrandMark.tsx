/* The academy mark: a shuttlecock silhouette in ink on the brand lime.
   Shared by the landing hero and the app top bar so the two never drift. */

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
        {/* feather skirt */}
        <path
          d="M9.5 12.9 L6.9 4.9 A1.1 1.1 0 0 1 7.95 3.4 H16.05 A1.1 1.1 0 0 1 17.1 4.9 L14.5 12.9 Z"
          fill="#0B1004"
        />
        {/* cork */}
        <circle cx="12" cy="17.6" r="3.5" fill="#0B1004" />
      </svg>
    </span>
  )
}
