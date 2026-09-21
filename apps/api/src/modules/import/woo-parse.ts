import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

/**
 * WooCommerce export CSV parsing (SS-206).
 *
 * Sync parse is deliberate: the 14 MB export fits memory trivially, and a
 * straight record array keeps resolvers and tests simple. Streaming is
 * reserved for a future source that exceeds comfortable memory.
 * csv-parse handles the export's realities: UTF-8 BOM and multiline quoted
 * HTML cells.
 *
 * Rows are RAGGED (132–243 cells; trailing empties omitted), so the header
 * is parsed as its own record and zipped positionally — `columns: true`
 * would silently inherit the first row's short width. Missing trailing
 * cells become ''. No body row is wider than the header (verified).
 */

export interface WooRecord {
  /** 1-based record ordinal (header is 1). */
  line: number;
  /** Cell values keyed by exact header text (untrimmed). */
  cells: Record<string, string>;
}

export interface WooParsed {
  header: string[];
  rows: WooRecord[];
}

export function parseWooCsv(input: Buffer | string, limit?: number): WooParsed {
  const raw = parse(input, {
    bom: true,
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
  }) as string[][];
  if (raw.length === 0) {
    return { header: [], rows: [] };
  }
  const [header, ...body] = raw as [string[], ...string[][]];
  const sliced = limit === undefined ? body : body.slice(0, limit);
  return {
    header,
    rows: sliced.map((cells, index) => ({
      line: index + 2,
      cells: Object.fromEntries(
        header.map((name, position) => [name, cells[position] ?? '']),
      ),
    })),
  };
}

export function parseWooCsvFile(path: string, limit?: number): WooParsed {
  return parseWooCsv(readFileSync(path), limit);
}

/** Cell accessor: trimmed value or '' (never null/undefined). */
export function cell(record: WooRecord, header: string): string {
  return (record.cells[header] ?? '').trim();
}

/** Split a comma-separated Woo cell into trimmed non-empty parts. */
export function splitCell(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
