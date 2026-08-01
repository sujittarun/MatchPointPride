/* ============================================================
   What the back gesture should close.

   On the web, a bottom sheet is closed with the X, the scrim or the
   Escape key. On Android there is a fourth way — the system back
   gesture — and it must close the sheet rather than navigate the page
   underneath it. Getting that wrong is the single most obvious way an
   app announces that it is a website in a frame: you swipe back to
   dismiss a dialog and instead the screen behind it changes while the
   dialog stays put.

   So anything modal registers a dismisser while it is open, most
   recent last, and the back handler pops one before it considers
   navigating. `Sheet` is the only component that does this, because
   `Sheet` is the only modal in the app — `Confirm` is a `Sheet`.

   Deliberately not React state or context: this is read once, inside
   an event handler that fires from native code, and a stack it can
   read synchronously is the whole requirement.
   ============================================================ */

type Dismiss = () => void

const stack: Dismiss[] = []

/** Register while open. Returns the unregister, so it fits an effect. */
export function pushDismiss(fn: Dismiss): () => void {
  stack.push(fn)
  return () => {
    const i = stack.lastIndexOf(fn)
    if (i !== -1) stack.splice(i, 1)
  }
}

/** Close the topmost dismissable thing. False when there was nothing. */
export function dismissTop(): boolean {
  const fn = stack.pop()
  if (!fn) return false
  fn()
  return true
}

/** Only for tests — nothing in the app clears the stack wholesale. */
export function dismissDepth(): number {
  return stack.length
}
