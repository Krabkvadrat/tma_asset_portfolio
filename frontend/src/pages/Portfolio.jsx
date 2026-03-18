import { useState } from "react";
import { useStore } from "../store";
import { CURRENCY_SYMBOLS, ALL_ASSET_TYPES, PERIODS } from "../constants";
import { S } from "../styles";
import ChartSVG from "../components/ChartSVG";
import DonutChart from "../components/DonutChart";
import Modal from "../components/Modal";
import { formLabelSt, inputSt, submitBtnSt } from "../styles";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function Portfolio() {
  const {
    displayCurrency, enabledTypes, assets, chartData, period, setPeriod,
    portfolio, toDisplay,
  } = useStore();

  const [showDateRange, setShowDateRange] = useState(false);
  const [dateRangeStart, setDateRangeStart] = useState(todayStr());
  const [dateRangeEnd, setDateRangeEnd] = useState(todayStr());
  const [customRange, setCustomRange] = useState(null);

  const sym = CURRENCY_SYMBOLS[displayCurrency] || displayCurrency;
  const enabledAssetTypes = ALL_ASSET_TYPES.filter((t) => enabledTypes.includes(t.key));

  const assetsByType = {};
  assets.forEach((a) => {
    if (!assetsByType[a.type]) assetsByType[a.type] = [];
    assetsByType[a.type].push(a);
  });

  const totalValue = portfolio?.total_value ?? assets
    .filter((a) => enabledTypes.includes(a.type))
    .reduce((s, a) => s + toDisplay(a.amount, a.currency), 0);

  const allocations = enabledAssetTypes.map((t) => ({
    label: t.label, icon: t.icon, color: t.color,
    value: (assetsByType[t.key] || []).reduce((s, a) => s + toDisplay(a.amount, a.currency), 0),
  }));

  const hasHistory = chartData.length >= 2;
  const firstVal = hasHistory ? chartData[0].value : 0;
  const lastVal = hasHistory ? chartData[chartData.length - 1].value : 0;
  const absChange = lastVal - firstVal;
  const pctChange = firstVal > 0 ? ((absChange / firstVal) * 100) : 0;
  const isUp = absChange >= 0;

  return (
    <div>
      {showDateRange && (
        <Modal title="Custom Date Range" onClose={() => setShowDateRange(false)}>
          <label style={formLabelSt}>Start Date</label>
          <input type="date" value={dateRangeStart} onChange={(e) => setDateRangeStart(e.target.value)} style={inputSt} />
          <label style={{ ...formLabelSt, marginTop: 14 }}>End Date</label>
          <input type="date" value={dateRangeEnd} onChange={(e) => setDateRangeEnd(e.target.value)} style={inputSt} />
          <button onClick={() => {
            setCustomRange({ start: dateRangeStart, end: dateRangeEnd });
            setShowDateRange(false);
            setPeriod("Custom");
          }} style={{ ...submitBtnSt, background: "#2A9EF4", width: "100%", marginTop: 20 }}>
            Apply Range
          </button>
        </Modal>
      )}

      <div style={{ textAlign: "center", padding: "20px 0 8px" }}>
        <div style={{ fontSize: 11, color: "#636366", textTransform: "uppercase", letterSpacing: 1.4, fontWeight: 600, marginBottom: 6 }}>
          Total Portfolio Value
        </div>
        <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.1 }}>
          {sym}{Math.round(totalValue).toLocaleString()}
        </div>
        {hasHistory ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8, fontSize: 14 }}>
            <span style={{ color: isUp ? "#10B981" : "#EF4444", fontWeight: 600 }}>
              {isUp ? "▲" : "▼"} {sym}{Math.abs(Math.round(absChange)).toLocaleString()}
            </span>
            <span style={{
              background: isUp ? "#10B98122" : "#EF444422",
              color: isUp ? "#10B981" : "#EF4444",
              padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700,
            }}>
              {isUp ? "+" : ""}{pctChange.toFixed(2)}%
            </span>
            <span style={{ color: "#636366", fontSize: 12 }}>
              {period === "Custom" && customRange ? `${customRange.start} → ${customRange.end}` : period}
            </span>
          </div>
        ) : (
          <div style={{ color: "#636366", fontSize: 12, marginTop: 8 }}>
            {totalValue > 0 ? "Performance tracking starts tomorrow" : "Add assets to start tracking"}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 5, padding: "12px 0", justifyContent: "center", flexWrap: "wrap" }}>
        {PERIODS.map((p) => (
          <button key={p} style={{
            padding: "6px 11px", borderRadius: 8,
            border: `1px solid ${p === period ? "#2A9EF4" : "#3A3A3C"}`,
            background: p === period ? "#2A9EF4" : "transparent",
            color: p === period ? "#fff" : "#636366",
            fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
          }} onClick={() => p === "Custom" ? setShowDateRange(true) : setPeriod(p)}>
            {p}
          </button>
        ))}
      </div>

      <div style={{ background: "#2C2C2E", borderRadius: 16, padding: "16px 12px 8px", marginBottom: 20, border: "1px solid #3A3A3C" }}>
        {chartData.length >= 2 ? (
          <ChartSVG data={chartData} currencySymbol={sym} />
        ) : (
          <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "#636366", fontSize: 13 }}>
            {totalValue > 0
              ? "Chart will appear as daily snapshots accumulate"
              : "No data yet"}
          </div>
        )}
      </div>

      <div style={S.secTitle}>Allocation</div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#2C2C2E", borderRadius: 16, padding: 16, border: "1px solid #3A3A3C" }}>
        <DonutChart allocations={allocations} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          {allocations.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: a.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: "#A1A1A6" }}>{a.icon} {a.label}</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {sym}{Math.round(a.value).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
