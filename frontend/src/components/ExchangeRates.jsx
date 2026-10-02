import { useState } from "react";
import { useStore } from "../store";
import { CURRENCY_SYMBOLS, CRYPTO_CURRENCIES } from "../constants";
import { S } from "../styles";
import { formatNumber, formatRate } from "../format";

const MASK = "•••••";

// Rates below 0.1 are quoted per 10/100/1000… units: "1 000 RSD = 8.54 €".
function unitFor(rate) {
  return rate > 0 && rate < 0.1 ? 10 ** Math.ceil(-Math.log10(rate)) : 1;
}

// The backend sends naive UTC datetimes.
function agoText(iso) {
  const ts = Date.parse(/Z|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(ts)) return "";
  const min = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

const rowSt = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "8px 0", borderBottom: "1px solid #3A3A3C", fontSize: 13,
  fontVariantNumeric: "tabular-nums",
};
const warnSt = { color: "#F59E0B", fontWeight: 600 };

export default function ExchangeRates() {
  const {
    displayCurrency, currencies, assets, assetScope, ratesFetchedAt,
    rateFor, toDisplay, refreshRates, visibleTypes, privateMode,
  } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const sym = CURRENCY_SYMBOLS[displayCurrency] || displayCurrency;

  // Same assets and per-asset conversion as the Portfolio total, so the sums match.
  const typeKeys = new Set(visibleTypes().map((t) => t.key));
  const byCurrency = {};
  assets.filter((a) => typeKeys.has(a.type)).forEach((a) => {
    const row = byCurrency[a.currency] || (byCurrency[a.currency] = { amount: 0, converted: 0 });
    row.amount += a.amount;
    row.converted += toDisplay(a.amount, a.currency);
  });
  const breakdown = Object.entries(byCurrency)
    .map(([cur, row]) => ({ cur, ...row, rate: rateFor(cur) }))
    .sort((a, b) => b.converted - a.converted);
  const total = breakdown.reduce((s, r) => s + r.converted, 0);

  const rateCurrencies = [...new Set([...currencies, ...Object.keys(byCurrency)])]
    .filter((c) => c !== displayCurrency);

  const onRefresh = async () => {
    setRefreshing(true);
    setRefreshError(false);
    try {
      await refreshRates();
    } catch {
      setRefreshError(true);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <div style={{ ...S.secTitle, marginTop: 24 }}>Exchange Rates → {displayCurrency}</div>
      <div style={S.settingsCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "#636366", marginBottom: 4 }}>
          <span style={refreshError ? warnSt : undefined}>
            {refreshError ? "Refresh failed" : ratesFetchedAt ? `Updated ${agoText(ratesFetchedAt)}` : "No rates loaded"}
          </span>
          <button onClick={onRefresh} disabled={refreshing}
            style={{ background: "none", border: "none", color: "#2A9EF4", fontSize: 13, fontWeight: 600, cursor: refreshing ? "default" : "pointer", padding: "4px 0" }}>
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
        {rateCurrencies.map((c) => {
          const rate = rateFor(c);
          const unit = rate === null ? 1 : unitFor(rate);
          // Fiat also gets the inverse quote; crypto pairs stay one-way.
          const showInverse = rate !== null && rate !== 0
            && !CRYPTO_CURRENCIES.includes(c) && !CRYPTO_CURRENCIES.includes(displayCurrency);
          const invUnit = showInverse ? unitFor(1 / rate) : 1;
          return (
            <div key={c} style={rowSt}>
              <span style={{ fontWeight: 600 }}>{c}</span>
              {rate === null
                ? <span style={warnSt}>⚠ no rate</span>
                : (
                  <div style={{ textAlign: "right" }}>
                    {formatRate(unit)} {c} = {formatRate(rate * unit)} {sym}
                    {showInverse && (
                      <div style={{ fontSize: 11, color: "#636366", marginTop: 2 }}>
                        {formatRate(invUnit)} {sym} = {formatRate(invUnit / rate)} {c}
                      </div>
                    )}
                  </div>
                )}
            </div>
          );
        })}

        <button onClick={() => setShowBreakdown(!showBreakdown)}
          style={{ background: "none", border: "none", color: "#2A9EF4", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "12px 0 0", width: "100%", textAlign: "left" }}>
          {showBreakdown ? "▾" : "▸"} How total is calculated
        </button>
        {showBreakdown && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: "#636366", marginBottom: 4 }}>
              {assetScope === "liquid" ? "Liquid assets" : "All assets"}, summed per currency
            </div>
            {breakdown.length === 0 && (
              <div style={{ fontSize: 13, color: "#636366", padding: "8px 0" }}>No assets yet</div>
            )}
            {breakdown.map((r) => (
              <div key={r.cur} style={rowSt}>
                <span>
                  {hideOr(privateMode, CRYPTO_CURRENCIES.includes(r.cur) ? +r.amount.toFixed(8) : formatNumber(r.amount))} {r.cur}
                  <span style={{ color: "#636366" }}> × </span>
                  {r.rate === null ? <span style={warnSt}>⚠ no rate, 1:1</span> : formatRate(r.rate)}
                </span>
                <span style={{ fontWeight: 600 }}>{sym}{hideOr(privateMode, formatNumber(Math.round(r.converted)))}</span>
              </div>
            ))}
            {breakdown.length > 0 && (
              <div style={{ ...rowSt, borderBottom: "none", fontSize: 15, fontWeight: 700 }}>
                <span>Total</span>
                <span>{sym}{hideOr(privateMode, formatNumber(Math.round(total)))}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function hideOr(hide, text) {
  return hide ? MASK : text;
}
