import { useCallback, useRef, useState, type ReactNode } from 'react'

/* ==================================================================
   Charts — hand-rolled SVG, no charting dependency.

   Rules held throughout (see README § Design):
   · one value axis per chart, never two scales
   · categorical hues assigned in fixed slot order, never cycled
   · thin marks, 4px rounded data-ends anchored to the baseline,
     2px surface gap between adjacent fills, recessive grid
   · >=2 series always carry a legend, so identity is never colour-alone
   · every plot has a tap/hover tooltip (pointer events, so a finger
     works the same as a mouse)
   ================================================================== */

export const SERIES = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
]

export function seriesColor(slot: number): string {
  return SERIES[(slot - 1 + SERIES.length) % SERIES.length]
}

/* ------------------------------------------------------------------
   Tooltip
   ------------------------------------------------------------------ */

interface TipState {
  x: number
  y: number
  content: ReactNode
}

function useTip() {
  const [tip, setTip] = useState<TipState | null>(null)
  const show = useCallback((e: { clientX: number; clientY: number }, content: ReactNode) => {
    setTip({ x: e.clientX, y: e.clientY, content })
  }, [])
  const hide = useCallback(() => setTip(null), [])
  const node = tip ? (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>
      {tip.content}
    </div>
  ) : null
  return { show, hide, node }
}

export function TipRow({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="chart-tip__row">
      <span className="chart-tip__label">
        {color && <span className="legend-swatch" style={{ background: color }} />}
        {label}
      </span>
      <span className="chart-tip__value">{value}</span>
    </div>
  )
}

/* ------------------------------------------------------------------
   Legend
   ------------------------------------------------------------------ */

export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="chart__legend">
      {items.map((it) => (
        <span className="legend-item" key={it.label}>
          <span className="legend-swatch" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------
   Geometry helpers
   ------------------------------------------------------------------ */

/** Bar anchored to the baseline with only its data-end rounded. */
function barTopRounded(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.max(0, Math.min(r, w / 2, h))
  if (h <= 0.5) return ''
  return [
    `M${x},${y + h}`,
    `V${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    `H${x + w - rr}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `V${y + h}`,
    'Z',
  ].join(' ')
}

function niceMax(v: number): number {
  if (v <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / mag
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * mag
}

/* ==================================================================
   Grouped / single vertical bars — for time series
   ================================================================== */

export interface BarSeries {
  key: string
  label: string
  color: string
}

export function BarChart({
  data,
  series,
  height = 168,
  format,
  showLegend = true,
  valueLabels = false,
}: {
  data: Array<{ label: string } & Record<string, string | number>>
  series: BarSeries[]
  height?: number
  format: (n: number) => string
  showLegend?: boolean
  /** Single-series only: print each value above its bar. Use when the
      values sit close together and the shape alone won't carry them. */
  valueLabels?: boolean
}) {
  const { show, hide, node } = useTip()
  const labelled = valueLabels && series.length === 1
  const W = 340
  const H = height
  const padL = 4
  const padR = 4
  const padT = labelled ? 22 : 10
  const padB = 22

  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const max = niceMax(
    Math.max(
      1,
      ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)),
    ),
  )

  const groupW = plotW / Math.max(1, data.length)
  // 2px gap between adjacent fills inside a group
  const gap = 2
  const inner = Math.min(groupW * 0.66, 34)
  const barW = Math.max(4, (inner - gap * (series.length - 1)) / series.length)

  const y = (v: number) => padT + plotH - (v / max) * plotH

  return (
    <div>
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ height: H }}
        onPointerLeave={hide}
      >
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            className="grid-line"
            x1={padL}
            x2={W - padR}
            y1={padT + plotH * (1 - f)}
            y2={padT + plotH * (1 - f)}
          />
        ))}

        {data.map((d, i) => {
          const gx = padL + groupW * i + (groupW - (barW * series.length + gap * (series.length - 1))) / 2
          return (
            <g key={d.label}>
              {series.map((s, si) => {
                const v = Number(d[s.key]) || 0
                const bx = gx + si * (barW + gap)
                const by = y(v)
                const bh = padT + plotH - by
                return (
                  <path
                    key={s.key}
                    className="bar"
                    d={barTopRounded(bx, by, barW, bh, 4)}
                    fill={s.color}
                    onPointerEnter={(e) =>
                      show(
                        e,
                        <>
                          <div className="chart-tip__title">{d.label}</div>
                          {series.map((ss) => (
                            <TipRow
                              key={ss.key}
                              label={ss.label}
                              color={ss.color}
                              value={format(Number(d[ss.key]) || 0)}
                            />
                          ))}
                        </>,
                      )
                    }
                  />
                )
              })}
              {/* generous invisible hit target over the whole group */}
              <rect
                x={padL + groupW * i}
                y={padT}
                width={groupW}
                height={plotH}
                fill="transparent"
                onPointerDown={(e) =>
                  show(
                    e,
                    <>
                      <div className="chart-tip__title">{d.label}</div>
                      {series.map((ss) => (
                        <TipRow
                          key={ss.key}
                          label={ss.label}
                          color={ss.color}
                          value={format(Number(d[ss.key]) || 0)}
                        />
                      ))}
                    </>,
                  )
                }
              />
              {labelled && (
                <text
                  x={padL + groupW * i + groupW / 2}
                  y={y(Number(d[series[0].key]) || 0) - 7}
                  textAnchor="middle"
                  style={{ fill: 'var(--ink-secondary)', fontSize: 10.5, fontWeight: 620 }}
                >
                  {format(Number(d[series[0].key]) || 0)}
                </text>
              )}
              <text
                className="tick"
                x={padL + groupW * i + groupW / 2}
                y={H - 7}
                textAnchor="middle"
              >
                {d.label}
              </text>
            </g>
          )
        })}

        <line className="axis-line" x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} />
      </svg>
      {showLegend && series.length > 1 && (
        <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
      )}
      {node}
    </div>
  )
}

