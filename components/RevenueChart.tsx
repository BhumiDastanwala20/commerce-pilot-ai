import type { OwnerOrder } from "@/lib/types";
import { money } from "@/lib/format";

export default function RevenueChart({ orders }: { orders: OwnerOrder[] }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const data = days.map((d) => {
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    const total = orders
      .filter((o) => o.status === "paid" && o.paidAt && new Date(o.paidAt) >= d && new Date(o.paidAt) < next)
      .reduce((s, o) => s + o.total, 0);
    return { label: d.toLocaleDateString([], { weekday: "short" }), total };
  });
  const max = Math.max(1, ...data.map((x) => x.total));
  const W = 560, H = 190, base = 150, bw = 46, gap = (W - bw * 7) / 8;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Revenue for the last 7 days" style={{ width: "100%", height: "auto" }}>
      {data.map((d, i) => {
        const h = (d.total / max) * 120;
        const x = gap + i * (bw + gap);
        return (
          <g key={i}>
            <rect x={x} y={base - h} width={bw} height={Math.max(h, 2)} rx="6" fill="var(--accent)" opacity={d.total ? 1 : 0.25} />
            <text x={x + bw / 2} y={base - h - 6} textAnchor="middle" fontSize="11" fill="var(--text)">{d.total ? money(d.total) : ""}</text>
            <text x={x + bw / 2} y={base + 18} textAnchor="middle" fontSize="12" fill="var(--muted)">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}