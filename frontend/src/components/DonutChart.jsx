export default function DonutChart({ allocations, hide }) {
  const total = allocations.reduce((s, a) => s + a.value, 0);
  if (total === 0) return null;

  let cum = -90;
  const sz = 120, cx = sz / 2, cy = sz / 2, r = 44, sw = 14;

  return (
    <svg viewBox={`0 0 ${sz} ${sz}`} style={{ width: sz, height: sz, flexShrink: 0 }}>
      {allocations.filter((a) => a.value > 0).map((a, i) => {
        const ang = (a.value / total) * 360;
        const gap = 3;
        const s = ((cum + gap / 2) * Math.PI) / 180;
        const e = ((cum + ang - gap / 2) * Math.PI) / 180;
        cum += ang;
        return (
          <path key={i}
            d={`M${cx + r * Math.cos(s)},${cy + r * Math.sin(s)} A${r},${r} 0 ${ang - gap > 180 ? 1 : 0} 1 ${cx + r * Math.cos(e)},${cy + r * Math.sin(e)}`}
            fill="none" stroke={a.color} strokeWidth={sw} strokeLinecap="round" />
        );
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: "#F5F5F7" }}>
        {hide ? "•••" : total > 1000 ? `${(total / 1000).toFixed(1)}k` : total}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" style={{ fontSize: 8, fill: "#636366", letterSpacing: 0.5 }}>
        TOTAL
      </text>
    </svg>
  );
}
