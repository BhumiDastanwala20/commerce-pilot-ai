import { listProducts, toPublicProduct } from "./store";
import type { Product } from "./store";
import type { PublicProduct } from "./types";

export type SortKey = "relevance" | "price_asc" | "price_desc" | "name" | "stock";
export type SearchFilters = { q?: string; category?: string; minPrice?: number; maxPrice?: number; inStock?: boolean; sort?: SortKey };

const STOP = new Set(["the", "a", "an", "for", "and", "or", "with", "to", "of", "in", "on", "me", "my", "i", "some", "any", "under", "below", "less", "than", "over", "above", "best", "sort", "by", "price", "need", "want", "find", "show", "something", "looking", "is", "it", "that", "who", "loves", "love", "likes"]);
// keys are stemmed (no trailing s). This is a tiny "semantic" layer: related words share meaning
const SYN: Record<string, string[]> = {
  present: ["gift"], birthday: ["gift", "set"], anniversary: ["gift"], cup: ["mug"], coffee: ["mug"], tea: ["mug"],
  phone: ["charger", "stand"], charge: ["charger", "wireless"], light: ["lamp"], plant: ["planter"], flower: ["planter"],
  bag: ["tote"], water: ["bottle"], gym: ["bottle"], study: ["lamp", "desk"], write: ["notebook"], journal: ["notebook"],
  smell: ["candle", "scent"], relax: ["candle"], eco: ["bamboo", "cotton"], office: ["desk", "workspace"],
};

const stem = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
export const tokenize = (s: string): string[] =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w)).map(stem);

type Vec = Map<string, number>;
export type V = { vec: Vec; norm: number };
const add = (v: Vec, k: string, w: number) => v.set(k, (v.get(k) ?? 0) + w);

// Words plus character trigrams (so "mugg" or "noteboook" still match), plus synonyms for queries
export function features(words: string[], expand = false): Vec {
  const v: Vec = new Map();
  for (const w of words) {
    add(v, w, 1);
    if (w.length >= 4) for (let i = 0; i <= w.length - 3; i++) add(v, "#" + w.slice(i, i + 3), 0.25);
    if (expand) for (const s of SYN[w] ?? []) add(v, stem(s), 0.7);
  }
  return v;
}

export type Index = { docs: (V & { p: Product })[]; idf: Map<string, number> };

export function weigh(idf: Map<string, number>, raw: Vec): V {
  const vec: Vec = new Map();
  let sum = 0;
  for (const [k, tf] of raw) {
    const w = tf * (idf.get(k) ?? 1);
    vec.set(k, w);
    sum += w * w;
  }
  return { vec, norm: Math.sqrt(sum) || 1 };
}

export function cosine(a: V, b: V): number {
  const [s, l] = a.vec.size < b.vec.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, w] of s.vec) dot += w * (l.vec.get(k) ?? 0);
  return dot / (a.norm * b.norm);
}

export function getIndex(): Index {
  const products = listProducts();
  const raws = products.map((p) => {
    const name = tokenize(p.name), tags = tokenize(p.tags.join(" ")), cat = tokenize(p.category);
    return features([...name, ...name, ...name, ...tags, ...tags, ...cat, ...cat, ...tokenize(p.description)]);
  });
  const df = new Map<string, number>();
  for (const r of raws) for (const k of r.keys()) df.set(k, (df.get(k) ?? 0) + 1);
  const N = products.length;
  const idf = new Map<string, number>();
  for (const [k, c] of df) idf.set(k, Math.log((N + 1) / (c + 1)) + 1);
  return { idf, docs: products.map((p, i) => ({ p, ...weigh(idf, raws[i]) })) };
}

export function searchProducts(f: SearchFilters): { product: PublicProduct; score: number }[] {
  const idx = getIndex();
  const words = tokenize(f.q ?? "");
  const qv = words.length ? weigh(idx.idf, features(words, true)) : null;

  let rows = idx.docs.map((d) => ({ p: d.p, score: qv ? cosine(qv, d) : 0 }));
  if (qv) rows = rows.filter((r) => r.score >= 0.12); // relevance cut-off; tune if results feel too loose/strict
  if (f.category) rows = rows.filter((r) => r.p.category.toLowerCase() === f.category!.toLowerCase());
  if (f.minPrice !== undefined) rows = rows.filter((r) => r.p.price >= f.minPrice!);
  if (f.maxPrice !== undefined) rows = rows.filter((r) => r.p.price <= f.maxPrice!);
  if (f.inStock) rows = rows.filter((r) => r.p.stock > 0);

  const sort: SortKey = f.sort && f.sort !== "relevance" ? f.sort : qv ? "relevance" : "name";
  rows.sort((a, b) => {
    if (sort === "price_asc") return a.p.price - b.p.price;
    if (sort === "price_desc") return b.p.price - a.p.price;
    if (sort === "stock") return b.p.stock - a.p.stock;
    if (sort === "name") return a.p.name.localeCompare(b.p.name);
    return b.score - a.score || a.p.name.localeCompare(b.p.name);
  });
  return rows.map((r) => ({ product: toPublicProduct(r.p), score: Math.round(r.score * 100) / 100 }));
}

// Free, instant "query understanding" from plain text. The AI toggle upgrades this with Claude.
export function parseHeuristic(raw: string): SearchFilters {
  let q = raw;
  const f: SearchFilters = {};
  const num = String.raw`\$?\s*(\d+(?:\.\d+)?)`;
  const max = q.match(new RegExp(String.raw`(?:under|below|less than|cheaper than|up to|upto|max|within)\s*` + num, "i"));
  if (max) { f.maxPrice = Number(max[1]); q = q.replace(max[0], " "); }
  const min = q.match(new RegExp(String.raw`(?:over|above|more than|at least|min)\s*` + num, "i"));
  if (min) { f.minPrice = Number(min[1]); q = q.replace(min[0], " "); }
  const cheap = q.match(/\b(cheapest|cheap|lowest price|low to high)\b/i);
  if (cheap) { f.sort = "price_asc"; q = q.replace(cheap[0], " "); }
  const pricey = q.match(/\b(most expensive|premium|high to low)\b/i);
  if (pricey) { f.sort = "price_desc"; q = q.replace(pricey[0], " "); }
  const stock = q.match(/\bin stock\b/i);
  if (stock) { f.inStock = true; q = q.replace(stock[0], " "); }
  f.q = q.replace(/\$/g, " ").replace(/\s+/g, " ").trim();
  return f;
}