const CORTEX_SERVER = process.env.CORTEX_SERVER ?? 'http://localhost:4170';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function serverFetch(endpoint: string, options?: RequestInit): Promise<any | null> {
  try {
    const res = await fetch(`${CORTEX_SERVER}${endpoint}`, {
      ...options,
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Server returned ${res.status}: ${body}`);
      return null;
    }

    return await res.json() as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      console.error('Cortex server not responding. Is it running?');
      console.error('Start it with: npx cortex serve');
    } else {
      console.error('Cannot reach Cortex server:', err instanceof Error ? err.message : String(err));
      console.error('Start it with: npx cortex serve');
    }
    return null;
  }
}
