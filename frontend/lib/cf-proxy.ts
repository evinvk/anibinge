const CF_PROXY = process.env.CF_PROXY_URL || "";

export async function fetchViaCfProxy(url: string, timeoutMs = 5000): Promise<string> {
  if (!CF_PROXY) throw new Error("CF_PROXY_URL not configured");
  const proxyUrl = `${CF_PROXY}?url=${encodeURIComponent(url)}`;
  const resp = await fetch(proxyUrl, {
    signal: AbortSignal.timeout(timeoutMs),
    next: { revalidate: 3600 },
  });
  if (!resp.ok) throw new Error(`CF Proxy ${resp.status}`);
  return resp.text();
}

export function hasCfProxy(): boolean {
  return !!CF_PROXY;
}
