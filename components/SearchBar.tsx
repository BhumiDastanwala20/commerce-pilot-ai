"use client";
import { useEffect, useState } from "react";
import type { SearchResponse } from "@/lib/types";
import { getSessionId } from "./session";

const SORTS: [string, string][] = [
  ["relevance", "Best match"], ["price_asc", "Price: low to high"], ["price_desc", "Price: high to low"],
  ["name", "Name A to Z"], ["stock", "Most in stock"],
];

type Props = { onResults: (r: SearchResponse) => void; onSearched?: () => void };

export default function SearchBar({ onResults, onSearched }: Props) {
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState("relevance");
  const [ai, setAi] = useState(false);
  const [info, setInfo] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Plain mode searches as you type; AI mode waits for Enter (it calls Claude)
  useEffect(() => {
    if (ai) return;
    const t = setTimeout(() => setQ(draft.trim()), 350);
    return () => clearTimeout(t);
  }, [draft, ai]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const p = new URLSearchParams({ sid: getSessionId(), sort });
    if (q) p.set("q", q);
    if (category) p.set("category", category);
    if (maxPrice) p.set("max", maxPrice);
    if (inStock) p.set("stock", "1");
    if (ai && q) p.set("ai", "1");
    fetch(`/api/search?${p}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SearchResponse | null) => {
        if (cancelled || !d) return;
        setInfo(d);
        onResults(d);
        if (q) onSearched?.();
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, category, maxPrice, inStock, sort, ai]);

  const a = info?.applied;
  const chips = [
    a?.q ? `"${a.q}"` : "",
    a?.category ?? "",
    a?.minPrice !== undefined ? `over $${a.minPrice}` : "",
    a?.maxPrice !== undefined ? `under $${a.maxPrice}` : "",
    a?.inStock ? "in stock" : "",
    a?.sort && a.sort !== "relevance" ? SORTS.find((s) => s[0] === a.sort)?.[1] ?? "" : "",
  ].filter(Boolean);

  return (
    <div className="card searchbar">
      <form onSubmit={(e) => { e.preventDefault(); setQ(draft.trim()); }} role="search" className="search-row">
        <label htmlFor="search" className="sr-only">Search products</label>
        <input id="search" className="field" type="search" value={draft} maxLength={120} onChange={(e) => setDraft(e.target.value)}
          placeholder={ai ? "Try: a cheap gift for my dad who loves coffee, under 30" : "Search products…"} />
        <button className="btn btn-primary" type="submit">Search</button>
      </form>
      <div className="filters">
        <label>Category
          <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>
            {(info?.categories ?? []).map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>Max price
          <input className="field" type="number" min={1} placeholder="Any" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} style={{ width: 90 }} />
        </label>
        <label>Sort by
          <select className="field" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} /> In stock only</label>
        <label className="check"><input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} /> AI understanding</label>
      </div>
      {(chips.length > 0 || loading) && (
        <div className="time" aria-live="polite">
          {loading ? "Searching…" : `${info?.aiUsed ? "AI understood" : "Showing"}: ${chips.join(" · ")} · ${info?.products.length ?? 0} result(s)`}
        </div>
      )}
    </div>
  );
}