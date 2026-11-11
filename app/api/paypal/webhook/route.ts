import { findOrderByCaptureId, findOrderByPaypalId, markOrderPaid, markOrderRefunded, saveOrder } from "@/lib/store";
import { verifyWebhook } from "@/lib/paypal";
import { jsonError } from "@/lib/api";

type Ev = {
  event_type?: string;
  resource?: { id?: string; links?: { rel: string; href: string }[]; supplementary_data?: { related_ids?: { order_id?: string } } };
};

export async function POST(req: Request) {
  let ev: Ev;
  try { ev = await req.json(); } catch { return jsonError("Invalid JSON."); }
  const valid = await verifyWebhook(req.headers, ev).catch(() => false);
  if (!valid) return jsonError("Invalid signature.", 400);

  const r = ev.resource;
  const paypalOrderId = r?.supplementary_data?.related_ids?.order_id;

  if (ev.event_type === "PAYMENT.CAPTURE.COMPLETED" && paypalOrderId) {
    const o = findOrderByPaypalId(paypalOrderId);
    if (o) markOrderPaid(o.id, r?.id ?? null);
  }
  if (ev.event_type === "PAYMENT.CAPTURE.DENIED" && paypalOrderId) {
    const o = findOrderByPaypalId(paypalOrderId);
    if (o && o.status === "awaiting_payment") { o.status = "failed"; saveOrder(o); }
  }
  if (ev.event_type === "PAYMENT.CAPTURE.REFUNDED") {
    const captureId = r?.links?.find((l) => l.rel === "up")?.href.split("/").pop();
    const o = captureId ? findOrderByCaptureId(captureId) : undefined;
    if (o) markOrderRefunded(o.id);
  }
  return Response.json({ ok: true });
}