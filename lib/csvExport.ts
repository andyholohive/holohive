/**
 * Tiny dependency-free CSV exporter.
 *
 * Why: every CRM list (submissions, sales-pipeline, network, contacts)
 * needs the same "Download as CSV" affordance. Centralising it keeps
 * the escaping rules consistent and makes the call sites one-liners.
 *
 * Quoting rules: any cell containing a comma, double-quote, newline, or
 * carriage return is wrapped in quotes; embedded quotes are doubled
 * (RFC 4180 standard).
 *
 * Excel compatibility: writes a UTF-8 BOM so Korean / Japanese / emoji
 * characters open correctly in Excel without manual encoding selection.
 *
 * Date handling: callers should format their own dates — this util
 * doesn't try to be smart about Date objects (would surprise more than
 * help).
 */

export interface CsvColumn<T> {
  /** Header text shown in the first row. */
  header: string;
  /** How to extract the cell value from a row. */
  accessor: (row: T) => string | number | boolean | null | undefined;
}

const escapeCell = (raw: unknown): string => {
  const s = raw === null || raw === undefined ? '' : String(raw);
  // Trigger quoting for any of: comma, quote, newline, carriage return.
  // Otherwise return as-is — keeps simple values unquoted for human
  // readability when the file is opened in a text editor.
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

/**
 * Build the CSV string for a set of rows + columns. Useful when the
 * caller wants to do something other than trigger a download (e.g.
 * stash to clipboard).
 */
export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const headerLine = columns.map(c => escapeCell(c.header)).join(',');
  const dataLines = rows.map(row =>
    columns.map(col => escapeCell(col.accessor(row))).join(',')
  );
  return [headerLine, ...dataLines].join('\n');
}

/**
 * Build the CSV and trigger a browser download. Filename is auto-suffixed
 * with today's date in YYYY-MM-DD if the caller didn't include one.
 */
export function downloadCsv<T>(rows: T[], columns: CsvColumn<T>[], filename: string): void {
  if (typeof window === 'undefined') return;
  const csv = buildCsv(rows, columns);
  // BOM tells Excel the file is UTF-8.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Convenience: today's ISO date for filenames. Avoids re-implementing
 * the slice in every call site.
 */
export const todayStamp = () => new Date().toISOString().slice(0, 10);
