/* ============================================================
   What a keystroke means to the PIN pad.

   Pulled out of Landing.tsx so it can be tested: that file imports CSS,
   which the node test harness cannot bundle. The DOM-dependent half of
   the guard — ignoring keys while a real field has focus — stays in the
   component, because it needs document.activeElement.
   ============================================================ */

export type PinKey =
  | { kind: 'digit'; value: string }
  | { kind: 'delete' }
  | { kind: 'ignore' }

/**
 * Classify a keydown for the PIN pad.
 *
 * A modifier held means the keystroke belongs to the browser, not to
 * us: Cmd+R is a refresh and Ctrl+Shift+I is devtools, and swallowing
 * either to type a "5" would be worse than the bug this fixes.
 *
 * `e.key` is the digit itself for both the number row and the numpad,
 * so one test covers both keyboards.
 */
export function classifyPinKey(e: {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
}): PinKey {
  if (e.metaKey || e.ctrlKey || e.altKey) return { kind: 'ignore' }
  if (/^[0-9]$/.test(e.key)) return { kind: 'digit', value: e.key }
  if (e.key === 'Backspace') return { kind: 'delete' }
  return { kind: 'ignore' }
}
