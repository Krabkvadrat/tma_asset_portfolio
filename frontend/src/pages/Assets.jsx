import { useState } from "react";
import { useStore } from "../store";
import { CURRENCY_SYMBOLS, CRYPTO_CURRENCIES, ALL_ASSET_TYPES } from "../constants";
import { formLabelSt, inputSt, submitBtnSt } from "../styles";
import Modal from "../components/Modal";

export default function Assets() {
  const {
    displayCurrency, enabledTypes, currencies, banks, assets,
    toDisplay, updateAsset, deleteAsset,
  } = useStore();

  const [expandedAsset, setExpandedAsset] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const sym = CURRENCY_SYMBOLS[displayCurrency] || displayCurrency;
  const enabledAssetTypes = ALL_ASSET_TYPES.filter((t) => enabledTypes.includes(t.key));

  const assetsByType = {};
  assets.forEach((a) => {
    if (!assetsByType[a.type]) assetsByType[a.type] = [];
    assetsByType[a.type].push(a);
  });

  const totalValue = assets
    .filter((a) => enabledTypes.includes(a.type))
    .reduce((s, a) => s + toDisplay(a.amount, a.currency), 0);

  const handleSaveAsset = async () => {
    if (!editModal) return;
    const { asset } = editModal;
    await updateAsset(asset.id, {
      name: asset.name,
      amount: parseFloat(asset.amount) || 0,
      currency: asset.currency,
      bank: asset.bank || null,
      note: asset.note || null,
      rate: asset.rate || null,
    });
    setEditModal(null);
  };

  const handleDeleteAsset = async () => {
    if (!editModal) return;
    await deleteAsset(editModal.asset.id);
    setEditModal(null);
  };

  return (
    <div>
      {editModal && (
        <Modal title="Edit Asset" onClose={() => setEditModal(null)}>
          <label style={formLabelSt}>Name</label>
          <input value={editModal.asset.name}
            onChange={(e) => setEditModal((m) => ({ ...m, asset: { ...m.asset, name: e.target.value } }))} style={inputSt} />
          <label style={{ ...formLabelSt, marginTop: 14 }}>Amount</label>
          <input type="number" value={editModal.asset.amount}
            onChange={(e) => setEditModal((m) => ({ ...m, asset: { ...m.asset, amount: e.target.value } }))} style={inputSt} />
          <label style={{ ...formLabelSt, marginTop: 14 }}>Currency</label>
          <div style={{ position: "relative" }}>
            <select value={editModal.asset.currency}
              onChange={(e) => setEditModal((m) => ({ ...m, asset: { ...m.asset, currency: e.target.value } }))}
              style={{ ...inputSt, appearance: "none", paddingRight: 36 }}>
              {(editModal.typeKey === "crypto" ? CRYPTO_CURRENCIES : currencies).map((c) => (
                <option key={c} value={c}>{CURRENCY_SYMBOLS[c] || c} {c}</option>
              ))}
            </select>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#636366" strokeWidth="2.5"
              style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
          {ALL_ASSET_TYPES.find((t) => t.key === editModal.typeKey)?.hasBanks && (banks[editModal.typeKey] || []).length > 0 && (
            <>
              <label style={{ ...formLabelSt, marginTop: 14 }}>Bank</label>
              <div style={{ position: "relative" }}>
                <select value={editModal.asset.bank || ""}
                  onChange={(e) => setEditModal((m) => ({ ...m, asset: { ...m.asset, bank: e.target.value } }))}
                  style={{ ...inputSt, appearance: "none", paddingRight: 36 }}>
                  <option value="">Select bank...</option>
                  {(banks[editModal.typeKey] || []).map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#636366" strokeWidth="2.5"
                  style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </>
          )}
          <label style={{ ...formLabelSt, marginTop: 14 }}>Note</label>
          <input value={editModal.asset.note || ""}
            onChange={(e) => setEditModal((m) => ({ ...m, asset: { ...m.asset, note: e.target.value } }))}
            style={inputSt} placeholder="Optional" />
          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <button onClick={handleSaveAsset}
              style={{ ...submitBtnSt, background: "#10B981", flex: 1 }}>Save Changes</button>
            <button onClick={handleDeleteAsset}
              style={{ ...submitBtnSt, background: "#EF4444", flex: 0, padding: "14px 20px", fontSize: 18 }}>🗑</button>
          </div>
        </Modal>
      )}

      <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
        <div style={{ fontSize: 11, color: "#636366", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600, marginBottom: 4 }}>Total Assets</div>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1.2 }}>{sym}{Math.round(totalValue).toLocaleString()}</div>

        {showOriginal && (() => {
          const allItems = enabledAssetTypes.flatMap((t) => assetsByType[t.key] || []);
          const byC = {};
          allItems.forEach((a) => {
            if (!byC[a.currency]) byC[a.currency] = { original: 0, converted: 0 };
            byC[a.currency].original += a.amount;
            byC[a.currency].converted += toDisplay(a.amount, a.currency);
          });
          const cKeys = Object.keys(byC);
          if (cKeys.length <= 1) return null;
          return (
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 10 }}>
              {cKeys.map((cur) => {
                const cSym = CURRENCY_SYMBOLS[cur] || "";
                const pct = Math.round((byC[cur].converted / totalValue) * 100);
                return (
                  <div key={cur} style={{
                    background: "#2C2C2E", border: "1px solid #3A3A3C", borderRadius: 10,
                    padding: "8px 12px", textAlign: "center", minWidth: 80,
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {CRYPTO_CURRENCIES.includes(cur) ? `${byC[cur].original.toFixed(4)} ${cur}` : `${cSym}${byC[cur].original.toLocaleString()}`}
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

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 0,
        marginBottom: 16, background: "#2C2C2E", borderRadius: 10, padding: 3, border: "1px solid #3A3A3C",
      }}>
        <button onClick={() => setShowOriginal(false)} style={{
          flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s",
          background: !showOriginal ? "#2A9EF4" : "transparent", color: !showOriginal ? "#fff" : "#636366",
        }}>Converted ({displayCurrency})</button>
        <button onClick={() => setShowOriginal(true)} style={{
          flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s",
          background: showOriginal ? "#2A9EF4" : "transparent", color: showOriginal ? "#fff" : "#636366",
        }}>Original Currency</button>
      </div>

      {enabledAssetTypes.map((type) => {
        const items = assetsByType[type.key] || [];
        const subtotalConverted = items.reduce((s, a) => s + toDisplay(a.amount, a.currency), 0);
        const isOpen = expandedAsset === type.key;

        const currencyGroups = {};
        items.forEach((a) => {
          if (!currencyGroups[a.currency]) currencyGroups[a.currency] = [];
          currencyGroups[a.currency].push(a);
        });
        const groupKeys = Object.keys(currencyGroups);
        const isMultiCurrency = groupKeys.length > 1;

        return (
          <div key={type.key} style={{
            marginBottom: 8, background: "#2C2C2E", border: "1px solid #3A3A3C",
            borderRadius: 14, overflow: "hidden",
          }}>
            <button style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
              padding: "14px 16px", background: "transparent", border: "none",
              borderBottom: isOpen ? "1px solid #3A3A3C" : "none", cursor: "pointer", color: "#F5F5F7",
            }} onClick={() => setExpandedAsset(isOpen ? null : type.key)}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, background: type.color + "22", color: type.color, flexShrink: 0 }}>{type.icon}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, textAlign: "left" }}>{type.label}</div>
                  <div style={{ fontSize: 11, color: "#636366", textAlign: "left" }}>
                    {items.length} item{items.length !== 1 ? "s" : ""}
                    {showOriginal && isMultiCurrency && ` · ${groupKeys.length} currencies`}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{sym}{Math.round(subtotalConverted).toLocaleString()}</div>
                  {showOriginal && isMultiCurrency && (
                    <div style={{ fontSize: 10, color: "#636366", marginTop: 1 }}>
                      {groupKeys.map((cur) => {
                        const grpTotal = currencyGroups[cur].reduce((s, a) => s + a.amount, 0);
                        const cSym = CURRENCY_SYMBOLS[cur] || cur + " ";
                        return CRYPTO_CURRENCIES.includes(cur) ? `${grpTotal} ${cur}` : `${cSym}${grpTotal.toLocaleString()}`;
                      }).join(" + ")}
                    </div>
                  )}
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#636366" strokeWidth="2"
                  style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </button>
            {isOpen && (showOriginal && isMultiCurrency ? (
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
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4A4A4E" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
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
              <div>
                {items.map((a, ai) => {
                  const cSym = CURRENCY_SYMBOLS[a.currency] || "";
                  const isLast = ai === items.length - 1;
                  return (
                    <button key={a.id} onClick={() => setEditModal({ typeKey: type.key, asset: { ...a } })}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "12px 16px", width: "100%", background: "transparent",
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
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4A4A4E" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
