export type Language = "en" | "zh";
export type Currency = "USD" | "CNY";

export interface Transaction {
  id: string;
  upload_id: string | null;
  date: string;
  description: string;
  amount: number;
  currency: string;
  category: string | null;
  category_zh: string | null;
  confidence: number | null;
  source: string;
  created_at: string;
}

export interface Upload {
  id: string;
  filename: string;
  row_count: number;
  status: string;
  created_at: string;
}

export interface ParsedRow {
  date: string;
  description: string;
  amount: number;
}

export interface ClassifyResult {
  category_en: string;
  category_zh: string;
  confidence: number;
}

export const CATEGORIES_EN = [
  "Revenue",
  "IT Infrastructure",
  "Travel & Entertainment",
  "Rent & Utilities",
  "Marketing",
  "Office Supplies",
  "Meals & Entertainment",
  "Payroll",
  "Taxes & Fees",
  "Other Expense",
  "Other Income",
] as const;

export const CATEGORY_ZH_MAP: Record<string, string> = {
  Revenue: "主营业务收入",
  "IT Infrastructure": "IT基础设施",
  "Travel & Entertainment": "差旅费",
  "Rent & Utilities": "租赁及水电",
  Marketing: "营销推广",
  "Office Supplies": "办公耗材",
  "Meals & Entertainment": "餐饮招待",
  Payroll: "人工成本",
  "Taxes & Fees": "税费",
  "Other Expense": "其他支出",
  "Other Income": "其他收入",
};

export const INCOME_CATEGORIES = new Set(["Revenue", "Other Income"]);

export const CATEGORY_COLORS: Record<string, string> = {
  Revenue: "bg-emerald-100 text-emerald-800",
  "IT Infrastructure": "bg-blue-100 text-blue-800",
  "Travel & Entertainment": "bg-purple-100 text-purple-800",
  "Rent & Utilities": "bg-orange-100 text-orange-800",
  Marketing: "bg-pink-100 text-pink-800",
  "Office Supplies": "bg-yellow-100 text-yellow-800",
  "Meals & Entertainment": "bg-red-100 text-red-800",
  Payroll: "bg-indigo-100 text-indigo-800",
  "Taxes & Fees": "bg-gray-100 text-gray-800",
  "Other Expense": "bg-slate-100 text-slate-800",
  "Other Income": "bg-teal-100 text-teal-800",
};
