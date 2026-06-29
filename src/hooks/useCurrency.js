"use client";

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "pos-currency";

export const CURRENCIES = {
  GTQ: { code: "GTQ", label: "Quetzales (Q)", locale: "es-GT", symbol: "Q" },
  USD: { code: "USD", label: "Dólares ($)", locale: "en-US", symbol: "$" },
};

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState("GTQ");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && CURRENCIES[saved]) {
      setCurrencyState(saved);
    }
  }, []);

  function setCurrency(code) {
    if (!CURRENCIES[code]) return;
    setCurrencyState(code);
    localStorage.setItem(STORAGE_KEY, code);
  }

  function formatMoney(amount) {
    const config = CURRENCIES[currency];
    return new Intl.NumberFormat(config.locale, {
      style: "currency",
      currency: config.code,
    }).format(Number(amount) || 0);
  }

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        formatMoney,
        currencies: CURRENCIES,
        currencyConfig: CURRENCIES[currency],
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency debe usarse dentro de CurrencyProvider");
  }
  return context;
}
