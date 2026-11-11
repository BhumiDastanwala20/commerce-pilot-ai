import { recommend } from "@/lib/recommend";

export async function GET(req: Request) {
  const sid = (new URL(req.url).searchParams.get("sid") ?? "anon").replace(/[^\w-]/g, "").slice(0, 40) || "anon";
  return Response.json(recommend(sid, 4));
}