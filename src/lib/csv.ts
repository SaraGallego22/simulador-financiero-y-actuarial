import Papa from "papaparse";
import type { z } from "zod";

export interface CsvRowError {
  row: number;
  message: string;
}

export interface ParseCsvResult<T> {
  rows: T[];
  errors: CsvRowError[];
}

export interface CsvSchema<T> {
  /**
   * For each canonical field name, substrings to look for (case-insensitive)
   * among the file's actual header names — mirrors the legacy prototype's
   * flexible header matching (e.g. a portfolio CSV's weight column may be
   * named `asignacion`, `monto`, or `peso`; see cargarPortafolio(), line
   * ~1871).
   */
  headerAliases: Record<string, string[]>;
  rowSchema: z.ZodType<T>;
}

function resolveHeaderAliases(headers: string[], aliases: Record<string, string[]>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [canonical, patterns] of Object.entries(aliases)) {
    const found = headers.find((h) => patterns.some((p) => h.includes(p)));
    if (found) map[canonical] = found;
  }
  return map;
}

/**
 * Decodes an uploaded CSV's raw bytes to text. Excel's "CSV (Comma
 * delimited)" export on Spanish-locale Windows writes Windows-1252 (ANSI),
 * not UTF-8, which mangles á/é/í/ó/ú/ñ when decoded as UTF-8 (e.g. a team
 * named "Seguros Medellín" fails to match because the roster's `equipo`
 * value decodes to something else). UTF-8 decoding with `fatal: true`
 * throws on the invalid byte sequences that non-UTF-8 accented characters
 * produce, so a caught error here reliably signals a Windows-1252 file.
 */
export function decodeCsvText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/**
 * Parses a CSV upload against a schema of canonical fields + zod validation.
 * Replaces the legacy's hand-rolled `line.split(',')` parsing (no
 * quote/comma escaping) with Papa Parse, and its ad hoc `isNaN` checks with
 * real schema validation — see CLAUDE.md §13. Rows that fail validation are
 * collected as errors (with their 1-indexed CSV line number) rather than
 * silently skipped, so the UI can report exactly what was ignored and why.
 */
export function parseCsv<T>(text: string, schema: CsvSchema<T>): ParseCsvResult<T> {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const rows: T[] = [];
  const errors: CsvRowError[] = [];

  const headers = parsed.meta.fields ?? [];
  const columnFor = resolveHeaderAliases(headers, schema.headerAliases);
  const missing = Object.keys(schema.headerAliases).filter((k) => !columnFor[k]);
  if (missing.length) {
    errors.push({ row: 1, message: `Faltan columnas requeridas: ${missing.join(", ")}` });
    return { rows, errors };
  }

  parsed.data.forEach((raw, i) => {
    const canonicalRow: Record<string, string> = {};
    for (const [canonical, column] of Object.entries(columnFor)) canonicalRow[canonical] = raw[column] ?? "";

    const result = schema.rowSchema.safeParse(canonicalRow);
    if (result.success) rows.push(result.data);
    else errors.push({ row: i + 2, message: result.error.issues.map((issue) => issue.message).join("; ") });
  });

  for (const e of parsed.errors) {
    errors.push({ row: (e.row ?? 0) + 2, message: e.message });
  }

  return { rows, errors };
}
