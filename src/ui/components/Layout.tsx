import { Outlet, NavLink, useParams, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  GitGraph,
  BookOpen,
  FileCheck,
  Search,
  GitBranch,
  AlertTriangle,
  Wifi,
  WifiOff,
  Loader2,
  ScrollText,
  Activity,
  Workflow,
  Settings,
} from 'lucide-react';
import { RepoSelector } from './RepoSelector';
import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '../lib/api-client';
import { useRepos } from '../hooks/useRepos';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { SearchOverlay } from './SearchOverlay';

const repoNavItems = [
  { to: 'graph', label: 'Dependency Graph', icon: GitGraph },
  { to: 'health', label: 'Health', icon: Activity },
  { to: 'docs', label: 'Documents', icon: FileCheck },
  { to: 'rules', label: 'Rules', icon: BookOpen },
  { to: 'manifest', label: 'Manifest', icon: FileCheck },
  { to: 'context', label: 'Context Inspector', icon: Search },
  { to: 'branches', label: 'Branches', icon: GitBranch },
  { to: 'conflicts', label: 'Conflicts', icon: AlertTriangle },
];

const pageTitles: Record<string, string> = {
  graph: 'Dependency Graph',
  health: 'Health',
  docs: 'Documents',
  rules: 'Rules',
  manifest: 'Manifest',
  context: 'Context Inspector',
  branches: 'Branches',
  conflicts: 'Conflicts',
  logs: 'Activity Logs',
  sessions: 'Sessions',
  webhooks: 'Webhooks',
};

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="card max-w-md text-center">
            <AlertTriangle size={32} className="mx-auto mb-3 text-red-400" />
            <h2 className="text-lg font-semibold text-zinc-200 mb-2">Something went wrong</h2>
            <p className="text-sm text-zinc-400 mb-4">{this.state.error.message}</p>
            <button className="btn-primary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function HealthIndicator() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 10_000,
    retry: 1,
  });

  if (health.isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Loader2 size={12} className="animate-spin" />
        <span>Connecting...</span>
      </div>
    );
  }

  if (health.isError || !health.data) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <WifiOff size={12} className="text-red-400" />
        <span className="text-red-400">Disconnected</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500">
      <Wifi size={12} className="text-emerald-400" />
      <span className="text-emerald-400">Connected</span>
      <span className="ml-auto text-zinc-600">v{health.data.version}</span>
    </div>
  );
}

function Breadcrumbs() {
  const { repoId } = useParams();
  const location = useLocation();
  const { data: repos } = useRepos();

  const pathSegments = location.pathname.split('/').filter(Boolean);
  const currentPage = pathSegments[pathSegments.length - 1];
  let pageTitle = pageTitles[currentPage];
  if (pathSegments[0] === 'sessions' && pathSegments.length > 1) {
    pageTitle = 'Session detail';
  }

  if (!repoId) {
    const globalTitle =
      pathSegments[0] === 'sessions'
        ? pathSegments.length > 1
          ? 'Session detail'
          : pageTitles.sessions
        : pathSegments[0] === 'logs'
          ? pageTitles.logs
          : pathSegments[0] === 'settings' && pathSegments[1] === 'webhooks'
            ? pageTitles.webhooks
            : pageTitle;
    if (!globalTitle && pathSegments.length === 0) return null;
    return (
      <div className="mb-4 flex items-center gap-1.5 text-xs text-zinc-500">
        <NavLink to="/" className="hover:text-zinc-300 transition-colors">
          Dashboard
        </NavLink>
        {globalTitle && (
          <>
            <span className="text-zinc-700">/</span>
            <span className="text-zinc-400">{globalTitle}</span>
          </>
        )}
      </div>
    );
  }

  const repo = repos?.find((r) => r.id === repoId);

  return (
    <div className="mb-4 flex items-center gap-1.5 text-xs text-zinc-500">
      <NavLink to="/" className="hover:text-zinc-300 transition-colors">Dashboard</NavLink>
      <span className="text-zinc-700">/</span>
      <span className="text-zinc-400 font-medium">{repo?.name ?? 'Repository'}</span>
      {pageTitle && (
        <>
          <span className="text-zinc-700">/</span>
          <span className="text-zinc-400">{pageTitle}</span>
        </>
      )}
    </div>
  );
}

export function Layout() {
  const { repoId } = useParams();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-zinc-800 bg-zinc-900 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 border-b border-zinc-800 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold">
            Cx
          </div>
          <div>
            <div className="text-sm font-semibold text-zinc-100">Cortex</div>
            <div className="text-[11px] text-zinc-500">Intelligence Server</div>
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

          <NavLink
            to="/logs"
            className={({ isActive }) =>
              `mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-indigo-600/10 text-indigo-400'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`
            }
          >
            <ScrollText size={16} />
            Activity Logs
          </NavLink>

          <NavLink
            to="/sessions"
            className={({ isActive }) =>
              `mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-indigo-600/10 text-indigo-400'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`
            }
          >
            <Workflow size={16} />
            Sessions
          </NavLink>

          <NavLink
            to="/settings/webhooks"
            className={({ isActive }) =>
              `mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-indigo-600/10 text-indigo-400'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`
            }
          >
            <Settings size={16} />
            Settings
          </NavLink>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="mt-2 flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/30 px-3 py-2 text-left text-[11px] text-zinc-500 transition-colors hover:border-zinc-700 hover:bg-zinc-800/50 hover:text-zinc-300"
          >
            <span className="flex items-center gap-2">
              <Search size={14} />
              Search
            </span>
            <kbd className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
              ⌘K
            </kbd>
          </button>

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
          <HealthIndicator />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-zinc-950 p-6">
        <ErrorBoundary>
          <Breadcrumbs />
          <Outlet />
        </ErrorBoundary>
      </main>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
