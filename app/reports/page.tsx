"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { Download } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { t } from "@/lib/i18n";
import { formatAmount } from "@/lib/formatCurrency";
import { supabase } from "@/lib/supabase";
import { CATEGORIES_EN, CATEGORY_ZH_MAP, INCOME_CATEGORIES, type Transaction } from "@/types";

// ── Colour palette for pie slices ──────────────────────────────────────────

const PIE_COLORS = [
  "#1D9E75", "#3B82F6", "#8B5CF6", "#F59E0B", "#EF4444",
  "#10B981", "#F97316", "#6366F1", "#EC4899", "#14B8A6",
];

// ── Date / month helpers ───────────────────────────────────────────────────

function isoMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthLabel(iso: string, lang: "en" | "zh") {
  const [y, m] = iso.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return lang === "zh"
    ? `${m}月`
    : date.toLocaleString("en-US", { month: "short" });
}

function rangeMonths(start: string, end: string): string[] {
  const months: string[] = [];
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(isoMonth(y, m));
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

// ── CSV export ─────────────────────────────────────────────────────────────

function exportCsv(
  categories: string[],
  months: string[],
  grid: Record<string, Record<string, number>>,
  catTotals: Record<string, number>,
  monthIncome: Record<string, number>,
  monthExpenses: Record<string, number>,
  totalIncome: number,
  totalExpenses: number,
  grandNet: number,
  language: "en" | "zh",
) {
  const catLabel = (c: string) => language === "zh" ? (CATEGORY_ZH_MAP[c] ?? c) : c;
  const header = ["Category", ...months.map((m) => monthLabel(m, language)), "Total"].join(",");

  const rows = categories.map((cat) => {
    const cells = months.map((m) => (grid[cat]?.[m] ?? 0).toFixed(2));
    return [`"${catLabel(cat)}"`, ...cells, (catTotals[cat] ?? 0).toFixed(2)].join(",");
  });

  const expRow = [language === "zh" ? "总支出" : "Total Expenses",
    ...months.map((m) => (monthExpenses[m] ?? 0).toFixed(2)), totalExpenses.toFixed(2)].join(",");
  const incRow = [language === "zh" ? "总收入" : "Total Income",
    ...months.map((m) => (monthIncome[m] ?? 0).toFixed(2)), totalIncome.toFixed(2)].join(",");
  const netRow = [language === "zh" ? "净利润" : "Net",
    ...months.map((m) => ((monthIncome[m] ?? 0) - (monthExpenses[m] ?? 0)).toFixed(2)), grandNet.toFixed(2)].join(",");

  const csv = [header, ...rows, expRow, incRow, netRow].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }); // BOM for Excel Chinese support
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ledger-ai-pl-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Page ───────────────────────────────────────────────────────────────────

type RangeMode = "year" | "custom";

