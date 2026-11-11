export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "local";
}