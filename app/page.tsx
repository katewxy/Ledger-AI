"use client";

import { useEffect, useState, useCallback } from "react";
import { TrendingUp, TrendingDown, DollarSign, Clock, Lightbulb, ChevronDown, ChevronUp } from "lucide-react";
import MetricCard from "@/components/ui/MetricCard";
import TransactionTable from "@/components/ui/TransactionTable";
import AiChat from "@/components/ui/AiChat";
import { useApp } from "@/context/AppContext";
import { t } from "@/lib/i18n";
import { formatAmount } from "@/lib/formatCurrency";
import { supabase } from "@/lib/supabase";
import { INCOME_CATEGORIES, CATEGORY_ZH_MAP, type Transaction } from "@/types";

// ── Period selector ────────────────────────────────────────────────────────

type Period = "all" | "year" | "6m" | "1m";

const PERIOD_LABELS: Record<Period, { en: string; zh: string }> = {
  all:  { en: "All Time",      zh: "全部" },
  year: { en: "This Year",     zh: "今年" },
  "6m": { en: "Last 6 Months", zh: "近6个月" },
  "1m": { en: "This Month",    zh: "本月" },
};

function getDateRange(period: Period): { start: string | null; end: string | null } {
  if (period === "all") return { start: null, end: null };
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  if (period === "1m") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return { start, end };
  }
  if (period === "6m") {
    const start = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().slice(0, 10);
    return { start, end };
  }
  return { start: `${now.getFullYear()}-01-01`, end };
}

// ── Insight computation ────────────────────────────────────────────────────

interface Insight {
  topCategory: string;
  topAmount: number;
  topPct: number;
  expenseRatio: number;        // expenses / income * 100
  highConcCategory: string | null;
  highConcPct: number;
  hasData: boolean;
}

function computeInsights(txs: Transaction[]): Insight {
  const categorySpend: Record<string, number> = {};
  let totalExpenses = 0;
  let totalIncome = 0;

  for (const tx of txs) {
    const abs = Math.abs(tx.amount);
    if (INCOME_CATEGORIES.has(tx.category ?? "")) {
      totalIncome += abs;
    } else if (tx.category) {
      totalExpenses += abs;
      categorySpend[tx.category] = (categorySpend[tx.category] ?? 0) + abs;
    }
  }

  const sorted = Object.entries(categorySpend).sort((a, b) => b[1] - a[1]);
  const [topCategory, topAmount] = sorted[0] ?? ["", 0];
  const topPct = totalExpenses > 0 ? Math.round((topAmount / totalExpenses) * 100) : 0;
  const expenseRatio = totalIncome > 0 ? Math.round((totalExpenses / totalIncome) * 100) : 0;

  // Flag any non-top category that's still >35% of expenses
  let highConcCategory: string | null = null;
  let highConcPct = 0;
  for (const [cat, amt] of sorted.slice(1)) {
    const pct = totalExpenses > 0 ? Math.round((amt / totalExpenses) * 100) : 0;
    if (pct > 35 && pct > highConcPct) {
      highConcCategory = cat;
      highConcPct = pct;
    }
  }

  return {
    topCategory,
    topAmount,
    topPct,
    expenseRatio,
    highConcCategory,
    highConcPct,
    hasData: sorted.length > 0,
  };
}

// ── Page ───────────────────────────────────────────────────────────────────

const PREVIEW_COUNT = 5;