export default function ReportsPage() {
  const { language, currency } = useApp();

  const currentYear = new Date().getFullYear();
  const [rangeMode, setRangeMode] = useState<RangeMode>("year");
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [customStart, setCustomStart] = useState(`${currentYear}-01`);
  const [customEnd, setCustomEnd] = useState(
    `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  );
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Seed year picker from earliest transaction
  useEffect(() => {
    supabase
      .from("transactions")
      .select("date")
      .order("date", { ascending: true })
      .limit(1)
      .then(({ data }) => {
        const earliest = data?.[0]?.date
          ? new Date(data[0].date).getFullYear()
          : currentYear;
        const years: number[] = [];
        for (let y = currentYear; y >= earliest; y--) years.push(y);
        setAvailableYears(years);
        if (earliest < currentYear) setSelectedYear(earliest);
      });
  }, [currentYear]);

  const start = rangeMode === "year"
    ? `${selectedYear}-01-01`
    : `${customStart}-01`;
  const end = rangeMode === "year"
    ? `${selectedYear}-12-31`
    : `${customEnd}-28`;

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: true });
    setTransactions((data ?? []) as Transaction[]);
    setLoading(false);
  }, [start, end]);

  useEffect(() => { load(); }, [load]);

  // ── Aggregations ──────────────────────────────────────────────────────────

  const months = useMemo(
    () => rangeMonths(start.slice(0, 7), end.slice(0, 7)),
    [start, end]
  );

  const { grid, catTotals, monthIncome, monthExpenses } = useMemo(() => {
    const grid: Record<string, Record<string, number>> = {};
    const catTotals: Record<string, number> = {};
    const monthIncome: Record<string, number> = {};
    const monthExpenses: Record<string, number> = {};

    for (const tx of transactions) {
      if (!tx.category) continue;
      const month = tx.date.slice(0, 7);
      const abs = Math.abs(tx.amount);

      grid[tx.category] ??= {};
      grid[tx.category][month] = (grid[tx.category][month] ?? 0) + abs;
      catTotals[tx.category] = (catTotals[tx.category] ?? 0) + abs;

      if (INCOME_CATEGORIES.has(tx.category)) {
        monthIncome[month] = (monthIncome[month] ?? 0) + abs;
      } else {
        monthExpenses[month] = (monthExpenses[month] ?? 0) + abs;
      }
    }
    return { grid, catTotals, monthIncome, monthExpenses };
  }, [transactions]);

  const totalIncome = Object.values(monthIncome).reduce((s, v) => s + v, 0);
  const totalExpenses = Object.values(monthExpenses).reduce((s, v) => s + v, 0);
  const grandNet = totalIncome - totalExpenses;

  const orderedCategories = useMemo(() => {
    const withData = CATEGORIES_EN.filter((c) => catTotals[c]);
    const income = withData.filter((c) => INCOME_CATEGORIES.has(c));
    const expenses = withData
      .filter((c) => !INCOME_CATEGORIES.has(c))
      .sort((a, b) => (catTotals[b] ?? 0) - (catTotals[a] ?? 0));
    return [...income, ...expenses];
  }, [catTotals]);

  const incomeKey = t(language, "monthlyIncome");
  const expensesKey = t(language, "monthlyExpenses");

  const barData = months.map((m) => ({
    month: monthLabel(m, language),
    [incomeKey]: +(monthIncome[m] ?? 0).toFixed(2),
    [expensesKey]: +(monthExpenses[m] ?? 0).toFixed(2),
  }));

  const pieData = orderedCategories
    .filter((c) => !INCOME_CATEGORIES.has(c))
    .map((c) => ({
      name: language === "zh" ? (CATEGORY_ZH_MAP[c] ?? c) : c,
      value: +(catTotals[c] ?? 0).toFixed(2),
    }));

  const fmt = (n: number) => formatAmount(n, currency);
  const catLabel = (c: string) => language === "zh" ? (CATEGORY_ZH_MAP[c] ?? c) : c;
  const tickFmt = (v: number) => `${currency === "CNY" ? "¥" : "$"}${(v / 1000).toFixed(0)}k`;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header + controls ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-gray-900">{t(language, "reports")}</h1>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode toggle */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {(["year", "custom"] as RangeMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setRangeMode(mode)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                  rangeMode === mode
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {mode === "year" ? t(language, "year") : t(language, "customRange")}
              </button>
            ))}
          </div>

          {rangeMode === "year" ? (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#1D9E75]"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-1.5 text-sm">
              <input
                type="month"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1D9E75]"
              />
              <span className="text-gray-400">—</span>
              <input
                type="month"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1D9E75]"
              />
            </div>
          )}

          {/* Export CSV */}
          <button
            onClick={() =>
              exportCsv(
                orderedCategories, months, grid, catTotals,
                monthIncome, monthExpenses, totalIncome, totalExpenses, grandNet, language,
              )
            }
            disabled={orderedCategories.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={14} />
            {t(language, "exportCsv")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center text-gray-400 text-sm animate-pulse">Loading...</div>
      ) : transactions.length === 0 ? (
        <div className="py-24 text-center text-gray-400 text-sm">{t(language, "noData")}</div>
      ) : (
        <>
          {/* ── Charts ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Monthly bar chart — 2/3 */}
            <div className="lg:col-span-2 bg-white border border-gray-100 rounded-xl p-5">
              <h2 className="text-sm font-medium text-gray-700 mb-4">{t(language, "monthlyTrend")}</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData} barCategoryGap="35%" barGap={2}>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} tickFormatter={tickFmt} width={48} />
                  <Tooltip
                    formatter={(v: number) => fmt(v)}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #F3F4F6", boxShadow: "none" }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey={incomeKey}   fill="#1D9E75" radius={[3, 3, 0, 0]} />
                  <Bar dataKey={expensesKey} fill="#EF4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Donut chart — 1/3 */}
            <div className="bg-white border border-gray-100 rounded-xl p-5">
              <h2 className="text-sm font-medium text-gray-700 mb-1">{t(language, "categoryBreakdown")}</h2>
              {pieData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-sm text-gray-300">
                  {t(language, "noData")}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={78} paddingAngle={2} dataKey="value">
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => fmt(v)}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #F3F4F6", boxShadow: "none" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-gray-600 truncate">{d.name}</span>
                    </div>
                    <span className="text-gray-400 flex-shrink-0">
                      {totalExpenses > 0 ? Math.round((d.value / totalExpenses) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── P&L Table ────────────────────────────────────────────────── */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-700">{t(language, "plStatement")}</h2>
              <span className="text-xs text-gray-400">{start.slice(0, 7)} — {end.slice(0, 7)}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide sticky left-0 bg-gray-50/50 min-w-[160px]">
                      {t(language, "category")}
                    </th>
                    {months.map((m) => (
                      <th key={m} className="text-right px-3 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap min-w-[90px]">
                        {monthLabel(m, language)}
                      </th>
                    ))}
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap min-w-[100px]">
                      {t(language, "row_total")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orderedCategories.map((cat, idx) => {
                    const isIncome = INCOME_CATEGORIES.has(cat);
                    const nextCat = orderedCategories[idx + 1];
                    const isDivider = isIncome && nextCat && !INCOME_CATEGORIES.has(nextCat);

                    return (
                      <tr
                        key={cat}
                        className={`hover:bg-gray-50 transition-colors ${
                          isDivider ? "border-b-2 border-gray-200" : "border-b border-gray-50"
                        }`}
                      >
                        <td className="px-4 py-2.5 font-medium text-gray-700 sticky left-0 bg-white">
                          {catLabel(cat)}
                        </td>
                        {months.map((m) => {
                          const val = grid[cat]?.[m] ?? 0;
                          return (
                            <td
                              key={m}
                              className={`px-3 py-2.5 text-right tabular-nums ${
                                val === 0 ? "text-gray-200" : isIncome ? "text-emerald-600" : "text-gray-700"
                              }`}
                            >
                              {val === 0 ? "—" : fmt(val)}
                            </td>
                          );
                        })}
                        <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${isIncome ? "text-emerald-600" : "text-gray-900"}`}>
                          {fmt(catTotals[cat] ?? 0)}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Total Expenses */}
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td className="px-4 py-2.5 font-semibold text-gray-700 sticky left-0 bg-gray-50">
                      {t(language, "totalExpenses")}
                    </td>
                    {months.map((m) => (
                      <td key={m} className="px-3 py-2.5 text-right font-semibold tabular-nums text-red-500">
                        {monthExpenses[m] ? fmt(monthExpenses[m]) : "—"}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums text-red-500">
                      {fmt(totalExpenses)}
                    </td>
                  </tr>

                  {/* Total Income */}
                  <tr className="border-t border-gray-100 bg-gray-50">
                    <td className="px-4 py-2.5 font-semibold text-gray-700 sticky left-0 bg-gray-50">
                      {t(language, "totalIncome")}
                    </td>
                    {months.map((m) => (
                      <td key={m} className="px-3 py-2.5 text-right font-semibold tabular-nums text-emerald-600">
                        {monthIncome[m] ? fmt(monthIncome[m]) : "—"}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums text-emerald-600">
                      {fmt(totalIncome)}
                    </td>
                  </tr>

                  {/* Net */}
                  <tr className="border-t-2 border-gray-300 bg-gray-50">
                    <td className="px-4 py-3 font-bold text-gray-900 sticky left-0 bg-gray-50">
                      {t(language, "net")}
                    </td>
                    {months.map((m) => {
                      const net = (monthIncome[m] ?? 0) - (monthExpenses[m] ?? 0);
                      const hasData = !!(monthIncome[m] || monthExpenses[m]);
                      return (
                        <td key={m} className={`px-3 py-3 text-right font-bold tabular-nums ${net >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {hasData ? fmt(Math.abs(net)) : "—"}
                        </td>
                      );
                    })}
                    <td className={`px-4 py-3 text-right font-bold tabular-nums ${grandNet >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {fmt(Math.abs(grandNet))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
