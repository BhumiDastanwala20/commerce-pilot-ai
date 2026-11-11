import { getRules, listProducts, saveRulesAndMinPrices } from "@/lib/store";
import { jsonError } from "@/lib/api";
import type { Rules } from "@/lib/types";

export async function GET() {
  return Response.json({
    rules: getRules(),
    products: listProducts().map((p) => ({ id: p.id, name: p.name, price: p.price, minPrice: p.minPrice })),
  });
}

export async function PUT(req: Request) {
  const b = (await req.json().catch(() => null)) as { rules?: Rules; minPrices?: Record<string, number> } | null;
  const r = b?.rules;
  if (!r) return jsonError("rules is required.");
  const vals = [r.maxDiscountPercent, r.bulkThreshold, r.bulkDiscountPercent, r.approvalAbove];
  if (vals.some((n) => typeof n !== "number" || !Number.isFinite(n))) return jsonError("All rule values must be numbers.");
  if (r.maxDiscountPercent < 0 || r.maxDiscountPercent > 90) return jsonError("Max discount must be 0 to 90.");
  if (r.bulkDiscountPercent < 0 || r.bulkDiscountPercent > 90) return jsonError("Bulk discount must be 0 to 90.");
  if (!Number.isInteger(r.bulkThreshold) || r.bulkThreshold < 2) return jsonError("Bulk threshold must be a whole number, at least 2.");
  if (r.approvalAbove < 1) return jsonError("Approval limit must be at least 1.");

  const prices = new Map(listProducts().map((p) => [p.id, p.price]));
  const mins: Record<string, number> = {};
  for (const [id, v] of Object.entries(b?.minPrices ?? {})) {
    const list = prices.get(id);
    if (list === undefined) return jsonError(`Unknown product ${id}.`);
    if (typeof v !== "number" || !(v > 0) || v > list) return jsonError(`Minimum price for ${id} must be above 0 and not above its list price.`);
    mins[id] = v;
  }
  saveRulesAndMinPrices(r, mins);
  return Response.json({ ok: true });
}