import { closeBtnSt } from "../styles";

export default function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "#2C2C2E", borderRadius: "20px 20px 0 0", width: "100%",
        maxWidth: 400, maxHeight: "80vh", display: "flex", flexDirection: "column",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 20px", borderBottom: "1px solid #3A3A3C",
        }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: "#F5F5F7" }}>{title}</span>
          <button onClick={onClose} style={closeBtnSt}>✕</button>
        </div>
        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}
