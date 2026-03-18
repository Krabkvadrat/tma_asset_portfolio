export const formLabelSt = {
  fontSize: 11, fontWeight: 700, color: "#636366", textTransform: "uppercase",
  letterSpacing: 0.8, marginBottom: 6, display: "block", marginTop: 0,
};
export const inputSt = {
  width: "100%", padding: "12px 14px", background: "#1C1C1E",
  border: "1px solid #3A3A3C", borderRadius: 12, color: "#F5F5F7",
  fontSize: 15, outline: "none", boxSizing: "border-box",
};
export const submitBtnSt = {
  padding: "14px", border: "none", borderRadius: 12, color: "#fff",
  fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: -0.2,
};
export const closeBtnSt = {
  background: "#3A3A3C", border: "none", borderRadius: 20, width: 30,
  height: 30, color: "#A1A1A6", fontSize: 16, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};

export const S = {
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
    border: "none", borderRadius: 8, width: "100%", fontSize: 14,
    cursor: "pointer", color: "#F5F5F7",
  },
  content: { flex: 1, overflowY: "auto", padding: "16px", paddingBottom: 80 },
  secTitle: {
    fontSize: 13, fontWeight: 700, color: "#636366", textTransform: "uppercase",
    letterSpacing: 1, marginBottom: 12,
  },
  settingsCard: {
    background: "#2C2C2E", borderRadius: 14, border: "1px solid #3A3A3C",
    padding: 14, marginBottom: 20,
  },
  tabBar: {
    display: "flex", justifyContent: "space-around", padding: "6px 0 10px",
    borderTop: "1px solid #3A3A3C", background: "#1C1C1E",
    position: "sticky", bottom: 0,
  },
};
