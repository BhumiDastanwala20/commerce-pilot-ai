import { resetDemo, seedDemo } from "@/lib/store";
import { jsonError } from "@/lib/api";

export async function POST(req: Request) {
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action === "seed") seedDemo();
  else if (action === "reset") resetDemo();
  else return jsonError("Unknown action.");
  return Response.json({ ok: true });
}