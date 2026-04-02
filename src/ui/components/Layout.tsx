import { Outlet, NavLink, useParams } from 'react-router-dom';
import {
  LayoutDashboard,
  GitGraph,
  BookOpen,
  FileCheck,
  Search,
  GitBranch,
  AlertTriangle,
  Server,
} from 'lucide-react';
import { RepoSelector } from './RepoSelector';
import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '../lib/api-client';

const repoNavItems = [
  { to: 'graph', label: 'Dependency Graph', icon: GitGraph },
  { to: 'rules', label: 'Rules', icon: BookOpen },
  { to: 'manifest', label: 'Manifest', icon: FileCheck },
  { to: 'context', label: 'Context Inspector', icon: Search },
  { to: 'branches', label: 'Branches', icon: GitBranch },
  { to: 'conflicts', label: 'Conflicts', icon: AlertTriangle },
];

export function Layout() {
  const { repoId } = useParams();
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 10_000 });

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-zinc-800 bg-zinc-900">
        {/* Logo */}
        <div className="flex items-center gap-2.5 border-b border-zinc-800 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold">
            DI
          </div>
          <div>
            <div className="text-sm font-semibold text-zinc-100">Dev Intel</div>
            <div className="text-[11px] text-zinc-500">Intelligence Layer</div>
          </div>
        </div>

        {/* Repo Selector */}
        <div className="border-b border-zinc-800 px-3 py-3">
          <RepoSelector />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-indigo-600/10 text-indigo-400'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`
            }
          >
            <LayoutDashboard size={16} />
            Dashboard
          </NavLink>

          {repoId && (
            <div className="mt-4">
              <div className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Repository
              </div>
              {repoNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={`/repos/${repoId}/${item.to}`}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-indigo-600/10 text-indigo-400'
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                    }`
                  }
                >
                  <item.icon size={16} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          )}
        </nav>

        {/* Server status */}
        <div className="border-t border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Server size={12} />
            <span>
              {health.data ? (
                <span className="text-emerald-400">Connected</span>
              ) : (
                <span className="text-red-400">Disconnected</span>
              )}
            </span>
            {health.data && (
              <span className="ml-auto text-zinc-600">v{health.data.version}</span>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-zinc-950 p-6">
        <Outlet />
      </main>
    </div>
  );
}
