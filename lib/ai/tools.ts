import type Anthropic from "@anthropic-ai/sdk";
import { findOrder, findProduct, logEvent, logSearch, saveOrder, toPublicOrder } from "../store";
import type { Order } from "../store";
import { checkDiscount, priceCart } from "../policy";
import { createCheckout } from "../paypal";
import { searchProducts } from "../search";
import { complementsFor, recommend } from "../recommend";
import { getTrace, pushTrace } from "../trace";
import { orderSummary } from "../types";
import type { PublicOrder } from "../types";

export const tools: Anthropic.Tool[] = [
  {
    name: "search_products",
    description: "Search the catalog by meaning (typo tolerant). Optional filters. Returns matching products with list prices and stock.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" }, maxPrice: { type: "number" }, category: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "check_discount",
    description: "Ask the policy engine what unit price is allowed. ALWAYS call before offering any price below list. Offer only the unitPrice it returns.",
    input_schema: {
      type: "object",
      properties: { productId: { type: "string" }, qty: { type: "integer" }, requestedUnitPrice: { type: "number" } },
      required: ["productId", "qty", "requestedUnitPrice"],
    },
  },
  {
    name: "suggest_bundle",
    description: "Find a complementary product to suggest with the given product, with a small bundle price already validated by policy.",
    input_schema: { type: "object", properties: { productId: { type: "string" } }, required: ["productId"] },
  },
  {
    name: "get_recommendations",
    description: "Get products this shopper is likely to want, based on their earlier searches and clicks. Use when they ask for ideas or seem undecided.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_checkout",
    description: "Create the order once the customer clearly agreed to buy. Supports several products at once. Prices are re-validated by the system.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { productId: { type: "string" }, qty: { type: "integer" }, agreedUnitPrice: { type: "number" } },
            required: ["productId", "qty", "agreedUnitPrice"],
          },
        },
        reasoning: { type: "string", description: "One sentence on why these prices were offered." },
      },
      required: ["items", "reasoning"],
    },
  },
  {
    name: "get_order_status",
    description: "Look up the status of an order by its id (for example 'did my payment go through?').",
    input_schema: { type: "object", properties: { orderId: { type: "string" } }, required: ["orderId"] },
  },
];

export type ToolOutput = { result: Record<string, unknown>; order?: PublicOrder };

const brief = (p: { id: string; name: string; description: string; category: string; price: number; stock: number }) =>
  ({ id: p.id, name: p.name, description: p.description, category: p.category, price: p.price, stock: p.stock });

async function exec(name: string, input: Record<string, unknown>, sid: string): Promise<ToolOutput> {
  if (name === "search_products") {
    const q = String(input.query ?? "").slice(0, 120);
    const max = Number(input.maxPrice);
    const hits = searchProducts({ q, category: input.category ? String(input.category) : undefined, maxPrice: Number.isFinite(max) && max > 0 ? max : undefined }).slice(0, 6);
    if (q && hits.length) logSearch(sid, q, hits.map((h) => h.product.id));
    const list = hits.length ? hits : searchProducts({}).slice(0, 8);
    return { result: { note: hits.length ? undefined : "No close match, showing the catalog.", products: list.map((h) => brief(h.product)) } };
  }

  if (name === "check_discount") {
    return { result: checkDiscount(String(input.productId ?? ""), Number(input.qty), Number(input.requestedUnitPrice)) };
  }

  if (name === "suggest_bundle") {
    const base = findProduct(String(input.productId ?? ""));
    if (!base) return { result: { error: "Unknown product." } };
    const partner = complementsFor(base.id, 1)[0];
    if (!partner) return { result: { error: "No suggestion available." } };
    const v = checkDiscount(partner.id, 1, partner.price * 0.95); // 5% bundle offer, still capped by policy
    if (v.status === "rejected") return { result: { error: v.reason } };
    return { result: { suggestion: brief(partner), bundleUnitPrice: v.unitPrice, note: "Offer this add-on once, naturally." } };
  }

  if (name === "get_recommendations") {
    return { result: { recommendations: recommend(sid, 3).map((r) => ({ ...brief(r.product), why: r.reason })) } };
  }

  if (name === "create_checkout") {
    const raw = Array.isArray(input.items) ? (input.items as Record<string, unknown>[]) : [];
    const verdict = priceCart(raw.map((i) => ({ productId: String(i.productId ?? ""), qty: Number(i.qty), agreedUnitPrice: Number(i.agreedUnitPrice) })));
    if (verdict.status === "rejected") return { result: { error: verdict.reason } };

    const order: Order = {
      id: "ord_" + Math.random().toString(36).slice(2, 8),
      items: verdict.items, listTotal: verdict.listTotal, total: verdict.total, discountPercent: verdict.discountPercent,
      status: "awaiting_payment", checkoutLink: null, reasoning: String(input.reasoning ?? "").slice(0, 300),
      paypalOrderId: null, captureId: null, trace: getTrace(sid).slice(-30), createdAt: new Date().toISOString(),
    };
    for (const it of order.items) logEvent(sid, it.productId, "order");

    if (verdict.status === "needs_approval") {
      order.status = "approval_needed";
      saveOrder(order);
      return { result: { status: "needs_approval", orderId: order.id, message: "Sent to the owner for approval." }, order: toPublicOrder(order) };
    }
    const { paypalOrderId, link } = await createCheckout(order.id, order.total, orderSummary(order.items));
    order.paypalOrderId = paypalOrderId;
    order.checkoutLink = link;
    saveOrder(order);
    return { result: { status: "ready", orderId: order.id, total: order.total }, order: toPublicOrder(order) };
  }

  if (name === "get_order_status") {
    const o = findOrder(String(input.orderId ?? "").trim());
    if (!o) return { result: { error: "No order with that id." } };
    return { result: { orderId: o.id, status: o.status, items: orderSummary(o.items), total: o.total } };
  }

  return { result: { error: "Unknown tool." } };
}

// Every call is logged to the session trace, which is stored on the order for the owner to audit
export async function runTool(name: string, input: Record<string, unknown>, sid: string): Promise<ToolOutput> {
  const out = await exec(name, input, sid);
  const r = out.result;
  pushTrace(sid, { time: new Date().toISOString(), tool: name, input, verdict: String(r.status ?? r.error ?? "ok") });
  return out;
}