// Shared helpers for watch.html and index.html. Plain browser JavaScript, no build step.
window.GW = (() => {
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Only real web links make it into an href.
  const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');

  // Typographic apostrophes and quotes for text people read.
  const typo = (s) =>
    String(s ?? '')
      .replace(/(\w)'(\w)/g, '$1\u2019$2')
      .replace(/(^|[\s(])"(\S)/g, '$1\u201c$2')
      .replace(/(\S)"/g, '$1\u201d');

  const money = (n) => {
    if (n == null || !isFinite(n)) return '';
    const whole = Math.abs(n - Math.round(n)) < 0.005;
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
  };

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const ago = (iso) => {
    if (!iso) return '';
    const s = (new Date(iso).getTime() - Date.now()) / 1000;
    const a = Math.abs(s);
    if (a < 90) return 'just now';
    if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
    if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
    return rtf.format(Math.round(s / 86400), 'day');
  };

  const clock = (iso) =>
    new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

  // Daily lows as a small line, with the target as a dashed line.
  function sparkline(daily, target) {
    if (!daily || daily.length < 2) return '';
    const w = 300, h = 40, pad = 3;
    const vals = daily.map((d) => d.low);
    const lo = Math.min(...vals, target), hi = Math.max(...vals, target);
    const span = hi - lo || 1;
    const x = (i) => pad + (i * (w - pad * 2)) / (daily.length - 1);
    const y = (v) => pad + (1 - (v - lo) / span) * (h - pad * 2);
    const pts = daily.map((d, i) => `${x(i).toFixed(1)},${y(d.low).toFixed(1)}`).join(' ');
    const last = daily[daily.length - 1];
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Lowest price each day for the last ${daily.length} days">
      <line class="target" x1="0" x2="${w}" y1="${y(target).toFixed(1)}" y2="${y(target).toFixed(1)}" vector-effect="non-scaling-stroke"/>
      <polyline class="line" points="${pts}" vector-effect="non-scaling-stroke"/>
      <circle class="dot" cx="${x(daily.length - 1).toFixed(1)}" cy="${y(last.low).toFixed(1)}" r="3"/>
    </svg>
    <p class="spark-cap">Lowest price each day, last ${daily.length} days. Dashed line is your target.</p>`;
  }

  async function load() {
    const res = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('data.json returned ' + res.status);
    return res.json();
  }

  return { esc, safeUrl, typo, money, ago, clock, sparkline, load };
})();
