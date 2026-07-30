import { fetchViaCfProxy, hasCfProxy } from "@/lib/cf-proxy";

const GOGO_BASE = "https://gogoanimehd.to";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export async function fetchGogoApi(path: string, timeoutMs = 10000): Promise<any> {
  const url = `${GOGO_BASE}${path}`;
  // Try direct first
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, Referer: `${GOGO_BASE}/` },
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) return resp.json();
  } catch {}
  // Fallback to CF Worker proxy
  if (!hasCfProxy()) throw new Error("GogoAnime blocked and no CF proxy configured");
  const text = await fetchViaCfProxy(url, timeoutMs);
  return JSON.parse(text);
}

export { GOGO_BASE, UA };
