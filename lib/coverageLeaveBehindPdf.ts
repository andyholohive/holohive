/**
 * Coverage Leave-behind → branded PDF (TG Intelligence Layer addendum).
 *
 * Renders the client-safe half of a coverage contract as a paginated A4 PDF.
 *
 * WHY html2canvas AND NOT VECTOR TEXT [2026-07-27]: the heart of this document
 * is `representative_posts[].text` — verbatim Telegram posts, in Korean.
 * jsPDF's built-in fonts (Helvetica et al.) have no Hangul glyphs, so a vector
 * build would silently emit blanks or tofu for exactly the content the client
 * cares about. Embedding Noto Sans KR would fix it at ~5MB of base64 in the
 * bundle. Rendering through the browser instead costs us selectable text but
 * gets correct Korean shaping for free, and matches the existing PDF path in
 * app/forms/[id] rather than introducing a second approach.
 *
 * Section-at-a-time rather than one tall canvas: a single image sliced across
 * pages cuts through the middle of a row or a quote. Measuring each block and
 * deciding the break keeps rows and quotes whole.
 *
 * Client-side only — html2canvas needs a DOM. Import it lazily from the page
 * so neither library lands in the server bundle.
 */

import type { CoverageContract } from '@/lib/coverageAnalysis';

const BRAND = '#3e8692';
const INK = '#111827';
const MUTED = '#6b7280';
const RULE = '#e5e7eb';

/** A4 in mm, with a margin that leaves room for the footer. */
const PAGE = { w: 210, h: 297, margin: 14, footer: 12 };
const CONTENT_W = PAGE.w - PAGE.margin * 2;

function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

function num(n: number | null | undefined): string {
  return n == null ? '—' : Number(n).toLocaleString('en-US');
}

/**
 * Render one HTML block to a canvas at a fixed CSS width, so every section
 * shares a scale and the PDF reads as one document rather than a collage.
 */
