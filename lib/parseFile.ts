import Papa from "papaparse";
import type { ParsedRow } from "@/types";

// ── Column name normalisation ──────────────────────────────────────────────

const DATE_HEADERS = [
  "transaction date",
  "date",
  "交易时间",
  "记账日期",
  "交易日期",
  "time",
];
const AMOUNT_HEADERS = [
  "amount",
  "debit amount",
  "credit amount",
  "transaction amount",
  "金额",
  "交易金额",
  "收/支",
];
const DESC_HEADERS = [
  "description",
  "memo",
  "payee",
  "narrative",
  "交易对方",
  "摘要",
  "备注",
  "交易分类",
  "商户名称",
];

function matchHeader(header: string, candidates: string[]): boolean {
  const h = header.toLowerCase().trim();
  return candidates.some((c) => h.includes(c) || c.includes(h));
}

function findColumn(headers: string[], candidates: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    if (matchHeader(headers[i], candidates)) return i;
  }
  return -1;
}

// ── Wells Fargo has no header row ─────────────────────────────────────────

function isWellsFargo(rows: string[][]): boolean {
  if (rows.length === 0) return false;
  const first = rows[0];
  // WF format: date string, amount (number), empty, empty, description
  return (
    first.length >= 5 &&
    /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(first[0]) &&
    !isNaN(parseFloat(first[1]))
  );
}

// ── Amount parsing ─────────────────────────────────────────────────────────

function parseAmount(raw: string): number {
  if (!raw) return 0;
  // Remove currency symbols, spaces, commas
  const cleaned = raw.replace(/[¥$,\s]/g, "").replace(/[()]/g, (m) =>
    m === "(" ? "-" : ""
  );
  return parseFloat(cleaned) || 0;
}

// ── Date normalisation ─────────────────────────────────────────────────────

function normaliseDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  // MM/DD/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  // YYYY/MM/DD
  const ymd = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  // Chinese datetime: 2024-03-01 12:34:56
  const dt = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dt) return dt[1];
  return raw.slice(0, 10);
}

// ── CSV parsing ────────────────────────────────────────────────────────────

export function parseCsv(text: string): ParsedRow[] {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
  });
  const rows = result.data as string[][];
  if (rows.length === 0) return [];

  if (isWellsFargo(rows)) {
    return rows.map((r) => ({
      date: normaliseDate(r[0]),
      amount: parseAmount(r[1]),
      description: r[4] || r[3] || "",
    }));
  }

  const headers = rows[0].map((h) => String(h));
  const dateIdx = findColumn(headers, DATE_HEADERS);
  const amountIdx = findColumn(headers, AMOUNT_HEADERS);
  const descIdx = findColumn(headers, DESC_HEADERS);

  return rows.slice(1).map((row) => ({
    date: normaliseDate(row[dateIdx] ?? ""),
    amount: parseAmount(row[amountIdx] ?? "0"),
    description: String(row[descIdx] ?? ""),
  }));
}

// ── Excel parsing ──────────────────────────────────────────────────────────

export async function parseExcel(buffer: ArrayBuffer): Promise<ParsedRow[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: false,
  });

  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  const dateKey =
    headers.find((h) => matchHeader(h, DATE_HEADERS)) ?? headers[0];
  const amountKey =
    headers.find((h) => matchHeader(h, AMOUNT_HEADERS)) ?? headers[1];
  const descKey =
    headers.find((h) => matchHeader(h, DESC_HEADERS)) ?? headers[2];

  return rows.map((row) => ({
    date: normaliseDate(String(row[dateKey] ?? "")),
    amount: parseAmount(String(row[amountKey] ?? "0")),
    description: String(row[descKey] ?? ""),
  }));
}
