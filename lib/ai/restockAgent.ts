import Anthropic from "@anthropic-ai/sdk";
import { listOrders } from "../store";
import { addMessage, createPo, scoreOffers, snapshot } from "../procurement";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MAX_ORDERS = 5;

const tools: Anthropic.Tool[] = [
  { name: "get_inventory_report", description: "Stock, incoming units, 14-day sales and days of cover for every product.", input_schema: { type: "object", properties: {} } },
  {
    name: "compare_vendors", description: "Vendor offers for a product and quantity, scored on price (50%), speed (30%) and rating (20%).",
    input_schema: { type: "object", properties: { productId: { type: "string" }, qty: { type: "integer" } }, required: ["productId", "qty"] },
  },
  {
    name: "create_purchase_order", description: "Send a restock request to a vendor. The owner still has to accept the quote.",
    input_schema: {
      type: "object",
      properties: { vendorId: { type: "string" }, productId: { type: "string" }, qty: { type: "integer" }, reason: { type: "string" } },
      required: ["vendorId", "productId", "qty", "reason"],
    },
  },
];

const SYSTEM = `You are the restock agent for a small shop.
1. Call get_inventory_report.
2. Restock a product if stock is at or below its reorder level, or days of cover is under 10, and incoming units do not already cover it. If there is no sales data, rely on stock versus reorder level.
3. Aim for about 30 days of cover, or the suggestedQty, rounded to a sensible number.
4. For each product call compare_vendors and pick the best score that meets the minimum order. Prefer speed when stock is nearly out.
5. Call create_purchase_order with a one-sentence reason. Place at most ${MAX_ORDERS} orders. Never accept quotes yourself.
Finish with a short plain-English summary of what you ordered and why, and what you skipped.`;

export async function runRestockAgent(): Promise<{ summary: string; created: string[] }> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const created: string[] = [];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: "Review inventory and place restock requests where needed." }];

  function exec(name: string, input: Record<string, unknown>): Record<string, unknown> {
    if (name === "get_inventory_report") {
      const since = Date.now() - 14 * 86_400_000;
      const sold = new Map<string, number>();
      for (const o of listOrders()) {
        if (o.status !== "paid" || !o.paidAt || Date.parse(o.paidAt) < since) continue;
        for (const i of o.items) sold.set(i.productId, (sold.get(i.productId) ?? 0) + i.qty);
      }
      return {
        products: snapshot().inventory.map((i) => {
          const s = sold.get(i.id) ?? 0;
          return { ...i, soldLast14Days: s, daysOfCover: s > 0 ? Math.round((i.stock / (s / 14)) * 10) / 10 : null };
        }),
      };
    }
    if (name === "compare_vendors") return { offers: scoreOffers(String(input.productId), Number(input.qty)) };
    if (name === "create_purchase_order") {
      if (created.length >= MAX_ORDERS) return { error: `Limit of ${MAX_ORDERS} orders per run reached.` };
      const r = createPo(String(input.vendorId), String(input.productId), Number(input.qty));
      if ("error" in r) return { error: r.error };
      addMessage(r.po, "system", `AI restock agent: ${String(input.reason ?? "").slice(0, 200)}`);
      created.push(r.po.id);
      return { ok: true, poId: r.po.id, total: r.po.total };
    }
    return { error: "Unknown tool." };
  }

  for (let i = 0; i < 10; i++) {
    const resp = await client.messages.create({ model: MODEL, max_tokens: 1000, system: SYSTEM, tools, messages });
    messages.push({ role: "assistant", content: resp.content });
    if (resp.stop_reason !== "tool_use") {
      const summary = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      return { summary: summary || "Done.", created };
    }
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const b of resp.content) {
      if (b.type !== "tool_use") continue;
      let out: Record<string, unknown>;
      try { out = exec(b.name, (b.input ?? {}) as Record<string, unknown>); } catch { out = { error: "Tool failed." }; }
      results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(out) });
    }
    messages.push({ role: "user", content: results });
  }
  return { summary: "Stopped after too many steps.", created };
}