export default function DashboardPage() {
  const { language, currency } = useApp();

  // All-time totals (for metric cards — never filtered by period)
  const [allTxs, setAllTxs] = useState<Transaction[]>([]);
  // Period-filtered transactions (for table + insights)
  const [txs, setTxs] = useState<Transaction[]>([]);

  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("all");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setShowAll(false);

    const { start, end } = getDateRange(period);

    let filteredQuery = supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: false });
    if (start) filteredQuery = filteredQuery.gte("date", start);
    if (end)   filteredQuery = filteredQuery.lte("date", end);

    // All-time query runs only when period isn't already "all"
    const allQuery = period === "all"
      ? Promise.resolve(null)
      : supabase.from("transactions").select("*");

    const [filteredRes, allRes] = await Promise.all([filteredQuery, allQuery]);

    const filtered = (filteredRes.data ?? []) as Transaction[];
    setTxs(filtered);
    setAllTxs(period === "all" ? filtered : ((allRes?.data ?? []) as Transaction[]));

    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  // Metrics always from all-time data
  const income = allTxs
    .filter((tx) => INCOME_CATEGORIES.has(tx.category ?? ""))
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const expenses = allTxs
    .filter((tx) => !INCOME_CATEGORIES.has(tx.category ?? "") && tx.category)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const net = income - expenses;
  const pending = allTxs.filter(
    (tx) => tx.confidence !== null && tx.confidence < 0.75
  ).length;

  // Insights from period-filtered data
  const insights = computeInsights(txs);

  // Table slice
  const displayedTxs = showAll ? txs : txs.slice(0, PREVIEW_COUNT);

  const handleCategoryChange = (id: string, category: string) => {
    const update = (list: Transaction[]) =>
      list.map((tx) =>
        tx.id === id
          ? { ...tx, category, category_zh: CATEGORY_ZH_MAP[category] ?? category, confidence: 1.0 }
          : tx
      );
    setTxs(update);
    setAllTxs(update);
  };

  return (
    <div className="space-y-6">
      {/* Header + period selector */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">{t(language, "dashboard")}</h1>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {(["all", "year", "6m", "1m"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                period === p
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {PERIOD_LABELS[p][language]}
            </button>
          ))}
        </div>
      </div>

      {/* Metric cards — always all-time */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label={t(language, "totalIncome")}   value={formatAmount(income, currency)}        color="green" icon={<TrendingUp size={18} />}   sub={language === "zh" ? "累计" : "All time"} />
        <MetricCard label={t(language, "totalExpenses")} value={formatAmount(expenses, currency)}      color="red"   icon={<TrendingDown size={18} />} sub={language === "zh" ? "累计" : "All time"} />
        <MetricCard label={t(language, "netProfit")}     value={formatAmount(Math.abs(net), currency)} color={net >= 0 ? "green" : "red"} icon={<DollarSign size={18} />} sub={language === "zh" ? "累计" : "All time"} />
        <MetricCard label={t(language, "pendingReview")} value={String(pending)} color={pending > 0 ? "amber" : "default"} icon={<Clock size={18} />} />
      </div>

      {/* Transaction table */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">{t(language, "transactions")}</h2>
          {!loading && txs.length > 0 && (
            <span className="text-xs text-gray-400">
              {showAll
                ? `${txs.length} ${language === "zh" ? "条" : "total"}`
                : `${Math.min(PREVIEW_COUNT, txs.length)} ${language === "zh" ? "/" : "of"} ${txs.length}`}
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm animate-pulse">Loading...</div>
        ) : (
          <>
            <TransactionTable transactions={displayedTxs} onCategoryChange={handleCategoryChange} />

            {txs.length > PREVIEW_COUNT && (
              <div className="px-5 py-3 border-t border-gray-50">
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-[#1D9E75] font-medium hover:text-[#178a64] transition-colors"
                >
                  {showAll ? (
                    <><ChevronUp size={13} />{language === "zh" ? "收起" : "Show less"}</>
                  ) : (
                    <><ChevronDown size={13} />{language === "zh" ? `显示全部 ${txs.length} 条` : `Show all ${txs.length} transactions`}</>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* AI Insights — computed from real data */}
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb size={16} className="text-[#1D9E75]" />
          <h2 className="text-sm font-medium text-gray-700">{t(language, "aiInsights")}</h2>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 animate-pulse">Analyzing...</p>
        ) : !insights.hasData ? (
          <p className="text-sm text-gray-400">{t(language, "noInsights")}</p>
        ) : (
          <div className="space-y-2.5">
            <p className="text-sm text-gray-600 leading-relaxed">
              <span className="inline-block w-2 h-2 rounded-full bg-[#1D9E75] mr-2 align-middle" />
              {language === "zh"
                ? `${CATEGORY_ZH_MAP[insights.topCategory] ?? insights.topCategory}是支出最大的分类，共计${formatAmount(insights.topAmount, currency)}，占总支出的${insights.topPct}%。`
                : `${insights.topCategory} is your largest expense category at ${formatAmount(insights.topAmount, currency)}, accounting for ${insights.topPct}% of total expenses.`}
            </p>

            {insights.expenseRatio > 0 && (
              <p className="text-sm text-gray-600 leading-relaxed">
                <span className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${insights.expenseRatio > 90 ? "bg-red-400" : insights.expenseRatio > 70 ? "bg-amber-400" : "bg-emerald-400"}`} />
                {language === "zh"
                  ? `支出占收入的${insights.expenseRatio}%。${insights.expenseRatio > 90 ? "⚠️ 利润空间非常有限。" : insights.expenseRatio > 70 ? "利润率尚可，但仍需注意成本控制。" : "收支状况良好。"}`
                  : `Expenses are ${insights.expenseRatio}% of total income. ${insights.expenseRatio > 90 ? "⚠️ Margins are very tight — review your largest cost drivers." : insights.expenseRatio > 70 ? "Margins are healthy but watch for cost creep." : "Your business is retaining a strong portion of revenue."}`}
              </p>
            )}

            {insights.highConcCategory && (
              <p className="text-sm text-gray-600 leading-relaxed">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-2 align-middle" />
                {language === "zh"
                  ? `⚠️ ${CATEGORY_ZH_MAP[insights.highConcCategory] ?? insights.highConcCategory}占总支出的${insights.highConcPct}%，支出集中度较高，建议重点关注。`
                  : `⚠️ ${insights.highConcCategory} accounts for ${insights.highConcPct}% of expenses — unusually high concentration worth reviewing.`}
              </p>
            )}
          </div>
        )}
      </div>

      {/* AI Chat */}
      <AiChat />
    </div>
  );
}
