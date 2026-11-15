export class ProviderHttpError extends Error {
  status: number;
  retryAfterMs?: number;
  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export async function providerFetch(url: string, init?: RequestInit, attempt = 0): Promise<Response> {
  const response = await fetch(url, init);
  if (response.status === 429 && attempt < 4) {
    const header = response.headers.get("retry-after");
    const seconds = header ? Number(header) : NaN;
    const wait = Number.isFinite(seconds) ? seconds * 1000 : 800 * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, Math.min(wait, 15000)));
    return providerFetch(url, init, attempt + 1);
  }
  return response;
}

export async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new ProviderHttpError(text.slice(0, 400) || response.statusText, response.status);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}
