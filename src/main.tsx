import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App'
import { StoreProvider } from './lib/store'
import ErrorBoundary from './components/ErrorBoundary'
import { installErrorReporting } from './lib/telemetry'

installErrorReporting()

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
