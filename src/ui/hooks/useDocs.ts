import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchDocs, fetchDocContent, fetchDocReferences, scanDocs } from '../lib/api-client';

export function useDocs(repoId: string | undefined, docType?: string) {
  return useQuery({
    queryKey: ['docs', repoId, docType],
    queryFn: () => fetchDocs(repoId!, docType),
    enabled: !!repoId,
  });
}

export function useDocContent(repoId: string | undefined, docId: string | undefined) {
  return useQuery({
    queryKey: ['doc-content', repoId, docId],
    queryFn: () => fetchDocContent(repoId!, docId!),
    enabled: !!repoId && !!docId,
  });
}

export function useDocReferences(repoId: string | undefined, docId: string | undefined) {
  return useQuery({
    queryKey: ['doc-refs', repoId, docId],
    queryFn: () => fetchDocReferences(repoId!, docId!),
    enabled: !!repoId && !!docId,
  });
}

export function useScanDocs(repoId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => scanDocs(repoId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docs', repoId] });
    },
  });
}
