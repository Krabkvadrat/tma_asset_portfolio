import { useState } from "react";
import { useStore } from "../store";
import { CURRENCY_SYMBOLS, CRYPTO_CURRENCIES, ALL_ASSET_TYPES } from "../constants";
import { S, formLabelSt, inputSt, submitBtnSt } from "../styles";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function Add() {
  const { enabledTypes, currencies, banks, assets, createTransaction } = useStore();
  const enabledAssetTypes = ALL_ASSET_TYPES.filter((t) => enabledTypes.includes(t.key));
  const defaultType = enabledAssetTypes[0]?.key || "deposits";

  const [mode, setMode] = useState("add");
  const [form, setForm] = useState({
    type: defaultType, name: "", amount: "", note: "",
    currency: currencies[0] || "EUR", date: todayStr(), bank: "",
  });
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleTypeChange = (type) => {
    const isCrypto = type === "crypto";
    setForm((f) => ({ ...f, type, currency: isCrypto ? "BTC" : (currencies[0] || "EUR"), bank: "" }));
    setSelectedAssetId("");
    setError(null);
  };

  const assetsForType = assets.filter((a) => a.type === form.type);

  const handleWithdrawAssetSelect = (assetId) => {
    setSelectedAssetId(assetId);
    const asset = assets.find((a) => a.id === parseInt(assetId));
    if (asset) {
      setForm((f) => ({
        ...f,
        name: asset.name,
        currency: asset.currency,
        bank: asset.bank || "",
      }));
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError("Enter a valid amount");
      return;
    }

    if (mode === "add" && !form.name.trim()) {
      setError("Enter an asset name");
      return;
    }

    if (mode === "remove" && !selectedAssetId) {
      setError("Select an asset to withdraw from");
      return;
    }

    try {
      const payload = {
        type: form.type,
        action: mode,
        name: form.name || form.type,
        amount: parseFloat(form.amount),
        currency: form.currency,
        date: form.date,
        note: form.note || (mode === "add" ? "Added funds" : "Withdrew funds"),
        bank: form.bank || null,
      };
      if (mode === "remove" && selectedAssetId) {
        payload.asset_id = parseInt(selectedAssetId);
      }
      await createTransaction(payload);
      setSuccess(mode === "add" ? "Funds added" : "Withdrawal recorded");
      setForm((f) => ({ ...f, name: "", amount: "", note: "", date: todayStr(), bank: "" }));
      setSelectedAssetId("");
      setTimeout(() => setSuccess(null), 2000);
    } catch (e) {
      setError(e.message || "Something went wrong");
    }
  };

  const currentType = ALL_ASSET_TYPES.find((t) => t.key === form.type);
  const isCrypto = form.type === "crypto";
  const currencyOptions = isCrypto ? CRYPTO_CURRENCIES : currencies;
  const hasBanks = currentType?.hasBanks;
  const banksForType = hasBanks ? (banks[form.type] || []) : [];

  return (
    <div>
      <div style={S.secTitle}>Add Transaction</div>

      {/* Mode toggle */}
      <div style={{
        display: "flex", marginBottom: 16, background: "#2C2C2E", borderRadius: 10,
        padding: 3, border: "1px solid #3A3A3C",
      }}>
        <button onClick={() => { setMode("add"); setError(null); setSuccess(null); }} style={{
          flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
          background: mode === "add" ? "#10B981" : "transparent", color: mode === "add" ? "#fff" : "#636366",
        }}>+ Add Funds</button>
        <button onClick={() => { setMode("remove"); setError(null); setSuccess(null); }} style={{
          flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
          background: mode === "remove" ? "#EF4444" : "transparent", color: mode === "remove" ? "#fff" : "#636366",
        }}>− Withdraw</button>
      </div>

      <label style={formLabelSt}>Asset Type</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        {enabledAssetTypes.map((t) => (
          <button key={t.key} style={{
            padding: "8px 12px", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: form.type === t.key ? t.color + "22" : "#2C2C2E",
            border: `1.5px solid ${form.type === t.key ? t.color : "#3A3A3C"}`,
            color: form.type === t.key ? t.color : "#A1A1A6",
          }} onClick={() => handleTypeChange(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {mode === "remove" ? (
        <>
          {/* Withdraw: pick an existing asset */}
          <label style={{ ...formLabelSt, marginTop: 16 }}>Asset</label>
          {assetsForType.length === 0 ? (
            <div style={{ color: "#636366", fontSize: 13, padding: "12px 0" }}>
              No {currentType?.label || "assets"} to withdraw from
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <select value={selectedAssetId}
                onChange={(e) => handleWithdrawAssetSelect(e.target.value)}
                style={{ ...inputSt, appearance: "none", paddingRight: 36 }}>
                <option value="">Select asset...</option>
                {assetsForType.map((a) => {
                  const cSym = CURRENCY_SYMBOLS[a.currency] || a.currency + " ";
                  const display = CRYPTO_CURRENCIES.includes(a.currency)
                    ? `${a.amount} ${a.currency}` : `${cSym}${a.amount.toLocaleString()}`;
                  return <option key={a.id} value={a.id}>{a.name} ({display})</option>;
                })}
              </select>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#636366" strokeWidth="2.5"
                style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Add: currency, bank, name fields */}
          <label style={{ ...formLabelSt, marginTop: 16 }}>Currency</label>
          <div style={{ position: "relative" }}>
            <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              style={{ ...inputSt, appearance: "none", paddingRight: 36 }}>
              {currencyOptions.map((c) => <option key={c} value={c}>{CURRENCY_SYMBOLS[c] || c} {c}</option>)}
            </select>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#636366" strokeWidth="2.5"
              style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>

          {hasBanks && banksForType.length > 0 && (
            <>
              <label style={{ ...formLabelSt, marginTop: 14 }}>Bank</label>
              <div style={{ position: "relative" }}>
                <select value={form.bank} onChange={(e) => setForm((f) => ({ ...f, bank: e.target.value }))}
                  style={{ ...inputSt, appearance: "none", paddingRight: 36 }}>
                  <option value="">Select bank...</option>
                  {banksForType.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#636366" strokeWidth="2.5"
                  style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </>
          )}

          <label style={{ ...formLabelSt, marginTop: 14 }}>Name</label>
          <input style={inputSt} placeholder="e.g. Tinkoff Deposit" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </>
      )}

      <label style={{ ...formLabelSt, marginTop: 14 }}>Amount</label>
      <input style={inputSt} placeholder="0.00" type="number" value={form.amount}
        onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); setError(null); }} />

      <label style={{ ...formLabelSt, marginTop: 14 }}>Date</label>
      <input style={inputSt} type="date" value={form.date}
        onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />

      <label style={{ ...formLabelSt, marginTop: 14 }}>Note</label>
      <input style={inputSt} placeholder="Optional note..." value={form.note}
        onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />

      {error && (
        <div style={{ background: "#EF444422", color: "#EF4444", padding: "10px 14px", borderRadius: 10, marginTop: 14, fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: "#10B98122", color: "#10B981", padding: "10px 14px", borderRadius: 10, marginTop: 14, fontSize: 13, fontWeight: 600 }}>
          {success}
        </div>
      )}

      <button onClick={handleSubmit} style={{
        ...submitBtnSt,
        background: mode === "add" ? "#10B981" : "#EF4444",
        width: "100%", marginTop: 18,
      }}>
        {mode === "add" ? "+ Add Funds" : "− Withdraw"}
      </button>
    </div>
  );
}
