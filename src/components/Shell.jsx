import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { SessionContext } from '../hooks/useSession.js';
import { useHashLocation } from '../hooks/useHashLocation.js';
import { clearSession } from '../lib/queryClient.js';
import { errorMessage } from '../lib/errors.js';
import { logout } from '../lib/services/auth.js';
import Dashboard from '../pages/Dashboard.jsx';
import JobCreate from '../pages/JobCreate.jsx';
import JobDetail from '../pages/JobDetail.jsx';
import JobsList from '../pages/JobsList.jsx';
import MechanicDetail from '../pages/MechanicDetail.jsx';
import MechanicsList from '../pages/MechanicsList.jsx';
import Settings from '../pages/Settings.jsx';
import Link from './Link.jsx';
import { NotFound } from './States.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', routes: ['dashboard'] },
  { to: '/jobs', label: 'Jobs', routes: ['jobs', 'job', 'job-new'] },
  { to: '/mechanics', label: 'Mechanics', routes: ['mechanics', 'mechanic'] },
  { to: '/settings', label: 'Settings', routes: ['settings'] },
];

function Screen({ location }) {
  const { route, query } = location;
  switch (route.name) {
    case 'dashboard':
      return <Dashboard />;
    case 'jobs':
      return <JobsList query={query} />;
    case 'job-new':
      return <JobCreate />;
    case 'job':
      return <JobDetail key={route.params.id} id={route.params.id} query={query} />;
    case 'mechanics':
      return <MechanicsList query={query} />;
    case 'mechanic':
      return <MechanicDetail key={route.params.id} id={route.params.id} />;
    case 'settings':
      return <Settings />;
    default:
      return <NotFound />;
  }
}

export default function Shell({ session }) {
  const queryClient = useQueryClient();
  const location = useHashLocation();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => clearSession(queryClient),
  });

  useEffect(() => {
    document.title = `GOSSA – ${session.garage.name}`;
  }, [session.garage.name]);

  return (
    <SessionContext.Provider value={session}>
      <a className="skip-link" href="#main-content" onClick={(e) => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>
        Skip to content
      </a>
      <div className="page-shell">
        <header className="topbar">
          <div>
            <strong>{session.garage.name}</strong>
            <small>
              {session.user.name} &middot; {session.user.email}
            </small>
          </div>
          <nav aria-label="Main">
            <ul className="nav-list">
              {NAV.map((item) => {
                const current = item.routes.includes(location.route.name);
                return (
                  <li key={item.to}>
                    <Link to={item.to} current={current} className="nav-link">
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div>
            <button
              type="button"
              className="ghost"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </header>
        {logoutMutation.error ? (
          <p className="notice notice-error" role="alert">
            Sign out failed. {errorMessage(logoutMutation.error)}
          </p>
        ) : null}
        <main id="main-content" tabIndex={-1}>
          <Screen location={location} />
        </main>
      </div>
    </SessionContext.Provider>
  );
}
