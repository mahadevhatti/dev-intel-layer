import { useNavigate, useParams } from 'react-router-dom';
import { useRepos } from '../hooks/useRepos';
import { Database } from 'lucide-react';

export function RepoSelector() {
  const { repoId } = useParams();
  const { data: repos, isLoading } = useRepos();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-500">
        <Database size={14} />
        Loading repos...
      </div>
    );
  }

  if (!repos || repos.length === 0) {
    return (
      <div className="rounded-lg bg-zinc-800/50 px-3 py-2 text-center text-xs text-zinc-500">
        No repos registered yet.
        <br />
        <span className="text-zinc-600">Connect an AI agent to get started.</span>
      </div>
    );
  }

  return (
    <select
      value={repoId ?? ''}
      onChange={(e) => {
        const val = e.target.value;
        if (val) {
          navigate(`/repos/${val}/graph`);
        } else {
          navigate('/');
        }
      }}
      className="select text-sm"
    >
      <option value="">Select a repository…</option>
      {repos.map((repo) => (
        <option key={repo.id} value={repo.id}>
          {repo.name} ({repo.status})
        </option>
      ))}
    </select>
  );
}
