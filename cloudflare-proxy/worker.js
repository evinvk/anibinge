// Deploy as a Cloudflare Worker (free tier: 100k req/day)
// 1. Go to https://dash.cloudflare.com/ → Workers & Pages → Create Worker
// 2. Paste this code, deploy
// 3. Set env var CF_PROXY_URL in your Vercel project to the worker URL

const ALLOWED_HOSTS = [
  "animexin.dev",
  "animexin.xyz",
  "animexin.vip",
  "gogoanimehd.to",
  "gogoanime.cl",
  "gogoanime.bid",
  "gogocdn.net",
  "api.comick.dev",
  "api.comick.io",
  "comick.dev",
  "comick.io",
  "comix.to",
  "meo.comick.pictures",
  "meo.comick.io",
  "bato.to",
  "xyz.bato.to",
  "ibighit.bato.to",
  "api.asurascans.com",
  "cdn.asurascans.com",
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = url.searchParams.get("url");
    if (!target) return new Response("Missing ?url=", { status: 400 });

    try {
      const parsed = new URL(target);
      if (!ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith("." + h))) {
        return new Response("Host not in allowlist", { status: 403 });
      }
    } catch {
      return new Response("Invalid URL", { status: 400 });
    }

    const resp = await fetch(target, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": target,
      },
    });

    const body = await resp.arrayBuffer();
    return new Response(body, {
      status: resp.status,
      headers: {
        "Content-Type": resp.headers.get("Content-Type") || "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60",
      },
    });
  },
};
