import { useState } from "react";
import { useStore } from "../store";
import { CURRENCY_SYMBOLS, ALL_ASSET_TYPES } from "../constants";
import { S, formLabelSt, inputSt, submitBtnSt } from "../styles";

export default function Settings() {
  const {
    enabledTypes, currencies, banks,
    setEnabledTypes, setCurrencies, setBanks, resetAllData,
  } = useStore();

  const [newCurrencyInput, setNewCurrencyInput] = useState("");
  const [newBankInput, setNewBankInput] = useState({});
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div>
      <div style={S.secTitle}>Display Currencies</div>
      <div style={S.settingsCard}>
        {currencies.map((c) => (
          <div key={c} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #3A3A3C" }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{CURRENCY_SYMBOLS[c] || ""} {c}</span>
            {currencies.length > 1 && (
              <button onClick={() => setCurrencies(currencies.filter((x) => x !== c))}
                style={{ background: "#EF444422", border: "none", borderRadius: 8, padding: "4px 10px", color: "#EF4444", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Remove
              </button>
            )}
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <select value={newCurrencyInput} onChange={(e) => setNewCurrencyInput(e.target.value)}
            style={{ ...inputSt, flex: 1, fontSize: 13, padding: "10px 12px" }}>
            <option value="">Add currency...</option>
            {Object.keys(CURRENCY_SYMBOLS).filter((c) => !currencies.includes(c)).map((c) => (
              <option key={c} value={c}>{CURRENCY_SYMBOLS[c]} {c}</option>
            ))}
          </select>
          <button onClick={() => { if (newCurrencyInput) { setCurrencies([...currencies, newCurrencyInput]); setNewCurrencyInput(""); } }}
            style={{ ...submitBtnSt, background: "#2A9EF4", padding: "10px 16px", fontSize: 13 }}>Add</button>
        </div>
      </div>

      <div style={{ ...S.secTitle, marginTop: 24 }}>Asset Types</div>
      <div style={S.settingsCard}>
        {ALL_ASSET_TYPES.map((t) => {
          const enabled = enabledTypes.includes(t.key);
          return (
            <div key={t.key} style={{ padding: "12px 0", borderBottom: "1px solid #3A3A3C" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{t.icon} {t.label}</span>
                <button onClick={() => setEnabledTypes(enabled ? enabledTypes.filter((x) => x !== t.key) : [...enabledTypes, t.key])}
                  style={{
                    width: 44, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
                    position: "relative", transition: "background 0.2s",
                    background: enabled ? "#10B981" : "#3A3A3C",
                  }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 10, background: "#fff",
                    position: "absolute", top: 3, transition: "left 0.2s",
                    left: enabled ? 21 : 3,
                  }} />
                </button>
              </div>
              {enabled && t.hasBanks && (
                <div style={{ marginTop: 10, paddingLeft: 4 }}>
                  <div style={{ fontSize: 10, color: "#636366", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
                    Banks for {t.label}
                  </div>
                  {(banks[t.key] || []).map((b, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}>
                      <span style={{ fontSize: 13, color: "#A1A1A6" }}>🏦 {b}</span>
                      <button onClick={() => setBanks({ ...banks, [t.key]: banks[t.key].filter((_, j) => j !== i) })}
                        style={{ background: "none", border: "none", color: "#EF4444", fontSize: 16, cursor: "pointer", padding: "0 4px" }}>✕</button>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <input placeholder="Bank name..." value={newBankInput[t.key] || ""}
                      onChange={(e) => setNewBankInput((p) => ({ ...p, [t.key]: e.target.value }))}
                      style={{ ...inputSt, flex: 1, padding: "8px 12px", fontSize: 13 }} />
                    <button onClick={() => {
                      const v = (newBankInput[t.key] || "").trim();
                      if (v) { setBanks({ ...banks, [t.key]: [...(banks[t.key] || []), v] }); setNewBankInput((p) => ({ ...p, [t.key]: "" })); }
                    }} style={{ ...submitBtnSt, background: t.color, padding: "8px 14px", fontSize: 14, borderRadius: 10 }}>+</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ ...S.secTitle, marginTop: 32 }}>Danger Zone</div>
      <div style={{ ...S.settingsCard, borderColor: "#EF444444" }}>
        <div style={{ fontSize: 13, color: "#A1A1A6", marginBottom: 12 }}>
          Delete all assets, transactions, and portfolio history. Settings will be kept.
        </div>
        {!confirmReset ? (
          <button onClick={() => setConfirmReset(true)} style={{
            ...submitBtnSt, background: "#EF4444", width: "100%",
          }}>
            Reset All Data
          </button>
        ) : (
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#EF4444", marginBottom: 12, textAlign: "center" }}>
              Are you sure? This cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmReset(false)} style={{
                ...submitBtnSt, background: "#3A3A3C", flex: 1,
              }}>
                Cancel
              </button>
              <button onClick={async () => {
                await resetAllData();
                setConfirmReset(false);
              }} style={{
                ...submitBtnSt, background: "#EF4444", flex: 1,
              }}>
                Yes, Delete Everything
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
