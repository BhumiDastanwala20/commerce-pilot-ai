"use client";
import { useEffect, useState } from "react";
import type { Recommendation } from "@/lib/types";
import { money } from "@/lib/format";
import ProductArt from "./ProductArt";
import { getSessionId } from "./session";

export default function Recommendations({ refreshKey }: { refreshKey: number }) {
  const [recs, setRecs] = useState<Recommendation[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/recommendations?sid=${getSessionId()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Recommendation[]) => { if (!cancelled) setRecs(d); })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!recs.length) return null;
  return (
    <section aria-label="Recommended for you" style={{ margin: "0 0 24px" }}>
      <h2 style={{ fontSize: 18 }}>Recommended for you</h2>
      <div className="product-grid">
        {recs.map((r) => (
          <article key={r.product.id} className="card product-card">
            <ProductArt id={r.product.id} name={r.product.name} />
            <div className="body">
              <span className="badge badge-accent">{r.reason}</span>
              <h3 style={{ fontSize: 15 }}>{r.product.name}</h3>
              <span className="price">{money(r.product.price)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}