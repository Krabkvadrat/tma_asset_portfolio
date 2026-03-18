import { useState } from "react";
import { useStore } from "../store";
import { CURRENCY_SYMBOLS, CRYPTO_CURRENCIES, ALL_ASSET_TYPES } from "../constants";
import { S, formLabelSt, inputSt, submitBtnSt } from "../styles";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function Add() {
  const { enabledTypes, currencies, banks, createTransaction } = useStore();
  const enabledAssetTypes = ALL_ASSET_TYPES.filter((t) => enabledTypes.includes(t.key));
  const defaultType = enabledAssetTypes[0]?.key || "deposits";

  const [form, setForm] = useState({
    type: defaultType, name: "", amount: "", note: "",
    currency: currencies[0] || "EUR", date: todayStr(), bank: "",
  });

  const handleTypeChange = (type) => {
    const isCrypto = type === "crypto";
    setForm((f) => ({ ...f, type, currency: isCrypto ? "BTC" : (currencies[0] || "EUR"), bank: "" }));
  };

  const handleSubmit = async (action) => {
    if (!form.amount) return;
    await createTransaction({
      type: form.type,
      action,
      name: form.name || form.type,
      amount: parseFloat(form.amount),
      currency: form.currency,
      date: form.date,
      note: form.note || (action === "add" ? "Added funds" : "Withdrew funds"),
      bank: form.bank || null,
    });
    setForm((f) => ({ ...f, name: "", amount: "", note: "", date: todayStr(), bank: "" }));
  };

  const currentType = ALL_ASSET_TYPES.find((t) => t.key === form.type);
  const isCrypto = form.type === "crypto";
  const currencyOptions = isCrypto ? CRYPTO_CURRENCIES : currencies;
  const hasBanks = currentType?.hasBanks;
  const banksForType = hasBanks ? (banks[form.type] || []) : [];

  return (
    <div>
      <div style={S.secTitle}>Add Transaction</div>

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

      <label style={{ ...formLabelSt, marginTop: 14 }}>Amount</label>
      <input style={inputSt} placeholder="0.00" type="number" value={form.amount}
        onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />

      <label style={{ ...formLabelSt, marginTop: 14 }}>Date</label>
      <input style={inputSt} type="date" value={form.date}
        onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />

      <label style={{ ...formLabelSt, marginTop: 14 }}>Note</label>
      <input style={inputSt} placeholder="Optional note..." value={form.note}
        onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />

      <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
        <button onClick={() => handleSubmit("add")} style={{ ...submitBtnSt, background: "#10B981", flex: 1 }}>
          + Add Funds
        </button>
        <button onClick={() => handleSubmit("remove")} style={{ ...submitBtnSt, background: "#EF4444", flex: 1 }}>
          − Withdraw
        </button>
      </div>
    </div>
  );
}
