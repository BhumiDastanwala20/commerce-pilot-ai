import { clientIp, jsonError } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import { acceptPo, addMessage, advancePo, cancelPo, createPo, findPo, findVendor, snapshot } from "@/lib/procurement";
import { vendorReply } from "@/lib/ai/vendorSim";

export async function GET() {
  return Response.json(snapshot());
}

type Body = { action?: string; vendorId?: string; productId?: string; qty?: number; poId?: string; text?: string };

export async function handler(req: Request) {
  let b: Body;
  try {
    b = await req.json();
  } catch {
    return jsonError("Invalid JSON.");
  }

  if (b.action === "create") {
    if (typeof b.vendorId !== "string" || typeof b.productId !== "string") return jsonError("vendorId and productId required.");
    const r = createPo(b.vendorId, b.productId, Number(b.qty));
    return "error" in r ? jsonError(r.error) : Response.json(r.po);
  }

  const po = typeof b.poId === "string" ? findPo(b.poId) : undefined;
  if (!po) return jsonError("Purchase order not found.", 404);

  if (b.action === "accept") {
    const r = acceptPo(po);
    return "error" in r ? jsonError(r.error) : Response.json(r.po);
  }
  if (b.action === "cancel") {
    const r = cancelPo(po);
    return "error" in r ? jsonError(r.error) : Response.json(r.po);
  }
  if (b.action === "advance") {
    const r = advancePo(po);
    return "error" in r ? jsonError(r.error) : Response.json(r.po);
  }
  if (b.action === "message") {
    const text = typeof b.text === "string" ? b.text.trim().slice(0, 500) : "";
    if (!text) return jsonError("Message is empty.");
    if (po.status === "cancelled") return jsonError("This order was cancelled.");
    if (!rateLimit(clientIp(req) + ":vendor", 15, 60_000)) return jsonError("Too many messages. Wait a minute.", 429);

    addMessage(po, "owner", text);
    const vendor = findVendor(po.vendorId);
    if (vendor) addMessage(po, "vendor", await vendorReply(vendor, po, text));
    return Response.json(po);
  }
  return jsonError("Unknown action.");
}
import { saveProc } from "@/lib/procurement"; // add to the existing procurement import instead if you prefer

export async function POST(req: Request) {
  const res = await handler(req);
  saveProc(); // persist purchase orders to SQLite after every change
  return res;
}