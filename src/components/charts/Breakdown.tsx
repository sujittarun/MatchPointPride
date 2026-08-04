import { useMemo, useState } from 'react'

/* ==================================================================
   Money breakdown — a ring you drill into, designed for a thumb.

   THE RULE THAT SHAPES EVERYTHING HERE: the list is the control, the
   ring is the picture.

   A sunburst is the obvious way to draw nested money and the wrong way
   to let anyone TOUCH it on a phone. Two reasons, both fatal, and
   neither visible on a desktop with a mouse:

   1. A third ring inside 240px is about 14px thick. The app's own rule
      is 44px targets. It is not a control, it is a decoration you can
      occasionally hit.
   2. Arc length is proportional, and real academy data has a long tail.
      A ₹700 line beside ₹84,000 of salaries is 0.6° of arc — under two
      pixels. No amount of care makes that tappable, and nothing in the
      chart can fix it, because the smallness IS the data.

   So every action lives in a full-width row that cannot be smaller than
   ROW_MIN_H whatever the numbers do, and the ring never has to be
   precise enough to hit. Tapping a slice still works, and is a bonus
   rather than the mechanism.

   THERE IS ONE RING, AND THAT IS THE POINT. A thin outer "you are here"
   arc was tried and cut: the breadcrumb already says All money › Expense
   and the hub already says EXPENSE ₹1,32,800 ‹ back, so a 6px arc was a
   third statement of the same fact in the least legible form — and on a
   phone it read as an artifact rather than as context. Cutting it also
   gives the one remaining ring 16px more radius, which is the trade
   worth making when a thumb has to find it.

   NO TEXT IS DRAWN ON AN ARC, ever, at any level. Labels on a 240px
   donut collide the moment two adjacent slices are thin, and "collide"
   on a chart means one number sitting on top of another. Names live in
   the rows and in the hub, where the width is known.

   NO HOVER ANYWHERE. There is no hover on a phone, so nothing may be
   revealed by it — every figure on this screen is either already
   readable or one tap away.
   ================================================================== */

export type Slice = {
  label: string
  value?: number
  color?: string
  children?: Slice[]
}

/** Below this share of its level, a slice is folded into "Other". */
const SMALL = 0.04
/** …but only when folding actually buys a tidier ring. */
const MIN_TO_FOLD = 2

export const IN_RAMP = ['var(--in-1)', 'var(--in-2)', 'var(--in-3)', 'var(--in-4)', 'var(--in-5)']
export const OUT_RAMP = ['var(--out-1)', 'var(--out-2)', 'var(--out-3)', 'var(--out-4)', 'var(--out-5)']

/**
 * Which family a top-level branch belongs to.
 *
 * By LABEL, not by position: the root is sorted by value like every
 * other level, so in a month that spent more than it took, Expense is
 * index 0 — and an index-based rule would paint it green.
 */
export function familyRamp(label: string): string[] {
  return label.toLowerCase().startsWith('exp') ? OUT_RAMP : IN_RAMP
}

export function sliceTotal(s: Slice): number {
  return s.value != null ? s.value : (s.children ?? []).reduce((a, c) => a + sliceTotal(c), 0)
}

/**
 * Fold the long tail into one "Other", so the ring only ever draws arcs
 * a person can see.
 *
 * It absorbs any existing "Other" rather than drawing a second one, and
 * it refuses to fold a single item — turning one 3% slice into one 3%
 * "Other" hides its name and buys nothing. Nothing is lost either way:
 * the fold is drillable and the amounts are unchanged.
 */
function foldSmall(children: Slice[]): Slice[] {
  const total = children.reduce((a, c) => a + sliceTotal(c), 0)
  if (total <= 0) return children

  const big: Slice[] = []
  const small: Slice[] = []
  for (const c of children) {
    const named = c.label.toLowerCase() === 'other'
    if (named || sliceTotal(c) / total < SMALL) small.push(c)
    else big.push(c)
  }

  // Count what would actually go INTO the fold — an existing "Other"
  // with children contributes those, not itself.
  const members = small.flatMap((s) => (s.children?.length ? s.children : [s]))
  if (members.length < MIN_TO_FOLD) return children

  return [
    ...big,
    {
      label: 'Other',
      children: members.slice().sort((a, b) => sliceTotal(b) - sliceTotal(a)),
    },
  ]
}

