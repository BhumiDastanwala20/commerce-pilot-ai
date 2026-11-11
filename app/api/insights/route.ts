import { countAttempts, listProducts, topSearches } from "@/lib/store";

export async function GET() {
  return Response.json({
    blocked: countAttempts(),
    topSearches: topSearches(5),
    lowStock: listProducts().filter((p) => p.stock <= 40).map((p) => ({ id: p.id, name: p.name, stock: p.stock })),
  });
}