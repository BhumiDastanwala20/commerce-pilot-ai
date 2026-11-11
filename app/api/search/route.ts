import { parseHeuristic, searchProducts } from "@/lib/search";
import type { SearchFilters, SortKey } from "@/lib/search";
import { parseWithClaude } from "@/lib/ai/queryParser";
import { listProducts, logSearch } from "@/lib/store";
import { clientIp } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import type { SearchResponse } from "@/lib/types";

const SORTS = new Set(["price_asc", "price_desc", "name", "stock"]);
const num = (v: string | null) => {
  const n = Number(v);
  return v && Number.isFinite(n) && n >= 0 ? n : undefined;
};

export async function GET(req: Request) {
  const u = new URL(req.url);
  const sid = (u.searchParams.get("sid") ?? "anon").replace(/[^\w-]/g, "").slice(0, 40) || "anon";
  const q = (u.searchParams.get("q") ?? "").trim().slice(0, 120);
  const categories = [...new Set(listProducts().map((p) => p.category))].sort();
  const cat = u.searchParams.get("category") ?? "";
  const sort = u.searchParams.get("sort") ?? "";

  // Filters the shopper set manually in the UI always win
  const manual: SearchFilters = {
    category: categories.includes(cat) ? cat : undefined,
    maxPrice: num(u.searchParams.get("max")),
    inStock: u.searchParams.get("stock") === "1" ? true : undefined,
    sort: SORTS.has(sort) ? (sort as SortKey) : undefined,
  };

  let parsed: SearchFilters = q ? parseHeuristic(q) : {};
  let aiUsed = false;
  if (q && u.searchParams.get("ai") === "1" && rateLimit(clientIp(req) + ":ai-search", 20, 60_000)) {
    const ai = await parseWithClaude(q, categories);
    if (ai) { parsed = ai; aiUsed = true; }
  }

  const filters: SearchFilters = { ...parsed };
  for (const [k, v] of Object.entries(manual)) if (v !== undefined) (filters as Record<string, unknown>)[k] = v;

  const results = searchProducts(filters);
  if (q && results.length) logSearch(sid, q, results.slice(0, 5).map((r) => r.product.id));

  const body: SearchResponse = {
    products: results.map((r) => r.product),
    applied: { q: filters.q ?? "", category: filters.category, minPrice: filters.minPrice, maxPrice: filters.maxPrice, inStock: filters.inStock, sort: filters.sort },
    aiUsed,
    categories,
  };
  return Response.json(body);
}