/* ==================================================================
   Horizontal bars — the right form for labelled categories on a phone
   ================================================================== */

export function HBarChart({
  data,
  format,
  max: maxOverride,
  showValue = true,
}: {
  data: Array<{ label: string; value: number; color?: string; meta?: string }>
  format: (n: number) => string
  max?: number
  showValue?: boolean
}) {
  const max = niceMax(maxOverride ?? Math.max(1, ...data.map((d) => d.value)))

  return (
    <div className="col gap-10">
      {data.map((d, i) => {
        const color = d.color ?? seriesColor(i + 1)
        const w = (d.value / max) * 100
        return (
          <div key={d.label} className="col gap-4">
            <div className="row-between" style={{ gap: 10 }}>
              <span className="t-sub truncate" style={{ fontWeight: 550 }}>
                {d.label}
              </span>
              {showValue && (
                <span className="num" style={{ fontSize: '0.83rem', fontWeight: 640, flexShrink: 0 }}>
                  {format(d.value)}
                </span>
              )}
            </div>
            <div
              style={{
                height: 8,
                borderRadius: 99,
                background: 'var(--surface-3)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.max(w, d.value > 0 ? 3 : 0)}%`,
                  height: '100%',
                  borderRadius: 99,
                  background: color,
                  transition: 'width 520ms var(--ease-out)',
                }}
              />
            </div>
            {d.meta && <div className="t-mut">{d.meta}</div>}
          </div>
        )
      })}
    </div>
  )
}

/* ==================================================================
   Donut
   ================================================================== */

