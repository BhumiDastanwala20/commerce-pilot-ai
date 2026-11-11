import { insertPayout, listPayouts } from "@/lib/store";
import { createPayout } from "@/lib/paypal";
import { jsonError } from "@/lib/api";

const CAP = 50; // sandbox safety cap

export async function GET() {
  return Response.json(listPayouts());
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { email?: unknown; amount?: unknown; note?: unknown };
  const email = typeof b.email === "string" ? b.email.trim() : "";
  const amount = Number(b.amount);
  const note = typeof b.note === "string" ? b.note.slice(0, 100) : "Supplier payment";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError("Enter a valid email.");
  if (!Number.isFinite(amount) || amount < 1 || amount > CAP) return jsonError(`Amount must be between $1 and $${CAP} (sandbox cap).`);

  const r = await createPayout(email, Math.round(amount * 100) / 100, note).catch(() => null);
  if (!r) return jsonError("PayPal request failed.", 502);
  insertPayout(email, amount, note, r.ok ? r.status : "FAILED", r.batchId);
  return r.ok ? Response.json({ ok: true, status: r.status }) : jsonError(r.error, 502);
}