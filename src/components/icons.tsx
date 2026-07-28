/* Inline SVG icon set — 24x24 grid, 1.7 stroke, currentColor.
   Kept in one file so there is no icon dependency to maintain. */

import type { CSSProperties, ReactNode } from 'react'

type P = { size?: number; className?: string; strokeWidth?: number; style?: CSSProperties }

function S({
  size = 20,
  className,
  strokeWidth = 1.7,
  style,
  children,
}: P & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const IconHome = (p: P) => (
  <S {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20h13V9.5" />
    <path d="M9.5 20v-5.5h5V20" />
  </S>
)

export const IconBatches = (p: P) => (
  <S {...p}>
    <circle cx="8" cy="8" r="3" />
    <circle cx="17" cy="9.5" r="2.4" />
    <path d="M2.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M15 14.2c2.6.2 4.5 2.1 4.5 4.8" />
  </S>
)

export const IconBell = (p: P) => (
  <S {...p}>
    <path d="M18 8.5a6 6 0 0 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" />
    <path d="M10.3 19a2 2 0 0 0 3.4 0" />
  </S>
)

export const IconStaff = (p: P) => (
  <S {...p}>
    <circle cx="10" cy="7.5" r="3.5" />
    <path d="M3.5 20c0-3.6 2.9-6 6.5-6 1.2 0 2.3.3 3.2.7" />
    <path d="m15.5 17.5 2 2 4-4.5" />
  </S>
)

export const IconRupee = (p: P) => (
  <S {...p}>
    <path d="M7 4h10" />
    <path d="M7 8.5h10" />
    <path d="M12.5 4c3 0 4.5 1.8 4.5 4.2S15.5 13 12.5 13H7l8 7" />
  </S>
)

export const IconGear = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 14.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-3-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 3 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1.2Z" />
  </S>
)

export const IconPlus = (p: P) => (
  <S {...p} strokeWidth={p.strokeWidth ?? 2}>
    <path d="M12 5v14M5 12h14" />
  </S>
)

export const IconX = (p: P) => (
  <S {...p} strokeWidth={p.strokeWidth ?? 1.9}>
    <path d="M6 6l12 12M18 6 6 18" />
  </S>
)

export const IconPencil = (p: P) => (
  <S {...p}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="m14.5 6.5 3 3" />
  </S>
)

export const IconTrash = (p: P) => (
  <S {...p}>
    <path d="M4 7h16" />
    <path d="M9.5 7V5h5v2" />
    <path d="M6.5 7l.8 12.2A1.8 1.8 0 0 0 9 21h6a1.8 1.8 0 0 0 1.8-1.8L17.5 7" />
    <path d="M10.5 11v6M13.5 11v6" />
  </S>
)

export const IconChevronRight = (p: P) => (
  <S {...p}>
    <path d="m9 5 7 7-7 7" />
  </S>
)

export const IconChevronLeft = (p: P) => (
  <S {...p}>
    <path d="m15 5-7 7 7 7" />
  </S>
)

export const IconChevronDown = (p: P) => (
  <S {...p}>
    <path d="m5 9 7 7 7-7" />
  </S>
)

export const IconCheck = (p: P) => (
  <S {...p} strokeWidth={p.strokeWidth ?? 2}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </S>
)

export const IconWhatsApp = ({ size = 20, className, style }: P) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    style={style}
    aria-hidden="true"
    focusable="false"
  >
    <path d="M12.04 2C6.6 2 2.2 6.4 2.2 11.84c0 1.9.53 3.68 1.46 5.2L2 22l5.1-1.62a9.8 9.8 0 0 0 4.94 1.33h.01c5.43 0 9.84-4.4 9.84-9.84 0-2.63-1.02-5.1-2.88-6.96A9.78 9.78 0 0 0 12.04 2Zm0 18.06c-1.55 0-3.07-.42-4.4-1.2l-.32-.19-3.02.96.96-2.95-.2-.33a8.16 8.16 0 0 1-1.25-4.35c0-4.52 3.68-8.2 8.2-8.2 2.19 0 4.25.86 5.8 2.4a8.15 8.15 0 0 1 2.4 5.8c0 4.53-3.68 8.06-8.17 8.06Zm4.49-6.11c-.24-.13-1.45-.72-1.68-.8-.22-.08-.39-.12-.55.12s-.63.8-.77.96c-.14.17-.28.19-.52.06a6.7 6.7 0 0 1-1.97-1.22 7.4 7.4 0 0 1-1.37-1.7c-.14-.24-.01-.37.11-.49.11-.11.24-.28.36-.42.12-.15.16-.25.24-.41.08-.17.04-.31-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.43.06-.65.3-.22.24-.85.83-.85 2.03s.87 2.35.99 2.51c.12.17 1.72 2.62 4.16 3.68.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.45-.6 1.65-1.17.2-.58.2-1.07.14-1.17-.06-.11-.22-.17-.46-.29Z" />
  </svg>
)

