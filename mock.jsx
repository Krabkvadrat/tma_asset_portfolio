import { useState, useEffect, useRef, useCallback } from "react";

const CURRENCY_SYMBOLS = { EUR: "€", USD: "$", RUB: "₽" };
const CRYPTO_CURRENCIES = ["BTC", "ETH"];

const ALL_ASSET_TYPES = [
  { key: "deposits", label: "Deposits", icon: "🏦", color: "#3B82F6", hasBanks: true },
  { key: "bank_accounts", label: "Bank Accounts", icon: "🏧", color: "#6366F1", hasBanks: true },
  { key: "cash", label: "Cash", icon: "💵", color: "#10B981" },
  { key: "crypto", label: "Crypto", icon: "₿", color: "#EC4899" },
  { key: "stocks_bonds", label: "Stocks/Bonds", icon: "📈", color: "#F59E0B" },
];

const PERIODS = ["7d", "30d", "90d", "180d", "1Y", "Custom"];

function generateChartData(period) {
  const points = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : period === "180d" ? 180 : 365;
  let value = 42000;
  const data = [];
  const now = new Date();
  for (let i = 0; i < points; i++) {
    value += (Math.random() - 0.45) * 800;
    value = Math.max(30000, Math.min(60000, value));
    const d = new Date(now);
    d.setDate(d.getDate() - (points - 1 - i));
    data.push({ value, date: d.toISOString().split("T")[0] });
  }
  return data;
}

function formatDate(d) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const parts = d.split("-");
  return `${months[parseInt(parts[1])-1]} ${parseInt(parts[2])}, ${parts[0]}`;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

/* ─── Chart with hover/touch tooltip ─── */
function ChartSVG({ data, width = 340, height = 160, currencySymbol }) {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  if (!data.length) return null;
  const values = data.map(d => d.value);
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const padTop = 30, padBot = 10;
  const pts = data.map((d, i) => [
    (i / (data.length - 1)) * width,
    padTop + (height - padTop - padBot) - ((d.value - min) / range) * (height - padTop - padBot),
  ]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const isUp = values[values.length - 1] >= values[0];
  const color = isUp ? "#10B981" : "#EF4444";
  const handleMove = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const idx = Math.round((x / rect.width) * (data.length - 1));
    if (idx >= 0 && idx < data.length) setHover(idx);
  }, [data.length]);
  const hPt = hover !== null ? pts[hover] : null;
  const hD = hover !== null ? data[hover] : null;
  return (
    <div style={{ position: "relative" }} onMouseLeave={() => setHover(null)} onTouchEnd={() => setHover(null)}>
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height, touchAction: "none" }}
        onMouseMove={handleMove} onTouchMove={handleMove}>
        <defs>
          <linearGradient id="aG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#aG)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {hPt ? (
          <>
            <line x1={hPt[0]} y1={padTop} x2={hPt[0]} y2={height - padBot} stroke={color} strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />
            <circle cx={hPt[0]} cy={hPt[1]} r="5" fill={color} />
            <circle cx={hPt[0]} cy={hPt[1]} r="9" fill={color} opacity="0.18" />
          </>
        ) : (
          <>
            <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="4" fill={color} />
            <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="7" fill={color} opacity="0.2" />
          </>
        )}
      </svg>
      {hD && hPt && (
        <div style={{
          position: "absolute", left: `${Math.min(Math.max(hPt[0] / width * 100, 18), 82)}%`, top: 0,
          transform: "translateX(-50%)", background: "#1C1C1Eee", border: "1px solid #3A3A3C",
          borderRadius: 8, padding: "5px 10px", pointerEvents: "none", zIndex: 5, whiteSpace: "nowrap",
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#F5F5F7" }}>{currencySymbol}{Math.round(hD.value).toLocaleString()}</div>
          <div style={{ fontSize: 10, color: "#A1A1A6", textAlign: "center" }}>{formatDate(hD.date)}</div>
        </div>
      )}
    </div>
  );
}

function DonutChart({ allocations }) {
  const total = allocations.reduce((s, a) => s + a.value, 0);
  if (total === 0) return null;
  let cum = -90;
  const sz = 120, cx = sz/2, cy = sz/2, r = 44, sw = 14;
  return (
    <svg viewBox={`0 0 ${sz} ${sz}`} style={{ width: sz, height: sz, flexShrink: 0 }}>
      {allocations.filter(a => a.value > 0).map((a, i) => {
        const ang = (a.value / total) * 360, gap = 3;
        const s = ((cum + gap/2) * Math.PI) / 180, e = ((cum + ang - gap/2) * Math.PI) / 180;
        cum += ang;
        return <path key={i} d={`M${cx+r*Math.cos(s)},${cy+r*Math.sin(s)} A${r},${r} 0 ${ang-gap>180?1:0} 1 ${cx+r*Math.cos(e)},${cy+r*Math.sin(e)}`} fill="none" stroke={a.color} strokeWidth={sw} strokeLinecap="round" />;
      })}
      <text x={cx} y={cy-4} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: "#F5F5F7" }}>{total > 1000 ? `${(total/1000).toFixed(1)}k` : total}</text>
      <text x={cx} y={cy+10} textAnchor="middle" style={{ fontSize: 8, fill: "#636366", letterSpacing: 0.5 }}>TOTAL</text>
    </svg>
  );
}