function arcDash(fromFrac: number, lenFrac: number, circ: number, stroke: number) {
  /* A 3px gap between neighbours, and round caps only when the segment
     is long enough to carry them — a cap adds stroke/2 at each end, so
     on a short arc it would swallow the arc and then some, and a 0.5%
     slice would render fatter than a 2% one. */
  /* One category holding the whole level is a complete ring, not a
     357-degree arc: the 3px separator and the round caps would open a
     ~33px notch in it, which reads as a chart that failed to finish
     drawing rather than as "all of it". */
  if (lenFrac >= 0.999) return { dash: `${circ} 0`, offset: -fromFrac * circ, cap: 'butt' as const }

  let len = lenFrac * circ - 3
  const cap: 'round' | 'butt' = len > stroke * 1.2 ? 'round' : 'butt'
  if (cap === 'round') len -= stroke
  if (len < 0.6) len = 0.6
  return { dash: `${len} ${circ - len}`, offset: -fromFrac * circ, cap }
}

/**
 * The children of a level, exactly as the screen shows them: sorted, and
 * with the long tail folded.
 *
 * Navigation and rendering MUST both go through this. They did not at
 * first — rows drilled by index into `node.children` while the ring drew
 * the folded list, so tapping the folded "Other" either did nothing (no
 * such index) or opened a different category that happened to sit at
 * that position and rendered "Nothing recorded". A synthetic node has no
 * index in the real data; the only stable handle it has is what the user
 * sees, which is its label.
 */
function shownChildren(node: Slice): Slice[] {
  const kids = node.children ?? []
  if (!kids.length) return []
  /* Zero is not a slice. A month with fees but no expenses yet still
     yields an Expense branch, and drawing it puts a 1px artifact on the
     ring and an "Expense 0% ₹0" row under it — both of which read as a
     rendering fault rather than as an empty category. If EVERY child is
     zero the level is empty and the caller shows its empty state. */
  const real = kids.filter((k) => sliceTotal(k) > 0)
  if (!real.length) return []
  const sorted = real.sort((a, b) => sliceTotal(b) - sliceTotal(a))
  return foldSmall(sorted)
}

