const BASE = "https://api-m.sandbox.paypal.com";

async function getToken(): Promise<string> {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error("PayPal auth failed: " + (await res.text()));
  return (await res.json()).access_token as string;
}

export async function createCheckout(orderId: string, amount: number, description: string) {
  const token = await getToken();
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const res = await fetch(`${BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": "order-" + orderId },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{ reference_id: orderId, description: description.slice(0, 120), amount: { currency_code: "USD", value: amount.toFixed(2) } }],
      payment_source: {
        paypal: { experience_context: { return_url: `${appUrl}/api/paypal/return`, cancel_url: `${appUrl}/shop`, user_action: "PAY_NOW" } },
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("PayPal order failed: " + JSON.stringify(data));
  const link = (data.links as { rel: string; href: string }[] | undefined)?.find((l) => l.rel === "payer-action")?.href;
  if (!link) throw new Error("PayPal did not return a checkout link");
  return { paypalOrderId: data.id as string, link };
}

export async function captureOrder(paypalOrderId: string): Promise<{ ok: boolean; captureId: string | null }> {
  const token = await getToken();
  const res = await fetch(`${BASE}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": "capture-" + paypalOrderId },
  });
  const data = await res.json().catch(() => null);
  const captureId = (data?.purchase_units?.[0]?.payments?.captures?.[0]?.id as string | undefined) ?? null;
  const already = Array.isArray(data?.details) && data.details.some((d: { issue?: string }) => d.issue === "ORDER_ALREADY_CAPTURED");
  return { ok: (res.ok && data?.status === "COMPLETED") || already, captureId };
}

export async function refundCapture(captureId: string): Promise<{ ok: boolean; error?: string }> {
  const token = await getToken();
  const res = await fetch(`${BASE}/v2/payments/captures/${captureId}/refund`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": "refund-" + captureId },
    body: "{}",
  });
  const data = await res.json().catch(() => null);
  return res.ok ? { ok: true } : { ok: false, error: data?.message || "Refund failed" };
}

// Needs "Payouts" enabled on your sandbox app (Developer Dashboard -> your app -> Features)
export async function createPayout(email: string, amount: number, note: string) {
  const token = await getToken();
  const batchId = "cp_" + Date.now();
  const res = await fetch(`${BASE}/v1/payments/payouts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender_batch_header: { sender_batch_id: batchId, email_subject: "Payment from CommercePilot (sandbox)" },
      items: [{ recipient_type: "EMAIL", amount: { value: amount.toFixed(2), currency: "USD" }, receiver: email, note: note.slice(0, 100), sender_item_id: batchId + "-1" }],
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false as const, error: (data?.message as string) || "Payout failed", batchId: null, status: "FAILED" };
  return { ok: true as const, error: "", batchId: (data?.batch_header?.payout_batch_id as string) ?? batchId, status: (data?.batch_header?.batch_status as string) ?? "PENDING" };
}

export async function verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
  if (!process.env.PAYPAL_WEBHOOK_ID) return false;
  const token = await getToken();
  const res = await fetch(`${BASE}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: headers.get("paypal-auth-algo"), cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"), transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"), webhook_id: process.env.PAYPAL_WEBHOOK_ID, webhook_event: event,
    }),
  });
  const data = await res.json();
  return data.verification_status === "SUCCESS";
}