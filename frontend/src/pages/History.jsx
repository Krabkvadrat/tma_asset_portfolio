import { useStore } from "../store";
import { CURRENCY_SYMBOLS, CRYPTO_CURRENCIES, ALL_ASSET_TYPES } from "../constants";
import { S } from "../styles";

export default function History() {
  const { transactions } = useStore();

  return (
    <div>
      <div style={S.secTitle}>Transactions</div>
      {transactions.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#636366" }}>No transactions yet</div>
      )}
      {transactions.map((tx) => {
        const at = ALL_ASSET_TYPES.find((t) => t.key === tx.type);
        const c = at?.color || "#888";
        return (
          <div key={tx.id} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 0",
            borderBottom: "1px solid #3A3A3C",
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, display: "flex",
              alignItems: "center", justifyContent: "center", fontSize: 18,
              fontWeight: 800, background: c + "18", color: c, flexShrink: 0,
            }}>
              {tx.action === "add" ? "+" : "−"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {tx.note || (tx.action === "add" ? "Added funds" : "Withdrew funds")}
              </div>
              <div style={{ fontSize: 11, color: "#636366", marginTop: 2 }}>
                {at?.label}{tx.bank ? ` · ${tx.bank}` : ""} · {tx.date}
              </div>
            </div>
            <div style={{
              fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums",
              flexShrink: 0, color: tx.action === "add" ? "#10B981" : "#EF4444",
            }}>
              {tx.action === "add" ? "+" : "−"}
              {CRYPTO_CURRENCIES.includes(tx.currency)
                ? `${tx.amount} ${tx.currency}`
                : `${CURRENCY_SYMBOLS[tx.currency] || tx.currency}${tx.amount.toLocaleString()}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