export function Donut({
  data,
  format,
  centerLabel,
  centerValue,
  size = 168,
}: {
  data: Array<{ label: string; value: number; color?: string }>
  format: (n: number) => string
  centerLabel?: string
  centerValue?: string
  size?: number
}) {
  const { show, hide, node } = useTip()
  const total = data.reduce((a, d) => a + d.value, 0)
  const R = size / 2
  const stroke = 22
  const r = R - stroke / 2 - 2
  const circ = 2 * Math.PI * r

  let offset = 0
  const arcs = data.map((d, i) => {
    const frac = total > 0 ? d.value / total : 0
    // 2px visual gap between adjacent fills
    const len = Math.max(0, frac * circ - 2)
    const arc = {
      ...d,
      color: d.color ?? seriesColor(i + 1),
      dash: `${len} ${circ - len}`,
      offset: -offset,
      frac,
    }
    offset += frac * circ
    return arc
  })

  return (
    <div className="col gap-12" style={{ alignItems: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} onPointerLeave={hide}>
          <g transform={`rotate(-90 ${R} ${R})`}>
            <circle cx={R} cy={R} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
            {arcs.map((a) => (
              <circle
                key={a.label}
                cx={R}
                cy={R}
                r={r}
                fill="none"
                stroke={a.color}
                strokeWidth={stroke}
                strokeDasharray={a.dash}
                strokeDashoffset={a.offset}
                style={{ cursor: 'pointer' }}
                onPointerEnter={(e) =>
                  show(
                    e,
                    <>
                      <div className="chart-tip__title">{a.label}</div>
                      <TipRow
                        label={`${(a.frac * 100).toFixed(0)}% of total`}
                        color={a.color}
                        value={format(a.value)}
                      />
                    </>,
                  )
                }
                onPointerDown={(e) =>
                  show(
                    e,
                    <>
                      <div className="chart-tip__title">{a.label}</div>
                      <TipRow
                        label={`${(a.frac * 100).toFixed(0)}% of total`}
                        color={a.color}
                        value={format(a.value)}
                      />
                    </>,
                  )
                }
              />
            ))}
          </g>
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <div>
            <div
              className="num"
              style={{ fontSize: '1.18rem', fontWeight: 670, letterSpacing: '-0.035em' }}
            >
              {centerValue ?? format(total)}
            </div>
            {centerLabel && (
              <div className="t-label" style={{ fontSize: '0.6rem', marginTop: 2 }}>
                {centerLabel}
              </div>
            )}
          </div>
        </div>
      </div>
      <Legend items={arcs.map((a) => ({ label: a.label, color: a.color }))} />
      {node}
    </div>
  )
}

/* ==================================================================
   Trend — area + line with a crosshair
   ================================================================== */

export function TrendChart({
  data,
  format,
  color = 'var(--brand)',
  height = 150,
  allowNegative = false,
}: {
  data: Array<{ label: string; value: number }>
  format: (n: number) => string
  color?: string
  height?: number
  allowNegative?: boolean
}) {
  const { show, hide, node } = useTip()
  const [active, setActive] = useState<number | null>(null)
  const ref = useRef<SVGSVGElement | null>(null)

  const W = 340
  const H = height
  const padT = 12
  const padB = 22
  const padX = 6
  const plotW = W - padX * 2
  const plotH = H - padT - padB

  const values = data.map((d) => d.value)
  const rawMax = Math.max(1, ...values)
  const rawMin = allowNegative ? Math.min(0, ...values) : 0
  const max = niceMax(rawMax)
  const min = rawMin < 0 ? -niceMax(Math.abs(rawMin)) : 0
  const span = max - min || 1

  const x = (i: number) => padX + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW)
  const y = (v: number) => padT + plotH - ((v - min) / span) * plotH

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.value)}`).join(' ')
  const area =
    data.length > 0
      ? `${line} L${x(data.length - 1)},${y(min)} L${x(0)},${y(min)} Z`
      : ''

  const gid = `grad-${color.replace(/[^a-z0-9]/gi, '')}`

  const pick = (clientX: number) => {
    const el = ref.current
    if (!el) return
    const box = el.getBoundingClientRect()
    const rel = ((clientX - box.left) / box.width) * W
    let best = 0
    let bestD = Infinity
    data.forEach((_, i) => {
      const d = Math.abs(x(i) - rel)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    setActive(best)
    return best
  }

  return (
    <div>
      <svg
        ref={ref}
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ height: H }}
        onPointerMove={(e) => {
          const i = pick(e.clientX)
          if (i != null && data[i]) {
            show(e, (
              <>
                <div className="chart-tip__title">{data[i].label}</div>
                <TipRow label="Net" color={color} value={format(data[i].value)} />
              </>
            ))
          }
        }}
        onPointerDown={(e) => {
          const i = pick(e.clientX)
          if (i != null && data[i]) {
            show(e, (
              <>
                <div className="chart-tip__title">{data[i].label}</div>
                <TipRow label="Net" color={color} value={format(data[i].value)} />
              </>
            ))
          }
        }}
        onPointerLeave={() => {
          hide()
          setActive(null)
        }}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            className="grid-line"
            x1={padX}
            x2={W - padX}
            y1={padT + plotH * f}
            y2={padT + plotH * f}
          />
        ))}

        {min < 0 && (
          <line className="axis-line" x1={padX} x2={W - padX} y1={y(0)} y2={y(0)} />
        )}

        <path d={area} fill={`url(#${gid})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {active != null && data[active] && (
          <>
            <line
              x1={x(active)}
              x2={x(active)}
              y1={padT}
              y2={padT + plotH}
              stroke="var(--line-strong)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {/* 2px surface ring so the marker stays legible over the fill */}
            <circle
              cx={x(active)}
              cy={y(data[active].value)}
              r={5}
              fill={color}
              stroke="var(--surface-1)"
              strokeWidth={2}
            />
          </>
        )}

        {data.map((d, i) =>
          i % Math.ceil(data.length / 6) === 0 || i === data.length - 1 ? (
            <text key={d.label} className="tick" x={x(i)} y={H - 6} textAnchor="middle">
              {d.label}
            </text>
          ) : null,
        )}
      </svg>
      {node}
    </div>
  )
}

/* ==================================================================
   Ring gauge — a single percentage
   ================================================================== */

