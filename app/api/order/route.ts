import { findOrder, toPublicOrder } from "@/lib/store";
import { jsonError } from "@/lib/api";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("Missing id.");
  const order = findOrder(id);
  if (!order) return jsonError("Order not found.", 404);
  return Response.json(toPublicOrder(order));
}