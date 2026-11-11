import { runAgent } from "@/lib/ai/agent";
import type { ChatTurn } from "@/lib/ai/agent";
import { clientIp, jsonError } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import { looksLikeManipulation } from "@/lib/guard";
import { logAttempt } from "@/lib/store";

const MAX_LEN = 500;
const MAX_HISTORY = 20;

export async function POST(req: Request) {
  if (!rateLimit(clientIp(req), 20, 60_000)) {
    return jsonError("You're sending messages too fast. Please wait a minute and try again.", 429);
  }
  let body: unknown;
  try { body = await req.json(); } catch { return jsonError("Invalid JSON."); }

  const b = body as { messages?: unknown; sessionId?: unknown };
  const sessionId = typeof b.sessionId === "string" ? b.sessionId.replace(/[^\w-]/g, "").slice(0, 40) || "anon" : "anon";
  if (!Array.isArray(b.messages) || b.messages.length === 0) return jsonError("messages must be a non-empty array.");

  const turns: ChatTurn[] = [];
  for (const m of b.messages.slice(-MAX_HISTORY)) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const text = content.trim().slice(0, MAX_LEN);
    if (text) turns.push({ role, content: text });
  }
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "user") return jsonError("The last message must come from the user.");

  const last = turns[turns.length - 1].content;
  const flagged = looksLikeManipulation(last);
  if (flagged) logAttempt(sessionId, last); // shows up as "Blocked manipulation attempts" on the dashboard

  try {
    return Response.json(await runAgent(turns, { sessionId, flagged }));
  } catch (e) {
    console.error("Chat error:", e);
    return jsonError("Our assistant is temporarily unavailable. Please try again.", 502);
  }
}