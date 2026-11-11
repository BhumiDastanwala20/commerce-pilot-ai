import Anthropic from "@anthropic-ai/sdk";
import type { PurchaseOrder, Vendor } from "../procurement";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

export async function vendorReply(vendor: Vendor, po: PurchaseOrder, ownerText: string): Promise<string> {
  const fallback = `Thanks for your message. Our quote of $${po.unitPrice.toFixed(2)} per unit for ${po.qty} units stands, and we'll get back to you shortly.`;
  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  const transcript = po.messages
    .filter((m) => m.from !== "system")
    .map((m) => `${m.from === "owner" ? "Shop owner" : vendor.contact}: ${m.text}`)
    .join("\n");

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: `You role-play ${vendor.contact}, a sales rep at ${vendor.name} in ${vendor.city}, replying to a small shop owner.
Facts: product ${po.productName}, quantity ${po.qty}, quoted $${po.unitPrice.toFixed(2)} per unit, total $${po.total.toFixed(2)}, lead time ${vendor.leadTimeDays} days, minimum order ${vendor.minOrderQty} units, order status "${po.status}".
Rules: reply in 2-3 short, polite sentences. You cannot change the quoted price in this chat; if asked for a discount, offer it only on a future, larger order. Never invent tracking numbers or delivery dates beyond the lead time. Be helpful about packaging, payment terms and delivery questions.`,
      messages: [{ role: "user", content: `${transcript}\nShop owner: ${ownerText}\n\nWrite ${vendor.contact}'s next reply only.` }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text || fallback;
  } catch (e) {
    console.error("Vendor sim error:", e);
    return fallback;
  }
}