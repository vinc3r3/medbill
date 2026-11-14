// Browser helper for calling our API routes. Errors carry the server's readable message.

export async function postJson<T>(url: string, body: unknown, init?: { signal?: AbortSignal }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: init?.signal,
    });
  } catch {
    throw new Error("We couldn't reach the server. Check your connection and try again.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : `Something went wrong (error ${response.status}). Please try again.`);
  }
  return data as T;
}
