import { useQuery } from '@tanstack/react-query';
import DateTime from '../components/DateTime.jsx';
import Link from '../components/Link.jsx';
import QueryBoundary from '../components/QueryBoundary.jsx';
import { StatusBadge } from '../components/Badges.jsx';
import { EmptyState } from '../components/States.jsx';
import { dashboardKey, getDashboard } from '../lib/services/dashboard.js';
import { jobPath } from '../lib/router.js';

const TILES = [
  { key: 'open_count', label: 'Open', status: 'open' },
  { key: 'in_progress_count', label: 'In progress', status: 'in_progress' },
  { key: 'waiting_count', label: 'Waiting', status: 'waiting' },
  { key: 'completed_today_count', label: 'Completed today' },
];

export default function Dashboard() {
  const query = useQuery({ queryKey: dashboardKey, queryFn: getDashboard });
  return (
    <section aria-labelledby="dash-title">
      <div className="page-head">
        <h1 id="dash-title">Dashboard</h1>
        <Link to="/jobs/new" className="button">
          New job
        </Link>
      </div>
      <QueryBoundary query={query} noun="dashboard">
        {(data) => (
          <>
            <ul className="stats-grid" aria-label="Job counts">
              {TILES.map((tile) => (
                <li className="stat" key={tile.key}>
                  <span>{tile.label}</span>
                  <strong>{data[tile.key]}</strong>
                  {tile.status ? (
                    <Link to="/jobs" query={{ status: tile.status }}>
                      View {tile.label.toLowerCase()} jobs
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="panel">
              <h2>Recent jobs</h2>
              {data.recent_jobs.length === 0 ? (
                <EmptyState>No jobs yet. Create the first job to get started.</EmptyState>
              ) : (
                <ul className="list">
                  {data.recent_jobs.map((job) => (
                    <li className="list-item" key={job.id}>
                      <div>
                        <Link to={jobPath(job.id)}>{job.job_number}</Link>
                        <span>
                          {job.customer_name} &middot; {job.vehicle_registration}
                        </span>
                        <small>
                          {job.assigned_mechanic
                            ? `Mechanic: ${job.assigned_mechanic.name}`
                            : 'Unassigned'}{' '}
                          &middot; Updated <DateTime value={job.updated_at} />
                        </small>
                      </div>
                      <StatusBadge status={job.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </QueryBoundary>
    </section>
  );
}
