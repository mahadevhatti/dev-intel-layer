import { useQuery } from '@tanstack/react-query';
import { fetchManifest, fetchContext, type Manifest, type ContextResult } from '../lib/api-client';

export function useManifest(repoId: string | undefined) {
  return useQuery<Manifest | null>({
    queryKey: ['manifest', repoId],
    queryFn: () => fetchManifest(repoId!),
    enabled: !!repoId,
  });
}

export function useContext(repoId: string | undefined, file: string | undefined) {
  return useQuery<ContextResult>({
    queryKey: ['context', repoId, file],
    queryFn: () => fetchContext(repoId!, file!),
    enabled: !!repoId && !!file,
  });
}
