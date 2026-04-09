import { useQuery } from '@tanstack/react-query';
import { fetchSessions, fetchSession, fetchSessionDelta } from '../lib/api-client';

export function useSessions() {
  return useQuery({ queryKey: ['sessions'], queryFn: fetchSessions, refetchInterval: 10_000 });
}

export function useSession(sessionId: string | undefined) {
  return useQuery({ queryKey: ['session', sessionId], queryFn: () => fetchSession(sessionId!), enabled: !!sessionId });
}

export function useSessionDelta(sessionId: string | undefined) {
  return useQuery({ queryKey: ['session-delta', sessionId], queryFn: () => fetchSessionDelta(sessionId!), enabled: !!sessionId });
}
