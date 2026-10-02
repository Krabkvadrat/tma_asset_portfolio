import { useStore } from "../store";

const SCOPES = [
  { key: "all", label: "All" },
  { key: "liquid", label: "Liquid" },
];

export default function ScopeToggle() {
  const { assetScope, setAssetScope, enabledTypes, includeDebts, setIncludeDebts } = useStore();
  const showDebtsChip = assetScope === "liquid" && enabledTypes.includes("debts");

  return (
    <>
      <div style={{
        display: "flex", margin: `0 auto ${showDebtsChip ? 8 : 12}px`, maxWidth: 200, background: "#2C2C2E",
        borderRadius: 10, padding: 3, border: "1px solid #3A3A3C",
      }}>
        {SCOPES.map((s) => (
          <button key={s.key} onClick={() => setAssetScope(s.key)} style={{
            flex: 1, padding: "6px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s",
            background: assetScope === s.key ? "#2A9EF4" : "transparent", color: assetScope === s.key ? "#fff" : "#636366",
          }}>{s.label}</button>
        ))}
      </div>
      {showDebtsChip && (
        <button onClick={() => setIncludeDebts(!includeDebts)} style={{
          display: "flex", width: "fit-content", alignItems: "center", gap: 5, margin: "0 auto 12px",
          padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
          background: includeDebts ? "#84CC1622" : "transparent",
          border: `1px ${includeDebts ? "solid #84CC16" : "dashed #3A3A3C"}`,
          color: includeDebts ? "#84CC16" : "#636366",
        }}>
          🤝 Debts {includeDebts ? "included" : "excluded"}
        </button>
      )}
    </>
  );
}