export function Breakdown({
  data,
  format,
  size = 232,
  emptyText = 'Nothing recorded this month',
}: {
  data: Slice
  format: (n: number) => string
  size?: number
  /** Shown instead of the ring when the whole level is zero. */
  emptyText?: string
}) {
  /* The path is LABELS, not indices — see shownChildren(). Labels are
     unique within a level here because every level arrives already
     grouped by label (revenueBySource, expenseByCategory), and the fold
     absorbs any existing "Other" rather than drawing a second one. */
  const [path, setPath] = useState<string[]>([])
  const [sel, setSel] = useState<number | null>(null)

  /* Resolve defensively. `data` is refetched on every store refresh, so
     a drilled-in path can outlive what it pointed at — a category
     emptied by a voided payment, or a tail that stopped being small
     enough to fold. Stopping at the last label that still resolves beats
     rendering an empty level and calling it a month with no money. */
  const { node, trail } = useMemo(() => {
    let cur = data
    const tr: Slice[] = [data]
    for (const label of path) {
      const kids = shownChildren(cur)
      const i = kids.findIndex((k) => k.label === label)
      if (i < 0) break
      cur = kids[i]
      tr.push(cur)
    }
    return { node: cur, trail: tr }
  }, [data, path])

  /* Which family this level belongs to, decided by the top of the path
     so every level below Revenue is green and every level below Expense
     is red, however deep it goes. */
  const ramp = useMemo(() => (path.length ? familyRamp(path[0]) : null), [path])

  const slices = useMemo(
    () =>
      shownChildren(node).map((s, i) => ({
        ...s,
        color: s.color ?? (ramp ? ramp[Math.min(i, ramp.length - 1)] : familyRamp(s.label)[0]),
        amount: sliceTotal(s),
      })),
    [node, ramp],
  )

  const total = slices.reduce((a, s) => a + s.amount, 0)
  const drilled = path.length > 0
  const chosen = sel != null ? slices[sel] : null

  const R = size / 2
  const MAIN_W = 30
  /** Extra stroke a selected slice gains. */
  const SEL_GROW = 4
  /** How far a selected slice slides outward, along its own mid-angle. */
  const POP = 4

  /* The radius has to be paid for by the SELECTED state, not the resting
     one. An SVG clips at its viewBox, and a slice that has both grown by
     SEL_GROW and slid out by POP reaches
     mainR + (MAIN_W + SEL_GROW) / 2 + POP — so sizing the ring to the
     resting stroke put the tapped slice's outer edge past the edge of
     the box, and it came back with a flat shaved side. It only showed on
     the slice you touched, which is the worst place for it.

     Everything below is derived from this one line, so the ring cannot
     be made to overflow by changing a stroke and forgetting the rest. */
  const mainR = R - (MAIN_W + SEL_GROW) / 2 - POP - 1
  const mainCirc = 2 * Math.PI * mainR

  const back = () => {
    setPath((p) => p.slice(0, -1))
    setSel(null)
  }

  /* Tapping a slice and tapping its row are the same gesture on the same
     thing, so they do the same thing: open it if it opens, otherwise
     select it. They disagreed at first — the arc always selected while
     the row drilled — which meant tapping "Expense" on the ring lit it up
     and tapping "Expense" in the list went inside it. */
  const activate = (i: number) => {
    const s = slices[i]
    if (!s) return
    if (s.children?.length) {
      setPath((p) => [...p, s.label])
      setSel(null)
    } else setSel((cur) => (cur === i ? null : i))
  }

  const hubLabel = chosen ? chosen.label : drilled ? node.label : 'All money'
  const hubValue = chosen ? chosen.amount : total

  return (
    <div className="bd">
      {/* Breadcrumb. Present only when it can do something, so the
          resting state is not carrying a dead control. */}
      {drilled && (
        <div className="bd__crumbs">
          <button className="bd__crumb" onClick={() => { setPath([]); setSel(null) }}>
            {data.label}
          </button>
          {trail.slice(1).map((t, i) => (
            <span key={t.label + i} className="bd__crumb-part">
              <span className="bd__sep" aria-hidden="true">›</span>
              {i === trail.length - 2 ? (
                <b>{t.label}</b>
              ) : (
                <button className="bd__crumb" onClick={() => { setPath(path.slice(0, i + 1)); setSel(null) }}>
                  {t.label}
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {total <= 0 ? (
        <p className="bd__empty">{emptyText}</p>
      ) : (
        <>
          <div className="bd__chart" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
              <g transform={`rotate(-90 ${R} ${R})`}>
                <circle
                  cx={R} cy={R} r={mainR} fill="none"
                  stroke="var(--surface-3)" strokeWidth={MAIN_W} opacity={0.55}
                />
                {(() => {
                  let acc = 0
                  return slices.map((s, i) => {
                    const frac = s.amount / total
                    const from = acc
                    acc += frac
                    const on = sel === i
                    /* The ACTUAL width, not the resting one: arcDash
                       subtracts a round cap's overhang from the arc, and
                       a selected slice is drawing SEL_GROW wider — using
                       the resting figure left the gap to its neighbour
                       shrinking every time it was tapped. */
                    const { dash, offset, cap } = arcDash(
                      from, frac, mainCirc, on ? MAIN_W + SEL_GROW : MAIN_W,
                    )
                    const mid = (from + frac / 2) * 2 * Math.PI
                    const pop = on ? POP : 0
                    return (
                      <circle
                        key={s.label + i}
                        className="bd__seg"
                        cx={R} cy={R} r={mainR} fill="none"
                        stroke={s.color} strokeWidth={on ? MAIN_W + SEL_GROW : MAIN_W}
                        strokeLinecap={cap} strokeDasharray={dash} strokeDashoffset={offset}
                        transform={`translate(${Math.cos(mid) * pop} ${Math.sin(mid) * pop})`}
                        onClick={() => activate(i)}
                      />
                    )
                  })
                })()}
              </g>
            </svg>

            {/* The hub is a real button and the biggest target on screen.
                Going back is the action a thumb reaches for most in a
                drill-down, so it gets the middle of the circle. */}
            <button
              type="button"
              className="bd__hub"
              style={{ width: (mainR - MAIN_W / 2) * 2 - 6, height: (mainR - MAIN_W / 2) * 2 - 6 }}
              onClick={() => (chosen ? setSel(null) : drilled ? back() : undefined)}
              aria-label={
                chosen ? `${chosen.label}, ${format(chosen.amount)}. Tap to clear`
                : drilled ? `Inside ${node.label}. Tap to go back`
                : `All money, ${format(total)}`
              }
            >
              <span className="bd__hub-label">{hubLabel}</span>
              <span className="bd__hub-value">{format(hubValue)}</span>
              <span className="bd__hub-hint">
                {chosen
                  ? 'tap to clear'
                  : drilled
                    ? '‹ back'
                    : `${slices.length} group${slices.length === 1 ? '' : 's'}`}
              </span>
            </button>
          </div>

          <div className="bd__rows">
            {slices.map((s, i) => {
              const deeper = !!s.children?.length
              return (
                <button
                  key={s.label + i}
                  type="button"
                  className={`bd__row${sel === i ? ' is-sel' : ''}`}
                  onClick={() => activate(i)}
                  aria-label={`${s.label}, ${format(s.amount)}, ${Math.round((s.amount / total) * 100)} percent${deeper ? '. Tap to open' : ''}`}
                >
                  <span className="bd__sw" style={{ background: s.color }} />
                  <span className="bd__name">{s.label}</span>
                  <span className="bd__pct">{Math.round((s.amount / total) * 100)}%</span>
                  <span className="bd__amt">{format(s.amount)}</span>
                  <span className="bd__chev" aria-hidden="true">{deeper ? '›' : ''}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
