import { useQuery } from '@tanstack/react-query';
import { fetchAnalytics } from '../lib/api-client';

export function useAnalytics() {
  return useQuery({ queryKey: ['analytics'], queryFn: fetchAnalytics, refetchInterval: 30_000 });
}