export const IconPhone = (p: P) => (
  <S {...p}>
    <path d="M15.5 21A13.5 13.5 0 0 1 3 8.5 2.5 2.5 0 0 1 5.5 6h1.8a1 1 0 0 1 1 .8l.7 3a1 1 0 0 1-.5 1.1l-1.3.7a10.6 10.6 0 0 0 4.7 4.7l.7-1.3a1 1 0 0 1 1.1-.5l3 .7a1 1 0 0 1 .8 1v1.8A2.5 2.5 0 0 1 15.5 21Z" />
  </S>
)

export const IconClock = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </S>
)

export const IconCalendar = (p: P) => (
  <S {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </S>
)

export const IconDownload = (p: P) => (
  <S {...p}>
    <path d="M12 3v12" />
    <path d="m7.5 11 4.5 4.5 4.5-4.5" />
    <path d="M4.5 20.5h15" />
  </S>
)

export const IconUpload = (p: P) => (
  <S {...p}>
    <path d="M12 16V4" />
    <path d="M7.5 8.5 12 4l4.5 4.5" />
    <path d="M4.5 20.5h15" />
  </S>
)

export const IconLogout = (p: P) => (
  <S {...p}>
    <path d="M9.5 3.5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h3.5" />
    <path d="M15.5 8 20 12l-4.5 4" />
    <path d="M20 12H9.5" />
  </S>
)

export const IconLock = (p: P) => (
  <S {...p}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 1 1 8 0v3" />
  </S>
)

export const IconArrowUp = (p: P) => (
  <S {...p} strokeWidth={p.strokeWidth ?? 2.2}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </S>
)

export const IconArrowDown = (p: P) => (
  <S {...p} strokeWidth={p.strokeWidth ?? 2.2}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </S>
)

export const IconAlert = (p: P) => (
  <S {...p}>
    <path d="M12 3.5 21 19H3l9-15.5Z" />
    <path d="M12 10v4M12 17h.01" />
  </S>
)

export const IconSearch = (p: P) => (
  <S {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </S>
)

export const IconShuttle = (p: P) => (
  <S {...p}>
    <path d="M12 3 7 13.5h10L12 3Z" />
    <path d="M9.6 8.3h4.8" />
    <circle cx="12" cy="17.5" r="3.5" />
  </S>
)

export const IconTrophy = (p: P) => (
  <S {...p}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 5.5H4.5V7A3.5 3.5 0 0 0 7 10.3M17 5.5h2.5V7A3.5 3.5 0 0 1 17 10.3" />
    <path d="M12 14v3.5M8.5 20.5h7" />
  </S>
)

export const IconUsers = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5" />
  </S>
)

export const IconSpark = (p: P) => (
  <S {...p}>
    <path d="M12 3v5M12 16v5M3 12h5M16 12h5" />
    <path d="m6.3 6.3 3 3M14.7 14.7l3 3M17.7 6.3l-3 3M9.3 14.7l-3 3" />
  </S>
)
