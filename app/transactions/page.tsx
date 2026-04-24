"use client";

import { useEffect, useState, useCallback } from "react";
import TransactionTable from "@/components/ui/TransactionTable";
import { useApp } from "@/context/AppContext";
import { t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { CATEGORIES_EN, CATEGORY_ZH_MAP, type Transaction } from "@/types";

export default function TransactionsPage() {
  const { language } = useApp();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: false })
      .limit(500);

    if (categoryFilter) {
      query = query.eq("category", categoryFilter);
    }

    const { data } = await query;
    setTransactions((data ?? []) as Transaction[]);
    setLoading(false);
  }, [categoryFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCategoryChange = (id: string, category: string) => {
    setTransactions((prev) =>
      prev.map((tx) =>
        tx.id === id
          ? {
              ...tx,
              category,
              category_zh: CATEGORY_ZH_MAP[category] ?? category,
              confidence: 1.0,
            }
          : tx
      )
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">
          {t(language, "transactions")}
        </h1>

        {/* Category filter */}
        <select
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1D9E75]"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">{t(language, "all")}</option>
          {CATEGORIES_EN.map((cat) => (
            <option key={cat} value={cat}>
              {language === "zh" ? `${CATEGORY_ZH_MAP[cat]} / ${cat}` : cat}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm animate-pulse">
            Loading...
          </div>
        ) : (
          <TransactionTable
            transactions={transactions}
            onCategoryChange={handleCategoryChange}
          />
        )}
      </div>
    </div>
  );
}
