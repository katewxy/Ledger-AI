"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  List,
  Upload,
  BarChart2,
  BookOpen,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { t } from "@/lib/i18n";
import type { Currency } from "@/types";

interface NavItem {
  href: string;
  labelKey: "dashboard" | "transactions" | "upload" | "reports";
  icon: React.ReactNode;
  disabled?: boolean;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { language, setLanguage, currency, setCurrency } = useApp();
  const pathname = usePathname();

  const navItems: NavItem[] = [
    {
      href: "/",
      labelKey: "dashboard",
      icon: <LayoutDashboard size={18} />,
    },
    {
      href: "/transactions",
      labelKey: "transactions",
      icon: <List size={18} />,
    },
    {
      href: "/upload",
      labelKey: "upload",
      icon: <Upload size={18} />,
    },
    {
      href: "/reports",
      labelKey: "reports",
      icon: <BarChart2 size={18} />,
    },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 flex flex-col bg-white border-r border-gray-100">
        {/* Logo */}
        <div className="px-5 pt-6 pb-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1D9E75] flex items-center justify-center">
              <BookOpen size={16} className="text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm leading-tight text-gray-900">
                Ledger AI
              </p>
              <p className="text-xs text-gray-400 leading-tight">
                {t(language, "tagline")}
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map((item) => {
            if (item.disabled) {
              return (
                <div key={item.href} className="relative group">
                  <button
                    disabled
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-300 text-sm cursor-not-allowed"
                  >
                    {item.icon}
                    <span>{t(language, item.labelKey)}</span>
                  </button>
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
                    {t(language, "comingSoon")}
                  </div>
                </div>
              );
            }

            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-[#1D9E75]/10 text-[#1D9E75] font-medium"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                }`}
              >
                {item.icon}
                <span>{t(language, item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        {/* Language toggle */}
        <div className="px-4 pb-5">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setLanguage("en")}
              className={`flex-1 text-xs py-1.5 rounded-md transition-colors font-medium ${
                language === "en"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage("zh")}
              className={`flex-1 text-xs py-1.5 rounded-md transition-colors font-medium ${
                language === "zh"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              中文
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 flex-shrink-0 bg-white border-b border-gray-100 flex items-center justify-between px-6">
          <div />
          {/* Currency toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {(["USD", "CNY"] as Currency[]).map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors font-medium ${
                  currency === c
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {c === "USD" ? "$ USD" : "¥ CNY"}
              </button>
            ))}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
