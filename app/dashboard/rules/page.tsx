"use client";
import { useEffect, useState } from "react";
import type { Rules } from "@/lib/types";
import { useToast } from "@/components/Toast";

type P = { id: string; name: string; price: number; minPrice: number };

export default function RulesPage() {
  const [rules, setRules] = useState<Rules | null>(null);
  const [products, setProducts] = useState<P[]>([]);
  const [busy, setBusy] = useState(false);
  const { toast, node } = useToast();

  useEffect(() => {
    fetch("/api/rules").then((r) => r.json()).then((d) => { setRules(d.rules); setProducts(d.products); }).catch(() => {});
  }, []);

  async function save() {
    if (!rules) return;
    setBusy(true);
    try {
      const r = await fetch("/api/rules", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules, minPrices: Object.fromEntries(products.map((p) => [p.id, p.minPrice])) }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) toast("Rules saved. The AI uses them immediately."); else toast(d?.error || "Could not save.", "err");
    } finally {
      setBusy(false);
    }
  }

  if (!rules) return <main className="container"><p>Loading…</p></main>;
  const set = (k: keyof Rules, v: string) => setRules({ ...rules, [k]: Number(v) });

  const fields: [keyof Rules, string, string][] = [
    ["maxDiscountPercent", "Max discount (%)", "Highest discount for normal orders"],
    ["bulkThreshold", "Bulk threshold (units)", "Quantity that unlocks the bulk discount"],
    ["bulkDiscountPercent", "Bulk discount (%)", "Highest discount for bulk orders"],
    ["approvalAbove", "Approval above ($)", "Orders over this total wait for your approval"],
  ];

  return (
    <main className="container">
      <h1>Negotiation rules</h1>
      <p style={{ color: "var(--muted)" }}>The AI can never go beyond these limits, even if a customer pushes.</p>
      <section className="card" style={{ padding: 16, marginBottom: 16, display: "grid", gap: 12, maxWidth: 560 }}>
        {fields.map(([k, label, hint]) => (
          <label key={k}>
            <div><b>{label}</b></div>
            <div className="time">{hint}</div>
            <input className="field" type="number" min={0} value={rules[k]} onChange={(e) => set(k, e.target.value)} />
          </label>
        ))}
      </section>

      <h2 style={{ fontSize: 18 }}>Minimum price per product</h2>
      <div className="card table-wrap" style={{ marginBottom: 16, maxWidth: 560 }}>
        <table className="simple">
          <thead><tr><th>Product</th><th>List</th><th>Minimum</th></tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td><td>${p.price}</td>
                <td><input className="field" type="number" min={0.01} step="0.01" value={p.minPrice} style={{ width: 100 }}
                  onChange={(e) => setProducts(products.map((x) => (x.id === p.id ? { ...x, minPrice: Number(e.target.value) } : x)))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn btn-primary" disabled={busy} onClick={save}>Save rules</button>
      {node}
    </main>
  );
}