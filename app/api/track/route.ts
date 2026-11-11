import { findProduct, logEvent } from "@/lib/store";
import { jsonError } from "@/lib/api";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { sessionId?: string; productId?: string; type?: string };
  const sid = String(b.sessionId ?? "anon").replace(/[^\w-]/g, "").slice(0, 40) || "anon";
  if (!b.productId || !findProduct(b.productId)) return jsonError("Unknown product.");
  if (b.type !== "view" && b.type !== "ask") return jsonError("Invalid type.");
  logEvent(sid, b.productId, b.type);
  return Response.json({ ok: true });
}