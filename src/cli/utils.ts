const DIL_SERVER = process.env.DIL_SERVER ?? 'http://localhost:4170';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function serverFetch(endpoint: string, options?: RequestInit): Promise<any | null> {
  try {
    const res = await fetch(`${DIL_SERVER}${endpoint}`, {
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
      console.error('DIL server not responding. Is it running?');
      console.error('Start it with: npx dev-intel serve');
    } else {
      console.error('Cannot reach DIL server:', err instanceof Error ? err.message : String(err));
      console.error('Start it with: npx dev-intel serve');
    }
    return null;
  }
}
