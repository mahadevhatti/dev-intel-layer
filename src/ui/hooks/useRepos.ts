import { useQuery } from '@tanstack/react-query';
import { fetchRepos, fetchRepoDetail, type RepoInfo } from '../lib/api-client';

export function useRepos() {
  return useQuery<RepoInfo[]>({
    queryKey: ['repos'],
    queryFn: fetchRepos,
  });
}

export function useRepoDetail(repoId: string | undefined) {
  return useQuery({
    queryKey: ['repo', repoId],
    queryFn: () => fetchRepoDetail(repoId!),
    enabled: !!repoId,
  });
}
