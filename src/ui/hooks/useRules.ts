import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchRules,
  fetchCrossRepoRules,
  createRule,
  updateRule,
  createCrossRepoRule,
  type KnowledgeRule,
} from '../lib/api-client';

export function useRules(repoId: string | undefined) {
  return useQuery<KnowledgeRule[]>({
    queryKey: ['rules', repoId],
    queryFn: () => fetchRules(repoId!),
    enabled: !!repoId,
  });
}

export function useCrossRepoRules() {
  return useQuery<KnowledgeRule[]>({
    queryKey: ['rules', 'cross-repo'],
    queryFn: fetchCrossRepoRules,
  });
}

export function useCreateRule(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { type: string; content: string; scope?: string; tags?: string[] }) =>
      createRule(repoId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rules', repoId] });
    },
  });
}

export function useUpdateRule(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, data }: { ruleId: string; data: Partial<KnowledgeRule> }) =>
      updateRule(repoId, ruleId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rules', repoId] });
    },
  });
}

export function useCreateCrossRepoRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { type: string; content: string; tags?: string[] }) =>
      createCrossRepoRule(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rules', 'cross-repo'] });
    },
  });
}
