import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '../lib/telemetry'

/* ============================================================
   The last thing between a render crash and a blank white screen.

   A blank screen on the owner's phone is the worst outcome here: it
   looks like the data is gone. It usually isn't — the data is in
   localStorage and a reload brings it back — so the fallback says so
   plainly and offers the reload, rather than making him guess.

   Reload rather than "try again": once a render has thrown, the tree's
   state is not trustworthy, and re-rendering the same state normally
   just throws again.
   ============================================================ */

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError({
      msg: error.message,
      // React's component stack points at the component that threw,
      // which is far more useful than a minified bundle offset.
      src: (info.componentStack || '').trim().split('\n')[0]?.trim().slice(0, 80) || 'render',
      stack: error.stack ?? null,
    })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="crash">
        <div className="crash__mark" aria-hidden="true">
          !
        </div>
        <h1 className="crash__title">Something went wrong</h1>
        <p className="crash__body">
          Your data is safe — it's stored on this phone, not in the screen that just
          failed. Reloading almost always fixes it.
        </p>
        <button
          type="button"
          className="btn btn--primary crash__action"
          onClick={() => location.reload()}
        >
          Reload the app
        </button>
        <p className="crash__note">
          If it keeps happening, take a screenshot of this and send it on.
        </p>
        <pre className="crash__detail">{error.message}</pre>
      </div>
    )
  }
}
