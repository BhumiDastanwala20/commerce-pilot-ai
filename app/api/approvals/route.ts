import { findOrder, saveOrder, toPublicOrder } from "@/lib/store";
import { createCheckout } from "@/lib/paypal";
import { jsonError } from "@/lib/api";
import { orderSummary } from "@/lib/types";

export async function POST(req: Request) {
  let body: { orderId?: unknown; action?: unknown };
  try { body = await req.json(); } catch { return jsonError("Invalid JSON."); }
  const { orderId, action } = body;
  if (typeof orderId !== "string" || (action !== "approve" && action !== "reject")) {
    return jsonError("Expected { orderId: string, action: 'approve' | 'reject' }.");
  }
  const order = findOrder(orderId);
  if (!order || order.status !== "approval_needed") return jsonError("Pending order not found.", 404);

  if (action === "reject") {
    order.status = "rejected";
    saveOrder(order);
    return Response.json(toPublicOrder(order));
  }
  try {
    const { paypalOrderId, link } = await createCheckout(order.id, order.total, orderSummary(order.items));
    order.paypalOrderId = paypalOrderId;
    order.checkoutLink = link;
    order.status = "awaiting_payment";
    saveOrder(order);
    return Response.json(toPublicOrder(order));
  } catch (e) {
    console.error("Approval error:", e);
    return jsonError("Could not create the PayPal checkout.", 502);
  }
}