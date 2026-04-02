import { useQuery } from '@tanstack/react-query';
import { fetchGraph } from '../lib/api-client';

export function useGraph(repoId: string | undefined) {
  return useQuery({
    queryKey: ['graph', repoId],
    queryFn: () => fetchGraph(repoId!),
    enabled: !!repoId,
  });
}