/* ─── Modal ─── */
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#2C2C2E", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 400, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #3A3A3C" }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: "#F5F5F7" }}>{title}</span>
          <button onClick={onClose} style={closeBtnSt}>✕</button>
        </div>
        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

/* ─── Shared styles ─── */
const formLabelSt = { fontSize: 11, fontWeight: 700, color: "#636366", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, display: "block", marginTop: 0 };
const inputSt = { width: "100%", padding: "12px 14px", background: "#1C1C1E", border: "1px solid #3A3A3C", borderRadius: 12, color: "#F5F5F7", fontSize: 15, outline: "none", boxSizing: "border-box" };
const submitBtnSt = { padding: "14px", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: -0.2 };
const closeBtnSt = { background: "#3A3A3C", border: "none", borderRadius: 20, width: 30, height: 30, color: "#A1A1A6", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };

/* ═══════════════ MAIN APP ═══════════════ */
export default function App() {
  const [enabledTypes, setEnabledTypes] = useState(["deposits", "bank_accounts", "cash", "crypto", "stocks_bonds"]);
  const [currencies, setCurrencies] = useState(["EUR", "USD"]);
  const [banks, setBanks] = useState({ deposits: ["Tinkoff", "Sber"], bank_accounts: ["Tinkoff", "Sber", "Alpha"] });
  const [displayCurrency, setDisplayCurrency] = useState("EUR");

  const [tab, setTab] = useState("portfolio");
  const [period, setPeriod] = useState("30d");
  const [chartData, setChartData] = useState(() => generateChartData("30d"));
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showDateRange, setShowDateRange] = useState(false);
  const [customRange, setCustomRange] = useState(null);
  const [expandedAsset, setExpandedAsset] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const [assets, setAssets] = useState({
    deposits: [
      { id: 1, name: "Tinkoff Deposit", amount: 15000, currency: "EUR", rate: "7.5%", bank: "Tinkoff", note: "" },
      { id: 2, name: "Sber Savings+", amount: 8200, currency: "EUR", rate: "6.8%", bank: "Sber", note: "" },
      { id: 10, name: "Sber USD Deposit", amount: 5000, currency: "USD", rate: "4.2%", bank: "Sber", note: "" },
    ],
    bank_accounts: [
      { id: 3, name: "Alpha Checking", amount: 4200, currency: "USD", bank: "Alpha", note: "" },
    ],
    cash: [
      { id: 4, name: "EUR Cash", amount: 3400, currency: "EUR", note: "" },
      { id: 5, name: "USD Cash", amount: 1200, currency: "USD", note: "" },
    ],
    crypto: [
      { id: 6, name: "Bitcoin", amount: 0.12, currency: "BTC", note: "" },
      { id: 7, name: "Ethereum", amount: 2.5, currency: "ETH", note: "" },
    ],
    stocks_bonds: [
      { id: 8, name: "OFZ 26238", amount: 12000, currency: "EUR", rate: "11.2%", note: "" },
      { id: 9, name: "Apple Inc.", amount: 5500, currency: "USD", note: "" },
    ],
  });

  const [transactions, setTransactions] = useState([
    { id: 1, type: "deposits", action: "add", amount: 5000, currency: "EUR", date: "2026-03-17", note: "Tinkoff deposit top-up", bank: "Tinkoff" },
    { id: 2, type: "crypto", action: "add", amount: 0.15, currency: "BTC", date: "2026-03-15", note: "Bought Bitcoin", bank: "" },
    { id: 3, type: "stocks_bonds", action: "add", amount: 12000, currency: "EUR", date: "2026-03-12", note: "OFZ coupon reinvest", bank: "" },
    { id: 4, type: "bank_accounts", action: "remove", amount: 2000, currency: "EUR", date: "2026-03-10", note: "Withdrawal", bank: "Alpha" },
    { id: 5, type: "cash", action: "add", amount: 2000, currency: "EUR", date: "2026-03-10", note: "From bank", bank: "" },
    { id: 6, type: "deposits", action: "add", amount: 3000, currency: "EUR", date: "2026-03-05", note: "Monthly salary", bank: "Sber" },
  ]);

  const defaultAddType = ALL_ASSET_TYPES.find(t => enabledTypes.includes(t.key))?.key || "deposits";
  const [addForm, setAddForm] = useState({ type: defaultAddType, name: "", amount: "", note: "", currency: currencies[0] || "EUR", date: todayStr(), bank: "" });

  const [dateRangeStart, setDateRangeStart] = useState(todayStr());
  const [dateRangeEnd, setDateRangeEnd] = useState(todayStr());
  const [newBankInput, setNewBankInput] = useState({});
  const [newCurrencyInput, setNewCurrencyInput] = useState("");

  useEffect(() => { if (period !== "Custom") setChartData(generateChartData(period)); }, [period]);

  const handleTypeChange = (type) => {
    const isCrypto = type === "crypto";
    setAddForm(f => ({ ...f, type, currency: isCrypto ? "BTC" : (currencies[0] || "EUR"), bank: "" }));
  };

  const sym = CURRENCY_SYMBOLS[displayCurrency] || displayCurrency;
  const enabledAssetTypes = ALL_ASSET_TYPES.filter(t => enabledTypes.includes(t.key));

  // Mock exchange rates to display currency
  // Rates: how many units of displayCurrency per 1 unit of source
  const RATES_TO_EUR = { EUR: 1, USD: 0.92, RUB: 0.0098, BTC: 38500, ETH: 2580 };
  const RATES_TO_USD = { EUR: 1.09, USD: 1, RUB: 0.0107, BTC: 41900, ETH: 2800 };
  const RATES_TO_RUB = { EUR: 102, USD: 93.5, RUB: 1, BTC: 3920000, ETH: 262000 };
  const RATE_TABLES = { EUR: RATES_TO_EUR, USD: RATES_TO_USD, RUB: RATES_TO_RUB };

  const toDisplay = (amount, cur) => {
    const table = RATE_TABLES[displayCurrency] || RATES_TO_EUR;
    const rate = table[cur];
    if (rate !== undefined) return amount * rate;
    return amount;
  };

  const totalValue = Object.entries(assets).reduce((s, [k, arr]) => {
    if (!enabledTypes.includes(k)) return s;
    return s + arr.reduce((ss, a) => ss + toDisplay(a.amount, a.currency), 0);
  }, 0);

  const allocations = enabledAssetTypes.map(t => ({
    label: t.label, icon: t.icon, color: t.color,
    value: (assets[t.key] || []).reduce((s, a) => s + toDisplay(a.amount, a.currency), 0),
  }));

  const handleSaveAsset = (typeKey, updated) => {
    setAssets(prev => ({ ...prev, [typeKey]: prev[typeKey].map(a => a.id === updated.id ? updated : a) }));
    setEditModal(null);
  };
  const handleDeleteAsset = (typeKey, asset) => {
    setAssets(prev => ({ ...prev, [typeKey]: prev[typeKey].filter(a => a.id !== asset.id) }));
    setEditModal(null);
  };

  const handleAddTransaction = (action) => {
    if (!addForm.amount) return;
    const tx = { id: Date.now(), type: addForm.type, action, amount: parseFloat(addForm.amount), currency: addForm.currency, date: addForm.date, note: addForm.note || (action === "add" ? "Added funds" : "Withdrew funds"), bank: addForm.bank || "" };
    setTransactions(prev => [tx, ...prev]);
    if (action === "add") {
      const newA = { id: Date.now() + 1, name: addForm.name || addForm.type, amount: parseFloat(addForm.amount), currency: addForm.currency, note: addForm.note, bank: addForm.bank || undefined };
      setAssets(prev => ({ ...prev, [addForm.type]: [...(prev[addForm.type] || []), newA] }));
    }
    setAddForm(f => ({ ...f, name: "", amount: "", note: "", date: todayStr(), bank: "" }));
  };

  const currentAddType = ALL_ASSET_TYPES.find(t => t.key === addForm.type);
  const isCryptoAdd = addForm.type === "crypto";
  const addCurrencyOptions = isCryptoAdd ? CRYPTO_CURRENCIES : currencies;
  const hasBanksForType = currentAddType?.hasBanks;
  const banksForType = hasBanksForType ? (banks[addForm.type] || []) : [];

  return (
    <div style={S.root}>
      {/* ── Header ── */}
      <div style={S.header}>
        <div style={{ width: 40 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#636366" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.3 }}>Portfolio Tracker</div>
        <button style={S.currencyBtn} onClick={() => setShowCurrencyPicker(!showCurrencyPicker)}>
          {displayCurrency} {sym}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </button>
      </div>

      {/* Currency dropdown */}
      {showCurrencyPicker && (
        <div style={S.dropdown}>
          {currencies.map(c => (
            <button key={c} style={{ ...S.ddItem, background: c === displayCurrency ? "#2A9EF422" : "transparent", color: c === displayCurrency ? "#2A9EF4" : "#F5F5F7" }}
              onClick={() => { setDisplayCurrency(c); setShowCurrencyPicker(false); }}>
              <span style={{ fontWeight: 600 }}>{CURRENCY_SYMBOLS[c]||c}</span> {c}
            </button>
          ))}
        </div>
      )}

      {/* Date range modal */}
      {showDateRange && (
        <Modal title="Custom Date Range" onClose={() => setShowDateRange(false)}>
          <label style={formLabelSt}>Start Date</label>
          <input type="date" value={dateRangeStart} onChange={e => setDateRangeStart(e.target.value)} style={inputSt} />
          <label style={{ ...formLabelSt, marginTop: 14 }}>End Date</label>
          <input type="date" value={dateRangeEnd} onChange={e => setDateRangeEnd(e.target.value)} style={inputSt} />
          <button onClick={() => { setCustomRange({ start: dateRangeStart, end: dateRangeEnd }); setShowDateRange(false); setPeriod("Custom"); setChartData(generateChartData("90d")); }}
            style={{ ...submitBtnSt, background: "#2A9EF4", width: "100%", marginTop: 20 }}>Apply Range</button>
        </Modal>
      )}

      {/* Edit asset modal */}
      {editModal && (
        <Modal title="Edit Asset" onClose={() => setEditModal(null)}>
          <label style={formLabelSt}>Name</label>
          <input value={editModal.asset.name} onChange={e => setEditModal(m => ({ ...m, asset: { ...m.asset, name: e.target.value } }))} style={inputSt} />
          <label style={{ ...formLabelSt, marginTop: 14 }}>Amount</label>
          <input type="number" value={editModal.asset.amount} onChange={e => setEditModal(m => ({ ...m, asset: { ...m.asset, amount: e.target.value } }))} style={inputSt} />
          <label style={{ ...formLabelSt, marginTop: 14 }}>Currency</label>
          <div style={{ position: "relative" }}>
            <select value={editModal.asset.currency} onChange={e => setEditModal(m => ({ ...m, asset: { ...m.asset, currency: e.target.value } }))}
              style={{ ...inputSt, appearance: "none", paddingRight: 36 }}>
              {(editModal.typeKey === "crypto" ? CRYPTO_CURRENCIES : currencies).map(c => <option key={c} value={c}>{CURRENCY_SYMBOLS[c]||c} {c}</option>)}
            </select>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#636366" strokeWidth="2.5" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><path d="M6 9l6 6 6-6"/></svg>
          </div>
          {ALL_ASSET_TYPES.find(t => t.key === editModal.typeKey)?.hasBanks && (banks[editModal.typeKey] || []).length > 0 && (
            <>
              <label style={{ ...formLabelSt, marginTop: 14 }}>Bank</label>
              <div style={{ position: "relative" }}>
                <select value={editModal.asset.bank || ""} onChange={e => setEditModal(m => ({ ...m, asset: { ...m.asset, bank: e.target.value } }))}
                  style={{ ...inputSt, appearance: "none", paddingRight: 36 }}>
                  <option value="">Select bank...</option>
                  {(banks[editModal.typeKey] || []).map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#636366" strokeWidth="2.5" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><path d="M6 9l6 6 6-6"/></svg>
              </div>
            </>
          )}
          <label style={{ ...formLabelSt, marginTop: 14 }}>Note</label>
          <input value={editModal.asset.note || ""} onChange={e => setEditModal(m => ({ ...m, asset: { ...m.asset, note: e.target.value } }))} style={inputSt} placeholder="Optional" />
          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <button onClick={() => handleSaveAsset(editModal.typeKey, { ...editModal.asset, amount: parseFloat(editModal.asset.amount) || 0 })}
              style={{ ...submitBtnSt, background: "#10B981", flex: 1 }}>Save Changes</button>
            <button onClick={() => handleDeleteAsset(editModal.typeKey, editModal.asset)}
              style={{ ...submitBtnSt, background: "#EF4444", flex: 0, padding: "14px 20px", fontSize: 18 }}>🗑</button>
          </div>
        </Modal>
      )}

      {/* ── Content ── */}
      <div style={S.content}>

        {/* ═══ PORTFOLIO ═══ */}
        {tab === "portfolio" && (
          <div>
            <div style={{ textAlign: "center", padding: "20px 0 8px" }}>
              <div style={{ fontSize: 11, color: "#636366", textTransform: "uppercase", letterSpacing: 1.4, fontWeight: 600, marginBottom: 6 }}>Total Portfolio Value</div>
              <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.1 }}>{sym}{Math.round(totalValue).toLocaleString()}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8, fontSize: 14 }}>
                <span style={{ color: "#10B981", fontWeight: 600 }}>▲ {sym}2,340</span>
                <span style={{ background: "#10B98122", color: "#10B981", padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>+4.19%</span>
                <span style={{ color: "#636366", fontSize: 12 }}>{period === "Custom" && customRange ? `${customRange.start} → ${customRange.end}` : period}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 5, padding: "12px 0", justifyContent: "center", flexWrap: "wrap" }}>
              {PERIODS.map(p => (
                <button key={p} style={{
                  padding: "6px 11px", borderRadius: 8, border: `1px solid ${p === period ? "#2A9EF4" : "#3A3A3C"}`,
                  background: p === period ? "#2A9EF4" : "transparent", color: p === period ? "#fff" : "#636366",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                }} onClick={() => p === "Custom" ? setShowDateRange(true) : setPeriod(p)}>
                  {p}
                </button>
              ))}
            </div>
            <div style={{ background: "#2C2C2E", borderRadius: 16, padding: "16px 12px 8px", marginBottom: 20, border: "1px solid #3A3A3C" }}>
              <ChartSVG data={chartData} currencySymbol={sym} />
            </div>
            <div style={S.secTitle}>Allocation</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#2C2C2E", borderRadius: 16, padding: 16, border: "1px solid #3A3A3C" }}>
              <DonutChart allocations={allocations} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                {allocations.map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: a.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: "#A1A1A6" }}>{a.icon} {a.label}</span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{sym}{Math.round(a.value).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ ASSETS ═══ */}
        {tab === "assets" && (
          <div>
            {/* Grand total */}
            <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
              <div style={{ fontSize: 11, color: "#636366", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600, marginBottom: 4 }}>Total Assets</div>
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1.2 }}>{sym}{Math.round(totalValue).toLocaleString()}</div>

              {/* Currency breakdown in original mode */}
              {showOriginal && (() => {
                const allItems = enabledAssetTypes.flatMap(t => assets[t.key] || []);
                const byC = {};
                allItems.forEach(a => {
                  if (!byC[a.currency]) byC[a.currency] = { original: 0, converted: 0 };
                  byC[a.currency].original += a.amount;
                  byC[a.currency].converted += toDisplay(a.amount, a.currency);
                });
                const cKeys = Object.keys(byC);
                if (cKeys.length <= 1) return null;
                return (
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 10 }}>
                    {cKeys.map(cur => {
                      const cSym = CURRENCY_SYMBOLS[cur] || "";
                      const pct = Math.round((byC[cur].converted / totalValue) * 100);
                      return (
                        <div key={cur} style={{
                          background: "#2C2C2E", border: "1px solid #3A3A3C", borderRadius: 10,
                          padding: "8px 12px", textAlign: "center", minWidth: 80,
                        }}>
                          <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                            {CRYPTO_CURRENCIES.includes(cur) ? `${byC[cur].original.toFixed(CRYPTO_CURRENCIES.includes(cur) ? 4 : 0)} ${cur}` : `${cSym}${byC[cur].original.toLocaleString()}`}
                          </div>
                          <div style={{ fontSize: 10, color: "#636366", marginTop: 2 }}>
                            ≈ {sym}{Math.round(byC[cur].converted).toLocaleString()} · {pct}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Toggle: converted vs original */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 16, background: "#2C2C2E", borderRadius: 10, padding: 3, border: "1px solid #3A3A3C" }}>
              <button onClick={() => setShowOriginal(false)} style={{
                flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s",
                background: !showOriginal ? "#2A9EF4" : "transparent", color: !showOriginal ? "#fff" : "#636366",
              }}>Converted ({displayCurrency})</button>
              <button onClick={() => setShowOriginal(true)} style={{
                flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s",
                background: showOriginal ? "#2A9EF4" : "transparent", color: showOriginal ? "#fff" : "#636366",
              }}>Original Currency</button>
            </div>

            {enabledAssetTypes.map(type => {
              const items = assets[type.key] || [];
              const subtotalConverted = items.reduce((s, a) => s + toDisplay(a.amount, a.currency), 0);
              const isOpen = expandedAsset === type.key;

              // Group items by currency for original mode
              const currencyGroups = {};
              items.forEach(a => {
                if (!currencyGroups[a.currency]) currencyGroups[a.currency] = [];
                currencyGroups[a.currency].push(a);
              });
              const groupKeys = Object.keys(currencyGroups);
              const isMultiCurrency = groupKeys.length > 1;

              return (
                <div key={type.key} style={{
                  marginBottom: 8,
                  background: "#2C2C2E",
                  border: "1px solid #3A3A3C",
                  borderRadius: 14,
                  overflow: "hidden",
                }}>
                  <button style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                    padding: "14px 16px", background: "transparent", border: "none",
                    borderBottom: isOpen ? "1px solid #3A3A3C" : "none",
                    cursor: "pointer", color: "#F5F5F7",
                  }} onClick={() => setExpandedAsset(isOpen ? null : type.key)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, background: type.color+"22", color: type.color }}>{type.icon}</div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, textAlign: "left" }}>{type.label}</div>
                        <div style={{ fontSize: 11, color: "#636366" }}>
                          {items.length} item{items.length !== 1 ? "s" : ""}
                          {showOriginal && isMultiCurrency && ` · ${groupKeys.length} currencies`}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{sym}{Math.round(subtotalConverted).toLocaleString()}</div>
                        {showOriginal && isMultiCurrency && (
                          <div style={{ fontSize: 10, color: "#636366", marginTop: 1 }}>
                            {groupKeys.map(cur => {
                              const grpTotal = currencyGroups[cur].reduce((s, a) => s + a.amount, 0);
                              const cSym = CURRENCY_SYMBOLS[cur] || cur + " ";
                              return CRYPTO_CURRENCIES.includes(cur)
                                ? `${grpTotal} ${cur}`
                                : `${cSym}${grpTotal.toLocaleString()}`;
                            }).join(" + ")}
                          </div>
                        )}
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#636366" strokeWidth="2" style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}><path d="M6 9l6 6 6-6"/></svg>
                    </div>
                  </button>
                  {isOpen && (
                    showOriginal && isMultiCurrency ? (
                      /* ── Original mode with currency sub-groups ── */
                      <div>
                        {groupKeys.map((cur, gi) => {
                          const grpItems = currencyGroups[cur];
                          const grpTotal = grpItems.reduce((s, a) => s + a.amount, 0);
                          const grpConverted = grpItems.reduce((s, a) => s + toDisplay(a.amount, a.currency), 0);
                          const cSym = CURRENCY_SYMBOLS[cur] || "";
                          const isLastGroup = gi === groupKeys.length - 1;
                          return (
                            <div key={cur}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px 6px 16px", background: "#252527" }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: type.color, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                  {CRYPTO_CURRENCIES.includes(cur) ? cur : `${cSym} ${cur}`}
                                </div>
                                <div style={{ textAlign: "right" }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "#A1A1A6" }}>
                                    {CRYPTO_CURRENCIES.includes(cur) ? `${grpTotal} ${cur}` : `${cSym}${grpTotal.toLocaleString()}`}
                                  </span>
                                  <span style={{ fontSize: 10, color: "#636366", marginLeft: 6 }}>≈ {sym}{Math.round(grpConverted).toLocaleString()}</span>
                                </div>
                              </div>
                              {grpItems.map((a, ai) => {
                                const isLast = isLastGroup && ai === grpItems.length - 1;
                                return (
                                  <button key={a.id} onClick={() => setEditModal({ typeKey: type.key, asset: { ...a } })}
                                    style={{
                                      display: "flex", justifyContent: "space-between", alignItems: "center",
                                      padding: "10px 16px 10px 32px", width: "100%", background: "transparent",
                                      border: "none", borderBottom: isLast ? "none" : "1px solid #3A3A3C44",
                                      cursor: "pointer", color: "#F5F5F7", textAlign: "left",
                                    }}>
                                    <div>
                                      <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</div>
                                      {a.bank && <div style={{ fontSize: 11, color: "#636366" }}>{a.bank}</div>}
                                    </div>
                                    <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: 8 }}>
                                      <div>
                                        <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                                          {CRYPTO_CURRENCIES.includes(a.currency) ? `${a.amount} ${a.currency}` : `${cSym}${a.amount.toLocaleString()}`}
                                        </div>
                                        <div style={{ fontSize: 10, color: "#636366" }}>≈ {sym}{Math.round(toDisplay(a.amount, a.currency)).toLocaleString()}</div>
                                      </div>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4A4A4E" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                                    </div>
                                  </button>
                                );
                              })}
                              {!isLastGroup && <div style={{ height: 1, background: "#3A3A3C", margin: "0 16px" }} />}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* ── Converted mode or single-currency: flat list ── */
                      <div>
                        {items.map((a, ai) => {
                          const cSym = CURRENCY_SYMBOLS[a.currency] || "";
                          const isLast = ai === items.length - 1;
                          return (
                            <button key={a.id} onClick={() => setEditModal({ typeKey: type.key, asset: { ...a } })}
                              style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                padding: "12px 16px 12px 16px", width: "100%", background: "transparent",
                                border: "none", borderBottom: isLast ? "none" : "1px solid #3A3A3C44",
                                cursor: "pointer", color: "#F5F5F7", textAlign: "left",
                              }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <div style={{ width: 4, height: 28, borderRadius: 2, background: type.color + "66" }} />
                                <div>
                                  <div style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</div>
                                  {a.bank && <div style={{ fontSize: 11, color: "#636366" }}>{a.bank}</div>}
                                </div>
                              </div>
                              <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: 10 }}>
                                <div>
                                  {showOriginal ? (
                                    <>
                                      <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                                        {CRYPTO_CURRENCIES.includes(a.currency) ? `${a.amount} ${a.currency}` : `${cSym}${a.amount.toLocaleString()}`}
                                      </div>
                                      {a.currency !== displayCurrency && !CRYPTO_CURRENCIES.includes(a.currency) && (
                                        <div style={{ fontSize: 10, color: "#636366" }}>≈ {sym}{Math.round(toDisplay(a.amount, a.currency)).toLocaleString()}</div>
                                      )}
                                    </>
                                  ) : (
                                    <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                                      {sym}{Math.round(toDisplay(a.amount, a.currency)).toLocaleString()}
                                    </div>
                                  )}
                                  {a.rate && <div style={{ fontSize: 11, color: type.color, fontWeight: 600 }}>{a.rate}</div>}
                                </div>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4A4A4E" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ ADD ═══ */}
        {tab === "add" && (
          <div>
            <div style={S.secTitle}>Add Transaction</div>

            <label style={formLabelSt}>Asset Type</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
              {enabledAssetTypes.map(t => (
                <button key={t.key} style={{
                  padding: "8px 12px", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: addForm.type === t.key ? t.color+"22" : "#2C2C2E",
                  border: `1.5px solid ${addForm.type === t.key ? t.color : "#3A3A3C"}`,
                  color: addForm.type === t.key ? t.color : "#A1A1A6",
                }} onClick={() => handleTypeChange(t.key)}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            <label style={{ ...formLabelSt, marginTop: 16 }}>Currency</label>
            <div style={{ position: "relative" }}>
              <select value={addForm.currency} onChange={e => setAddForm(f => ({ ...f, currency: e.target.value }))}
                style={{ ...inputSt, appearance: "none", paddingRight: 36 }}>
                {addCurrencyOptions.map(c => <option key={c} value={c}>{CURRENCY_SYMBOLS[c]||c} {c}</option>)}
              </select>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#636366" strokeWidth="2.5" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><path d="M6 9l6 6 6-6"/></svg>
            </div>

            {hasBanksForType && banksForType.length > 0 && (
              <>
                <label style={{ ...formLabelSt, marginTop: 14 }}>Bank</label>
                <div style={{ position: "relative" }}>
                  <select value={addForm.bank} onChange={e => setAddForm(f => ({ ...f, bank: e.target.value }))}
                    style={{ ...inputSt, appearance: "none", paddingRight: 36 }}>
                    <option value="">Select bank...</option>
                    {banksForType.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#636366" strokeWidth="2.5" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><path d="M6 9l6 6 6-6"/></svg>
                </div>
              </>
            )}

            <label style={{ ...formLabelSt, marginTop: 14 }}>Name</label>
            <input style={inputSt} placeholder="e.g. Tinkoff Deposit" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />

            <label style={{ ...formLabelSt, marginTop: 14 }}>Amount</label>
            <input style={inputSt} placeholder="0.00" type="number" value={addForm.amount} onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))} />

            <label style={{ ...formLabelSt, marginTop: 14 }}>Date</label>
            <input style={inputSt} type="date" value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} />

            <label style={{ ...formLabelSt, marginTop: 14 }}>Note</label>
            <input style={inputSt} placeholder="Optional note..." value={addForm.note} onChange={e => setAddForm(f => ({ ...f, note: e.target.value }))} />

            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button onClick={() => handleAddTransaction("add")} style={{ ...submitBtnSt, background: "#10B981", flex: 1 }}>+ Add Funds</button>
              <button onClick={() => handleAddTransaction("remove")} style={{ ...submitBtnSt, background: "#EF4444", flex: 1 }}>− Withdraw</button>
            </div>
          </div>
        )}

        {/* ═══ HISTORY ═══ */}
        {tab === "history" && (
          <div>
            <div style={S.secTitle}>Transactions</div>
            {transactions.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#636366" }}>No transactions yet</div>}
            {transactions.map(tx => {
              const at = ALL_ASSET_TYPES.find(t => t.key === tx.type);
              const c = at?.color || "#888";
              return (
                <div key={tx.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid #3A3A3C" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, background: c+"18", color: c, flexShrink: 0 }}>
                    {tx.action === "add" ? "+" : "−"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.note}</div>
                    <div style={{ fontSize: 11, color: "#636366", marginTop: 2 }}>{at?.label}{tx.bank ? ` · ${tx.bank}` : ""} · {tx.date}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", flexShrink: 0, color: tx.action === "add" ? "#10B981" : "#EF4444" }}>
                    {tx.action === "add" ? "+" : "−"}{CRYPTO_CURRENCIES.includes(tx.currency) ? `${tx.amount} ${tx.currency}` : `${CURRENCY_SYMBOLS[tx.currency]||tx.currency}${tx.amount.toLocaleString()}`}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ SETTINGS ═══ */}
        {tab === "settings" && (
          <div>
            {/* Currencies */}
            <div style={S.secTitle}>Display Currencies</div>
            <div style={S.settingsCard}>
              {currencies.map(c => (
                <div key={c} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #3A3A3C" }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{CURRENCY_SYMBOLS[c]||""} {c}</span>
                  {currencies.length > 1 && (
                    <button onClick={() => { setCurrencies(p => p.filter(x => x !== c)); if (displayCurrency === c) setDisplayCurrency(currencies.find(x => x !== c)); }}
                      style={{ background: "#EF444422", border: "none", borderRadius: 8, padding: "4px 10px", color: "#EF4444", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Remove</button>
                  )}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <select value={newCurrencyInput} onChange={e => setNewCurrencyInput(e.target.value)} style={{ ...inputSt, flex: 1, fontSize: 13, padding: "10px 12px" }}>
                  <option value="">Add currency...</option>
                  {Object.keys(CURRENCY_SYMBOLS).filter(c => !currencies.includes(c)).map(c => <option key={c} value={c}>{CURRENCY_SYMBOLS[c]} {c}</option>)}
                </select>
                <button onClick={() => { if (newCurrencyInput) { setCurrencies(p => [...p, newCurrencyInput]); setNewCurrencyInput(""); } }}
                  style={{ ...submitBtnSt, background: "#2A9EF4", padding: "10px 16px", fontSize: 13 }}>Add</button>
              </div>
            </div>

            {/* Asset types */}
            <div style={{ ...S.secTitle, marginTop: 24 }}>Asset Types</div>
            <div style={S.settingsCard}>
              {ALL_ASSET_TYPES.map(t => {
                const enabled = enabledTypes.includes(t.key);
                return (
                  <div key={t.key} style={{ padding: "12px 0", borderBottom: "1px solid #3A3A3C" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{t.icon} {t.label}</span>
                      <button onClick={() => setEnabledTypes(p => enabled ? p.filter(x => x !== t.key) : [...p, t.key])}
                        style={{ width: 44, height: 26, borderRadius: 13, border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", background: enabled ? "#10B981" : "#3A3A3C" }}>
                        <div style={{ width: 20, height: 20, borderRadius: 10, background: "#fff", position: "absolute", top: 3, transition: "left 0.2s", left: enabled ? 21 : 3 }} />
                      </button>
                    </div>
                    {enabled && t.hasBanks && (
                      <div style={{ marginTop: 10, paddingLeft: 4 }}>
                        <div style={{ fontSize: 10, color: "#636366", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Banks for {t.label}</div>
                        {(banks[t.key] || []).map((b, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}>
                            <span style={{ fontSize: 13, color: "#A1A1A6" }}>🏦 {b}</span>
                            <button onClick={() => setBanks(p => ({ ...p, [t.key]: p[t.key].filter((_, j) => j !== i) }))}
                              style={{ background: "none", border: "none", color: "#EF4444", fontSize: 16, cursor: "pointer", padding: "0 4px" }}>✕</button>
                          </div>
                        ))}
                        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                          <input placeholder="Bank name..." value={newBankInput[t.key] || ""} onChange={e => setNewBankInput(p => ({ ...p, [t.key]: e.target.value }))}
                            style={{ ...inputSt, flex: 1, padding: "8px 12px", fontSize: 13 }} />
                          <button onClick={() => {
                            const v = (newBankInput[t.key] || "").trim();
                            if (v) { setBanks(p => ({ ...p, [t.key]: [...(p[t.key] || []), v] })); setNewBankInput(p => ({ ...p, [t.key]: "" })); }
                          }} style={{ ...submitBtnSt, background: t.color, padding: "8px 14px", fontSize: 14, borderRadius: 10 }}>+</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom Tab Bar ── */}
      <div style={S.tabBar}>
        {[
          { key: "portfolio", label: "Portfolio", d: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" },
          { key: "assets", label: "Assets", d: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
          { key: "add", label: "Add", d: "M12 4v16m8-8H4" },
          { key: "history", label: "History", d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
          { key: "settings", label: "Settings", d: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
        ].map(t => (
          <button key={t.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "none", border: "none", cursor: "pointer", padding: "4px 6px", color: tab === t.key ? "#2A9EF4" : "#636366" }}
            onClick={() => setTab(t.key)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={t.d}/></svg>
            <span style={{ fontSize: 9, fontWeight: tab === t.key ? 700 : 500, letterSpacing: 0.2 }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const S = {
  root: {
    fontFamily: "'SF Pro Display', -apple-system, 'Helvetica Neue', sans-serif",
    background: "#1C1C1E", color: "#F5F5F7", maxWidth: 400, margin: "0 auto",
    height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden",
    borderRadius: 20, boxShadow: "0 0 60px rgba(0,0,0,0.6)", position: "relative",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 16px", borderBottom: "1px solid #3A3A3C", background: "#1C1C1E",
    position: "sticky", top: 0, zIndex: 10,
  },
  currencyBtn: {
    display: "flex", alignItems: "center", gap: 4, background: "#2C2C2E",
    border: "1px solid #3A3A3C", borderRadius: 8, padding: "6px 10px",
    color: "#2A9EF4", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  dropdown: {
    position: "absolute", top: 54, right: 16, background: "#2C2C2E",
    border: "1px solid #3A3A3C", borderRadius: 12, padding: 4, zIndex: 20,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)", minWidth: 120,
  },
  ddItem: {
    display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
    border: "none", borderRadius: 8, width: "100%", fontSize: 14, cursor: "pointer", color: "#F5F5F7",
  },
  content: { flex: 1, overflowY: "auto", padding: "16px", paddingBottom: 80 },
  secTitle: { fontSize: 13, fontWeight: 700, color: "#636366", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 },
  assetHdr: {
    display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
    padding: "14px 16px", background: "#2C2C2E", border: "1px solid #3A3A3C",
    borderRadius: 14, cursor: "pointer", color: "#F5F5F7",
  },
  settingsCard: { background: "#2C2C2E", borderRadius: 14, border: "1px solid #3A3A3C", padding: 14, marginBottom: 20 },
  tabBar: {
    display: "flex", justifyContent: "space-around", padding: "6px 0 10px",
    borderTop: "1px solid #3A3A3C", background: "#1C1C1E", position: "sticky", bottom: 0,
  },
};
