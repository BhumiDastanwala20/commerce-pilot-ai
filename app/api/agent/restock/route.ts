import { clientIp, jsonError } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import { runRestockAgent } from "@/lib/ai/restockAgent";
import { saveProc } from "@/lib/procurement";

export async function POST(req: Request) {
  if (!rateLimit(clientIp(req) + ":restock", 5, 60_000)) return jsonError("Too many runs. Wait a minute.", 429);
  try {
    const result = await runRestockAgent();
    saveProc();
    return Response.json(result);
  } catch (e) {
    console.error("Restock agent error:", e);
    return jsonError("The restock agent failed. Check the server log.", 502);
  }
}