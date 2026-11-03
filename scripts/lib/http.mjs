// Polite GET with a timeout and one retry. Sites that block automated requests
// usually answer 403 or send an HTML challenge page; both count as failures.

const HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  accept: 'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9'
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function getText(url, { fetchImpl = fetch, timeoutMs = 25000, retries = 1, retryDelayMs = 3000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
      return await res.text();
    } catch (err) {
      const host = new URL(url).host;
      if (err.name === 'TimeoutError') lastErr = new Error(`Timed out after ${timeoutMs / 1000}s (${host})`);
      else if (err.message === 'fetch failed') {
        const why = err.cause?.code || err.cause?.message || 'network error';
        lastErr = new Error(`Couldn't connect to ${host} (${why})`);
      } else lastErr = err;
      if (attempt < retries) await sleep(retryDelayMs);
    }
  }
  throw lastErr;
}
