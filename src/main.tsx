import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App'
import { StoreProvider } from './lib/store'
import ErrorBoundary from './components/ErrorBoundary'
import { installErrorReporting, trackOpen } from './lib/telemetry'

installErrorReporting()
trackOpen()

/* Ask the browser to keep our storage. Safari grants this to installed
   home-screen apps and refuses it for a plain tab, which is the whole
   reason for the manifest — the only thing at stake is the sealed
   session, but losing it means the owner digs out his password. */
void navigator.storage?.persist?.().catch(() => {})

// The boundary sits outside StoreProvider on purpose: a crash while
// reading or migrating stored data is exactly the case where the owner
// most needs a readable screen instead of a blank one.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <StoreProvider>
        <App />
      </StoreProvider>
    </ErrorBoundary>
  </StrictMode>,
)
