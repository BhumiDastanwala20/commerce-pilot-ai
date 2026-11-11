import { NextResponse } from "next/server";
import { findOrder, findOrderByPaypalId, markOrderPaid } from "@/lib/store";
import { captureOrder } from "@/lib/paypal";

export async function GET(req: Request) {
  const base = process.env.APP_URL || new URL(req.url).origin;
  const token = new URL(req.url).searchParams.get("token"); // PayPal order id
  const order = token ? findOrderByPaypalId(token) : undefined;
  if (!token || !order) return NextResponse.redirect(new URL("/shop", base));

  if (order.status === "awaiting_payment") {
    try {
      const cap = await captureOrder(token);
      if (cap.ok) markOrderPaid(order.id, cap.captureId);
    } catch (e) {
      console.error("Capture error:", e);
    }
  }
  const fresh = findOrder(order.id);
  return NextResponse.redirect(new URL(fresh?.status === "paid" ? `/shop?paid=${order.id}` : "/shop?payment=failed", base));
}