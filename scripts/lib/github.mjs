// Tiny GitHub REST client: just what alerts need. Uses the workflow's built-in token.

const LABELS = {
  'price-alert': { color: 'f2c12e', description: 'A watched item is at or under its target price' },
  'source-down': { color: 'c2341b', description: 'Gear Watch cannot read one of its sources' }
};

export function makeGitHub({ token, repo, api = 'https://api.github.com', fetchImpl = fetch }) {
  if (!token || !repo) return null;
  const madeLabels = new Set();

  async function call(method, path, body) {
    const res = await fetchImpl(`${api}/repos/${repo}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'content-type': 'application/json',
        'user-agent': 'gear-watch'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = new Error(`GitHub ${method} ${path} failed: ${res.status} ${data?.message || ''}`.trim());
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function ensureLabel(name) {
    if (madeLabels.has(name) || !LABELS[name]) return;
    try {
      await call('POST', '/labels', { name, ...LABELS[name] });
    } catch (err) {
      if (err.status !== 422) throw err; // 422 = it already exists
    }
    madeLabels.add(name);
  }

  return {
    async createIssue(title, body, labels = []) {
      for (const l of labels) await ensureLabel(l);
      const data = await call('POST', '/issues', { title, body, labels });
      return data.number;
    },
    async comment(number, body) {
      await call('POST', `/issues/${number}/comments`, { body });
    },
    async close(number) {
      await call('PATCH', `/issues/${number}`, { state: 'closed', state_reason: 'completed' });
    },
    async isOpen(number) {
      try {
        const data = await call('GET', `/issues/${number}`);
        return data.state === 'open';
      } catch (err) {
        if (err.status === 404 || err.status === 410) return false;
        throw err;
      }
    }
  };
}