export function Ring({
  value,
  size = 92,
  stroke = 9,
  color,
  label,
}: {
  value: number
  size?: number
  stroke?: number
  color?: string
  label?: string
}) {
  const R = size / 2
  const r = R - stroke / 2 - 1
  const circ = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value))
  const c =
    color ??
    (v >= 95 ? 'var(--good)' : v >= 85 ? 'var(--brand)' : v >= 70 ? 'var(--warning)' : 'var(--critical)')

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${R} ${R})`}>
          <circle cx={R} cy={R} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
          <circle
            cx={R}
            cy={R}
            r={r}
            fill="none"
            stroke={c}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(v / 100) * circ} ${circ}`}
            style={{ transition: 'stroke-dasharray 620ms var(--ease-out)' }}
          />
        </g>
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
        }}
      >
        <div>
          <div
            className="num"
            style={{ fontSize: size > 80 ? '1.05rem' : '0.85rem', fontWeight: 680, letterSpacing: '-0.03em' }}
          >
            {v.toFixed(0)}%
          </div>
          {label && (
            <div className="t-label" style={{ fontSize: '0.54rem', marginTop: 1 }}>
              {label}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ==================================================================
   Sparkline — inline trend, no axes
   ================================================================== */

export function Sparkline({
  values,
  color = 'var(--brand)',
  width = 92,
  height = 30,
}: {
  values: number[]
  color?: string
  width?: number
  height?: number
}) {
  if (values.length === 0) return null
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const x = (i: number) => (values.length === 1 ? width / 2 : (i / (values.length - 1)) * (width - 4) + 2)
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6)
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.6} fill={color} />
    </svg>
  )
}

/* ==================================================================
   Stacked share bar — one row, parts of a whole
   ================================================================== */

export function ShareBar({
  parts,
  height = 10,
}: {
  parts: Array<{ label: string; value: number; color: string }>
  height?: number
}) {
  const total = parts.reduce((a, p) => a + p.value, 0)
  if (total <= 0) {
    return (
      <div style={{ height, borderRadius: 99, background: 'var(--surface-3)' }} />
    )
  }
  return (
    <div style={{ display: 'flex', gap: 2, height, borderRadius: 99, overflow: 'hidden' }}>
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <div
            key={p.label}
            title={`${p.label}: ${p.value}`}
            style={{
              width: `${(p.value / total) * 100}%`,
              background: p.color,
              transition: 'width 520ms var(--ease-out)',
            }}
          />
        ))}
    </div>
  )
}

/* ==================================================================
   Attendance month heatmap
   ================================================================== */

export const ATT_COLOR: Record<string, string> = {
  present: 'var(--good)',
  half: 'var(--warning)',
  leave: 'var(--series-1)',
  absent: 'var(--critical)',
}

export function MonthHeatmap({
  days,
  statusOf,
  onTap,
}: {
  days: string[]
  statusOf: (date: string) => string | undefined
  onTap?: (date: string) => void
}) {
  if (days.length === 0) return null
  const first = days[0]
  const firstDow = new Date(
    Number(first.slice(0, 4)),
    Number(first.slice(5, 7)) - 1,
    Number(first.slice(8, 10)),
  ).getDay()

  const cells: Array<string | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...days,
  ]

  return (
    <div className="col gap-8">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div
            key={i}
            className="t-label"
            style={{ fontSize: '0.56rem', textAlign: 'center', letterSpacing: '0.06em' }}
          >
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`pad-${i}`} />
          const st = statusOf(date)
          const day = Number(date.slice(8, 10))
          return (
            <button
              key={date}
              onClick={onTap ? () => onTap(date) : undefined}
              disabled={!onTap}
              title={`${date}${st ? ` — ${st}` : ' — not marked'}`}
              style={{
                aspectRatio: '1',
                borderRadius: 7,
                border: st ? '1px solid transparent' : '1px dashed var(--line-strong)',
                background: st ? ATT_COLOR[st] ?? 'var(--surface-3)' : 'transparent',
                color: st ? 'rgba(0,0,0,0.72)' : 'var(--ink-muted)',
                fontSize: '0.63rem',
                fontWeight: 650,
                display: 'grid',
                placeItems: 'center',
                cursor: onTap ? 'pointer' : 'default',
                padding: 0,
                minHeight: 30,
              }}
            >
              {day}
            </button>
          )
        })}
      </div>
      <Legend
        items={[
          { label: 'Present', color: ATT_COLOR.present },
          { label: 'Half day', color: ATT_COLOR.half },
          { label: 'Leave', color: ATT_COLOR.leave },
          { label: 'Absent', color: ATT_COLOR.absent },
        ]}
      />
    </div>
  )
}
