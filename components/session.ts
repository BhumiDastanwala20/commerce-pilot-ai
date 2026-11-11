// Anonymous id so searches and clicks can power recommendations (no login needed)
export function getSessionId(): string {
  try {
    let s = localStorage.getItem("cp_sid");
    if (!s) {
      s = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
      localStorage.setItem("cp_sid", s);
    }
    return s;
  } catch {
    return "anon";
  }
}