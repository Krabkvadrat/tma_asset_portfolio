import { useState, useRef, useCallback } from "react";

function formatDate(d) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const parts = d.split("-");
  return `${months[parseInt(parts[1]) - 1]} ${parseInt(parts[2])}, ${parts[0]}`;
}

export default function ChartSVG({ data, width = 340, height = 160, currencySymbol }) {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  if (!data.length) return null;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padTop = 30;
  const padBot = 10;

  const pts = data.map((d, i) => [
    (i / (data.length - 1)) * width,
    padTop + (height - padTop - padBot) - ((d.value - min) / range) * (height - padTop - padBot),
  ]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const isUp = values[values.length - 1] >= values[0];
  const color = isUp ? "#10B981" : "#EF4444";

  const handleMove = useCallback(
    (e) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
      const idx = Math.round((x / rect.width) * (data.length - 1));
      if (idx >= 0 && idx < data.length) setHover(idx);
    },
    [data.length]
  );

  const hPt = hover !== null ? pts[hover] : null;
  const hD = hover !== null ? data[hover] : null;

  return (
    <div style={{ position: "relative" }} onMouseLeave={() => setHover(null)} onTouchEnd={() => setHover(null)}>
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height, touchAction: "none" }}
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
            <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4" fill={color} />
            <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="7" fill={color} opacity="0.2" />
          </>
        )}
      </svg>
      {hD && hPt && (
        <div style={{
          position: "absolute", left: `${Math.min(Math.max(hPt[0] / width * 100, 18), 82)}%`, top: 0,
          transform: "translateX(-50%)", background: "#1C1C1Eee", border: "1px solid #3A3A3C",
          borderRadius: 8, padding: "5px 10px", pointerEvents: "none", zIndex: 5, whiteSpace: "nowrap",
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#F5F5F7" }}>
            {currencySymbol}{Math.round(hD.value).toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: "#A1A1A6", textAlign: "center" }}>{formatDate(hD.date)}</div>
        </div>
      )}
    </div>
  );
}
