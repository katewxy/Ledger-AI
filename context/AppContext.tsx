"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { Currency, Language } from "@/types";

interface AppContextValue {
  language: Language;
  setLanguage: (l: Language) => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
}

const AppContext = createContext<AppContextValue>({
  language: "en",
  setLanguage: () => {},
  currency: "USD",
  setCurrency: () => {},
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  const [currency, setCurrencyState] = useState<Currency>("USD");

  useEffect(() => {
    const lang = localStorage.getItem("ledger_language") as Language | null;
    const cur = localStorage.getItem("ledger_currency") as Currency | null;
    if (lang === "en" || lang === "zh") setLanguageState(lang);
    if (cur === "USD" || cur === "CNY") setCurrencyState(cur);
  }, []);

  const setLanguage = (l: Language) => {
    setLanguageState(l);
    localStorage.setItem("ledger_language", l);
  };

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    localStorage.setItem("ledger_currency", c);
  };

  return (
    <AppContext.Provider value={{ language, setLanguage, currency, setCurrency }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
