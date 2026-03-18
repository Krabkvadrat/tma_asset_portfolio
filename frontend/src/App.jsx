import { useState, useEffect } from "react";
import { useStore } from "./store";
import { CURRENCY_SYMBOLS } from "./constants";
import { S } from "./styles";
import Portfolio from "./pages/Portfolio";
import Assets from "./pages/Assets";
import Add from "./pages/Add";
import History from "./pages/History";
import Settings from "./pages/Settings";

const TABS = [
  { key: "portfolio", label: "Portfolio", d: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" },
  { key: "assets", label: "Assets", d: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
  { key: "add", label: "Add", d: "M12 4v16m8-8H4" },
  { key: "history", label: "History", d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { key: "settings", label: "Settings", d: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

export default function App() {
  const [tab, setTab] = useState("portfolio");
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  const { displayCurrency, currencies, setDisplayCurrency, initApp, loading } = useStore();
  const sym = CURRENCY_SYMBOLS[displayCurrency] || displayCurrency;

  useEffect(() => {
    initApp();
  }, []);

  if (loading) {
    return (
      <div style={{ ...S.root, alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#636366" }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={S.root}>
      <div style={S.header}>
        <div style={{ width: 40 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#636366" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.3 }}>Portfolio Tracker</div>
        <button style={S.currencyBtn} onClick={() => setShowCurrencyPicker(!showCurrencyPicker)}>
          {displayCurrency} {sym}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      </div>

      {showCurrencyPicker && (
        <div style={S.dropdown}>
          {currencies.map((c) => (
            <button key={c} style={{
              ...S.ddItem,
              background: c === displayCurrency ? "#2A9EF422" : "transparent",
              color: c === displayCurrency ? "#2A9EF4" : "#F5F5F7",
            }} onClick={() => { setDisplayCurrency(c); setShowCurrencyPicker(false); }}>
              <span style={{ fontWeight: 600 }}>{CURRENCY_SYMBOLS[c] || c}</span> {c}
            </button>
          ))}
        </div>
      )}

      <div style={S.content}>
        {tab === "portfolio" && <Portfolio />}
        {tab === "assets" && <Assets />}
        {tab === "add" && <Add />}
        {tab === "history" && <History />}
        {tab === "settings" && <Settings />}
      </div>

      <div style={S.tabBar}>
        {TABS.map((t) => (
          <button key={t.key} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            background: "none", border: "none", cursor: "pointer", padding: "4px 6px",
            color: tab === t.key ? "#2A9EF4" : "#636366",
          }} onClick={() => setTab(t.key)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={t.d} /></svg>
            <span style={{ fontSize: 9, fontWeight: tab === t.key ? 700 : 500, letterSpacing: 0.2 }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