async function blockToCanvas(html: string, cssWidth: number): Promise<HTMLCanvasElement> {
  const html2canvas = (await import('html2canvas')).default;
  const holder = document.createElement('div');
  holder.style.cssText =
    `position:fixed;left:-10000px;top:0;width:${cssWidth}px;background:#ffffff;` +
    `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Apple SD Gothic Neo',` +
    `'Malgun Gothic',sans-serif;color:${INK};`;
  holder.innerHTML = html;
  document.body.appendChild(holder);
  try {
    return await html2canvas(holder, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
  } finally {
    document.body.removeChild(holder);
  }
}

interface BuildArgs {
  contract: CoverageContract;
  /** Client / subject display name for the cover line. */
  subjectLabel: string;
  generatedAt: string | null;
  /** mm/dd/yyyy formatter — passed in so this module stays free of date policy. */
  formatDate: (iso: string | null | undefined) => string;
  formatDateTime: (iso: string | null | undefined) => string;
}

/**
 * Build the leave-behind PDF and hand back a Blob. The caller decides whether
 * to download it, attach it to a document record, or both.
 */
export async function buildCoverageLeaveBehindPdf(args: BuildArgs): Promise<Blob> {
  const { contract: c, subjectLabel, generatedAt, formatDate, formatDateTime } = args;
  const { default: jsPDF } = await import('jspdf');

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  // 760px of CSS width maps onto CONTENT_W mm — a comfortable reading measure
  // that keeps table columns from collapsing.
  const CSS_W = 760;

  let y = PAGE.margin;
  let page = 1;

  const addFooter = () => {
    pdf.setFontSize(7);
    pdf.setTextColor(150);
    pdf.text('Confidential — do not redistribute.', PAGE.margin, PAGE.h - 7);
    pdf.text(`${page}`, PAGE.w - PAGE.margin, PAGE.h - 7, { align: 'right' });
  };

  const newPage = () => {
    addFooter();
    pdf.addPage();
    page += 1;
    y = PAGE.margin;
  };

  /** Place a rendered block, breaking the page first if it will not fit. */
  const place = async (html: string, gapAfter = 6) => {
    const canvas = await blockToCanvas(html, CSS_W);
    const h = (canvas.height * CONTENT_W) / canvas.width;
    if (y + h > PAGE.h - PAGE.margin - PAGE.footer) newPage();
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', PAGE.margin, y, CONTENT_W, h);
    y += h + gapAfter;
  };

  // ── Header ────────────────────────────────────────────────────────
  await place(`
    <div style="border-bottom:3px solid ${BRAND};padding-bottom:14px;">
      <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${BRAND};font-weight:700;">
        Organic Coverage
      </div>
      <div style="font-size:30px;font-weight:800;margin-top:6px;line-height:1.15;">${esc(subjectLabel)}</div>
      <div style="font-size:12px;color:${MUTED};margin-top:8px;">
        Trailing ${c.window_days} days
        &nbsp;·&nbsp; ${c.generated_basis.channels_scanned} channels scanned,
        ${c.generated_basis.channels_readable} readable
        &nbsp;·&nbsp; Generated ${esc(generatedAt ? formatDateTime(generatedAt) : '—')}
      </div>
    </div>
  `, 8);

  // ── KPI strip ─────────────────────────────────────────────────────
  const kpi = (label: string, value: string, sub?: string) => `
    <td style="width:25%;padding:0 6px;vertical-align:top;">
      <div style="border:1px solid ${RULE};border-radius:10px;padding:12px 14px;">
        <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${MUTED};font-weight:700;">${esc(label)}</div>
        <div style="font-size:26px;font-weight:800;margin-top:6px;color:${INK};">${esc(value)}</div>
        ${sub ? `<div style="font-size:10px;color:${MUTED};margin-top:3px;">${esc(sub)}</div>` : ''}
      </div>
    </td>`;
  await place(`
    <table style="width:100%;border-collapse:separate;border-spacing:0;"><tr>
      ${kpi('Channels covered', num(c.counts.channels_covered), '≥1 matching post')}
      ${kpi('Posts referencing', num(c.counts.posts_total))}
      ${kpi('% of tracked network', c.counts.pct_of_tracked_network != null ? `${c.counts.pct_of_tracked_network}%` : '—', 'indicative, not complete')}
      ${kpi('Covered more than once', num(c.counts.channels_repeat))}
    </tr></table>
  `);

  // ── Who is covering it ────────────────────────────────────────────
  if (c.channel_type_breakdown.length) {
    const rows = c.channel_type_breakdown.map((r) => `
      <tr>
        <td style="padding:9px 12px;border-top:1px solid ${RULE};font-size:12px;">${esc(r.channel_type)}</td>
        <td style="padding:9px 12px;border-top:1px solid ${RULE};font-size:12px;">${num(r.channels)}</td>
        <td style="padding:9px 12px;border-top:1px solid ${RULE};font-size:12px;">${num(r.posts)}</td>
        <td style="padding:9px 12px;border-top:1px solid ${RULE};font-size:12px;text-align:right;">${num(r.avg_views_per_post)}</td>
      </tr>`).join('');
    await place(`
      <div style="border:1px solid ${RULE};border-radius:10px;overflow:hidden;">
        <div style="padding:11px 12px;font-size:13px;font-weight:700;background:#fafafa;border-bottom:1px solid ${RULE};">
          Who is covering it
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#fafafa;">
            ${['Channel type', 'Channels', 'Posts', 'Avg views / post'].map((h, i) => `
              <th style="padding:7px 12px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;
                         color:${MUTED};text-align:${i === 3 ? 'right' : 'left'};font-weight:700;">${h}</th>`).join('')}
          </tr>
          ${rows}
        </table>
      </div>
    `);
  }

  // ── Velocity ──────────────────────────────────────────────────────
  if (c.velocity.length) {
    const peak = Math.max(...c.velocity.map((v) => v.posts), 1);
    const bars = c.velocity.map((v) => {
      const pct = Math.round((v.posts / peak) * 100);
      return `
        <td style="vertical-align:bottom;padding:0 4px;text-align:center;">
          <div style="font-size:10px;color:${MUTED};margin-bottom:4px;">${v.posts}</div>
          <div style="height:${Math.max(pct, 2)}px;background:${v.posts >= peak ? BRAND : '#9cc3c9'};border-radius:4px 4px 0 0;"></div>
          <div style="font-size:9px;color:${MUTED};margin-top:5px;">${esc(v.month)}</div>
        </td>`;
    }).join('');
    await place(`
      <div style="border:1px solid ${RULE};border-radius:10px;padding:14px;">
        <div style="font-size:13px;font-weight:700;margin-bottom:12px;">Velocity — posts per month</div>
        <table style="width:100%;height:120px;border-collapse:collapse;"><tr>${bars}</tr></table>
      </div>
    `);
  }

  // ── Verbatim posts — one block each so a quote never splits ───────
  if (c.representative_posts.length) {
    await place(`
      <div style="font-size:13px;font-weight:700;">
        What the channels are saying
        <span style="font-weight:400;color:${MUTED};">— top post per channel, verbatim</span>
      </div>
    `, 4);

    for (const p of c.representative_posts) {
      const meta = [
        formatDate(p.posted_at),
        p.views != null ? `${num(p.views)} views` : null,
        `${p.reaction_total ?? 0} reactions`,
      ].filter(Boolean).join(' · ');
      await place(`
        <div style="border:1px solid ${RULE};border-radius:10px;padding:13px 14px;">
          <div style="font-size:12px;font-weight:700;">
            ${esc(p.channel_title || p.channel_handle || 'Channel')}
            ${p.channel_type ? `<span style="font-weight:400;color:${MUTED};"> · ${esc(p.channel_type)}</span>` : ''}
            ${p.is_forward ? `<span style="font-weight:400;color:${MUTED};"> · forwarded</span>` : ''}
          </div>
          <div style="font-size:10px;color:${MUTED};margin-top:2px;">${esc(meta)}</div>
          <div style="font-size:12px;line-height:1.6;margin-top:8px;white-space:pre-wrap;">${esc(p.text)}</div>
        </div>
      `, 5);
    }
  }

  // ── Basis note — say what this number is and is not ───────────────
  await place(`
    <div style="border-top:1px solid ${RULE};padding-top:10px;font-size:10px;color:${MUTED};line-height:1.6;">
      Figures cover the trailing ${c.window_days} days across
      ${c.generated_basis.channels_readable} readable channels of
      ${c.generated_basis.channels_scanned} scanned. Coverage is indicative of the
      tracked network, not a complete census of Telegram.
      ${c.generated_basis.scanned_at_latest
        ? `Most recent scan ${esc(formatDate(c.generated_basis.scanned_at_latest))}.` : ''}
    </div>
  `, 0);

  addFooter();
  return pdf.output('blob');
}
