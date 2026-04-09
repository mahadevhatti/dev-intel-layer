import { useQuery } from '@tanstack/react-query';
import { fetchRepoHealth } from '../lib/api-client';

export function useRepoHealth(repoId: string | undefined) {
  return useQuery({
    queryKey: ['health', repoId],
    queryFn: () => fetchRepoHealth(repoId!),
    enabled: !!repoId,
    refetchInterval: 30_000,
  });
}
