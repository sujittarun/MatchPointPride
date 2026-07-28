import { useEffect } from 'react'
import { match, navigate, useRoute } from './lib/router'
import { useStore } from './lib/store'
import { Toasts } from './components/ui'
import {
  IconBatches,
  IconBell,
  IconGear,
  IconHome,
  IconRupee,
  IconStaff,
} from './components/icons'
import { overdueReminders, unmarkedToday } from './lib/selectors'
import BrandMark from './components/BrandMark'
import { ACADEMY } from './lib/academy'

import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Batches from './pages/Batches'
import BatchDetail from './pages/BatchDetail'
import Reminders from './pages/Reminders'
import Staff from './pages/Staff'
import StaffDetail from './pages/StaffDetail'
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
  const { authed, data } = useStore()

  // Anything under the shell requires the gate; bounce back to landing.
  useEffect(() => {
    if (!authed && path !== '/') navigate('/')
  }, [authed, path])

  if (path === '/' || !authed) return <Landing />

  const overdue = overdueReminders(data).length
  const unmarked = unmarkedToday(data)

  const batchDetail = match(path, '/batches/:id')
  const staffDetail = match(path, '/staff/:id')

  const title = batchDetail
    ? 'Batch'
    : staffDetail
      ? 'Staff member'
      : (TITLES[path] ?? 'Match Point Pride')

  const activeTab =
    TABS.find((t) => path === t.path || path.startsWith(t.path + '/'))?.path ?? ''

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__inner">
          <div className="brandmark">
            <BrandMark size={36} />
            <div style={{ minWidth: 0 }}>
              <div className="topbar__title">{title}</div>
              <div className="topbar__sub">{ACADEMY.name}</div>
            </div>
          </div>
          <button
            className="btn btn--ghost btn--icon"
            onClick={() => navigate('/settings')}
            aria-label="Settings"
            aria-current={path === '/settings' ? 'page' : undefined}
          >
            <IconGear size={21} />
          </button>
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
