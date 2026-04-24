"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import CategoryBadge from "./CategoryBadge";
import { useApp } from "@/context/AppContext";
import { t } from "@/lib/i18n";
import { formatAmount } from "@/lib/formatCurrency";
import {
  CATEGORIES_EN,
  CATEGORY_ZH_MAP,
  INCOME_CATEGORIES,
  type Transaction,
} from "@/types";
import { supabase } from "@/lib/supabase";

interface Props {
  transactions: Transaction[];
  onCategoryChange?: (id: string, category: string) => void;
}

export default function TransactionTable({ transactions, onCategoryChange }: Props) {
  const { language, currency } = useApp();
  const [saving, setSaving] = useState<string | null>(null);

  async function handleCategoryChange(id: string, category: string) {
    setSaving(id);
    const zh = CATEGORY_ZH_MAP[category] ?? category;
    await supabase
      .from("transactions")
      .update({ category, category_zh: zh, confidence: 1.0 })
      .eq("id", id);
    setSaving(null);
    onCategoryChange?.(id, category);
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        {t(language, "noTransactions")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {[
              { label: t(language, "date"),       cls: "" },
              { label: t(language, "description"), cls: "" },
              { label: t(language, "amount"),      cls: "" },
              { label: t(language, "category"),    cls: "min-w-[120px]" },
              { label: t(language, "confidence"),  cls: "" },
              { label: t(language, "action"),      cls: "" },
            ].map(({ label, cls }) => (
              <th
                key={label}
                className={`text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide ${cls}`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const isLowConfidence =
              tx.confidence !== null && tx.confidence < 0.75;
            const isIncome = INCOME_CATEGORIES.has(tx.category ?? "");
            const categoryLabel =
              language === "zh" && tx.category_zh
                ? tx.category_zh
                : (tx.category ?? "—");

            return (
              <tr
                key={tx.id}
                className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  isLowConfidence ? "bg-amber-50/50" : ""
                }`}
              >
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                  {tx.date}
                </td>
                <td className="px-4 py-3 max-w-xs">
                  <div className="flex items-center gap-1.5">
                    {isLowConfidence && (
                      <AlertTriangle
                        size={13}
                        className="text-amber-400 flex-shrink-0"
                        aria-label={t(language, "lowConfidence")}
                      />
                    )}
                    <span className="truncate text-gray-700">
                      {tx.description}
                    </span>
                  </div>
                </td>
                <td
                  className={`px-4 py-3 font-medium tabular-nums whitespace-nowrap ${
                    isIncome ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  {isIncome ? "+" : "-"}
                  {formatAmount(Math.abs(tx.amount), currency)}
                </td>
                <td className="px-4 py-3 min-w-[120px]">
                  {tx.category ? (
                    <CategoryBadge
                      category={tx.category}
                      label={categoryLabel}
                    />
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {tx.confidence !== null
                    ? `${Math.round(tx.confidence * 100)}%`
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <select
                    className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1D9E75] disabled:opacity-50"
                    value={tx.category ?? ""}
                    disabled={saving === tx.id}
                    onChange={(e) => handleCategoryChange(tx.id, e.target.value)}
                    title={t(language, "overrideCategory")}
                  >
                    <option value="" disabled>
                      {t(language, "overrideCategory")}
                    </option>
                    {CATEGORIES_EN.map((cat) => (
                      <option key={cat} value={cat}>
                        {language === "zh"
                          ? `${CATEGORY_ZH_MAP[cat]} / ${cat}`
                          : cat}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
