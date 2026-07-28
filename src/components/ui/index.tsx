import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconAlert, IconArrowDown, IconArrowUp, IconX } from '../icons'
import { useStore } from '../../lib/store'

/* ------------------------------------------------------------------
   Bottom-sheet modal
   ------------------------------------------------------------------ */

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  /* Portalled to <body>: the page wrapper keeps a stacking context from
     its fill-mode entrance animation, which would otherwise trap the
     sheet underneath the bottom tab bar. */
  return createPortal(
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__grab" />
        <div className="modal__head">
          <div className="grow">
            <div className="t-h2">{title}</div>
            {subtitle && <div className="card__sub">{subtitle}</div>}
          </div>
          <button className="btn btn--ghost btn--icon btn--sm" onClick={onClose} aria-label="Close">
            <IconX size={19} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------
   Confirm
   ------------------------------------------------------------------ */

export function Confirm({
  open,
  title,
  body,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn--danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="row gap-12" style={{ alignItems: 'flex-start' }}>
        <div
          className="empty__icon"
          style={{ width: 38, height: 38, color: '#ff8f8f', marginBottom: 0, flexShrink: 0 }}
        >
          <IconAlert size={19} />
        </div>
        <p className="t-sub" style={{ lineHeight: 1.55 }}>
          {body}
        </p>
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------------
   Field
   ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  span,
  children,
}: {
  label: string
  hint?: string
  span?: boolean
  children: ReactNode
}) {
  return (
    <label className={`field${span ? ' span-2' : ''}`}>
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  )
}

/* ------------------------------------------------------------------
   Stat tile
   ------------------------------------------------------------------ */

export function Stat({
  label,
  value,
  foot,
  accent,
  delta,
}: {
  label: string
  value: string
  foot?: ReactNode
  accent?: string
  /** `value` is the real change, so the arrow always points the way the
      number actually moved. `higherIsBetter` (default true) decides the
      colour — for expenses, a rise points up but reads red. */
  delta?: { value: number; suffix?: string; higherIsBetter?: boolean }
}) {
  const dir = !delta ? 'flat' : delta.value > 0.05 ? 'up' : delta.value < -0.05 ? 'down' : 'flat'
  const tone =
    !delta || dir === 'flat'
      ? 'flat'
      : delta.value > 0 === (delta.higherIsBetter ?? true)
        ? 'up'
        : 'down'
  return (
    <div className="stat" style={accent ? ({ '--accent': accent } as CSSProperties) : undefined}>
      <div className="t-label">{label}</div>
      <div className="stat__value num">{value}</div>
      <div className="stat__foot">
        {delta && (
          <span className={`delta delta--${tone}`}>
            {dir === 'up' ? <IconArrowUp size={12} /> : dir === 'down' ? <IconArrowDown size={12} /> : null}
            {Math.abs(delta.value).toFixed(0)}
            {delta.suffix ?? '%'}
          </span>
        )}
        {foot && <span className="truncate">{foot}</span>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------
   Empty state
   ------------------------------------------------------------------ */

export function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode
  title: string
  text?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      <div className="empty__title">{title}</div>
      {text && <p className="empty__text">{text}</p>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------
   Toasts
   ------------------------------------------------------------------ */

export function Toasts() {
  const { toasts } = useStore()
  if (toasts.length === 0) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------
   Segmented control
   ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={`seg__item${o.value === value ? ' seg__item--on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------
   Month stepper
   ------------------------------------------------------------------ */

export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
