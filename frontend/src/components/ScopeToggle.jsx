import { useStore } from "../store";

const SCOPES = [
  { key: "all", label: "All" },
  { key: "liquid", label: "Liquid" },
];

export default function ScopeToggle() {
  const { assetScope, setAssetScope } = useStore();

  return (
    <div style={{
      display: "flex", margin: "0 auto 12px", maxWidth: 200, background: "#2C2C2E",
      borderRadius: 10, padding: 3, border: "1px solid #3A3A3C",
    }}>
      {SCOPES.map((s) => (
        <button key={s.key} onClick={() => setAssetScope(s.key)} style={{
          flex: 1, padding: "6px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s",
          background: assetScope === s.key ? "#2A9EF4" : "transparent", color: assetScope === s.key ? "#fff" : "#636366",
        }}>{s.label}</button>
      ))}
    </div>
  );
}
