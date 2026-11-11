import { findOrder, markOrderRefunded } from "@/lib/store";
import { refundCapture } from "@/lib/paypal";
import { jsonError } from "@/lib/api";

export async function POST(req: Request) {
  const { orderId } = (await req.json().catch(() => ({}))) as { orderId?: string };
  const order = typeof orderId === "string" ? findOrder(orderId) : undefined;
  if (!order) return jsonError("Order not found.", 404);
  if (order.status !== "paid") return jsonError("Only paid orders can be refunded.");

  const isDemo = order.id.startsWith("demo_"); // demo orders have no real PayPal capture
  if (!isDemo) {
    if (!order.captureId) return jsonError("This order has no PayPal capture id.");
    const r = await refundCapture(order.captureId);
    if (!r.ok) return jsonError(r.error || "PayPal refused the refund.", 502);
  }
  markOrderRefunded(order.id);
  return Response.json({ ok: true });
}