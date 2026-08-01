import { useEffect } from 'react'
import { match, navigate, useRoute } from './lib/router'
import { useStore } from './lib/store'
import { Toasts } from './components/ui'
import {
  IconBatches,
  IconBell,
  IconGear,
  IconHome,
  IconLogout,
  IconRupee,
  IconStaff,
} from './components/icons'
import { overdueReminders, unmarkedToday } from './lib/selectors'
import { useNativeShell } from './lib/native'
import BrandMark from './components/BrandMark'
import { ACADEMY } from './lib/academy'
import { DEMO } from './lib/demo'

import Landing from './pages/Landing'
import Pay from './pages/Pay'
import Dashboard from './pages/Dashboard'
import Batches from './pages/Batches'
import BatchDetail from './pages/BatchDetail'
import Reminders from './pages/Reminders'
import Staff from './pages/Staff'
import StaffDetail from './pages/StaffDetail'
import StudentDetail from './pages/StudentDetail'
import Finance from './pages/Finance'
import Settings from './pages/Settings'

const TABS = [
  { path: '/app', label: 'Home', Icon: IconHome },
  { path: '/batches', label: 'Batches', Icon: IconBatches },
  { path: '/reminders', label: 'Reminders', Icon: IconBell },
  { path: '/staff', label: 'Staff', Icon: IconStaff },
  { path: '/finance', label: 'Money', Icon: IconRupee },
]

const TITLES: Record<string, string> = {
  '/app': 'Overview',
  '/batches': 'Batches',
  '/reminders': 'Reminders',
  '/staff': 'Staff',
  '/finance': 'Finance',
  '/settings': 'Settings',
}

export default function App() {
  const path = useRoute()
  const { authed, data, logout, loading, loadError, refresh } = useStore()

  /* The Android shell: back gesture, splash, refresh on resume. A no-op
     in a browser. Called above the early return on purpose — the back
     gesture has to work on the locked gate too, where the only screen
     rendered is Landing. */
  useNativeShell(refresh)

  /* The payment page is public and stays public.

     It is the link a parent opens from a fee reminder, and a parent is
     never signed in — so it has to be decided before the gate below,
     and exempted from the bounce. It reads nothing from the database:
     the amount, the UPI id and the payee all arrive in the link,
     already resolved by the signed-in app that sent it. */
  const isPay = path === '/pay' || path.startsWith('/pay?')

  // Anything under the shell requires the gate; bounce back to landing.
  useEffect(() => {
    if (!authed && path !== '/' && !isPay) navigate('/')
  }, [authed, path, isPay])

  if (isPay) return <Pay />
  if (path === '/' || !authed) return <Landing />

  const overdue = overdueReminders(data).length
  const unmarked = unmarkedToday(data)

  const batchDetail = match(path, '/batches/:id')
  const staffDetail = match(path, '/staff/:id')
  const studentDetail = match(path, '/student/:id')

  const title = studentDetail
    ? 'Student'
    : batchDetail
      ? 'Batch'
      : staffDetail
        ? 'Staff member'
        : (TITLES[path] ?? 'Match Point Pride')

  const activeTab =
    TABS.find((t) => path === t.path || path.startsWith(t.path + '/'))?.path ?? ''

  /* The database is the only store now, so a failed read is not a
     cosmetic problem — the screen is empty and the owner has no idea
     why. Say which, and offer the retry, rather than showing an app
     that looks like an academy with no students. */
  /* Demo mode is loud on purpose. The whole point of the switch is that
     it gets turned off again, and the failure mode of forgetting is the
     owner running his academy on invented students — every figure
     plausible, none of them his. A strip he cannot miss costs nothing
     while it is true and everything if it is ever wrong. */
  const banner = DEMO ? (
    <div className="loadbar loadbar--demo">
      <span>Demo mode — login is off and this data is not real.</span>
    </div>
  ) : loadError ? (
    <div className="loadbar loadbar--bad" role="alert">
      <span>{loadError}</span>
      <button type="button" onClick={() => void refresh()}>
        Try again
      </button>
    </div>
  ) : loading && data.students.length === 0 ? (
    <div className="loadbar">
      <span>Loading the academy…</span>
    </div>
  ) : null

  return (
    <div className="shell">
      {banner}
      <header className="topbar">
        <div className="topbar__inner">
          <div className="brandmark">
            <BrandMark size={36} />
            <div style={{ minWidth: 0 }}>
              <div className="topbar__title">{title}</div>
              <div className="topbar__sub">{ACADEMY.name}</div>
            </div>
          </div>
          <div className="row gap-2" style={{ flexShrink: 0 }}>
            <button
              className="btn btn--ghost btn--icon"
              onClick={() => navigate('/settings')}
              aria-label="Settings"
              aria-current={path === '/settings' ? 'page' : undefined}
            >
              <IconGear size={21} />
            </button>
            <button
              className="btn btn--ghost btn--icon"
              onClick={() => {
                logout()
                navigate('/')
              }}
              aria-label="Log out"
            >
              <IconLogout size={21} />
            </button>
          </div>
        </div>
      </header>

      <Route path={path} />

      <nav className="tabbar" aria-label="Main">
        {TABS.map(({ path: p, label, Icon }) => {
          const on = activeTab === p
          const badge = p === '/reminders' ? overdue : p === '/staff' ? unmarked : 0
          return (
            <button
              key={p}
              className={`tab${on ? ' tab--on' : ''}`}
              onClick={() => navigate(p)}
              aria-current={on ? 'page' : undefined}
            >
              <Icon size={21} className="tab__icon" />
              {label}
              {badge > 0 && (
                <span className="tab__badge" aria-label={`${badge} need attention`}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <Toasts />
    </div>
  )
}

function Route({ path }: { path: string }) {
  const batch = match(path, '/batches/:id')
  if (batch) return <BatchDetail id={batch.id} />

  const staff = match(path, '/staff/:id')
  if (staff) return <StaffDetail id={staff.id} />

  const student = match(path, '/student/:id')
  if (student) return <StudentDetail id={student.id} />

  switch (path) {
    case '/app':
      return <Dashboard />
    case '/batches':
      return <Batches />
    case '/reminders':
      return <Reminders />
    case '/staff':
      return <Staff />
    case '/finance':
      return <Finance />
    case '/settings':
      return <Settings />
    default:
      return <Dashboard />
  }
}
