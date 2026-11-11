import { listOrders, recentEvents, recentSearches, toPublicProduct } from "./store";
import type { Product } from "./store";
import { cosine, features, getIndex, tokenize, weigh } from "./search";
import type { V } from "./search";
import type { Recommendation } from "./types";

type Source = { kind: "search" | "viewed"; label: string; w: number; v: V; productId?: string };

function coPurchase(): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>();
  for (const o of listOrders()) {
    if (o.status !== "paid") continue;
    const ids = o.items.map((i) => i.productId);
    for (const a of ids) for (const b of ids) {
      if (a === b) continue;
      const row = m.get(a) ?? new Map<string, number>();
      row.set(b, (row.get(b) ?? 0) + 1);
      m.set(a, row);
    }
  }
  return m;
}

function popularity(): Map<string, number> {
  const sold = new Map<string, number>();
  for (const o of listOrders()) if (o.status === "paid") for (const i of o.items) sold.set(i.productId, (sold.get(i.productId) ?? 0) + i.qty);
  const max = Math.max(1, ...sold.values());
  return new Map([...sold].map(([k, v]) => [k, 0.05 + (0.95 * v) / max]));
}

export function recommend(sessionId: string, limit = 4): Recommendation[] {
  const idx = getIndex();
  const sources: Source[] = [];

  // Recent searches and clicks, newer ones count more (0.85^rank time decay)
  recentSearches(sessionId, 8).forEach((s, i) => {
    const words = tokenize(s.query);
    if (words.length) sources.push({ kind: "search", label: s.query, w: Math.pow(0.85, i), v: weigh(idx.idf, features(words, true)) });
  });
  recentEvents(sessionId, 8).forEach((e, i) => {
    const d = idx.docs.find((x) => x.p.id === e.productId);
    if (d) sources.push({ kind: "viewed", label: d.p.name, w: Math.pow(0.85, i) * (e.type === "order" ? 1.5 : 1), v: d, productId: e.productId });
  });

  const seen = new Set(sources.filter((s) => s.productId).map((s) => s.productId!));
  const co = coPurchase();
  const pop = popularity();
  const totalW = sources.reduce((a, s) => a + s.w, 0);

  const scored = idx.docs
    .filter((d) => d.p.stock > 0 && !seen.has(d.p.id))
    .map((d) => {
      let content = 0, bestVal = 0, best: Source | null = null, coScore = 0, coWith = "";
      for (const s of sources) {
        const c = s.w * cosine(s.v, d);
        content += c;
        if (c > bestVal) { bestVal = c; best = s; }
        if (s.productId) {
          const n = (co.get(s.productId)?.get(d.p.id) ?? 0) * s.w;
          if (n > coScore) { coScore = n; coWith = s.label; }
        }
      }
      content = totalW ? content / totalW : 0;
      const coNorm = Math.min(1, coScore / 3);
      const p = pop.get(d.p.id) ?? 0.05;
      const score = sources.length ? 0.6 * content + 0.3 * coNorm + 0.1 * p : p;
      let reason = "Popular with shoppers";
      if (sources.length && coNorm * 0.3 > content * 0.6 && coNorm > 0.1) reason = `Often bought with ${coWith}`;
      else if (best && content > 0.02) reason = best.kind === "search" ? `Because you searched "${best.label}"` : `Similar to ${best.label}`;
      return { p: d.p, score, reason };
    })
    .sort((a, b) => b.score - a.score);

  const strong = scored.filter((s) => !sources.length || s.score > 0.03);
  const picked = [...strong, ...scored.filter((s) => !strong.includes(s))].slice(0, limit);
  return picked.map((s) => ({ product: toPublicProduct(s.p), reason: s.reason }));
}

// Used by the agent's suggest_bundle tool: products usually bought with this one
export function complementsFor(productId: string, limit = 2): Product[] {
  const idx = getIndex();
  const base = idx.docs.find((d) => d.p.id === productId);
  if (!base) return [];
  const row = coPurchase().get(productId) ?? new Map<string, number>();
  return idx.docs
    .filter((d) => d.p.id !== productId && d.p.stock > 0)
    .map((d) => ({ p: d.p, s: (row.get(d.p.id) ?? 0) * 2 + cosine(base, d) + (d.p.category !== base.p.category ? 0.15 : 0) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.p);
}