/**
 * The weekly Korea email — Layer 1 of the Korea intelligence stack.
 *
 * Rendered from the same KoreaSummary as the portal, so the email and the
 * portal never disagree. Table layout + inline styles because that's what
 * email clients render reliably; no external CSS, no web fonts required
 * (Geist is requested, with system fallbacks).
 *
 * Reading order is fixed every week (verdict → three numbers → one voice →
 * one action → market → link), so a client learns where to look.
 */

import type { KoreaSummary } from './summary';

const C = {
  bg: '#FBF9F4', card: '#ffffff', line: '#EBE6D8', soft: '#F5F2E9',
  ink: '#16140F', ink7: '#46423A', ink5: '#6B6557', ink4: '#9A9385',
  brand: '#3e8692', brandDeep: '#1f4651', brandSoft: '#EFF5F4',
  good: '#059669', bad: '#e11d48',
};
const FONT = `Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  heating: { bg: '#d1fae5', fg: '#065f46' },
  cooling: { bg: '#fef3c7', fg: '#92400e' },
  steady: { bg: '#F5F2E9', fg: '#46423A' },
  first: { bg: '#e8f4f5', fg: '#3e8692' },
  unlisted: { bg: '#e0f2fe', fg: '#075985' },
};

export function koreaEmailSubject(s: KoreaSummary): string {
  return s.verdict.headline.replace(/\.$/, '');
}

export function renderKoreaEmail(s: KoreaSummary, opts: { portalUrl: string }): string {
  const st = STATUS_STYLE[s.verdict.status] ?? STATUS_STYLE.steady;
  const quote = s.comments.featured ?? s.comments.quotes[0] ?? null;
  const m = s.market.latest;

  const stat = (label: string, value: string, detail: string) => `
    <td width="33%" valign="top" style="padding:0 4px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:10px">
        <tr><td style="padding:12px">
          <div style="font:600 10px/1.4 ${FONT};letter-spacing:.16em;text-transform:uppercase;color:${C.ink5}">${esc(label)}</div>
          <div style="font:600 22px/1.15 ${FONT};letter-spacing:-.03em;color:${C.ink};margin-top:6px;white-space:nowrap">${value}</div>
          <div style="font:400 12px/1.4 ${FONT};color:${C.ink5};margin-top:4px">${detail}</div>
        </td></tr>
      </table>
    </td>`;

  const stats: string[] = [];
  if (s.stats.share) {
    const d = s.stats.share.prev != null ? `${arrow(s.stats.share.value - s.stats.share.prev)} from ${s.stats.share.prev}%` : 'first week tracked';
    stats.push(stat('Korea’s share', `${s.stats.share.value}%`, d));
  }
  if (s.stats.volume) {
    const r = s.stats.volume.paceRatio;
    // Short notes: on a phone each box is ~100px wide, and long notes wrapped to three lines.
    const d = r == null ? 'no prior week yet' : r >= 1 ? `<span style="color:${C.good}">▲ ${r.toFixed(1)}×</span> daily pace` : `<span style="color:${C.bad}">▼ ${Math.round((1 - r) * 100)}%</span> daily pace`;
    stats.push(stat('Korean volume', usd(s.stats.volume.usd), d));
  }
  stats.push(stat('Korean posts', s.stats.posts.newThisWeek != null ? String(s.stats.posts.newThisWeek) : '—',
    s.stats.posts.total != null ? `new · ${s.stats.posts.total} total` : 'new this week'));
  if (!s.client.listed && s.readiness) {
    const ok = s.readiness.filter((r) => r.ok).length;
    stats.push(stat('Listing readiness', `${ok} of ${s.readiness.length}`, 'checks passing'));
  }

  const section = (inner: string) => `<tr><td style="padding:18px 28px;border-top:1px solid ${C.soft}">${inner}</td></tr>`;
  const h = (t: string) => `<div style="font:600 10px/1.4 ${FONT};letter-spacing:.18em;text-transform:uppercase;color:${C.ink5};margin-bottom:10px">${esc(t)}</div>`;

  const marketLine = m ? [
    `<b style="color:${C.ink}">Korean stocks ${m.kospiPct == null ? 'closed' : m.kospiPct >= 0 ? `rose ${m.kospiPct}%` : `fell ${Math.abs(m.kospiPct)}%`}</b> (KOSPI ${m.kospi.toLocaleString('en-US')})`,
    m.kimchiPct >= 0
      ? `<b style="color:${C.ink}">Koreans are paying ${m.kimchiPct.toFixed(1)}% more for crypto</b> than the rest of the world`
      : `<b style="color:${C.ink}">Koreans are paying ${Math.abs(m.kimchiPct).toFixed(1)}% less for crypto</b> than the rest of the world`,
    m.krCexPct != null ? `overall Korean crypto trading ${m.krCexPct >= 0 ? 'rose' : 'fell'} ${Math.abs(Math.round(m.krCexPct))}%` : null,
  ].filter(Boolean).join(', ') + '.' : null;

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(koreaEmailSubject(s))}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(previewText(s))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${C.card};border:1px solid ${C.line};border-radius:12px;overflow:hidden">
  <tr><td style="padding:16px 28px;border-bottom:1px solid ${C.line}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font:600 14px/1 ${FONT};color:${C.ink}">Holo Hive</td>
      <td align="right" style="font:500 11px/1 ${FONT};letter-spacing:.06em;color:${C.ink5}">${esc(s.client.name.toUpperCase())} · KOREA${s.week ? ` · ${esc(s.week.label.toUpperCase())}` : ''}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:22px 28px">
    <span style="display:inline-block;background:${st.bg};color:${st.fg};font:500 12px/1.5 ${FONT};padding:2px 8px;border-radius:6px">${esc(s.verdict.label)}</span>
    <div style="font:500 22px/1.3 ${FONT};letter-spacing:-.03em;color:${C.ink};margin-top:10px">${esc(s.verdict.headline)}</div>
    ${s.verdict.sub ? `<div style="font:400 15px/1.55 ${FONT};color:${C.ink7};margin-top:8px">${esc(s.verdict.sub)}</div>` : ''}
  </td></tr>
  ${section(`${h('This week in three numbers')}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -4px;table-layout:fixed"><tr>${stats.slice(0, 3).join('')}</tr></table>`)}
  ${quote ? section(`${h('What Koreans are saying')}
    <div style="background:${C.bg};border:1px solid ${C.line};border-radius:10px;padding:14px 16px">
      <div style="font:400 16px/1.45 ${FONT};color:${C.ink}">${esc(quote.ko)}</div>
      ${quote.en ? `<div style="font:400 14px/1.45 ${FONT};color:${C.ink5};margin-top:3px">“${esc(quote.en)}”</div>` : ''}
    </div>`) : ''}
  ${section(`<div style="background:${C.brandSoft};border:1px solid #D4E5E4;border-radius:12px;padding:16px 18px">
      <div style="font:600 10px/1.4 ${FONT};letter-spacing:.18em;text-transform:uppercase;color:${C.brandDeep};margin-bottom:8px">One thing to do this week</div>
      <div style="font:600 16px/1.4 ${FONT};color:${C.ink}">${esc(s.action.text)}</div>
      <div style="font:400 13.5px/1.5 ${FONT};color:${C.ink7};margin-top:6px">${esc(s.action.why)}</div>
    </div>`)}
  ${marketLine ? section(`${h('The Korean market')}<div style="font:400 14.5px/1.6 ${FONT};color:${C.ink7}">${marketLine}</div>`) : ''}
  ${section(`<a href="${escAttr(opts.portalUrl)}" style="display:inline-block;background:${C.brand};color:#ffffff;text-decoration:none;font:500 14px/1 ${FONT};padding:12px 18px;border-radius:8px">See the full Korea report →</a>
    <span style="font:400 13px/1.4 ${FONT};color:${C.ink5};margin-left:10px">Exchanges, history, comments and peers</span>`)}
  <tr><td style="padding:16px 28px 20px;background:${C.bg};font:400 12px/1.6 ${FONT};color:${C.ink4}">
    Sent by your Holo Hive account team. Reply to this email to reach your account lead.<br>
    Figures cover Upbit and Bithumb${s.week ? `, ${esc(s.week.label)}` : ''}. Comments are from your campaign posts.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function previewText(s: KoreaSummary) {
  const bits = [];
  if (s.stats.share) bits.push(`Korea share ${s.stats.share.value}%.`);
  bits.push(`One thing to do: ${s.action.text}`);
  return bits.join(' ');
}
function arrow(d: number) {
  return d > 0 ? `<span style="color:${C.good}">▲</span>` : d < 0 ? `<span style="color:${C.bad}">▼</span>` : '⟷';
}
function usd(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}
function esc(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(s: string) { return esc(s); }
