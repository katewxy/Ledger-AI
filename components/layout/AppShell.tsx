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
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { language, setLanguage, currency, setCurrency } = useApp();
  const pathname = usePathname();

  const navItems: NavItem[] = [
    { href: "/",             labelKey: "dashboard",    icon: <LayoutDashboard size={18} /> },
    { href: "/transactions", labelKey: "transactions", icon: <List size={18} /> },
    { href: "/upload",       labelKey: "upload",       icon: <Upload size={18} /> },
    { href: "/reports",      labelKey: "reports",      icon: <BarChart2 size={18} /> },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Sidebar (desktop only) ───────────────────────────────────── */}
      <aside className="hidden md:flex w-56 flex-shrink-0 flex-col bg-white border-r border-gray-100">
        {/* Logo */}
        <div className="px-5 pt-6 pb-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1D9E75] flex items-center justify-center">
              <BookOpen size={16} className="text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm leading-tight text-gray-900">Ledger AI</p>
              <p className="text-xs text-gray-400 leading-tight">{t(language, "tagline")}</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map((item) => {
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
            {(["en", "zh"] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className={`flex-1 text-xs py-1.5 rounded-md transition-colors font-medium ${
                  language === lang
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {lang === "en" ? "EN" : "中文"}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="h-14 flex-shrink-0 bg-white border-b border-gray-100 flex items-center justify-between px-4 md:px-6">
          {/* Logo — mobile only */}
          <div className="flex md:hidden items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#1D9E75] flex items-center justify-center">
              <BookOpen size={14} className="text-white" />
            </div>
            <span className="font-semibold text-sm text-gray-900">Ledger AI</span>
          </div>
          <div className="hidden md:block" />

          {/* Right controls */}
          <div className="flex flex-col xs:flex-row items-end xs:items-center gap-1.5">
            {/* Language toggle — mobile only */}
            <div className="flex md:hidden items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {(["en", "zh"] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors font-medium ${
                    language === lang
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500"
                  }`}
                >
                  {lang === "en" ? "EN" : "中文"}
                </button>
              ))}
            </div>

            {/* Currency toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {(["USD", "CNY"] as Currency[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`px-2.5 py-1.5 text-xs rounded-md transition-colors font-medium ${
                    currency === c
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {c === "USD" ? "$ USD" : "¥ CNY"}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-28 md:pb-6">
          {children}
        </main>
      </div>

      {/* ── Bottom tab bar (mobile only) ────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex z-50">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 text-xs transition-colors ${
                active ? "text-[#1D9E75]" : "text-gray-400"
              }`}
            >
              {item.icon}
              <span className="text-[10px] font-medium">{t(language, item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>

    </div>
  );
}
